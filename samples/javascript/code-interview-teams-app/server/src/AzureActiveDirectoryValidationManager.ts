import jsonwebtoken, { VerifyOptions } from "jsonwebtoken";
import * as request from "request";
import AzureActiveDirectoryOptions from "./AzureActiveDirectoryOptions";

export default class AzureActiveDirectoryValidationManager {
  options: VerifyOptions;

  certificates: string[];

  constructor(options: AzureActiveDirectoryOptions) {
    this.options = {
      algorithms: ["RS256"],
      audience: options.audience,
    };

    this.certificates = [];

    this.updateCertificates(options.tenantId);
    setInterval(
      () => this.updateCertificates(options.tenantId),
      10 * 60 * 1000
    );

    return this;
  }

  convert(cert: string) {
    // Certificate must be in this specific format or else the function won't accept it
    var beginCert = "-----BEGIN CERTIFICATE-----";
    var endCert = "-----END CERTIFICATE-----";

    cert = cert.replace("\n", "");
    cert = cert.replace(beginCert, "");
    cert = cert.replace(endCert, "");

    var result = beginCert;
    while (cert.length > 0) {
      if (cert.length > 64) {
        result += "\n" + cert.substring(0, 64);
        cert = cert.substring(64, cert.length);
      } else {
        result += "\n" + cert;
        cert = "";
      }
    }

    if (result[result.length] != "\n") result += "\n";
    result += endCert + "\n";
    return result;
  }

  updateCertificates(tenantId: string) {
    let self = this;

    self.loadOpenIdConfig(tenantId, function (result: any, err: Error) {
      // TODO handle err
      console.log(result.jwks_uri);
      self.loadSigningKeys(
        result.jwks_uri,
        function (certificates: string[], err: Error) {
          // TODO handle err
          self.certificates = certificates;
        }
      );
    });
  }

  loadSigningKeys(jwks_uri: string, callback: Function) {
    let self = this;

    let config = {
      uri: jwks_uri,
      json: true,
    };
    request.get(config, function (err, response, result) {
      if (err) {
        callback(null, err);
      }

      let certificates: string[] = [];

      result.keys.forEach(function (key: any) {
        // let kid = key.kid;
        // if (!certificates[kid]) {
        //     certificates[kid] = []
        // }

        key.x5c.forEach(function (certStr: string) {
          console.log(key.kid, certStr.substring(0, 24) + "...");
          certificates.push(self.convert(certStr));
        });
      });

      callback(certificates, null);
    });
  }

  loadOpenIdConfig(tenantId: string, callback: Function) {
    let config = {
      url:
        "https://login.windows.net/" +
        tenantId +
        "/.well-known/openid-configuration",
      json: true,
    };
    console.log(config);

    request.get(config, function (err, response, result) {
      if (err) {
        callback(null, err);
      } else {
        callback(result, null);
      }
    });
  }

  verify(token: string, callback: Function) {
    let self = this;

    let valid = false;
    let lastErr = undefined;

    this.certificates.every(function (cert) {
      try {
        jsonwebtoken.verify(token, cert, self.options);
        valid = true;
        return false;
      } catch (err) {
        if (err instanceof Error) {
          lastErr = err;
          if (err.message === "invalid signature") {
            return true;
          }
        }
        return false;
      }
    });

    if (valid) {
      callback(jsonwebtoken.decode(token), undefined);
    } else {
      callback(undefined, lastErr);
    }
  }
}
