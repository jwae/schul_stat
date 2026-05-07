<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

interface Props {
  title?: string;
  subtitle?: string;
  items?: string[];
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "",
  subtitle: "",
  items: () => [],
  ariaLabel: "Hilfe",
});

const emit = defineEmits<{
  (e: "close"): void;
}>();

function closeOverlay() {
  emit("close");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeOverlay();
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="help-overlay" @click.self="closeOverlay">
    <section class="help-overlay-dialog" role="dialog" aria-modal="true" :aria-label="ariaLabel">
      <div class="help-overlay-head">
        <div class="help-overlay-copy">
          <h3>{{ title }}</h3>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <button class="btn-secondary help-overlay-close" type="button" @click="closeOverlay">
          Schliessen
        </button>
      </div>

      <div class="help-overlay-content">
        <p v-for="(item, index) in items" :key="`help-item-${index}`">{{ item }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.btn-secondary {
  background: #fff;
  color: #111;
  border: 1px solid #ccc;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover {
  background: #f7f9fc;
}

.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: rgba(23, 34, 52, 0.46);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.help-overlay-dialog {
  width: min(660px, 100%);
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid #dbe4f0;
  background: linear-gradient(180deg, #ffffff 0%, #f4f8fe 100%);
  box-shadow: 0 24px 60px rgba(20, 63, 120, 0.24);
}

.help-overlay-head {
  margin: -18px -18px 0;
  padding: 16px 18px 14px;
  border-radius: 18px 18px 0 0;
  background: linear-gradient(180deg, #eaf2ff 0%, #dce9ff 100%);
  border-bottom: 1px solid #c9daf7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.help-overlay-copy {
  flex: 1;
}

.help-overlay-copy h3 {
  margin: 0;
  color: #114fb8;
  font-size: 18px;
  text-align: center;
}

.help-overlay-copy p {
  margin: 4px 0 0;
  color: #4f6f99;
  line-height: 1.45;
  text-align: center;
}

.help-overlay-close {
  min-height: 34px;
  padding: 6px 10px;
}

.help-overlay-content {
  display: grid;
  gap: 10px;
  color: #41546d;
  line-height: 1.5;
}

.help-overlay-content p {
  margin: 0;
}

@media (max-width: 640px) {
  .help-overlay-head {
    align-items: stretch;
    flex-direction: column;
  }

  .help-overlay-close {
    align-self: center;
  }
}
</style>
