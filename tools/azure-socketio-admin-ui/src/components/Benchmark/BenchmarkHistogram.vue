<template>
  <v-container fluid>
    <v-row>
      <v-col cols="2"> Benchmark Parameters </v-col>

      <v-col cols="2">
        <v-text-field type="number" label="Total Clients" v-model="maxClients" hide-details />
      </v-col>

      <v-col cols="2">
        <v-text-field type="number" label="Echo Message Per Second" v-model="emitPerSecond" flat />
      </v-col>

      <v-col cols="3">
        <v-text-field type="number" label="Interval of Client Creation (ms)" class="white--text"
          v-model="clientCreationIntervalInMs" />
      </v-col>

      <v-col cols="2">
        <v-text-field type="number" label="Benchmark Duration (s)" class="white--text"
          v-model="totalBenchmarkSeconds" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="2">
        <b>Action</b>
      </v-col>

      <v-col cols="2">
        <v-btn color="success" class="white--text"
          @click="startBenchmark(serviceEndpoint, '/echoBenchmark', wsOnly, path, parser)"
          append-icon="mdi-speedometer">
          Start
        </v-btn>
      </v-col>

      <v-col cols="2">
        <v-btn color="error" class="white--text" @click="endBenchmark(true)"> Stop </v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="2">
        <b>Progress</b>
      </v-col>

      <v-col>
        <v-progress-linear color="light-blue" :value="progress" height="20" striped>
          <template v-slot:default="{ value }">
            <strong>{{ Math.floor(value) }}%</strong>
          </template>
        </v-progress-linear>
      </v-col>
    </v-row>
    <v-row>
      <v-divider :thickness="30" class="border-opacity-100" color="info"></v-divider>
    </v-row>

    <v-row>
      <v-chart class="chart" :option="option" autoresize />
    </v-row>
  </v-container>
</template>

<script>
import { mapState } from "vuex";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart, BarChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from "echarts/components";
import VChart, { THEME_KEY } from "vue-echarts";
import { ref, defineComponent, reactive } from "vue";
import { io } from "socket.io-client";

use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  BarChart,
]);

export default defineComponent({
  name: "BenchmarkHistogram",
  components: {
    VChart,
  },
  provide: {
    [THEME_KEY]: "dark",
  },
  data() {
    return {
      startTime: 0,
      lifetimeDatas: [],
      periodDatas: [],
      timeTasks: [],
      sockets: [],

      maxClients: 10,
      emitPerSecond: 1,
      clientCreationIntervalInMs: 500,
      totalBenchmarkSeconds: 120,
    };
  },
  setup() {
    const chartData = reactive({
      xAxisData: [],
      seriesData: [],
      seriesData2: [],
      seriesData3: [],
    });

    const option = reactive({
      backgroundColor: "rgba(128, 128, 128, 0.1)",
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      title: {
        text: "Echo Benchmark\n\nRTT=Round Trip Time",
        left: "10vh",
        top: "20vh",
        bottom: "10vh",
      },
      grid: { x: 70, y: 150, x2: 70, y2: 20 },
      xAxis: { type: "value", name: "Time (s)", position: "center" },
      yAxis: [
        {
          type: "value",
          name: "Packets Count",
          position: "left",
          axisLabel: { formatter: "{value}" },
        },
        {
          type: "value",
          name: "RTT (ms)",
          position: "right",
          axisLabel: { formatter: "{value} ms" },
        },
      ],
      legend: {
        orient: "horizontal",
        top: "10%",
        left: "30%",
        data: [
          "Received Echo by Clients Per Second",
          "Sent Message by Clients Per Second",
          "Max RTT Per Second",
        ],
      },
      series: [
        {
          name: "Received Echo by Clients Per Second",
          data: chartData.seriesData,
          type: "bar",
          color: "green",
          yAxisIndex: 0,
          showAllSymbol: true,
        },
        {
          name: "Sent Message by Clients Per Second",
          data: chartData.seriesData2,
          type: "bar",
          color: "red",
          yAxisIndex: 0,
          showAllSymbol: true,
        },
        {
          name: "Max RTT Per Second",
          data: chartData.seriesData3,
          type: "line",
          yAxisIndex: 1,
          showAllSymbol: true,
        },
      ],
    });

    return { option, chartData };
  },

  computed: {
    ...mapState({
      serviceEndpoint: (state) => state.connection.serviceEndpoint,
      wsOnly: (state) => state.connection.wsOnly,
      path: (state) => state.connection.path,
      namespace: (state) => state.connection.namespace,
      parser: (state) => state.connection.parser,
    }),

    progress() {
      return this.periodDatas && this.totalBenchmarkSeconds
        ? Math.floor(this.periodDatas.length / (Number(this.totalBenchmarkSeconds) + 1.0) * 100)
        : 0;
    },
  },

  methods: {
    startBenchmark(serviceEndpoint, namespace, wsOnly, path, parser) {
      console.log(serviceEndpoint);
      var MAX_CLIENTS = this.maxClients;
      var EMIT_PER_SECOND = this.emitPerSecond;
      var CLIENT_CREATION_INTERVAL_IN_MS = this.clientCreationIntervalInMs;
      console.log(`Max Clients: ${MAX_CLIENTS}, Emit Per Second: ${EMIT_PER_SECOND}, Client Creation Interval: ${CLIENT_CREATION_INTERVAL_IN_MS}`)

      this.endBenchmark();

      var lifetimeData = {
        startTime: 0,
        clientCount: 0,
        totalReceivedPackets: 0,
        totalEmittedPackets: 0,
        totalRoundTripTime: 0,
      };

      var periodData = {
        startTime: 0,
        maxRoundTripTime: 0,
      };

      var idx = 0;

      const updateChartData = (time) => {
        console.log(time);
        var i = this.lifetimeDatas.length - 1;

        if (i > 0) {
          let currentData = this.lifetimeDatas[i];
          let previousData = this.lifetimeDatas[i - 1];
          let duration = (currentData.x - previousData.x) / 1000.0;

          let avgReceive =
            (currentData.y["totalReceivedPackets"] -
              previousData.y["totalReceivedPackets"]) /
            duration;
          let avgSend =
            (currentData.y["totalEmittedPackets"] -
              previousData.y["totalEmittedPackets"]) /
            duration;
          console.log(`time = ${time}, duration = ${duration}, AVG RECEIVE = ${avgReceive}, AVG SEND = ${avgSend}`);

          this.chartData.seriesData.push([time, avgReceive.toFixed(1)]);
          this.chartData.seriesData2.push([time, avgSend.toFixed(1)]);

          this.chartData.seriesData3.push([
            time,
            this.periodDatas[i].y["maxRoundTripTime"] == 0
              ? null
              : this.periodDatas[i].y["maxRoundTripTime"],
          ]);
        }
      };

      const createClient = () => {
        const useWps = true;
        const transports = ["websocket"];

        const socket = useWps
          ? io(serviceEndpoint + namespace, { transports: transports, path: path })
          : io(serviceEndpoint + namespace, { transports: transports });

        this.sockets.push(socket);

        socket.on("connect", () => {
          console.log("client connected");
          this.timeTasks.push(
            setInterval(() => {
              socket.emit(
                "client to server event",
                (++idx).toString() + "," + new Date().getTime().toString()
              );
              lifetimeData.totalEmittedPackets++;
            }, (1000 / EMIT_PER_SECOND) * 1)
          );
        });

        socket.on("server to client event", (data) => {
          var idx = data.split(",")[0];
          var timestamp = data.split(",")[1];
          let costTime = new Date().getTime() - Number(timestamp);
          lifetimeData.totalRoundTripTime += costTime;
          lifetimeData.totalReceivedPackets++;
          periodData.maxRoundTripTime = Math.max(periodData.maxRoundTripTime, costTime);
        });

        socket.on("disconnect", (reason) => {
          console.log(`disconnect due to ${reason}`);
        });

        if (lifetimeData.clientCount + 1 < MAX_CLIENTS) {
          this.timeTasks.push(setTimeout(createClient, CLIENT_CREATION_INTERVAL_IN_MS));
          lifetimeData.clientCount++;
        }
      };

      createClient();
      this.startTime = new Date().getTime();
      periodData.startTime = this.startTime;
      lifetimeData.startTime = this.startTime;
      this.periodDatas.push({ x: 0, y: Object.assign({}, periodData) });
      this.lifetimeDatas.push({ x: 0, y: Object.assign({}, lifetimeData) });

      const report = () => {
        if (this.periodDatas.length > this.totalBenchmarkSeconds) {
          this.endBenchmark();
          return;
        }

        const now = new Date().getTime();
        periodData["duration"] = now - periodData["startTime"];

        console.log(
          `${lifetimeData.clientCount} Clients, ${JSON.stringify(
            periodData
          )}, ${JSON.stringify(lifetimeData)}`
        );

        this.lifetimeDatas.push({
          x: new Date().getTime() - this.startTime,
          y: Object.assign({}, lifetimeData),
        });
        this.periodDatas.push({
          x: new Date().getTime() - this.startTime,
          y: Object.assign({}, periodData),
        });

        periodData = {
          startTime: new Date().getTime(),
          maxRoundTripTime: 0,
        };

        updateChartData((now - this.startTime) / 1000);
      };

      this.timeTasks.push(
        setInterval(() => {
          report();
        }, 1000)
      );
    },

    endBenchmark(cleanData = false) {
      this.timeTasks.forEach((task) => {
        clearInterval(task);
      });
      this.sockets.forEach((socket) => {
        socket.close();
      });
      if (cleanData) {
        this.sockets = [];
        this.lifetimeDatas = [];
        this.periodDatas = [];
      }
    },
  },
});
</script>

<style scoped>
.chart {
  height: 70vh;
  width: 140vh;
}
</style>
