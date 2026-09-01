<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BenchmarkHistogram from "../components/Benchmark/BenchmarkHistogram.vue";

const { t } = useI18n();

const breadcrumbItems = computed(() => [
  {
    title: t("benchmark.detailedTitle"),
    disabled: true,
  },
]);
</script>

<template>
  <div>
    <v-breadcrumbs :items="breadcrumbItems" />

    <v-container fluid>
      <BenchmarkHistogram />
    </v-container>
  </div>
</template>
