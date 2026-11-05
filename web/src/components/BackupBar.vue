<template>
  <a-dropdown :trigger="['click']">
    <a-button size="small">备份</a-button>
    <template #overlay>
      <a-menu @click="onMenu">
        <a-menu-item key="export">导出 JSON（{{ scheduleState.schedules.length }} 条）</a-menu-item>
        <a-menu-item key="import">导入 JSON…</a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>

  <!-- 导入是覆盖风险操作，用独立的文件选择框，选中后先解析校验再问「合并 / 覆盖」 -->
  <input ref="fileInput" type="file" accept="application/json,.json" class="file" @change="onFile" />

  <a-modal
    v-model:open="confirmOpen"
    title="导入备份"
    :width="440"
    :mask-closable="false"
    :footer="null"
    @cancel="closeConfirm"
  >
    <p class="summary">
      文件中读到 <b>{{ parsed.schedules.length }}</b> 条日程<span v-if="parsed.skipped">（另有 {{ parsed.skipped }} 条格式不合法，将跳过）</span>。
      <br />
      当前库里有 <b>{{ scheduleState.schedules.length }}</b> 条。
    </p>
    <a-alert type="warning" show-icon :message="`「覆盖导入」会先清空现有 ${scheduleState.schedules.length} 条日程，且无法撤销。`" />
    <div class="actions">
      <a-button @click="closeConfirm">取消</a-button>
      <a-button @click="doMerge">合并导入</a-button>
      <a-popconfirm title="确定清空现有日程并覆盖？此操作无法撤销。" ok-text="确定覆盖" cancel-text="取消" @confirm="doReplace">
        <a-button danger>覆盖导入</a-button>
      </a-popconfirm>
    </div>
  </a-modal>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { scheduleState, mergeAll, replaceAll } from '../store/schedule.js'
import { backupFileName, downloadJson, exportJson, parseBackup, summarize } from '../utils/backup.js'

const fileInput = ref(null)
const confirmOpen = ref(false)
const parsed = reactive({ schedules: [], skipped: 0 })

function onMenu({ key }) {
  if (key === 'export') doExport()
  else fileInput.value?.click()
}

function doExport() {
  const list = scheduleState.schedules
  if (!list.length) {
    message.info('当前没有日程可导出')
    return
  }
  const now = new Date()
  downloadJson(backupFileName(now), exportJson(list, now))
  message.success(`已导出：${summarize(list)}`)
}

async function onFile(event) {
  const file = event.target.files?.[0]
  // 重置 input，否则连续选同一个文件不会再触发 change
  event.target.value = ''
  if (!file) return
  let text = ''
  try {
    text = await file.text()
  } catch {
    message.error('读取文件失败')
    return
  }
  const result = parseBackup(text)
  if (!result.ok) {
    message.error(`导入失败：${result.error}`)
    return
  }
  parsed.schedules = result.schedules
  parsed.skipped = result.skipped
  confirmOpen.value = true
}

function closeConfirm() {
  confirmOpen.value = false
  parsed.schedules = []
  parsed.skipped = 0
}

async function doMerge() {
  try {
    const { imported, skipped } = await mergeAll(parsed.schedules)
    closeConfirm()
    message.success(`已合并导入 ${imported} 条${skipped ? `，跳过 ${skipped} 条（重复或格式不合法）` : ''}`)
  } catch (e) {
    // 失败时不关确认框，用户可以直接重试
    message.error(e?.message ?? '导入失败')
  }
}

async function doReplace() {
  try {
    const { imported, skipped } = await replaceAll(parsed.schedules)
    closeConfirm()
    message.success(`已覆盖导入 ${imported} 条${skipped ? `，跳过 ${skipped} 条格式不合法的` : ''}`)
  } catch (e) {
    // 覆盖导入是后端单事务，失败即整体回滚，不会留下半截数据
    message.error(e?.message ?? '导入失败')
  }
}
</script>

<style scoped>
.file {
  display: none;
}

.summary {
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.7;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
