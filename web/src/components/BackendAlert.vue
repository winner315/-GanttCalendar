<template>
  <!-- 后端连不上时**绝不降级到本地存储**：明着报错，数据一律不显示 -->
  <a-alert
    v-if="!scheduleState.persistent"
    class="backend-alert"
    type="error"
    show-icon
    message="后端未连接"
  >
    <template #description>
      <div class="reason">{{ scheduleState.backendError || '无法连接后端服务' }}</div>
      <div class="hint">
        数据没在本地兜底，所以这里不显示任何日程。确认 MySQL 与后端已启动后再点「重试」。
      </div>
    </template>
    <template #action>
      <a-button size="small" :loading="retrying" @click="retry">重试</a-button>
    </template>
  </a-alert>
</template>

<script setup>
import { ref } from 'vue'
import { load, scheduleState } from '../store/schedule.js'

const retrying = ref(false)

// load() 自己不抛异常，失败时状态仍是 persistent=false，告警条会照旧挂着
async function retry() {
  retrying.value = true
  try {
    await load()
  } finally {
    retrying.value = false
  }
}
</script>

<style scoped>
/* 独立类名：不要复用视图里的 .warn（那是数据脏的提示，与连接状态无关） */
.backend-alert {
  flex: none;
  margin: 12px 16px 0;
}

.reason {
  /* MySQL 的原始报错可能很长，别把布局撑破 */
  word-break: break-all;
}

.hint {
  margin-top: 4px;
  color: var(--legend-text);
}
</style>
