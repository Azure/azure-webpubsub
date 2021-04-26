import Diagram from './diagram';
import WebSocketClient from './websocketclient';

function resizeImage(data, maxSize) {
  let dataURLToBlob = dataURL => {
    let BASE64_MARKER = ';base64,';
    if (dataURL.indexOf(BASE64_MARKER) == -1) {
      let parts = dataURL.split(',');
      let contentType = parts[0].split(':')[1];
      let raw = parts[1];

      return new Blob([raw], { type: contentType });
    }

    let parts = dataURL.split(BASE64_MARKER);
    let contentType = parts[0].split(':')[1];
    let raw = window.atob(parts[1]);
    let rawLength = raw.length;

    let uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  return new Promise(resolve => {
    if (!maxSize) {
      resolve(false);
      return;
    }

    let reader = new FileReader();
    reader.onload = readerEvent => {
      let image = new Image();
      image.onload = function (imageEvent) {
        let canvas = document.createElement('canvas');
        let ratio = Math.max(image.width / maxSize, image.height / maxSize);
        if (ratio < 1) {
          resolve(false);
          return;
        }
        canvas.width = image.width / ratio;
        canvas.height = image.height / ratio;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(dataURLToBlob(canvas.toDataURL('image/jpeg')));
      }
      image.src = readerEvent.target.result;
    }
    reader.readAsDataURL(data);
  });
}

async function initialize() {
  let tools = {
    polyline: {
      start: (x, y) => [x, y],
      move: (x, y, d) => { d.push(x, y); return [x, y]; },
      draw: (b, d) => b.polyline(d),
      update: (e, d) => e.plot(d)
    },
    line: {
      start: (x, y) => [x, y, x, y],
      move: (x, y, d) => { d[2] = x; d[3] = y; },
      draw: (b, d) => b.line(d),
      update: (e, d) => e.plot(d)
    },
    rect: {
      start: (x, y) => [x, y, x, y],
      move: (x, y, d) => { d[2] = x; d[3] = y; },
      draw: (b, d) => b.rect(Math.abs(d[2] - d[0]), Math.abs(d[3] - d[1])).move(Math.min(d[0], d[2]), Math.min(d[1], d[3])),
      update: (e, d) => e.x(Math.min(d[2], d[0])).y(Math.min(d[1], d[3])).size(Math.abs(d[2] - d[0]), Math.abs(d[3] - d[1]))
    },
    circle: {
      start: (x, y) => [x, y, 0],
      move: (x, y, d) => { d[2] = Math.floor(Math.sqrt((d[0] - x) * (d[0] - x) + (d[1] - y) * (d[1] - y))) },
      draw: (b, d) => b.circle(d[2] * 2).cx(d[0]).cy(d[1]),
      update: (e, d) => e.cx(d[0]).cy(d[1]).radius(d[2])
    },
    ellipse: {
      start: (x, y) => [x, y, x, y],
      move: (x, y, d) => { d[2] = x; d[3] = y; },
      draw: (b, d) => b.ellipse(Math.abs(d[2] - d[0]), Math.abs(d[3] - d[1])).cx((d[0] + d[2]) / 2).cy((d[1] + d[3]) / 2),
      update: (e, d) => e.cx((d[0] + d[2]) / 2).cy((d[1] + d[3]) / 2).radius(Math.abs(d[2] - d[0]) / 2, Math.abs(d[3] - d[1]) / 2)
    }
  };

  let diagram = new Diagram(SVG('whiteboard'), tools);
  let author = Math.random().toString(36).substr(2, 8);
  let appData = {
    connected: false,
    totalUsers: 1,
    hasUndo: false,
    hasRedo: false,
    tool: 'polyline',
    color: 'black',
    width: 1,
    tools: Object.keys(tools),
    colors: ['black', 'grey', 'darkred', 'red', 'orange', 'yellow', 'green', 'deepskyblue', 'indigo', 'purple'],
    widths: [1, 2, 4, 8],
    messages: [],
    messageColor: 'black',
    name: '',
    draft: '',
    showLog: true,
    maxImageSize: 1920,
    diagram: diagram
  };

  let ws = new WebSocketClient(async function () {
    let res = await fetch('/negotiate');
    let data = await res.json();
    return data.url;
  }, 5000);

  ws.onopen = () => {
    appData.connected = true;
    diagram.removeAll();
  };
  ws.onclose = () => appData.connected = false;
  ws.onmessage = event => {
    let data = JSON.parse(event.data);
    switch (data.name) {
      case 'clear': {
        let a = data.data;
        if (author !== a) diagram.removeAll();
        break;
      }
      case 'shapeUpdated': {
        let [a, i, m] = data.data;
        if (author !== a) diagram.updateShape(i, m);
        break;
      }
      case 'shapePatched': {
        let [a, i, d] = data.data;
        if (author !== a) diagram.patchShape(i, d);
        break;
      }
      case 'shapeRemoved': {
        let [a, i] = data.data;
        if (author !== a) diagram.removeShape(i);
        break;
      }
      case 'backgroundUpdated': {
        let i = data.data;
        diagram.updateBackground('/background/' + i);
        break;
      }
      case 'newMessage': {
        let [a, n, m] = data.data;
        if (author !== a) appData.messages.push({ name: n, message: m });
        break;
      }
      case 'userUpdated': {
        let n = data.data;
        appData.totalUsers = n;
        break;
      }
    }
  };

  diagram.onShapeUpdate((i, m) => ws.send(JSON.stringify({
    name: 'updateShape',
    data: [author, i, m]
  })));
  diagram.onShapeRemove(i => ws.send(JSON.stringify({
    name: 'removeShape',
    data: [author, i]
  })));
  diagram.onShapePatch((i, d) => ws.send(JSON.stringify({
    name: 'patchShape',
    data: [author, i, d]
  })));
  diagram.onClear(() => ws.send(JSON.stringify({
    name: 'clear',
    data: author
  })));
  diagram.onHistoryChange((p, f) => [appData.hasUndo, appData.hasRedo] = [p, f]);

  let app = new Vue({
    el: '#app',
    data: appData,
    methods: {
      upload: async function () {
        let b = await resizeImage(event.target.files[0], this.maxImageSize);
        let formData = new FormData($('#uploadForm')[0]);
        if (b) {
          formData.delete('file');
          formData.append('file', b);
        }
        await fetch('/background/upload', {
          method: 'POST',
          body: formData
        });
        $('#uploadForm')[0].reset();
      },
      zoomIn: () => diagram.zoom(1.25),
      zoomOut: () => diagram.zoom(0.8),
      sendMessage: function () {
        if (!this.draft) return;
        this.messages.push({ name: this.name, message: this.draft });
        ws.send(JSON.stringify({
          name: 'sendMessage',
          data: [author, this.name, this.draft]
        }));
        this.draft = '';
      },
      setName: function () { if (this.name) $('#inputName').modal('toggle'); },
      toggleLog: function () { this.showLog = !this.showLog; },
      showSettings: () => $("#settings").modal({ backdrop: 'static', keyboard: false })
    }
  });

  let modes = {
    panAndZoom: {
      startOne: p => 0,
      moveOne: (p, pp) => diagram.pan(pp[0] - p[0], pp[1] - p[1]),
      startTwo: (p1, p2) => 0,
      moveTwo: (p1, p2, pp1, pp2) => {
        let r = Math.sqrt(((p2[0] - p1[0]) * (p2[0] - p1[0]) + (p2[1] - p1[1]) * (p2[1] - p1[1]))
          / ((pp2[0] - pp1[0]) * (pp2[0] - pp1[0]) + (pp2[1] - pp1[1]) * (pp2[1] - pp1[1])));
        diagram.pan(pp1[0] - p1[0] / r, pp1[1] - p1[1] / r);
        diagram.zoom(r);
      },
      end: () => 0
    },
    draw: {
      startOne: p => { if (appData.connected) diagram.startShape(appData.tool, appData.color, appData.width, p[0], p[1]); },
      moveOne: (p, pp) => { if (appData.connected) diagram.drawShape(p[0], p[1]); },
      startTwo: () => 0,
      moveTwo: () => 0,
      end: () => { if (appData.connected) diagram.endShape(); }
    }
  };

  // hook mouse and touch events for whiteboard
  let mode;
  let prev;
  let started;
  let start = p => {
    if (!mode) return;
    prev = p;
  };
  let move = p => {
    if (!mode) return;
    if (prev.length !== p.length) return;
    // do not start if the move is too small
    if (!started && p.length === 1 && Math.abs(p[0][0] - prev[0][0]) < 5 && Math.abs(p[0][1] - prev[0][1]) < 5) return;
    else {
      started = true;
      if (p.length === 1) modes[mode].startOne(prev[0]);
      else if (p.length === 2) modes[mode].startTwo(prev[0], prev[1]);
    }
    if (p.length === 1) modes[mode].moveOne(p[0], prev[0]);
    else if (p.length === 2) modes[mode].moveTwo(p[0], p[1], prev[0], prev[1]);
    prev = p;
  };
  let end = p => {
    if (!mode) return;
    if (started) modes[mode].end();
    prev = started = null;
  };
  let map = (ts, f) => {
    let ps = [];
    for (let i = 0; i < ts.length; i++) ps.push(f(ts[i]));
    return ps;
  };
  $('#whiteboard')
    .on('mousedown', e => {
      mode = e.ctrlKey ? 'panAndZoom' : 'draw';
      start([[e.offsetX, e.offsetY]]);
    }).on('mousemove', e => {
      move([[e.offsetX, e.offsetY]]);
    }).on('mouseup', e => {
      end();
      mode = null;
    }).on('touchstart', e => {
      if (e.touches.length > 2) return;
      if (prev) end();
      mode = e.touches.length === 1 ? 'draw' : 'panAndZoom';
      start(map(e.touches, t => [t.pageX, t.pageY - 66]));
      e.preventDefault();
    }).on('touchmove', e => {
      move(map(e.touches, t => [t.pageX, t.pageY - 66]));
      e.preventDefault();
    }).on('touchend', e => {
      end();
      mode = null;
      e.preventDefault();
    }).on('touchcancel', e => {
      end();
      mode = null;
      e.preventDefault();
    });

  // disable keyboard events for username dialog
  $("#inputName").on('shown.bs.modal', () => {
    $('#username').focus();
  }).modal({
    backdrop: 'static',
    keyboard: false
  });

  // update zoom level for small devices
  let w = window.innerWidth;
  diagram.zoom(w < 576 ? 1 / 3 :
    w < 768 ? 1 / 2 :
      w < 992 ? 2 / 3 :
        w < 1200 ? 5 / 6 :
          1);

  // hook window resize event to set correct viewbox size
  window.onresize = () => diagram.resizeViewbox($('#whiteboard').width(), $('#whiteboard').height());
}

initialize();