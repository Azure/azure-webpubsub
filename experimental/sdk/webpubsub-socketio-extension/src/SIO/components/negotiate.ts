import {
  debugModule,
  AzureSocketIOOptions,
  AzureSocketIOCredentialOptions,
  getWebPubSubServiceClient,
  ConfigureNegotiateOptions,
  NegotiateResponse,
} from "../../common/utils";
import * as SIO from "socket.io";
import { ExtendedError } from "socket.io/dist/namespace";
import { IncomingMessage, ServerResponse } from "http";

import {
  EXPRESS_SESSION_COOKIE_NAME,
  WEB_PUBSUB_OPTIONS_PROPERY_NAME,
  NEGOTIATE_PATH,
  DEFAULT_SIO_PATH,
} from "./constants";
import { Store } from "express-session";
import * as cookieParser from "cookie";
import { getAesCryptor } from "../../common/encrypt";
import { parse } from "url";

const debug = debugModule("wps-sio-ext:SIO:negotiate");

export function checkNegotiatePath(url: string, path = DEFAULT_SIO_PATH): boolean {
  const negotiatePathPrefix = path + (path.endsWith("/") ? "" : "/") + NEGOTIATE_PATH;
  return (
    url === negotiatePathPrefix ||
    url.startsWith(negotiatePathPrefix + "/") ||
    url.startsWith(negotiatePathPrefix + "?")
  );
}

/**
 * Returns a HTTP server middleware to handle negotiate request with path `/socket.io/negotiate'
 *
 * @param io - the Socket.IO server or its pure options
 * @param configureNegotiateOptions - a customized function which defines how to extract information for negotiation from a HTTP request
 * @returns
 */
export function getNegotiateHttpMiddleware(
  io: SIO.Server | AzureSocketIOOptions | AzureSocketIOCredentialOptions,
  configureNegotiateOptions: ConfigureNegotiateOptions
): (req: IncomingMessage, res: ServerResponse) => void {
  var wpsOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions = null;
  wpsOptions = io instanceof SIO.Server ? io[WEB_PUBSUB_OPTIONS_PROPERY_NAME] : io;
  const serviceClient = getWebPubSubServiceClient(wpsOptions);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!checkNegotiatePath(req.url)) return;
    try {
      debug("negotiate, start");
      const negotiateOptions = await configureNegotiateOptions(req);
      // Example: https://<web-pubsub-endpoint>?access_token=ABC.EFG.HIJ
      const tokenResponse = await serviceClient.getClientAccessToken(negotiateOptions);
      const url = new URL(tokenResponse.baseUrl);
      const message: NegotiateResponse = {
        endpoint: url.origin,
        path: url.pathname,
        token: tokenResponse.token,
      };
      writeJsonResponse(res, 200, message);
      debug("negotiate, finished");
    } catch (e) {
      writeJsonResponse(res, 500, { message: "Internal Server Error" });
      debug(`negotiate, error: ${e.message}`);
    }
  };
}

function writeJsonResponse(res: ServerResponse, statusCode: number, message: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(message));
}

/**
 * Get a Socket.IO middleware which makes `express-session` work.
 * Using this middleware, encrypted session cookie will be put into the response for negotiate request as a part of JWT token.
 * When the Socket.IO client connects to the server, the encrypted session cookie in JWT token will be decrypted and corresponding `socket.request.session` will be available.
 *
 * @param io - the Socket.IO server
 * @param secret - Secret key for AES-256-CBC algorithm used to encrypt/decrypt session cookie. Must be 256 bits (32 bytes). Example value: `crypto.randomBytes(32)`
 * @returns
 */
export function getSessionHttpMiddleware(
  io: SIO.Server | AzureSocketIOOptions | AzureSocketIOCredentialOptions,
  secret: Buffer,
  iv: Buffer
) {
  const crypto = getAesCryptor(secret, iv);

  const webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions =
    io instanceof SIO.Server ? io[WEB_PUBSUB_OPTIONS_PROPERY_NAME] : io;

  return getNegotiateHttpMiddleware(webPubSubOptions, async (req: IncomingMessage) => {
    const query = parse(req.url || "", true).query;
    const userId = query["userId"].toString();
    const expirationMinutes = Number(query["expirationMinutes"]) ?? undefined;

    const cookies = cookieParser.parse(req.headers.cookie);
    const sessionCookie = cookies[EXPRESS_SESSION_COOKIE_NAME];

    const encryptedSessionCookie = crypto.encrypt(sessionCookie);

    return {
      userId: userId,
      expirationTimeInMinutes: expirationMinutes,
      customClaims: {
        [EXPRESS_SESSION_COOKIE_NAME]: encryptedSessionCookie,
      },
    };
  });
}

/**
 * Returns a Socket.IO middleware to cooperate with `getSessionHttpMiddleware`
 *
 * @param secret - a 32 bytes key used in AES-256-CBC encryption / decryption
 * @param iv - a 16 bytes key used in AES-256-CBC encryption / decryption
 * @returns
 */
export function getSessionSocketIOMiddleware(secret: Buffer, iv: Buffer) {
  const crypto = getAesCryptor(secret, iv);
  return (socket: SIO.Socket, next: (err?: ExtendedError) => void) => {
    const customClaims = JSON.parse(socket.request["claims"].customClaims);
    const encryptedSessionCookie = customClaims[EXPRESS_SESSION_COOKIE_NAME];
    const decryptedSessionCookie = crypto.decrypt(encryptedSessionCookie);

    socket.request.headers.cookie =
      socket.request.headers.cookie ?? "" + cookieParser.serialize(EXPRESS_SESSION_COOKIE_NAME, decryptedSessionCookie);
    next();
  };
}

/**
 * Get a Socket.IO middleware which makes `passport` work.
 * Using this middleware, the user id of passport will be put into the response for negotiate request as a part of JWT token.
 * When the Socket.IO client connects to the server, the user id in JWT token will be extracted and the corresponding passport will be restored and `socket.request.user` will be available.
 *
 * @param io - the Socket.IO server
 * @param store - the storage for `express-session`
 * @param assignProperty - the property name of passport object in `socket.request`. Default value is `user`. Reference: https://www.jsdocs.io/package/@types/passport#AuthenticateOptions.assignProperty
 * @returns
 */
export function getPassportHttpMiddleware(
  io: SIO.Server | AzureSocketIOOptions | AzureSocketIOCredentialOptions,
  store: Store,
  assignProperty = "user"
) {
  if (!assignProperty || assignProperty.length === 0) {
    throw new Error("Valid assignProperty is required.");
  }

  const webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions =
    io instanceof SIO.Server ? io[WEB_PUBSUB_OPTIONS_PROPERY_NAME] : io;

  return getNegotiateHttpMiddleware(webPubSubOptions, async (req: IncomingMessage) => {
    const query = parse(req.url || "", true).query;
    const expirationMinutes = Number(query["expirationMinutes"]) ?? 600;

    const sessionId = req.headers.cookie.slice("connect.sid=s%3A".length).split(".")[0];
    const session = JSON.parse(store.sessions[sessionId]);
    const passportUserId = session.passport[assignProperty];

    return {
      userId: passportUserId,
      expirationTimeInMinutes: expirationMinutes,
    };
  });
}

/**
 * Get a Socket.IO middleware which cooperates with `getPassportHttpMiddleware`.
 *
 * @param assignProperty - the property name of passport object in `socket.request`. Default value is `user`. Reference: https://www.jsdocs.io/package/@types/passport#AuthenticateOptions.assignProperty
 * @returns
 */
export function getPassportSocketIOMiddleware(assignProperty = "user") {
  return (socket: SIO.Socket, next: (err?: ExtendedError) => void) => {
    const passportUserId = JSON.parse(socket.request["claims"].userId);
    socket.request["session"] = { passport: {} };
    socket.request["session"].passport[assignProperty] = passportUserId;
    next();
  };
}

/**
 * Using this middleware, you could put customized information into the response for negotiate request as a part of JWT token.
 * When the Socket.IO client connects to the server, your customized information could be accessed via `socket.request.claims`.
 *
 * @param io - the Socket.IO server
 * @param store - a customized negotiate configuration which defines the JWT token in the response for negotiate response
 * @returns
 */
export function getClaimsHttpMiddleware(
  io: SIO.Server | AzureSocketIOOptions | AzureSocketIOCredentialOptions,
  configureNegotiateOptions: ConfigureNegotiateOptions
) {
  const webPubSubOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions =
    io instanceof SIO.Server ? io[WEB_PUBSUB_OPTIONS_PROPERY_NAME] : io;

  return getNegotiateHttpMiddleware(webPubSubOptions, configureNegotiateOptions);
}

/**
 * Get a Socket.IO middleware which cooperates with `getClaimsHttpMiddleware`.
 *
 * @returns
 */
export function getClaimsSocketIOMiddleware() {
  return (socket: SIO.Socket, next: (err?: ExtendedError) => void) => {
    socket["claims"] = socket.request["claims"];
    socket["claims"]["customClaims"] = JSON.parse(socket["claims"]["customClaims"]);
    next();
  };
}
