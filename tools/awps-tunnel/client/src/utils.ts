import { RESTApi } from "./models";

export async function loadApiSpec(): Promise<RESTApi> {
  const response = await fetch(`./api/${process.env.REACT_APP_API_VERSION}/webpubsub.json`);
  const apiSpec = await response.json() as RESTApi;
  // expand the schema reference into the schema
  Object.entries(apiSpec.paths).forEach(([path, item]) => {
    Object.entries(item).forEach(([method, operation]) => {
      if (operation.consumes) {
        operation.consumes = operation.consumes.sort();
      }
      if (operation.parameters) {
        operation.parameters.forEach((v) => {
          if (v.schema?.$ref) {
            const definitionKey = v.schema.$ref.slice("#/definitions/".length);
            const def = apiSpec.definitions[definitionKey];
            if (def) {
              v.schema = def;
              v.type = v.schema.type;
            } else {
              console.error(`unexpected definition ${definitionKey}`);
            }
          }
        })
      } if (operation.responses) {
        Object.entries(operation.responses).forEach(([code, v]) => {
          if (v.schema?.$ref) {
            v.schema = apiSpec.definitions[v.schema.$ref];
          }
        })
      }
    })
  });
  return apiSpec;
}

export function hasJsonBody(methodName: string, header: Headers): boolean {
    if (methodName === "head") {
        return false;
    }
    const contentType = header.get("Content-Type");
    if (!contentType) {
        return false;
    }

    return isJsonContent(contentType);
}

export function isJsonContent(contentType: string | undefined):boolean{
    if (!contentType){
        return false;
    }
    return contentType.includes("application/json") || contentType.includes("text/json") || contentType.includes("application/problem+json");
}