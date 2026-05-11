import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import pretty from 'pino-pretty';

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const VALID_FORMATS = new Set(['json', 'pretty']);
const DEFAULT_LEVEL = 'info';
const DEFAULT_SERVICE = 'codeagenthub';
const LOG_CONTEXT = new AsyncLocalStorage();

const SENSITIVE_FIELD_NAMES = new Set([
  'accesskey',
  'accesstoken',
  'authorization',
  'bearertoken',
  'connectionstring',
  'content',
  'cookie',
  'cookies',
  'displaytext',
  'finalcontent',
  'jwt',
  'output',
  'password',
  'prompt',
  'rawoutput',
  'reasoning',
  'secret',
  'sessionsecret',
  'token',
  'tooloutput',
]);

const PATH_FIELD_NAMES = new Set([
  'cwd',
  'directory',
  'filepath',
  'workingdirectory',
]);

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function removeUndefinedEntries(record) {
  return Object.fromEntries(Object.entries(record || {}).filter(([, value]) => value !== undefined));
}

function buildRedactedValue(value, config) {
  const text = value == null ? '' : String(value);
  const base = { redacted: true, length: text.length };
  if (config.includeContentPreview && text) {
    return { ...base, preview: text.slice(0, 80) };
  }
  return base;
}

function serializeUnknownObject(value, config, seen) {
  if (value == null) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = sanitizeValue(nestedValue, key, config, seen);
  }
  seen.delete(value);
  return removeUndefinedEntries(sanitized);
}

function sanitizeValue(value, fieldName, config, seen) {
  if (value == null) return value;

  const normalizedFieldName = String(fieldName || '').trim().toLowerCase();
  if (SENSITIVE_FIELD_NAMES.has(normalizedFieldName)) {
    return buildRedactedValue(value, config);
  }

  if (typeof value === 'string') {
    if (PATH_FIELD_NAMES.has(normalizedFieldName)) {
      return summarizePathForLog(value);
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return serializeError(value, config);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, fieldName, config, seen));
  }

  if (typeof value === 'object') {
    return serializeUnknownObject(value, config, seen);
  }

  return String(value);
}

function createDestination(config, stream) {
  if (config.format === 'pretty') {
    return pretty({
      colorize: stream?.isTTY ?? process.stdout.isTTY,
      destination: stream || process.stdout,
      ignore: 'pid,hostname',
      singleLine: true,
      translateTime: 'SYS:standard',
    });
  }
  return stream || process.stdout;
}

class StructuredLogger {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
  }

  child(fields = {}) {
    return new StructuredLogger(this.logger.child(sanitizeLogFields(fields, this.config)), this.config);
  }

  debug(event, fields = {}, message) {
    this.#write('debug', event, fields, message);
  }

  info(event, fields = {}, message) {
    this.#write('info', event, fields, message);
  }

  warn(event, fields = {}, message) {
    this.#write('warn', event, fields, message);
  }

  error(event, fields = {}, message) {
    this.#write('error', event, fields, message);
  }

  #write(level, event, fields, message) {
    const payload = {
      event,
      ...sanitizeLogFields(fields, this.config),
    };
    this.logger[level](payload, message || event);
  }
}

export function resolveLogConfig(env = process.env, { isTTY = process.stdout.isTTY } = {}) {
  const requestedLevel = String(env.CODEAGENTHUB_LOG_LEVEL || DEFAULT_LEVEL).trim().toLowerCase();
  const requestedFormat = String(env.CODEAGENTHUB_LOG_FORMAT || '').trim().toLowerCase();

  return {
    level: VALID_LEVELS.has(requestedLevel) ? requestedLevel : DEFAULT_LEVEL,
    format: VALID_FORMATS.has(requestedFormat) ? requestedFormat : (isTTY ? 'pretty' : 'json'),
    includeContentPreview: parseBoolean(env.CODEAGENTHUB_LOG_CONTENT_PREVIEW, false),
    includeStacks: parseBoolean(env.CODEAGENTHUB_LOG_INCLUDE_STACKS, false),
  };
}

export function sanitizeLogFields(fields = {}, config = resolveLogConfig()) {
  return sanitizeValue(fields, '', config, new WeakSet()) || {};
}

export function summarizePathForLog(filePath) {
  const text = String(filePath || '').trim();
  if (!text) return text;
  const normalized = text.replace(/\\+/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return normalized;
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join('/');
}

export function serializeError(error, config = resolveLogConfig()) {
  if (error == null) return null;
  if (error instanceof Error) {
    return removeUndefinedEntries({
      name: error.name || 'Error',
      message: error.message,
      code: error.code,
      stack: config.includeStacks ? error.stack : undefined,
      cause: error.cause ? serializeError(error.cause, config) : undefined,
    });
  }
  if (typeof error === 'object') {
    return sanitizeLogFields(error, config);
  }
  return { message: String(error) };
}

export function createLogger(bindings = {}, options = {}) {
  const config = resolveLogConfig(options.env, { isTTY: options.isTTY ?? process.stdout.isTTY });
  const logger = pino({
    level: config.level,
    base: null,
    messageKey: 'message',
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }, createDestination(config, options.stream));

  return new StructuredLogger(
    logger.child(sanitizeLogFields({ service: DEFAULT_SERVICE, ...bindings }, config)),
    config,
  );
}

let cachedRootLogger = null;

export function getRootLogger() {
  if (!cachedRootLogger) {
    cachedRootLogger = createLogger();
  }
  return cachedRootLogger;
}

export function withLogContext(fields, callback) {
  const current = LOG_CONTEXT.getStore() || {};
  const next = { ...current, ...sanitizeLogFields(fields) };
  return LOG_CONTEXT.run(next, callback);
}

export function appendLogContext(fields) {
  const current = LOG_CONTEXT.getStore();
  if (!current) return null;
  Object.assign(current, sanitizeLogFields(fields));
  return current;
}

export function getLogContext() {
  return { ...(LOG_CONTEXT.getStore() || {}) };
}

export function getContextLogger(logger = null) {
  const baseLogger = logger || getRootLogger();
  const context = LOG_CONTEXT.getStore();
  if (!context || Object.keys(context).length === 0) return baseLogger;
  return baseLogger.child(context);
}

export const rootLogger = new Proxy({}, {
  get(_target, property) {
    const baseLogger = getRootLogger();
    const value = baseLogger[property];
    return typeof value === 'function' ? value.bind(baseLogger) : value;
  },
});