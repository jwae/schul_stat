<script setup lang="ts">
import { ref } from "vue";
import UserSessionCard from "./UserSessionCard.vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  user?: any;
  loginUserLabel?: string;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
}>();

const activeCredentialsMenu = ref<"gs" | "sek1">("gs");
</script>

<template src="./LoginCredentialsPage.html"></template>
<style scoped src="./LoginCredentialsPage.css"></style>
