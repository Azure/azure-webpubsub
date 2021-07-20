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
    ws.onData = data => {
      if (sourceBuffer.updating === false && queue.length === 0) sourceBuffer.appendBuffer(data);
      else queue.push(data);
    }

    ws.onProtobufData = any => {
      let type = any.getTypeName();
      if (type == 'video.CameraControl') {
        let controlData = any.unpack(proto.video.CameraControl.deserializeBinary, 'video.CameraControl');
        app.receiveCall(data.client, controlData.getSender(), controlData.getReciver());
      } else if (type == 'video.CameraControlAck') {
        let ackData = any.unpack(proto.video.CameraControlAck.deserializeBinary, 'video.CameraControlAck');
        app.receiveAck(data.client, ackData.getApproved(), ackData.getSender(), ackData.getReciver());
      }
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

export async function callRequest(ws, user, receiver, log) {
  const receiverGroup = `${receiver}_control`

  const request = new proto.video.CameraControl();
  request.setSender(user);
  request.setReciver(receiver);
  ws.sendProtobufData(receiverGroup, request.serializeBinary(), 'video.CameraControl')
}

export async function ackRequest(ws, approved, user, receiver, log) {
  const receiverGroup = `${receiver}_control`

  const request = new proto.video.CameraControlAck();
  request.setSender(user);
  request.setReciver(receiver);
  request.setApproved(approved);
  ws.sendProtobufData(receiverGroup, request.serializeBinary(), 'video.CameraControlAck')
}