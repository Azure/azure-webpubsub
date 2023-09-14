import {
  debugModule,
  AzureSocketIOOptions,
  AzureSocketIOCredentialOptions,
  getWebPubSubServiceClient,
  ConfigureNegotiateOptions,
  NegotiateResponse,
  toAsync,
} from "../../common/utils";
import { WEB_PUBSUB_OPTIONS_PROPERY_NAME, DEFAULT_SIO_PATH } from "./constants";
import * as SIO from "socket.io";
import session, { Store, Session } from "express-session";
import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { parse } from "url";

const debug = debugModule("wps-sio-ext:SIO:negotiate");

/**
 * Returns a HTTP server middleware to handle negotiate request with path `/socket.io/negotiate'
 *
 * @param io - the Socket.IO server or its pure options
 * @param configureNegotiateOptions - a customized function which defines how to extract information for negotiation from a HTTP request
 * @returns
 */
export function negotiate(
  path: string,
  io: SIO.Server | AzureSocketIOOptions | AzureSocketIOCredentialOptions,
  configureNegotiateOptions: ConfigureNegotiateOptions
): (req: ExpressRequest, res: ExpressResponse, next: any) => void {
  debug(`getNegotiateExpressMiddleware, path: ${path}`);

  if (path.startsWith(DEFAULT_SIO_PATH)) {
    throw new Error(`Negotiate path ${path} cannot starts with "${DEFAULT_SIO_PATH}"`);
  }

  const wpsOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions =
    io instanceof SIO.Server ? io[WEB_PUBSUB_OPTIONS_PROPERY_NAME] : io;
  const serviceClient = getWebPubSubServiceClient(wpsOptions);

  return async (req: ExpressRequest, res: ExpressResponse, next: any): Promise<void> => {
    if (!req.url.startsWith(path)) return next();

    try {
      debug("negotiate, start");

      const negotiateOptions = await configureNegotiateOptions(req);
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

function writeJsonResponse(res: ExpressResponse, statusCode: number, message: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(message));
}

/**
 * Get a Socket.IO middleware which makes `passport` work.
 * Using this middleware, the user id of passport will be put into the response for negotiate request as a part of JWT token.
 * When the Socket.IO client connects to the server, the user id in JWT token will be extracted and the corresponding passport will be restored and `socket.request.user` will be available.
 *
 * @param path - the path of negotiate request. For Example `/negotiate`.
 * @param store - the storage for `express-session`
 * @param assignProperty - the property name of passport object in `socket.request`. Default value is `user`. Reference: https://www.jsdocs.io/package/@types/passport#AuthenticateOptions.assignProperty
 * @returns
 */
export function usePassport(path: string, store: Store, assignProperty = "user"): ConfigureNegotiateOptions {
  if (!assignProperty || assignProperty.length === 0) {
    throw new Error("Valid assignProperty is required.");
  }

  const getSessionAsyncFromFromStore = toAsync<{ err: any; session?: session.SessionData | null }>(store.get);
  return async (req: ExpressRequest) => {
    const query = parse(req.url || "", true).query;
    const expirationMinutes = Number(query["expirationMinutes"] ?? 600);

    const sessionId = req.headers.cookie.slice("connect.sid=s%3A".length).split(".")[0];

    const getSessionCallbackParameters = await getSessionAsyncFromFromStore(sessionId);

    if (!getSessionCallbackParameters.err && getSessionCallbackParameters.session) {
      const session = getSessionCallbackParameters.session;
      const passportUserId = session["passport"][assignProperty];

      return { userId: passportUserId, expirationTimeInMinutes: expirationMinutes };
    }
    return { expirationTimeInMinutes: expirationMinutes };
  };
}

/**
 * Get a Express which cooperates with `usePassport(...)`.
 *
 * @param assignProperty - the property name of passport object in `socket.request`. Default value is `user`. Reference: https://www.jsdocs.io/package/@types/passport#AuthenticateOptions.assignProperty
 * @returns
 */
export function restorePassport(assignProperty = "user") {
  return (request: ExpressRequest, response: ExpressResponse, next: any) => {
    const passportUserId = JSON.parse(request["claims"].userId);
    request["session"] = { passport: {} } as unknown as Session;
    request["session"]["passport"][assignProperty] = passportUserId;
    next();
  };
}

/**
 * Get a Express .IO middleware which cooperates with `negotiate`.
 *
 * @returns
 */
export function restoreClaims() {
  return (request: ExpressRequest, response: ExpressResponse, next: any) => {
    if (Object.keys((request["claims"] ?? {}) as Record<string, string[]>).length > 0) {
      request["claims"]["customClaims"] = JSON.parse(request["claims"]["customClaims"]);
    }
    next();
  };
}
