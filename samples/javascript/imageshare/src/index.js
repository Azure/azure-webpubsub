import WebSocketClient from './websocketclient';

export async function connect(userName, log) {
  let ws = new WebSocketClient(async function () {
    let res = await fetch('/negotiate');
    let data = await res.json();
    return data.url;
  }, userName, 5000, log);

  let sourceBuffer;
  let queue = [];
  let mediaSource = new MediaSource();
  mediaSource.onsourceopen = e => {
    sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs=vp8');
    sourceBuffer.onupdateend = () => {
      if (queue.length > 0) {
        sourceBuffer.appendBuffer(queue[0]);
        queue = queue.slice(1);
      }
    }
    sourceBuffer.mode = 'sequence';
    Initialize();
  }

  var video = document.querySelector("#receiveVideoElement");
  video.src = URL.createObjectURL(mediaSource);

  async function Initialize() {
    ws.onData = (data) => {
      if (sourceBuffer.updating === false && queue.length === 0) sourceBuffer.appendBuffer(data);
      else queue.push(data);
    }
  }

  return ws;
}

export async function shareVideo(ws, receiver, log) {
  const receiverGroup = `${receiver}_data`
  
  var video = document.querySelector("#videoElement");

  if (navigator.mediaDevices.getUserMedia) {
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ video: true });
      let recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' })
      recorder.ondataavailable = async event => {
        let data = await event.data.arrayBuffer();
        ws.sendData(receiverGroup, data);
      }
      setInterval(() => recorder.requestData(), 50);
      recorder.start();

      video.srcObject = stream;
    } catch (error) {
      log("Something went wrong!" + error);
    }
  }
}

// export async function viewVideo(userName) {
//   let ws = new WebSocketClient(async function () {
//     let res = await fetch('/negotiate');
//     let data = await res.json();
//     return data.url;
//   }, userName, 5000);
  
//   let sourceBuffer;
//   let queue = [];
//   let mediaSource = new MediaSource();
//   mediaSource.onsourceopen = e => {
//     sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs=vp8');
//     sourceBuffer.onupdateend = () => {
//       if (queue.length > 0) {
//         sourceBuffer.appendBuffer(queue[0]);
//         queue = queue.slice(1);
//       }
//     }
//     sourceBuffer.mode = 'sequence';
//     Initialize();
//   }

//   var video = document.querySelector("#receiveVideoElement");
//   video.src = URL.createObjectURL(mediaSource);

//   async function Initialize() {
//     let i = 0;
//     ws.onData = (data) => {
//       if (sourceBuffer.updating === false && queue.length === 0) sourceBuffer.appendBuffer(data);
//       else queue.push(data);
//     }
//   }
// }
