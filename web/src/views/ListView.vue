<template>
  <div class="list-view">
    <div class="toolbar">
      <a-input-search
        :value="prefs.keyword"
        placeholder="搜索标题"
        allow-clear
        class="search"
        @update:value="onKeyword"
      />
      <a-select
        :value="prefs.colorFilter"
        mode="multiple"
        placeholder="按颜色筛选"
        allow-clear
        class="colors"
        :max-tag-count="3"
        @update:value="onColors"
      >
        <a-select-option v-for="(c, i) in PALETTE" :key="i" :value="i">
          <span class="opt-dot" :style="{ background: c }" />{{ COLOR_NAMES[i] }}
        </a-select-option>
      </a-select>
      <a-range-picker
        :value="rangeValue"
        format="YYYY-MM-DD"
        :input-read-only="false"
        :placeholder="['开始日期', '结束日期']"
        @update:value="onRange"
      />
      <span class="count">共 {{ rows.length }} 条</span>
      <a-button v-if="filterActive" @click="onClear">清空筛选</a-button>
      <a-button type="primary" @click="openCreate">新建日程</a-button>
    </div>

    <div v-if="!scheduleState.persistent" class="warn">
      浏览器未开放本地存储（或处于隐私模式），本次改动的数据刷新后会丢失。
    </div>

    <a-table
      class="table"
      :columns="columns"
      :data-source="rows"
      :row-key="(r) => r.id"
      :pagination="pagination"
      size="middle"
      :locale="{ emptyText: filterActive ? '没有符合筛选条件的日程' : '暂无日程' }"
      :custom-row="customRow"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <span class="title-cell">
            <span class="dot" :style="{ background: colorOf(record.color) }" />
            <span class="title-text">{{ record.title }}</span>
          </span>
        </template>
        <template v-else-if="column.key === 'color'">
          {{ colorNameOf(record.color) }}
        </template>
        <template v-else-if="column.key === 'range'">
          {{ formatMonthDay(record.startDay) }} ~ {{ formatMonthDay(record.endDay) }}
          <span v-if="crossYear(record)" class="year-hint">{{ yearSpan(record) }}</span>
        </template>
        <template v-else-if="column.key === 'days'">{{ spanDays(record.startDay, record.endDay) }} 天</template>
        <template v-else-if="column.key === 'action'">
          <a-button type="link" size="small" @click.stop="openEdit(record)">编辑</a-button>
        </template>
      </template>
    </a-table>

    <ScheduleDialog
      :open="dialogOpen"
      :schedule="editing"
      @save="onSave"
      @delete="onDelete"
      @cancel="dialogOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import ScheduleDialog from '../components/ScheduleDialog.vue'
import { addSchedule, load, removeSchedule, scheduleState, updateSchedule } from '../store/schedule.js'
import {
  clearFilters,
  prefsState as prefs,
  setColorFilter,
  setKeyword,
  setRangeFilter,
} from '../store/prefs.js'
import { MS_PER_DAY, formatDay, formatMonthDay, parseDay, spanDays } from '../utils/date.js'
import { filterSchedules, hasActiveFilter } from '../utils/filter.js'
import { COLOR_NAMES, PALETTE, colorNameOf, colorOf } from '../utils/palette.js'

const dialogOpen = ref(false)
const editing = ref(null)

const columns = [
  { title: '标题', dataIndex: 'title', key: 'title', sorter: (a, b) => a.title.localeCompare(b.title, 'zh') },
  { title: '起止日期', dataIndex: 'startDay', key: 'range', sorter: (a, b) => a.startDay - b.startDay || a.endDay - b.endDay },
  { title: '天数', dataIndex: 'days', key: 'days', width: 90, sorter: (a, b) => spanDays(a.startDay, a.endDay) - spanDays(b.startDay, b.endDay) },
  { title: '颜色', dataIndex: 'color', key: 'color', width: 90, sorter: (a, b) => a.color - b.color },
  { title: '', key: 'action', width: 80 },
]

const pagination = { pageSize: 20, showSizeChanger: false, hideOnSinglePage: true, showTotal: (t) => `共 ${t} 条` }

const filterActive = computed(() =>
  hasActiveFilter({ keyword: prefs.keyword, colors: prefs.colorFilter, from: prefs.rangeFrom, to: prefs.rangeTo })
)

/** 筛选后的行（排序交给 antd Table 的 sorter，不改动 store 里的顺序） */
const rows = computed(() =>
  filterSchedules(scheduleState.schedules, {
    keyword: prefs.keyword,
    colors: prefs.colorFilter,
    from: prefs.rangeFrom,
    to: prefs.rangeTo,
  })
)

/** DatePicker 需要 dayjs 对象；从天数序号构造，避免时区偏一天 */
const rangeValue = computed(() => {
  const from = Number.isInteger(prefs.rangeFrom) ? dayjs(formatDay(prefs.rangeFrom), 'YYYY-MM-DD') : null
  const to = Number.isInteger(prefs.rangeTo) ? dayjs(formatDay(prefs.rangeTo), 'YYYY-MM-DD') : null
  return from || to ? [from, to] : null
})

onMounted(() => {
  load()
})

/** 跨年日程在「起止日期」列补一句年份，否则「12月31日 ~ 1月2日」看不出跨了年 */
function crossYear(record) {
  return (
    new Date(record.startDay * MS_PER_DAY).getUTCFullYear() !==
    new Date(record.endDay * MS_PER_DAY).getUTCFullYear()
  )
}

function yearSpan(record) {
  const from = new Date(record.startDay * MS_PER_DAY)
  const to = new Date(record.endDay * MS_PER_DAY)
  return `（跨年：${from.getUTCFullYear()} → ${to.getUTCFullYear()}）`
}

/** 整行可点，点进编辑；「编辑」按钮单独绑了 stop，避免触发两次 */
function customRow(record) {
  return {
    onClick: () => openEdit(record),
    style: { cursor: 'pointer' },
  }
}

function onKeyword(value) {
  setKeyword(value ?? '')
}

function onColors(value) {
  setColorFilter(Array.isArray(value) ? value : [])
}

function onRange(value) {
  if (!value || !value[0] || !value[1]) {
    setRangeFilter(null, null)
    return
  }
  setRangeFilter(parseDay(value[0].format('YYYY-MM-DD')), parseDay(value[1].format('YYYY-MM-DD')))
}

function onClear() {
  clearFilters()
}

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(record) {
  editing.value = record
  dialogOpen.value = true
}

async function onSave(payload) {
  try {
    if (payload.id !== undefined) {
      await updateSchedule(payload)
      message.success('已保存')
    } else {
      await addSchedule(payload)
      message.success('已新增')
    }
    dialogOpen.value = false
    editing.value = null
  } catch (e) {
    message.error(e?.message ?? '保存失败')
  }
}

async function onDelete(id) {
  await removeSchedule(id)
  message.success('已删除')
  dialogOpen.value = false
  editing.value = null
}
</script>

<style scoped>
.list-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px 16px 16px;
  gap: 10px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: none;
}

.search {
  width: 200px;
}

.colors {
  width: 200px;
}

.opt-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: middle;
}

.count {
  font-size: 12px;
  color: var(--legend-text);
}

.warn {
  flex: none;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fff7e6;
  border: 1px solid #ffe0a3;
  color: #ad6800;
  font-size: 12px;
}

.table {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.title-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}

.title-text {
  font-weight: 500;
}

.year-hint {
  margin-left: 6px;
  font-size: 12px;
  color: var(--legend-text);
}
</style>
