# Work with subprotocols

In previous tutorials you have learned how to use WebSocket APIs to send and receive data with Azure Web PubSub. You can see there is no protocol needed when client is communicating with the service. For example, you can use `WebSocket.send()` to send any data and server will receive the data as is. This is easy to use, but functionality is also limited. You cannot, for example, specify the event name when sending the event to server, or publish message to other clients instead of sending it to server. In this tutorial you will learn how to use subprotocol to extend the functionality of client.

## Using a subprotocol

To specify a subprotocol, you just need to use the [protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#parameters) parameter in the constructor:

```javascript
let ws = new WebSocket(url, protocol);
```

Currently Azure Web PubSub only supports one subprotocol: `json.webpubsub.azure.v1`.

> If you use other protocol names, they will be ignored by the service and passthrough to server in the connect event handler, so you can build your own protocols.

Now let's update the chat app to use this subprotocol.

First update the WebSocket constructor to use the subprotocol:

```javascript
let ws = new WebSocket(data.url, 'json.webpubsub.azure.v1');
```

Then start the server and open your browser, type your username, you'll see the joined message is now different:

```json
{"type":"message","from":"server","dataType":"text","data":"\"[SYSTEM] <username> joined\""}
```

Instead of a plain text of "someone joined", client now receives a json message that contains more information, like what's the message type and where it is from. So you can use this information to do additional processing to the message (for example, display the message in a different style if it's from a different source).

Now if you try to send something to others, you'll receive an error message and the connection will be closed.

```json
{"type":"system","event":"close","message":"Failed to process invalid incoming payload."}
```

This is because service now expects a message in json format that follows the subprotocol but we're sending a plain text. So let's change the send part to send a json message:

```javascript
message.addEventListener('keypress', e => {
  if (e.charCode !== 13) return;
  ws.send(JSON.stringify({
    type: 'event',
    event: 'message',
    dataType: 'text',
    data: message.value
  }));
  message.value = '';
});
```

You can see you need to specify message type, event type and data type together with the message body. This means you can also send other message or event type if you want, which is not possible if you're not using subprotocol.

Also change the receive part to show the message text instead of the json:

```javascript
ws.onmessage = event => {
  let m = document.createElement('p');
  m.innerText = JSON.parse(event.data).data;
  messages.appendChild(m);
};
```

Here we simply parse the json message and get the message body from it.

Now rerun the app you'll see it's working as before.
