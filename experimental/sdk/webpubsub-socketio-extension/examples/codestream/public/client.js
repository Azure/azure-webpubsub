function createEditor(element, readOnly) {
    //https://unpkg.com/browse/monaco-editor@0.8.3/min/vs/editor/
    let monacoeditor = monaco.editor.create(element, {
        value: '',
        language: "typescript",
        theme: 'vs-dark',
        readOnly: readOnly
    });
    return monacoeditor;
}

function updateStreamId(room_id) {
    let u = document.querySelector('#url');
    let url = `${location.protocol}//${location.host}${location.pathname}#${room_id}`;
    u.setAttribute('href', url);
    u.textContent = url;
}

function updateStatus(status) {
    document.querySelector('#status').textContent = status;
}

async function initialize(url) {
    let res = await fetch(url);
    let data = await res.json();
    updateStreamId(data.room_id);
    let editor = createEditor(document.getElementById("monacoeditor"), false);//monaco editor.executeEdits() won't work in readyonly mode

    var socket = io(data.url, {
        path: "/clients/socketio/hubs/eio_hub",
        reconnection: false
    });

    console.log(`initialize room_id=${data.room_id} url=${data.url}`)
    return [socket, editor, data.room_id];
}

function joinRoom(socket, room_id) {
    console.log(`joinRoom ${room_id}`);
    socket.emit("joinRoom", {
        room_id: room_id,
    });
}

function sendToRoom(socket, room_id, data) {
    console.log(`sendToRoom ${room_id} data`);
    socket.emit("sendToRoom", {
        room_id: room_id,
        data: data
    });
}

async function startStream() {
    let [socket, editor, room_id] = await initialize('/negotiate');
    let changes = [];
    let content = '';
    let version = 0;
    function flush() {
        if (changes.length === 0) return;
        sendToRoom(socket, room_id, {
            type: 'delta',
            version: version++,
            changes: changes
        });
        changes = [];
        content = editor.getValue();
    }

    socket.on("login", () => {
        updateStatus('Connected');
        joinRoom(socket, `${room_id}-control`);
        setInterval(() => flush(), 200);
        editor.getModel().onDidChangeContent((e) => { changes.push(e); });  //editor.on('change', e => changes.push(e));
        editor.updateOptions({ readOnly: false });//editor.setReadOnly(false); 
    });

    socket.on("message", (message) => {
        console.log(message);
        let data = message.data;
        if (data.data === 'sync') sendToRoom(socket, room_id, {
            type: 'full',
            version: version,
            content: content
        });
    });
}

async function watch(room_id) {
    let version = -1;
    let [socket, editor] = await initialize(`/negotiate?room_id=${room_id}`)
    socket.on("login", () => {
        updateStatus('Connected');
        joinRoom(socket, `${room_id}`);
    });

    socket.on("message", (message) => {
        let data = message;
        if (data.type === 'ackJoinRoom' && data.success) {
            sendToRoom(socket, `${room_id}-control`, { data: 'sync'});
        } 
        else if (data.type === 'editorMessage') {
            switch (data.data.type) {
                case 'delta':
                    if (data.data.version !== version + 1) console.log(`unexpected version: ${data.data.version}`);
                    //data.data.changes.forEach(changeEvent => editor.getSession().getDocument().applyDelta(c)); 
                    data.data.changes.forEach(changeEvent => {
                        const changes = changeEvent.changes;//event.changes: IModelContentChangedEvent.IModelContentChange[]
                        changes.forEach(change => { //IModelContentChange (range, rangeLength, rangeOffset, text)
                            editor.executeEdits('update-value', [{
                                range: change.range,
                                text: change.text,
                                forceMoveMarkers: true
                            }]);
                        });
                    });
                    version = data.data.version;
                    break;
                case 'full':
                    if (version >= data.data.version) break;
                    editor.setValue(data.data.content);
                    version = data.data.version;
                    break;
            }
        }
    });
}

let room_id = location.hash.slice(1);
if (!room_id) startStream();
else watch(room_id);