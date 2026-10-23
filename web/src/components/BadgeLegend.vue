<template>
  <div class="legend">
    <div class="group">
      <span class="title">角标</span>
      <span class="item"><b :style="{ color: 'var(--holiday-badge-text)' }">休</b>法定节假日</span>
      <span class="item"><b :style="{ color: 'var(--weekend-badge-text)' }">休</b>周末</span>
      <span class="item"><b :style="{ color: 'var(--workday-badge-text)' }">班</b>调休补班</span>
      <span v-if="!dataCovered" class="hint">该年份的节假日数据未覆盖，角标留空不猜</span>
    </div>
    <div class="group">
      <span class="title">日程</span>
      <span v-for="(c, i) in PALETTE" :key="c" class="dot" :style="{ background: c }" :title="COLOR_NAMES[i]" />
    </div>
  </div>
</template>

<script setup>
import { COLOR_NAMES, PALETTE } from '../utils/palette.js'

defineProps({
  /** 当前视图范围是否有节假日数据覆盖 */
  dataCovered: { type: Boolean, default: true },
})
</script>

<style scoped>
.legend {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--legend-text);
}

.group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  color: #999999;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.item b {
  font-weight: 600;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.hint {
  color: #b0b0b0;
}
</style>
