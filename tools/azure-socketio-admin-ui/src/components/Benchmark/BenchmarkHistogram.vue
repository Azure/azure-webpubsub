<script setup>
import { ref, reactive, computed, provide, onUnmounted } from "vue";
import { useStore } from "vuex";
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

provide(THEME_KEY, "dark");

const store = useStore();

const serviceEndpoint = computed(() => store.state.connection.serviceEndpoint);
const wsOnly = computed(() => store.state.connection.wsOnly);
const path = computed(() => store.state.connection.path);
const parser = computed(() => store.state.connection.parser);

const startTime = ref(0);
const lifetimeDatas = ref([]);
const periodDatas = ref([]);
const timeTasks = ref([]);
const sockets = ref([]);

const maxClients = ref(10);
const emitPerSecond = ref(1);
const clientCreationIntervalInMs = ref(500);
const totalBenchmarkSeconds = ref(120);

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

const progress = computed(() => {
  return periodDatas.value && totalBenchmarkSeconds.value
    ? Math.floor(
        (periodDatas.value.length /
          (Number(totalBenchmarkSeconds.value) + 1.0)) *
          100,
      )
    : 0;
});

const endBenchmark = (cleanData = false) => {
  timeTasks.value.forEach((task) => {
    clearInterval(task);
  });
  timeTasks.value = [];
  sockets.value.forEach((socket) => {
    socket.close();
  });
  if (cleanData) {
    sockets.value = [];
    lifetimeDatas.value = [];
    periodDatas.value = [];
  }
};

const startBenchmark = (
  serviceEndpointValue,
  namespaceValue,
  wsOnlyValue,
  pathValue,
) => {
  const MAX_CLIENTS = maxClients.value;
  const EMIT_PER_SECOND = emitPerSecond.value;
  const CLIENT_CREATION_INTERVAL_IN_MS = clientCreationIntervalInMs.value;

  endBenchmark();

  const lifetimeData = {
    startTime: 0,
    clientCount: 0,
    totalReceivedPackets: 0,
    totalEmittedPackets: 0,
    totalRoundTripTime: 0,
  };

  let periodData = {
    startTime: 0,
    maxRoundTripTime: 0,
  };

  let idx = 0;

  const updateChartData = (time) => {
    const i = lifetimeDatas.value.length - 1;

    if (i > 0) {
      const currentData = lifetimeDatas.value[i];
      const previousData = lifetimeDatas.value[i - 1];
      const duration = (currentData.x - previousData.x) / 1000.0;

      const avgReceive =
        (currentData.y["totalReceivedPackets"] -
          previousData.y["totalReceivedPackets"]) /
        duration;
      const avgSend =
        (currentData.y["totalEmittedPackets"] -
          previousData.y["totalEmittedPackets"]) /
        duration;

      chartData.seriesData.push([time, avgReceive.toFixed(1)]);
      chartData.seriesData2.push([time, avgSend.toFixed(1)]);
      chartData.seriesData3.push([
        time,
        periodDatas.value[i].y["maxRoundTripTime"] === 0
          ? null
          : periodDatas.value[i].y["maxRoundTripTime"],
      ]);
    }
  };

  const createClient = () => {
    const transports = wsOnlyValue ? ["websocket"] : ["polling", "websocket"];

    const socket = io(serviceEndpointValue + namespaceValue, {
      transports,
      path: pathValue,
    });

    sockets.value.push(socket);

    socket.on("connect", () => {
      timeTasks.value.push(
        setInterval(
          () => {
            socket.emit(
              "client to server event",
              (++idx).toString() + "," + new Date().getTime().toString(),
            );
            lifetimeData.totalEmittedPackets++;
          },
          (1000 / EMIT_PER_SECOND) * 1,
        ),
      );
    });

    socket.on("server to client event", (data) => {
      const timestamp = data.split(",")[1];
      const costTime = new Date().getTime() - Number(timestamp);
      lifetimeData.totalRoundTripTime += costTime;
      lifetimeData.totalReceivedPackets++;
      periodData.maxRoundTripTime = Math.max(
        periodData.maxRoundTripTime,
        costTime,
      );
    });

    if (lifetimeData.clientCount + 1 < MAX_CLIENTS) {
      timeTasks.value.push(
        setTimeout(createClient, CLIENT_CREATION_INTERVAL_IN_MS),
      );
      lifetimeData.clientCount++;
    }
  };

  createClient();
  startTime.value = new Date().getTime();
  periodData.startTime = startTime.value;
  lifetimeData.startTime = startTime.value;
  periodDatas.value.push({ x: 0, y: Object.assign({}, periodData) });
  lifetimeDatas.value.push({ x: 0, y: Object.assign({}, lifetimeData) });

  const report = () => {
    if (periodDatas.value.length > totalBenchmarkSeconds.value) {
      endBenchmark();
      return;
    }

    const now = new Date().getTime();
    periodData["duration"] = now - periodData["startTime"];

    lifetimeDatas.value.push({
      x: now - startTime.value,
      y: Object.assign({}, lifetimeData),
    });
    periodDatas.value.push({
      x: now - startTime.value,
      y: Object.assign({}, periodData),
    });

    periodData = {
      startTime: new Date().getTime(),
      maxRoundTripTime: 0,
    };

    updateChartData((now - startTime.value) / 1000);
  };

  timeTasks.value.push(
    setInterval(() => {
      report();
    }, 1000),
  );
};

onUnmounted(() => {
  endBenchmark(true);
});
</script>

<template>
  <v-container fluid>
    <v-row>
      <v-col cols="2"> Benchmark Parameters </v-col>

      <v-col cols="2">
        <v-text-field
          type="number"
          label="Total Clients"
          v-model="maxClients"
          hide-details
        />
      </v-col>

      <v-col cols="2">
        <v-text-field
          type="number"
          label="Echo Message Per Second"
          v-model="emitPerSecond"
        />
      </v-col>

      <v-col cols="3">
        <v-text-field
          type="number"
          label="Interval of Client Creation (ms)"
          v-model="clientCreationIntervalInMs"
        />
      </v-col>

      <v-col cols="2">
        <v-text-field
          type="number"
          label="Benchmark Duration (s)"
          v-model="totalBenchmarkSeconds"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="2">
        <b>Action</b>
      </v-col>

      <v-col cols="2">
        <v-btn
          color="success"
          class="text-white"
          append-icon="mdi-speedometer"
          @click="
            startBenchmark(serviceEndpoint, '/echoBenchmark', wsOnly, path, parser)
          "
        >
          Start
        </v-btn>
      </v-col>

      <v-col cols="2">
        <v-btn color="error" class="text-white" @click="endBenchmark(true)">
          Stop
        </v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="2">
        <b>Progress</b>
      </v-col>

      <v-col>
        <v-progress-linear
          color="light-blue"
          :model-value="progress"
          height="20"
          striped
        >
          <template v-slot:default="{ value }">
            <strong>{{ Math.floor(value) }}%</strong>
          </template>
        </v-progress-linear>
      </v-col>
    </v-row>

    <v-row>
      <v-divider :thickness="30" class="border-opacity-100" color="info" />
    </v-row>

    <v-row>
      <VChart class="chart" :option="option" autoresize />
    </v-row>
  </v-container>
</template>

<style scoped>
.chart {
  height: 70vh;
  width: 140vh;
}
</style>
