<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';

import {
  detectShowcasePlatform,
  getShowcaseImage,
  type ShowcaseMode,
  type ShowcasePlatform,
} from './editor-showcase';

const SHOWCASE_PLATFORMS: ReadonlyArray<{ id: ShowcasePlatform; label: string }> = [
  { id: 'macos', label: 'macOS' },
  { id: 'windows-linux', label: 'Windows / Linux' },
];

const SHOWCASE_MODES: ReadonlyArray<{ id: ShowcaseMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const props = defineProps<{
  description?: string;
}>();

const { isDark } = useData();
const platform = ref<ShowcasePlatform>('macos');
const modeOverride = ref<ShowcaseMode | null>(null);

watch(isDark, () => {
  modeOverride.value = null;
});

onMounted(() => {
  platform.value = detectShowcasePlatform(window.navigator);
});

const activeMode = computed<ShowcaseMode>(() => modeOverride.value ?? (isDark.value ? 'dark' : 'light'));
const lightImage = computed(() => getShowcaseImage(platform.value, 'light', props.description));
const darkImage = computed(() => getShowcaseImage(platform.value, 'dark', props.description));

function selectMode(mode: ShowcaseMode) {
  const siteMode: ShowcaseMode = isDark.value ? 'dark' : 'light';
  modeOverride.value = mode === siteMode ? null : mode;
}
</script>

<template>
  <figure class="editor-showcase" :data-mode="modeOverride ?? 'auto'">
    <div class="editor-showcase-bar">
      <div class="editor-showcase-segmented" role="group" aria-label="Platform window frame">
        <button
          v-for="item in SHOWCASE_PLATFORMS"
          :key="item.id"
          type="button"
          class="editor-showcase-option"
          :aria-pressed="platform === item.id"
          @click="platform = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="editor-showcase-segmented" role="group" aria-label="Theme preview">
        <button
          v-for="item in SHOWCASE_MODES"
          :key="item.id"
          type="button"
          class="editor-showcase-option"
          :aria-pressed="activeMode === item.id"
          @click="selectMode(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div class="editor-showcase-frame">
      <img
        class="editor-showcase-img editor-showcase-img-light"
        :src="lightImage.src"
        :alt="lightImage.alt"
        width="1440"
        height="900"
      />
      <img
        class="editor-showcase-img editor-showcase-img-dark"
        :src="darkImage.src"
        :alt="darkImage.alt"
        width="1440"
        height="900"
      />
    </div>
  </figure>
</template>
