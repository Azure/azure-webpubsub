const { WebPubSubServiceClient } = require('@azure/web-pubsub');

if (process.argv.length !== 4) {
  console.log('Usage: node server <connection-string> <hub-name>');
  return 1;
}

async function main(){
    let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
    await serviceClient.sendToAll("text from server to all", {contentType: "text/plain"});
    await serviceClient.sendToAll("json from server to all");
    
    await serviceClient.sendToUser("user1", "text from server to user1", {contentType: "text/plain"});
    await serviceClient.sendToUser("user1", "json from server to user1");
    
    console.log(await serviceClient.hasGroup("group1"));
    console.log(await serviceClient.hasConnection("group1"));

    await serviceClient.grantPermission("DdshPJtmJSt0Xum5RkqzpAb7ec2a0b1", "joinLeaveGroup", {
          targetName: "group1"
        });
        
    await serviceClient.revokePermission("DdshPJtmJSt0Xum5RkqzpAb7ec2a0b1", "joinLeaveGroup", {
        targetName: "group1"
      });
    console.log("granted");
    // Use live trace to get the connectionId quickly
    // console.log(await serviceClient.hasPermission("DdshPJtmJSt0Xum5RkqzpAb7ec2a0b1", "joinLeaveGroup", {
    //     targetName: "group1"
    // }));
    
    // group related actions below
    let group = serviceClient.group("group1");
    
    // await group.addUser("user1");
    await group.sendToAll("text from group to all", {contentType: "text/plain"});
    await group.sendToAll("json from group to all");
}

main().catch(err=>console.log(err));