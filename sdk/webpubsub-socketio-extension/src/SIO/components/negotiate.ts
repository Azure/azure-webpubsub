import {
  debugModule,
  AzureSocketIOOptions,
  AzureSocketIOCredentialOptions,
  getWebPubSubServiceClient,
  ConfigureNegotiateOptions,
  NegotiateOptions,
  NegotiateResponse,
  writeResponse,
} from "../../common/utils";
import { WEB_PUBSUB_OPTIONS_PROPERY_NAME } from "./constants";
import * as SIO from "socket.io";
import { Session } from "express-session";
import { IncomingMessage, ServerResponse } from "http";
import { parse } from "url";

const debug = debugModule("wps-sio-ext:SIO:negotiate");
const defaultNegotiateOptions: ConfigureNegotiateOptions = async () => ({} as NegotiateOptions);

/**
 * Returns a Express middleware to handle negotiate request
 *
 * @param io - a Socket.IO server processed by `useAzureSocketIO` or a option used by `useAzureSocketIO`.
 * @param configureNegotiateOptions - a customized function which defines how to extract information for negotiation from a HTTP request.
 * @returns
 */
export function negotiate(
  io: SIO.Server | AzureSocketIOOptions | AzureSocketIOCredentialOptions,
  configureNegotiateOptions?: ConfigureNegotiateOptions
): (req: IncomingMessage, res: ServerResponse, next: any) => void {
  debug(`getNegotiateExpressMiddleware`);

  const wpsOptions: AzureSocketIOOptions | AzureSocketIOCredentialOptions =
    io instanceof SIO.Server ? io[WEB_PUBSUB_OPTIONS_PROPERY_NAME] : io;
  const serviceClient = getWebPubSubServiceClient(wpsOptions);

  return async (req: IncomingMessage, res: ServerResponse, next: any): Promise<void> => {
    try {
      debug("negotiate, start");

      if (!configureNegotiateOptions) {
        configureNegotiateOptions = defaultNegotiateOptions;
      }
      const negotiateOptions = await configureNegotiateOptions(req);
      const tokenResponse = await serviceClient.getClientAccessToken(negotiateOptions);
      const url = new URL(tokenResponse.baseUrl);
      const message: NegotiateResponse = {
        endpoint: url.origin,
        path: url.pathname,
        token: tokenResponse.token,
      };
      writeResponse(res, 200, message);
      debug("negotiate, finished");
    } catch (e) {
      writeResponse(res, 500, { message: "Internal Server Error" });
      debug(`negotiate, error: ${e.message}`);
    }
  };
}

/**
 * Get a `ConfigureNegotiateOptions` used by `negotaite` to enable passport authentication.
 * Using this middleware, the user id of passport will be put into the response for negotiate request as a part of JWT token.
 * When the Socket.IO client connects to the server, the user id in JWT token will be extracted and the corresponding passport will be restored and `socket.request.user` will be available.
 *
 * @param assignProperty - the property name of passport object in `socket.request`. Default value is `user`. Reference: https://www.jsdocs.io/package/@types/passport#AuthenticateOptions.assignProperty
 * @returns
 */
export function usePassport(assignProperty = "user"): ConfigureNegotiateOptions {
  if (!assignProperty || assignProperty.length === 0) {
    throw new Error("Valid assignProperty is required.");
  }

  return async (req: IncomingMessage) => {
    const query = parse(req.url || "", true).query;
    const expirationMinutes = Number(query["expirationMinutes"] ?? 600);

    const passport = req[assignProperty];
    if (passport) {
      return { userId: passport.id, expirationTimeInMinutes: expirationMinutes };
    }
    return { expirationTimeInMinutes: expirationMinutes };
  };
}

/**
 * Get a Express which cooperates with `usePassport` to restore passport in `socket.request`.
 *
 * @param assignProperty - the property name of passport object in `socket.request`. Default value is `user`. Reference: https://www.jsdocs.io/package/@types/passport#AuthenticateOptions.assignProperty
 * @returns
 */
export function restorePassport(assignProperty = "user") {
  return (request: IncomingMessage, response: ServerResponse, next: any) => {
    try {
      const passportUserId = JSON.parse(request["claims"].userId);
      request["session"] = { passport: {} } as unknown as Session;
      request["session"]["passport"][assignProperty] = passportUserId;
    } catch (e) {
      debug(`restorePassport, error: ${e.message}`);
    }
    next();
  };
}

/**
 * Get a Express which cooperates with `negotiate` to restore claims in `socket.request`.
 *
 * @returns
 */ export function restoreClaims() {
  return (request: IncomingMessage, response: ServerResponse, next: any) => {
    try {
      if (!request["claims"]) return next();
      if (!request["claims"]["customClaims"]) return next();
    } catch (e) {
      debug(`restoreClaims, error: ${e.message}`);
    }
    next();
  };
}
