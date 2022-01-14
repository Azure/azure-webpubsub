class WebsocketClient {
    userName;
    connection = null;
    lastReceivedSequenceId = 0;
    ackHandler = {};
    onMessage;
    connectionId;
    reconnectionToken;
    reconnectionEndpoint;
    log;
    connected = false;
    timer;

    constructor(userName, log, onMessage) {
        this.userName = userName;
        this.onMessage = onMessage;
        this.log = log;
        this.timer = setInterval(() => {
            var ackHandler = this.ackHandler;
            for (const key in ackHandler) {
                var value = ackHandler[key]
                if (value.expireAt < new Date().getTime()) {
                    value.deferred.reject({ackId: parseInt(key), success: false, error: {name: 'Timeout'}});
                    delete ackHandler[key];
                }
            }
        }, 1000);
    }

    close() {
        var ackHandler = this.ackHandler;
        for (const key in ackHandler) {
            var value = ackHandler[key]
            value.deferred.reject({ackId: parseInt(key), success: false, error: {name: 'Timeout'}})
            delete ackHandler[key];
        }

        if (this.connection) {
            this.connection.close();
        }
    }

    async connect() {
        let res = await fetch(`/negotiate?id=${this.userName}`);
        let data = await res.json();
        this.reconnectionEndpoint = new URL(data.url);
        addItem("Connecting..", this.log);

        try {
            this.connectCore(data.url);
        } catch (err) {
            addItem("Error: " + err, this.log);
        }
    }

    reconnect() {
        if (this.connectionId !== null && this.reconnectionToken !== null) {
            addItem("Reconnecting..", this.log);
            this.reconnectionEndpoint.search = `?awps_connection_id=${this.connectionId}&awps_reconnection_token=${this.reconnectionToken}`;
    
            try {
                this.connectCore(this.reconnectionEndpoint.href);
            } catch (err) {
                this.connected = false;
                addItem("Error: " + err, this.log);
                delay(1000).then(() => this.reconnect());
            }
        } else {
            this.connect();
        }
    }

    connectCore(url)
    {
        var websocket = this.connection = new WebSocket(url, 'json.reliable.webpubsub.azure.v1');
        websocket.onopen = e => {
            this.connected = true;
            addItem(`[${new Date().toISOString()}] Client WebSocket opened.`, this.log);
        }
        websocket.onclose = e => {
            this.connected = false;
            addItem(`[${new Date().toISOString()}] Client WebSocket closed.`, this.log);

            if (e.code != 1008) {
                delay(1000).then(() => this.reconnect());
            }
        }
        websocket.onerror = e => {
            addItem(`[${new Date().toISOString()}] Client WebSocket error, check the Console window for details: ` + e, this.log);
        }
        websocket.onmessage = e => {
            var data = JSON.parse(e.data);
            // sequence ack for every messages
            var sequenceId = data.sequenceId
            if (sequenceId > this.lastReceivedSequenceId) {
                this.lastReceivedSequenceId = sequenceId;
            }
            this.send(JSON.stringify(
                {
                    type: "ack",
                    sequenceId: this.lastReceivedSequenceId,
                }
            ));

            if (this.onMessage) this.onMessage(data, (connectionId, reconnectionToken) => {
                this.connectionId = connectionId;
                this.reconnectionToken = reconnectionToken;
            });
        }
    }

    abort() {
        this.connection.close(3001);
    }

    invoke(data, ackId) {
        var deferred = new Deferred();
        this.ackHandler[ackId] = {
            data: data,
            expireAt: new Date().getTime() + 5000,
            deferred: deferred,
        };
        
        try {
            this.connection.send(data);
        } catch (error) {
            console.log(error);
        }
        
        return deferred.promise;
    }

    send(data) {
        this.connection.send(data);
    }

    handleAck(ackMessage) {
        var item = this.ackHandler[ackMessage.ackId];
        if (item !== null) {
            if (ackMessage.success === true || ackMessage.error.name === "Duplicate") {
                item.deferred.resolve(ackMessage);
            } else {
                item.deferred.reject(ackMessage)
            }
            
            delete this.ackHandler[ackMessage.ackId];
        }
    }
}

function Deferred() {
    const p = this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    this.then = p.then.bind(p);
    this.catch = p.catch.bind(p);
    if (p.finally) {
        this.finally = p.finally.bind(p);
    }
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}