const express = require('express');
const app = express();
const port = 5000;
import { io, Socket } from "socket.io-client";

const DEBUG = false;

interface BenchmarkConfig {
    maxClients: number,
    emitPerSecond: number,
    clientCreationIntervalInMs: number
    totalBenchmarkSeconds: number
}

interface LifetimeData{
    startTime: number,
    clientCount: number,
    totalReceivedPackets: number,
    totalEmittedPackets: number,
    totalRoundTripTime: number,
}

interface PeriodData {
    startTime: number,
    maxRoundTripTime:number,
    maxClientToServerTime: number,
    maxServerToClientTime: number
}

class Benchmarker {
    private lifetimeData: LifetimeData = {
        startTime: 0,
        clientCount: 0,
        totalReceivedPackets: 0,
        totalEmittedPackets: 0,
        totalRoundTripTime: 0,
    }
    private lifetimeDatas: {x: number, y: LifetimeData}[] = [];

    private periodData: PeriodData = {
        startTime: 0,
        maxRoundTripTime: 0,
        maxClientToServerTime: 0,
        maxServerToClientTime: 0,
    }
    private periodDatas: {x: number, y: PeriodData}[] = [];

    private idx: number = 0;
    private sockets: Socket[] = [];
    private timeTasks: unknown[] = [];
    private startTime:number = 0;
    private clientOpts = {
        uri: "",
        opts: {}
    }
    private benchmarkConfig: BenchmarkConfig;

    private fullData: any[] = [];

    constructor(uri:string, opts: unknown, benchmarkConfig: BenchmarkConfig) {
        this.clientOpts = { uri: uri, opts: opts as any };
        this.benchmarkConfig = benchmarkConfig;
    }

    createClient() {
        const socket = io(this.clientOpts.uri, this.clientOpts.opts);

        this.sockets.push(socket);

        socket.on("connect", () => {
            if (DEBUG) console.log("client connected");
            this.lifetimeData.clientCount++;

            this.timeTasks.push(setInterval(() => {
                for (var _ = 0; _ < this.benchmarkConfig.emitPerSecond; _++) {
                    setTimeout(() => {
                        socket.emit("client to server event", (++this.idx).toString() + "," + new Date().getTime().toString());
                        this.lifetimeData.totalEmittedPackets++;
                    }, 1000 / this.benchmarkConfig.emitPerSecond * _);
                }
            }, 1000));
        });

        socket.on("server to client event", (data) => {
            if (DEBUG) console.log("client received: " + data);

            var idx = data.split(",")[0];
            var clientSendTimestamp = data.split(",")[1];
            var serverReceiveTimestamp = data.split(",")[2];

            let clientToServerTime = Number(serverReceiveTimestamp) - Number(clientSendTimestamp);
            let serverToClientTime = new Date().getTime() - Number(serverReceiveTimestamp);
            let rtt = clientToServerTime + serverToClientTime;
            
            this.lifetimeData.totalRoundTripTime += rtt;
            this.lifetimeData.totalReceivedPackets++;
            this.periodData.maxClientToServerTime = Math.max(this.periodData.maxClientToServerTime, clientToServerTime);
            this.periodData.maxServerToClientTime = Math.max(this.periodData.maxServerToClientTime, serverToClientTime);
            this.periodData.maxRoundTripTime = Math.max(this.periodData.maxRoundTripTime, rtt);
        });

        socket.on("disconnect", (reason) => {
            if (DEBUG) console.log(`disconnect due to ${reason}`);
            this.lifetimeData.clientCount--;
        });

        if (this.lifetimeData.clientCount + 1 < this.benchmarkConfig.maxClients) {
            this.timeTasks.push(setTimeout(() => { this.createClient(); }, this.benchmarkConfig.clientCreationIntervalInMs));
        }
    };

    updateChartData(intervalTime) {
        if (DEBUG) console.log(intervalTime);
        var i = this.lifetimeDatas.length - 1;

        if (i > 0) {
            let currentData = this.lifetimeDatas[i];
            let previousData = this.lifetimeDatas[i - 1];
            let duration = (currentData.x - previousData.x) / 1000.0;

            let v1 = (currentData.y.totalReceivedPackets - previousData.y.totalReceivedPackets) / duration;
            let v2 = (currentData.y.totalEmittedPackets - previousData.y.totalEmittedPackets) / duration;

            if (DEBUG) console.log("time=", intervalTime, ",duration=", duration, ",AVG RECEIVE=", v1, ",AVG SEND=", v2);

            this.fullData.push({
                timestamp: intervalTime * 1000 + this.startTime, 
                clientsReceivedPacketPerSecond: Number(v1.toFixed(1)),
                clientsSentPacketPerSecond: Number(v2.toFixed(1)),
                maxRoundTripTimePerSecond: this.periodDatas[i].y["maxRoundTripTime"] == 0 ? null : this.periodDatas[i].y["maxRoundTripTime"],
                maxClientToServerTimePerSecond: this.periodDatas[i].y["maxClientToServerTime"] == 0 ? null : this.periodDatas[i].y["maxClientToServerTime"],
                maxServerToClientTimePerSecond: this.periodDatas[i].y["maxServerToClientTime"] == 0 ? null : this.periodDatas[i].y["maxServerToClientTime"],
                clientCount: currentData.y.clientCount
            });
        }
    };

    getFullData() {
        return this.fullData;
    }

    startBenchmark() {
        this.endBenchmark();
        this.createClient();

        this.startTime = new Date().getTime();
        this.periodData.startTime = this.startTime;
        this.lifetimeData.startTime = this.startTime;
        this.periodDatas.push({ x: 0, y: Object.assign({}, this.periodData) });
        this.lifetimeDatas.push({ x: 0, y: Object.assign({}, this.lifetimeData) });

        const report = () => {
            if (DEBUG) console.log(`report ${this.periodDatas.length}, ${this.benchmarkConfig.totalBenchmarkSeconds}`);
            if (this.periodDatas.length > this.benchmarkConfig.totalBenchmarkSeconds) {
                this.endBenchmark();
                return;
            }

            const now = new Date().getTime();
            this.periodData["duration"] = (now - this.periodData["startTime"]);

            if (DEBUG) console.log(`report: ${this.lifetimeData.clientCount} Clients, ${JSON.stringify(this.periodData)}, ${JSON.stringify(this.lifetimeData)}`);

            this.lifetimeDatas.push({ x: (new Date().getTime() - this.startTime), y: Object.assign({}, this.lifetimeData) });
            this.periodDatas.push({ x: (new Date().getTime() - this.startTime), y: Object.assign({}, this.periodData) });

            this.periodData = {
                startTime: new Date().getTime(),
                maxRoundTripTime: 0,
                maxClientToServerTime: 0,
                maxServerToClientTime: 0
            }

            this.updateChartData((now - this.startTime) / 1000);
        };
        this.timeTasks.push(setInterval(() => { report(); }, 1000));
    };

    endBenchmark() {
        this.timeTasks.forEach(task => {
            clearInterval(task as any);
        });
        this.sockets.forEach(socket => {
            socket.close();
        });
        this.sockets = [];
        this.lifetimeDatas = [];
        this.periodDatas = [];
    }
}

// Use fetch get the content of google homepage
fetch("http://localhost:3000/getConfig")
.then(res => res.json())
.then(data => {
    if (DEBUG) console.log(data);
    const benchmarker = new Benchmarker(
        data.uri,
        data.clientOptions,
        data.benchmarkOptions
    );
    
    app.get('/', (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'application/json');
        res.json({data: benchmarker.getFullData()});
    });
    
    app.listen(port, () => {
        benchmarker.startBenchmark();
        if (DEBUG) console.log(`Server is running on port ${port}`);
    });    
});