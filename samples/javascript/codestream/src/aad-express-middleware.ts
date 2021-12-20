import AzureActiveDirectoryValidationManager from "./aad-validation-manager";
import AzureActiveDirectoryOptions from "./aad-options";

export default class AzureActiveDirectoryExpressMiddlewareBuilder {
  constructor() {}

  build(options: AzureActiveDirectoryOptions) {
    var client = new AzureActiveDirectoryValidationManager(options);

    let middleware = function (req: any, res: any, next: Function) {
      let token;

      if (req.headers && req.headers.authorization) {
        var parts = req.headers.authorization.split(" ");
        if (parts.length == 2) {
          var scheme = parts[0];
          var credentials = parts[1];

          if (/^Bearer$/i.test(scheme)) {
            token = credentials;
          }
        }
      }

      if (!token) {
        return next();
      }

      client.verify(token, function (result: any, err: Error) {
        if (err) {
          console.log(err)
          return next(new Error("invalid_token"));
        }
        req.claims = result;
        next();
      });
    };
    return middleware;
  }
}

module.exports = new AzureActiveDirectoryExpressMiddlewareBuilder()