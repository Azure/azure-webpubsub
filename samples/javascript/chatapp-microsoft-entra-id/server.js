const express = require("express");
const { WebPubSubServiceClient } = require("@azure/web-pubsub");
const { WebPubSubEventHandler } = require("@azure/web-pubsub-express");
const {
  AzureAuthorityHosts,
  ClientAssertionCredential,
  ClientAssertionCredentialOptions,
  ClientCertificateCredential,
  ClientCertificateCredentialOptions,
  ClientSecretCredential,
  ClientAssertionCredentialOptions,
  ManagedIdentityCredential,
  ManagedIdentityCredentialOptions,
  VisualStudioCodeCredential,
  VisualStudioCodeCredentialOptions,
} = require("@azure/identity");

const app = express();
const hubName = "sample_chat";

let endpoint = process.argv[2]; // sample: https://<name>.webpubsub.azure.com

const AuthType = Object.freeze({
  VisualStudioCode: 0,
  ApplicationWithClientSecret: 1,
  ApplicationWithCertification: 2,
  ApplicationWithFederatedIdentity: 3,
  SystemAssignedMSI: 4,
  UserAssignedMSI: 5,
});

var authType = AuthType.VisualStudioCode;

function GetTokenCredential(authType) {
  switch (authType) {
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

function GetVisualStudioCodeCredential() {
  let options = new VisualStudioCodeCredentialOptions();
  // options.AuthorityHost = AzureAuthorityHosts.AzureChina; // Entra ID China operated by 21Vianet
  // options.AuthorityHost = AzureAuthorityHosts.AzureGovernment; // Entra ID US Government
  options.AuthorityHost = AzureAuthorityHosts.AzurePublicCloud;
  return new VisualStudioCodeCredential(options);
}

function GetApplicationWithClientSecretCredential() {
  let options = new ClientAssertionCredentialOptions();
  // options.AuthorityHost = AzureAuthorityHosts.AzureChina; // Entra ID China operated by 21Vianet
  // options.AuthorityHost = AzureAuthorityHosts.AzureGovernment; // Entra ID US Government
  options.authorityHost = AzureAuthorityHosts.AzurePublicCloud;
  return new ClientSecretCredential("<tenantId>", "<clientId>", "<clientSecret>", options);
}

function GetApplicationWithCertificationCredential() {
  let options = new ClientCertificateCredentialOptions();
  // options.AuthorityHost = AzureAuthorityHosts.AzureChina; // Entra ID China operated by 21Vianet
  // options.AuthorityHost = AzureAuthorityHosts.AzureGovernment; // Entra ID US Government
  options.authorityHost = AzureAuthorityHosts.AzurePublicCloud;
  return new ClientCertificateCredential("<tenantId>", "<clientId>", "<pathToCert>", options);
}

function GetApplicationWithFederatedIdentityCredential() {
  let msiCredential = new ManagedIdentityCredential("<msiClientId>");
  let options = new ClientAssertionCredentialOptions();
  // options.AuthorityHost = AzureAuthorityHosts.AzureChina; // Entra ID China operated by 21Vianet
  // options.AuthorityHost = AzureAuthorityHosts.AzureGovernment; // Entra ID US Government
  options.authorityHost = AzureAuthorityHosts.AzurePublicCloud;
  return new ClientAssertionCredential("<tenantId>", "<clientId>", () => {
    // Entra ID US Government: api://AzureADTokenExchangeUSGov
    // Entra ID China operated by 21Vianet: api://AzureADTokenExchangeChina
    var scope = "api://AzureADTokenExchange/.default";
    return msiCredential.getToken(scope);
  }, options);
}

function GetSystemAssignedMSICredential() {
  let options = new ManagedIdentityCredentialOptions();
  // options.AuthorityHost = AzureAuthorityHosts.AzureChina; // Entra ID China operated by 21Vianet
  // options.AuthorityHost = AzureAuthorityHosts.AzureGovernment; // Entra ID US Government
  options.authorityHost = AzureAuthorityHosts.AzurePublicCloud;
  return new ManagedIdentityCredential(options);
}

function GetUserAssignedMSICredential() {
  return new ManagedIdentityCredential("<msiClientId>", options);
}


let credential = GetTokenCredential(authType);

let serviceClient = new WebPubSubServiceClient(endpoint, credential, hubName);

let handler = new WebPubSubEventHandler(hubName, {
  path: "/eventhandler",
  handleConnect: async (req, res) => {
    console.log(req);
    await serviceClient.sendToAll({
      type: "system",
      message: `${req.context.userId} joined`,
    });
    console.log("123");
    res.success();
  },
  handleUserEvent: async (req, res) => {
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
app.get("/negotiate", async (req, res) => {
  let id = req.query.id;
  if (!id) {
    res.status(400).send("missing user id");
    return;
  }
  let token = await serviceClient.getClientAccessToken({ userId: id });
  res.json({
    url: token.url,
  });
});

app.use(express.static("public"));
app.listen(8080, () => console.log("server started"));
