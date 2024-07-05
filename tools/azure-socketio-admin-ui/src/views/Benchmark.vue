<template>
  <div>
    <v-breadcrumbs :items="breadcrumbItems" />

    <v-container fluid>
          <BenchmarkHistogram />
    </v-container>
  </div>
</template>

<script>
import BenchmarkHistogram from "../components/Benchmark/BenchmarkHistogram";
import { mapGetters } from "vuex";

export default {
  name: "Benchmark",

  components: {
    BenchmarkHistogram,
},

  computed: {
    breadcrumbItems() {
      return [
        {
          text: this.$t("benchmark.detailedTitle"),
          disabled: true,
        },
      ];
    },
    ...mapGetters("config", ["hasAggregatedValues"]),
  },
};
</script>
