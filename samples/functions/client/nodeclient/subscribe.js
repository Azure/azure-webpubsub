const WebSocket = require('ws');
const axios = require('axios');

async function main() {
  let funcUrl = 'http://localhost:7071';
  if (process.argv.length == 2) {
    console.log(`Use default local function endpoint: ${funcUrl}`);
  }
  else if (process.argv.length == 3)
  {
    funcUrl = process.argv[2];
    console.log(`Use function endpoint: ${funcUrl}`);
  }

  axios.get(`${funcUrl}/api/login`)
    .then(resp => {
      let url = resp.data.url;
      let ws = new WebSocket(url);
      ws.on('open', () => console.log('connected'));
      ws.on('message', data => console.log(data));
    });
}

main();