<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import * as echarts from "echarts";

interface Props {
  option?: any;
  autoresize?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  option: null,
  autoresize: true,
});

const containerEl = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

function applyOption() {
  if (!chart || !props.option) return;
  chart.setOption(props.option, true);
}

async function initChart() {
  if (chart || !containerEl.value) return;
  
  // Ensure the DOM element has size before initializing
  await nextTick();
  
  if (!containerEl.value) return;
  
  chart = echarts.init(containerEl.value);
  applyOption();

  if (props.autoresize && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      chart?.resize();
    });
    resizeObserver.observe(containerEl.value);
  }
}

onMounted(() => {
  if (props.option) {
    initChart();
  }
});

watch(
  () => props.option,
  (nextOption) => {
    if (!nextOption) {
      if (chart) chart.clear();
      return;
    }
    if (!chart) {
      initChart();
    } else {
      applyOption();
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<template>
  <div ref="containerEl" class="pie-chart"></div>
</template>
