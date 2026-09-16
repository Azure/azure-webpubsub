import WebSocketClient from './websocketclient';
const { CameraControl, CameraControlAck } = require('./generated/video').video;

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
    ws.onopen = () => {
      data.client.connected = true;
    }

    ws.onclose = () => {
      data.client.connected = false;
    }

    ws.onData = data => {
      if (sourceBuffer.updating === false && queue.length === 0) sourceBuffer.appendBuffer(data);
      else queue.push(data);
    }

    ws.onProtobufData = any => {
      let type = any.type_url.split('/').pop();
      if (type == 'video.CameraControl') {
        let controlData = CameraControl.decode(any.value);
        app.receiveCall(data.client, controlData.sender, controlData.reciver);
      } else if (type == 'video.CameraControlAck') {
        let ackData = CameraControlAck.decode(any.value);
        app.receiveAck(data.client, ackData.approved, ackData.sender, ackData.reciver);
      }
    }

    ws.connect();
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
      setInterval(() => recorder.requestData(), 100);
      recorder.start();

      video.srcObject = stream;
    } catch (error) {
      log("Something went wrong!" + error);
    }
  }
}

export async function callRequest(ws, user, receiver, log) {
  const receiverGroup = `${receiver}_control`

  const request = CameraControl.create({ sender: user, reciver: receiver });
  ws.sendProtobufData(receiverGroup, CameraControl.encode(request).finish(), 'video.CameraControl')
}

export async function ackRequest(ws, approved, user, receiver, log) {
  const receiverGroup = `${receiver}_control`

  const request = CameraControlAck.create({ sender: user, reciver: receiver, approved });
  ws.sendProtobufData(receiverGroup, CameraControlAck.encode(request).finish(), 'video.CameraControlAck')
}