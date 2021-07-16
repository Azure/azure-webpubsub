import WebSocketClient from './websocketclient';

export function shareVideo(userName, receiver) {
  const receiverGroup = `${receiver}_data`
  let ws = new WebSocketClient(async function () {
    let res = await fetch('/negotiate');
    let data = await res.json();
    return data.url;
  }, userName, 5000);
  
  var video = document.querySelector("#videoElement");

  if (navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(function (stream) {
        stream.onaddtrack = event => {
          ws.sendImage(receiverGroup, event);
        }
        // video.srcObject = stream;
      })
      .catch(function (error) {
        console.log("Something went wrong!" + error);
      });
  }
}

export function viewVideo(userName) {
  let ws = new WebSocketClient(async function () {
    let res = await fetch('/negotiate');
    let data = await res.json();
    return data.url;
  }, userName, 5000);
  
  var video = document.querySelector("#videoElement");
  
  ws.onData = (data) => {
    video.srcObject = data;
  }
}
