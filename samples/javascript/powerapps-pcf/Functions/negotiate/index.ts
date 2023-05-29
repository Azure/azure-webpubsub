import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { WebPubSubServiceClient } from "@azure/web-pubsub";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('HTTP trigger function processed a request.');
    let serviceClient = new WebPubSubServiceClient("<webpubsub-connection-string>", "synchub");
    let token = await serviceClient.getClientAccessToken({ roles: ["webpubsub.sendToGroup.pa", "webpubsub.joinLeaveGroup.pa"] }); 
    context.res = {
        // status: 200, /* Defaults to 200 */
        body: token.url
    };

};

export default httpTrigger;