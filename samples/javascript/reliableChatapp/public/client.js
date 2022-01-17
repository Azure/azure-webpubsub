class ReliableWebSocketClient {
    endpoint;
    userName;
    connection = null;
    lastReceivedSequenceId = 0;
    ackHandler = {};
    onMessage;
    onConnected;
    onDisconnected;
    connectionId;
    reconnectionToken;
    reconnectionEndpoint;
    log;
    connectionStatus = ConnectionStatus.Disconnected;
    timer;
    closed = false;

    refreshInterval = 1000;
    messageTimeout = 5000;

    constructor(endpoint, userName, onMessage, onConnected, onDisconnected, log, options) {
        this.endpoint = endpoint;
        this.userName = userName;
        this.onMessage = onMessage;
        this.onConnected = onConnected;
        this.onDisconnected = onDisconnected;
        this.log = log;


        if (options?.refreshInterval) {
            this.refreshInterval = options.refreshInterval;
        }

        if (options?.messageTimeout) {
            this.messageTimeout = options.messageTimeout;
        }

        this.timer = setInterval(() => {
            var ackHandler = this.ackHandler;
            for (const key in ackHandler) {
                var value = ackHandler[key]
                if (value.expireAt < new Date().getTime()) {
                    value.deferred.reject({ackId: parseInt(key), success: false, error: {name: 'Timeout'}});
                    delete ackHandler[key];
                }
            }
        }, this.refreshInterval);
    }

    close() {
        this.closed = true;
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
        this.log(`[${new Date().toISOString()}] WebSocket connecting.`);
        let res = await fetch(`${this.endpoint}?id=${this.userName}`);
        let data = await res.json();
        this.reconnectionEndpoint = new URL(data.url);
        this.connectionStatus = ConnectionStatus.Connecting;

        try {
            this.connectCore(data.url);
        } catch (err) {
          this.log(`[${new Date().toISOString()}] Error: ${err}`);
        }
    }

    reconnect() {
        if (this.connectionId !== null && this.reconnectionToken !== null) {
            this.log(`[${new Date().toISOString()}] Client ${this.connectionId} Reconnecting.`);
            this.reconnectionEndpoint.search = `?awps_connection_id=${this.connectionId}&awps_reconnection_token=${this.reconnectionToken}`;
    
            try {
                this.connectCore(this.reconnectionEndpoint.href);
            } catch (err) {
                this.log(`[${new Date().toISOString()}] Error: ` + err);
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
            if (this.connectionStatus == ConnectionStatus.Reconnecting) this.connectionStatus = ConnectionStatus.Connected;
            this.log(`[${new Date().toISOString()}] WebSocket opened.`);
        }
        websocket.onclose = e => {
            this.log(`[${new Date().toISOString()}] WebSocket closed.`);

            if (!this.closed && e.code != 1008) {
                this.connectionStatus = ConnectionStatus.Reconnecting;
                delay(1000).then(() => this.reconnect());
            } else {
                this.connectionStatus = ConnectionStatus.Disconnected;
            }
        }
        websocket.onerror = e => {
          this.log(`[${new Date().toISOString()}] WebSocket error, check the Console window for details.`);
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

            if (data.type === "system") {
                if (data.event === "connected") {
                    this.connectionStatus = ConnectionStatus.Connected;
                    this.connectionId = data.connectionId;
                    this.reconnectionToken = data.reconnectionToken;
                    if (this.onConnected) this.onConnected(data);
                }
                if (data.event === "disconnected") {
                    if (this.onDisconnected) this.onDisconnected(data);
                }
            } else if (data.type === "ack") {
                var handleAck = ackMessage => {
                    var item = this.ackHandler[ackMessage.ackId];
                    if (item !== null) {
                        if (ackMessage.success === true || ackMessage.error.name === "Duplicate") {
                            item.deferred.resolve(ackMessage);
                        } else {
                            item.deferred.reject(ackMessage)
                        }
                        
                        delete this.ackHandler[ackMessage.ackId];
                    }
                };

                handleAck(data);
            } else if (data.type === "message") {
                if (this.onMessage) this.onMessage(data);
            }
        }
    }

    abort() {
        this.connection.close(3001);
    }

    invoke(data, ackId) {
        var deferred = new Deferred();
        this.ackHandler[ackId] = {
            data: data,
            expireAt: new Date().getTime() + this.messageTimeout,
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

const ConnectionStatus = {
    Disconnected: 'Disconnected',
    Connecting: 'Connecting',
    Reconnecting: 'Reconnecting',
    Connected: 'Connected',
};