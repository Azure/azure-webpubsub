import {WebPubSubClient} from "@azure/web-pubsub-client"

let id = prompt('Please input your user name');

let client = new WebPubSubClient({
  getClientAccessUrl: async _ => {
    let value = await (await fetch(`/negotiate?id=${id}`)).json();
    return value.url;
  }
});

client.on("connected", (e) => {
  console.log(`Connected: ${e.connectionId}.`);
});

let messages = document.querySelector('#messages');
client.on("server-message", (e) => {
  console.log(e.message.data);
  let d = document.createElement('p');
  let data = e.message.data;
  d.innerText = `[${data.type || ''}${data.from || ''}] ${data.message}`;
  messages.appendChild(d);
  window.scrollTo(0, document.body.scrollHeight);
});

let message = document.querySelector('#message');
message.addEventListener('keypress', async e => {
  if (e.charCode !== 13) return;
  await client.sendEvent("broadcast", message.value, "text");
  message.value = '';
});

(async function () {
  await client.start();
})();
