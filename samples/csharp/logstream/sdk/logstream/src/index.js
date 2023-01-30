import {WebPubSubClient} from "@azure/web-pubsub-client"

let client = new WebPubSubClient({
  getClientAccessUrl: async _ => {
    let value = await (await fetch(`/negotiate`)).json();
    return value.url;
  }
});

client.on("connected", (e) => {
  console.log(`Connected: ${e.connectionId}.`);
});

let output = document.querySelector('#output');

client.on("group-message", (e) => {
  let d = document.createElement('span');
  d.innerText = e.message.data;
  output.appendChild(d);
  window.scrollTo(0, document.body.scrollHeight);
});

(async function () {
  await client.start();
  await client.joinGroup("stream");
})();
