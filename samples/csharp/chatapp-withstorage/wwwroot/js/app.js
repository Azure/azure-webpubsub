const userChats = {

};

const app = Vue.createApp({
    data() {
        return {
            logs: [],
            login: true,
            connected: true,
            error: null,
            message: null,
            user: "Lia",
            currentPair: "user1",
            userChats: {
                '["Lia","user1"]': {
                    readSequenceId: 2,
                    lastestSequenceId: 3, // The latest message ID set
                    chats: [
                        {
                            text: "Hello",
                            from: "user1",
                            state: "read",
                            time: "12:42PM",
                            sequenceId: null,
                            invocationId: 2,
                        },
                        {
                            text: "Hello friend",
                            from: "Lia",
                            state: "read",
                            time: "12:43PM",
                            sequenceId: null,
                            invocationId: 1,
                        },
                    ],
                    pendingChats:
                    {
                        1: {},
                        2: {}
                            }
                },
                '["Lia","user2"]': []
            },
            users: {
                "user1": {
                    "name": "user1"
                },
                "user2": {
                    "name": "user2"
                },
                }
            
        }
    },
    computed: {
        currentChats() {
            const key = getChatKey(this.user, this.currentPair); 
            return this.userChats[key];
         }
    },
    methods: {
        getChatHistory() {
            if (this.client) {
                const message = {
                    user: this.user,
                    pair: this.currentPair,
                };
                this.client.sendEvent("getChatHistory", message, "json");
            }
        },
        readTo() {
            const message = {
                from: this.user,
                to: this.currentPair,
            };
            var chat = app.userChats[getChatKey(message.from, message.to)];
            message.sequenceId = chat.readSequenceId = chat.lastestSequenceId;
            send("readTo", message);
        },
        sendToUser() {
            const message = {
                from: this.user,
                to: this.currentPair,
                text: this.message,
                invocationId: generateInvocationId(),
            };
            app.userChats[getChatKey(message.from, message.to)].push(message);
            send("sendToUser", message);
        }
    }
}).mount('#app');

async function send(event, message) {
    try {
        await app.client.sendEvent(event, message, "json");
    } catch (e) {
        var msg = log(`Unable to send event ${event}: ${e}`)
        app.error = msg;
    }
}
connect();

let invocationSeed = 0;
function generateInvocationId() {
    return ++invocationSeed;
}

async function connect() {
    let client = new WebPubSubClient(
        "wss://lianwei-preserve.webpubsub.azure.com/client/hubs/chat?access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ3c3M6Ly9saWFud2VpLXByZXNlcnZlLndlYnB1YnN1Yi5henVyZS5jb20vY2xpZW50L2h1YnMvY2hhdCIsImlhdCI6MTY3MDU2MDAxMCwiZXhwIjoxNjcwNjMyMDEwfQ.JHTn-ErpJchyTdKdznBt-nD4QMjqrcgPqxHszLiXvBI"
        //{
        //    getClientAccessUrl: async () => {
        //        let res = await fetch(`/negotiate?id=${app.user}`);
        //        return await res.text();
        //    },
        //}
    );

    client.on("connected", (e) => {
        log(`Connection ${e.connectionId} is connected.`);
        app.error = null;
        app.client = client;
        app.connected = true;
    });

    client.on("disconnected", (e) => {
        const msg = log(`Connection disconnected: ${e.message}`);
        app.error = msg;
        app.connected = false;
    });

    client.on("stopped", (e) => {
        const msg = log(`Connection disconnected: ${e.message}`);
        app.error = msg;
    });

    client.on("server-message", (e) => {
        log(`Received message ${e.message.data}`);
        const message = JSON.parse(e.message.data);
        switch (message.event) {
            case "setUsers": {
                var users = message.users;
                app.users = users;
                break;
            }
            case "updateUsers": {
                var users = message.users;
                // { name:..., online: ...}
                for (var i in Object.values(users)) {
                    app.users[i.name] = i;
                }
                break;
            }
            case "chatHistory": {
                // {data: { user: ..., pair: ..., readSequenceId: ..., chats: [ {text: ..., from:..., to: ..., sequenceId: ...} ]}
                var data = message.data;
                var key = getChatKey(user, pair);
                var chat = app.userChats[key];
                chat.readSequenceId = data.readSequenceId;
                [].unshift.apply(data.chats, chat.chats);
                break;
            }
            case "chat": {
                // {from: ..., to: ..., text: ..., date: ..., id: ...}
                var key = getChatKey(message.from, message.to);
                userChats[key].chats.push({
                    ...message,
                    state: "received"
                })
                break;
            }
            case "sequenceId": {

            }
             
        }
    });

    try {
        await client.start();
    } catch (e) {
        log(e, "err");
        app.error = e;
    }
}

function markAsRead(user, from, readTo) {
    // mark the message as read
    // send message {user: ..., from:..., readTo: (id)}
    
}

function getChatKey(from, to) {
    return JSON.stringify([from, to].sort());
}

function log(message, level = "info") {
        app.logs.push({
            level: level,
            text: message,
            time: new Date().toISOString(),
        })
    return message;
}