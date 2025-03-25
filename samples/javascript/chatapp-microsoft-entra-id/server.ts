import express, { Request, Response } from "express";

import dotenv from "dotenv";

import {
  AzurePowerShellCredential,
  VisualStudioCodeCredential,
  ClientSecretCredential,
  ClientSecretCredentialOptions,
  ClientCertificateCredential,
  ClientCertificateCredentialOptions,
  ClientAssertionCredential,
  ManagedIdentityCredential,
  TokenCredential,
  TokenCredentialOptions,
  AzureAuthorityHosts,
} from "@azure/identity";

import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { WebPubSubEventHandler, ConnectRequest, UserEventRequest } from "@azure/web-pubsub-express";

dotenv.config();

const endpoint = process.env.WEB_PUBSUB_ENDPOINT || ""; // Default to an empty string if not set
const hubName = process.env.HUB_NAME || "default_hub";
const tenantId = process.env.TENANT_ID || "";
const appClientId = process.env.APP_CLIENT_ID || "";
const clientSecret = process.env.CLIENT_SECRET || "";
const certPath = process.env.CERT_PATH || "";
const msiClientId = process.env.MSI_CLIENT_ID || "";

const app = express();

enum AuthType {
  AzurePowershell,
  VisualStudioCode,
  ApplicationWithClientSecret,
  ApplicationWithCertification,
  ApplicationWithFederatedIdentity,
  SystemAssignedMSI,
  UserAssignedMSI,
}

let authType: AuthType = AuthType.AzurePowershell;

function GetTokenCredential(authType: AuthType): TokenCredential {
  switch (authType) {
    case AuthType.AzurePowershell:
      return GetAzurePowershellCredential();
    case AuthType.VisualStudioCode:
      return GetVisualStudioCodeCredential();
    case AuthType.ApplicationWithClientSecret:
      return GetApplicationWithClientSecretCredential();
    case AuthType.ApplicationWithCertification:
      return GetApplicationWithCertificationCredential();
    case AuthType.ApplicationWithFederatedIdentity:
      return GetApplicationWithFederatedIdentityCredential();
    case AuthType.SystemAssignedMSI:
      return GetSystemAssignedMSICredential();
    case AuthType.UserAssignedMSI:
      return GetUserAssignedMSICredential();
    default:
      throw new Error("Invalid auth type");
  }
}

function GetAzurePowershellCredential(): AzurePowerShellCredential {
  return new AzurePowerShellCredential();
}

function GetVisualStudioCodeCredential(): VisualStudioCodeCredential {
  return new VisualStudioCodeCredential();
}

function GetApplicationWithClientSecretCredential(): ClientSecretCredential {
  const options: ClientSecretCredentialOptions = {
    // China: AzureAuthorityHosts.AzureChina
    // US Government: AzureAuthorityHosts.AzureGovernment
    authorityHost: AzureAuthorityHosts.AzurePublicCloud,
  };
  return new ClientSecretCredential(tenantId, appClientId, clientSecret, options);
}

function GetApplicationWithCertificationCredential(): ClientCertificateCredential {
  const options: ClientCertificateCredentialOptions = {
    // China: AzureAuthorityHosts.AzureChina
    // US Government: AzureAuthorityHosts.AzureGovernment
    authorityHost: AzureAuthorityHosts.AzurePublicCloud,
  };
  return new ClientCertificateCredential(tenantId, appClientId, certPath, options);
}

function GetApplicationWithFederatedIdentityCredential(): ClientAssertionCredential {
  const options: TokenCredentialOptions = {
    // China: AzureAuthorityHosts.AzureChina
    // US Government: AzureAuthorityHosts.AzureGovernment
    authorityHost: AzureAuthorityHosts.AzurePublicCloud,
  };
  const msiCredential = new ManagedIdentityCredential(msiClientId, options);
  return new ClientAssertionCredential(
    tenantId,
    appClientId,
    async () => {
      // Entra ID US Government: api://AzureADTokenExchangeUSGov
      // Entra ID China operated by 21Vianet: api://AzureADTokenExchangeChina
      const scope = "api://AzureADTokenExchange/.default";
      const token = await msiCredential.getToken(scope);

      if (!token?.token) {
        throw new Error("Failed to get token from MSI");
      }
      return token.token;
    },
    options,
  );
}

function GetSystemAssignedMSICredential(): ManagedIdentityCredential {
  const options: TokenCredentialOptions = {
    authorityHost: AzureAuthorityHosts.AzurePublicCloud,
  };
  return new ManagedIdentityCredential(options);
}

function GetUserAssignedMSICredential(): ManagedIdentityCredential {
  const options: TokenCredentialOptions = {
    authorityHost: AzureAuthorityHosts.AzurePublicCloud,
  };
  return new ManagedIdentityCredential(msiClientId, options);
}

const credential: TokenCredential = GetTokenCredential(authType);
const serviceClient = new WebPubSubServiceClient(endpoint, credential, hubName);

const handler = new WebPubSubEventHandler(hubName, {
  path: "/eventhandler",
  handleConnect: async (req: ConnectRequest, res) => {
    console.log(req);
    await serviceClient.sendToAll({
      type: "system",
      message: `${req.context.userId} joined`,
    });
    res.success();
  },
  handleUserEvent: async (req: UserEventRequest, res) => {
    if (req.context.eventName === "message") {
      await serviceClient.sendToAll({
        from: req.context.userId,
        message: req.data,
      });
    }
    res.success();
  },
  allowedEndpoints: [endpoint],
});

app.use(handler.getMiddleware());
app.get("/negotiate", async (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (!id) {
    res.status(400).send("missing user id");
    return;
  }
  const token = await serviceClient.getClientAccessToken({ userId: id });
  res.json({
    url: token.url,
  });
});

app.use(express.static("public"));
app.listen(8080, () => console.log("server started"));
