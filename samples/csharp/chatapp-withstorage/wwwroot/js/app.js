const userChats = {

};

const app = Vue.createApp({
    data() {
        return {
            login: false,
            connected: false,
            error: null,
            message: null,
            user: "User1",
            currentPair: null,
            /**
             * Sample key-value pair
             * '["user1", "user2"]': {
             *    readSequenceId: 2, // the latest received message I read
             *    pairReadSequenceId: 1, // the latest message my pair read
             *    latestSequenceId: 3; // the latest message sequence id sent
             *    chats: []; // the chat items
             * }
             * */
            userChats: { },
            /**
             * Sample item:
             * { name: "user1", unread: false, new: false}
             * */
            users: [ ]
        }
    },
    computed: {
        currentChats() {
            return getOrAddUserChat(this.user, this.currentPair);
        }
    },
    methods: {
        connect() {
            this.login = true;
            connect();
        },
        switchChatPair(current) {
            this.currentPair = current.name;
            current.new = false;
            this.getChatHistory();
        },
        getChatHistory() {
            var chat = getOrAddUserChat(this.user, this.currentPair);
            if (!chat.historyRequested) {
                send("getChatHistory", {
                    user: this.user,
                    pair: this.currentPair,
                });
                chat.historyRequested = true;
            }
        },
        readTo() {
            const message = {
                user: this.user,
                pair: this.currentPair,
            };
            var chat = getOrAddUserChat(message.user, message.pair);
            message.sequenceId = chat.readSequenceId = chat.lastestSequenceId;
            send("readTo", message);
            setUnread(this.currentPair, false);
        },
        sendToUser() {
            const message = {
                from: this.user,
                to: this.currentPair,
                text: this.message,
                invocationId: generateInvocationId(),
            };
            var chat = getOrAddUserChat(message.from, message.to);
            chat.chats.push(message);
            send("sendToUser", message);
        }
    }
}).mount('#app');

function setUnread(name, unread) {
    var user = app.users.find(s => s.name === name);
    if (user) user.unread = unread;
}

function getOrAddUserChat(from, to) {
    // from-to & to-from share the same chat key
    var key = JSON.stringify([from, to].sort());
    var chat = app.userChats[key] = app.userChats[key] ?? {
        historyRequested: false,
        historyLoaded: false,
        lastestSequenceId: 0,
        readSequenceId: 0,
        pairReadSequenceId: 0,
        chats: []
    };
    return chat;
}

async function send(event, message) {
    try {
        await app.client.send(
            JSON.stringify({
                type: 'event',
                event: event,
                dataType: 'json',
                data: message,
            }));
    } catch (e) {
        var msg = log(`Unable to send event ${event}: ${e}`)
        app.error = msg;
    }
}

let invocationSeed = 0;
function generateInvocationId() {
    return ++invocationSeed;
}

async function connect() {
    try {

        let res = await fetch(`/negotiate?id=${app.user}`);
        let url = await res.text();

        let client = app.client = new WebSocket(url, 'json.webpubsub.azure.v1');

        client.onerror = (e) => {
            const msg = log(`Connection disconnected: ${e.message}`);
            app.error = msg;
            app.connected = false;
        };

        client.onclose = (e) => {
            const msg = log(`Connection disconnected: ${e.message}`);
            app.error = msg;
            app.connected = false;
        };
        client.onopen = () => {
            const msg = log(`Connection connected!`);
            app.connected = true;
        }

        client.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.from !== "server" || msg.type !== "message" || msg.dataType !== "json") {
                    return;
                }
                const message = msg.data;
                switch (message.event) {
                    case "setUsers": {
                        var users = message.users;
                        app.users = users;
                        break;
                    }
                    case "updateUsers": {
                        var users = message.users;
                        // { name:...}
                        // newly added user to bold
                        Object.values(users).forEach(i => {
                            app.users.unshift({
                                ...i,
                                new: true
                            });
                        })
                        break;
                    }
                    case "chatHistory": {
                        // {data: { user: ..., pair: ..., readSequenceId: ..., chats: [ {text: ..., from:..., to: ..., sequenceId: ...} ]}
                        var data = message.data;
                        if (!data) { return; }
                        var chat = getOrAddUserChat(data.user, data.pair);
                        chat.readSequenceId = data.readSequenceId;
                        chat.pairReadSequenceId = data.pairReadSequenceId;
                        // Insert history to the top
                        // should be ordered by the server
                        [].unshift.apply(chat.chats, data.chats);
                        chat.chats.forEach(c => { if (chat.lastestSequenceId < c.sequenceId) chat.lastestSequenceId = c.sequenceId; })
                        chat.historyLoaded = true;
                        break;
                    }
                    case "chat": {
                        // {from: ..., to: ..., text: ..., date: ..., id: ...}
                        var data = message.data;
                        var chat = getOrAddUserChat(data.from, data.to);
                        // always append to the chat
                        chat.chats.push(data);
                        // Update the latest sequenceId if the chat contains a latter one
                        if (chat.lastestSequenceId < data.sequenceId) chat.lastestSequenceId = data.sequenceId;

                        if (chat.readSequenceId < data.sequenceId) {
                            setUnread(data.from, true);
                        }

                        if (chat.pairReadSequenceId < data.sequenceId) {
                            setUnread(data.to, true);
                        }

                        break;
                    }
                    case "sequenceId": {
                        var invocationId = message.invocationId;
                        var chat = getOrAddUserChat(message.from, message.to);
                        var invocationMessage = chat.chats.find(s => s.invocationId === invocationId);
                        if (invocationMessage) {
                            invocationMessage.sequenceId = message.sequenceId;
                        }
                        break;
                    }
                    case "readto": {
                        var chat = getOrAddUserChat(message.user, message.pair);
                        if (app.user === message.pair) {
                            // this is from my pair
                            if (chat.pairReadSequenceId < message.sequenceId) chat.pairReadSequenceId = message.sequenceId;
                        } else if (app.user === message.user) {
                            // this is from my some other connection
                            if (chat.readSequenceId < message.sequenceId) chat.readSequenceId = message.sequenceId;
                        }
                        break;
                    }
                }
            } catch (err) {
                const msg = log(`Error: ${err.message}`, "err");
                this.error = msg;
                throw err;
            }
        }
    } catch (err) {
        const msg = log(`Error: ${err.message}`, "err");
        this.error = msg;
        throw err;
    }
}

function log(message, level = "info") {
    switch (level) {
        case "info":
            console.log(message);
            break;
        case "warn":
            console.warn(message);
            break;
        case "err":
            console.error(message);
            break;
    }
    return message;
}