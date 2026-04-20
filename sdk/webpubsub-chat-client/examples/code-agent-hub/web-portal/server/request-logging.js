import { randomUUID } from 'node:crypto';
import { appendLogContext, getContextLogger, withLogContext } from '../../shared/logging.js';

const REQUEST_LOG_IDENTITY = Symbol.for('codeagenthub.requestLogIdentity');

export function getRequestLogIdentity(req) {
  return req?.[REQUEST_LOG_IDENTITY] || {};
}

export function setRequestLogIdentity(req, fields = {}) {
  const next = {
    ...getRequestLogIdentity(req),
    ...fields,
  };
  req[REQUEST_LOG_IDENTITY] = next;
  appendLogContext(fields);
  return next;
}

export function createRequestLoggingMiddleware({ logger }) {
  if (!logger) {
    throw new Error('createRequestLoggingMiddleware requires a logger');
  }

  return function requestLoggingMiddleware(req, res, next) {
    const requestId = String(req.get('x-request-id') || randomUUID());
    const startedAt = Date.now();

    res.setHeader('x-request-id', requestId);

    withLogContext({ requestId, method: req.method, route: req.originalUrl || req.url }, () => {
      const requestLogger = getContextLogger(logger).child({ area: 'http' });
      requestLogger.info('server.request.started', {}, 'HTTP request started');

      let completed = false;
      const logCompletion = (event, message) => {
        if (completed) return;
        completed = true;
        requestLogger.info(event, {
          ...getRequestLogIdentity(req),
          durationMs: Date.now() - startedAt,
          statusCode: res.statusCode,
        }, message);
      };

      res.once('finish', () => logCompletion('server.request.completed', 'HTTP request completed'));
      res.once('close', () => {
        if (!res.writableEnded) {
          logCompletion('server.request.aborted', 'HTTP request aborted');
        }
      });

      next();
    });
  };
}