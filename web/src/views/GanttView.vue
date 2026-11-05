<template>
  <div class="gantt">
    <div class="toolbar">
      <a-button-group>
        <a-button @click="step(-1)">‹</a-button>
        <a-button @click="goToday">今天</a-button>
        <a-button @click="step(1)">›</a-button>
      </a-button-group>
      <span class="range-title">{{ title }}</span>

      <a-radio-group :value="prefs.view" button-style="solid" size="small" @update:value="setView">
        <a-radio-button value="month">月</a-radio-button>
        <a-radio-button value="week">周</a-radio-button>
        <a-radio-button value="year">年</a-radio-button>
      </a-radio-group>

      <a-input-search
        :value="prefs.keyword"
        placeholder="搜索标题"
        allow-clear
        class="search"
        @update:value="onKeyword"
      />
      <a-select
        :value="prefs.statusFilter"
        mode="multiple"
        placeholder="按状态筛选"
        allow-clear
        class="statuses"
        :max-tag-count="3"
        @update:value="onStatuses"
      >
        <a-select-option v-for="st in STATUSES" :key="st" :value="st">{{ STATUS_LABELS[st] }}</a-select-option>
      </a-select>
      <a-button type="primary" @click="openCreate">新建日程</a-button>
    </div>

    <!-- 后端连不上由顶栏的 BackendAlert 统一提示，这里只管数据本身的问题 -->
    <div v-if="scheduleState.skippedOnLoad > 0" class="warn">
      有 {{ scheduleState.skippedOnLoad }} 条数据格式不合法，已跳过未显示。
    </div>

    <BadgeLegend class="legend-bar" :data-covered="dataCovered" />

    <div class="grid-wrap">
      <MonthGrid
        v-if="prefs.view === VIEW_MONTH"
        :year="prefs.year"
        :month="prefs.month"
        :schedules="filtered"
        :badges="badges"
        @pick="openEdit"
        @reschedule="onReschedule"
      />
      <WeekGrid
        v-else-if="prefs.view === VIEW_WEEK"
        :anchor="weekAnchor"
        :schedules="filtered"
        :badges="badges"
        @pick="openEdit"
      />
      <YearGrid v-else :year="prefs.year" :schedules="filtered" :badges="badges" @pick-month="onPickMonth" />
    </div>

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
import { computed, onMounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import BadgeLegend from '../components/BadgeLegend.vue'
import MonthGrid from '../components/MonthGrid.vue'
import ScheduleDialog from '../components/ScheduleDialog.vue'
import WeekGrid from '../components/WeekGrid.vue'
import YearGrid from '../components/YearGrid.vue'
import { addSchedule, load, removeSchedule, scheduleState, updateSchedule } from '../store/schedule.js'
import {
  VIEW_MONTH,
  VIEW_WEEK,
  VIEW_YEAR,
  goToday,
  prefsState as prefs,
  setKeyword,
  setStatusFilter,
  setView,
  setYearMonth,
  shiftMonthBy,
  shiftWeekBy,
  shiftYearBy,
} from '../store/prefs.js'
import { daysInMonth, fromDayNumber, monthTitle, toDayNumber, todayDayNumber } from '../utils/date.js'
import { filterSchedules } from '../utils/filter.js'
import { STATUSES, STATUS_LABELS } from '../utils/schedule.js'
import { badgesInRange as holidayBadgesInRange, coveredYears } from '../utils/holiday.js'
import { refreshIfStale } from '../api/holidaySync.js'

const dialogOpen = ref(false)
const editing = ref(null)
/** 节假日数据联网更新后自增，用来强制角标重算 */
const holidayVersion = ref(0)

const title = computed(() => {
  if (prefs.view === VIEW_YEAR) return `${prefs.year}年`
  return monthTitle(prefs.year, prefs.month)
})

/**
 * 周视图锚点（本周的任意一天）。
 * 没手动翻过周时：今天就在当前查看的月里 → 锚今天（想看的就是本周）；
 * 否则锚该月 1 号 —— 否则从 10 月的月视图切到周视图会跳到「今天那一周」，
 * 明明在看 10 月的排期却一片空白。
 */
const weekAnchor = computed(() => {
  if (Number.isInteger(prefs.weekAnchor)) return prefs.weekAnchor
  const today = todayDayNumber()
  const todayInView = fromDayNumber(today)
  if (todayInView.year === prefs.year && todayInView.month === prefs.month) return today
  return toDayNumber(prefs.year, prefs.month, 1)
})

/**
 * 当前视图要标注的时间范围。
 * 年视图要看整年（跨年的日程也才会被算成有安排），其余视图看当月。
 */
const visibleRange = computed(() => {
  if (prefs.view === VIEW_YEAR) {
    return { start: toDayNumber(prefs.year, 1, 1), end: toDayNumber(prefs.year, 12, 31) }
  }
  return {
    start: toDayNumber(prefs.year, prefs.month, 1),
    end: toDayNumber(prefs.year, prefs.month, daysInMonth(prefs.year, prefs.month)),
  }
})

const badges = computed(() => {
  holidayVersion.value // 依赖联网更新，数据到了要重算
  return holidayBadgesInRange(visibleRange.value.start, visibleRange.value.end)
})

const dataCovered = computed(() => {
  holidayVersion.value
  return coveredYears(visibleRange.value.start, visibleRange.value.end).size > 0
})

/** 关键词 + 颜色 + 状态筛选（甘特视图与列表页共用同一份条件与口径） */
const filtered = computed(() =>
  filterSchedules(scheduleState.schedules, {
    keyword: prefs.keyword,
    colors: prefs.colorFilter,
    statuses: prefs.statusFilter,
  })
)

onMounted(async () => {
  await load()
  // 节假日数据联网更新：24h 节流、失败静默回退内置数据
  await refreshIfStale()
  holidayVersion.value++
})

/** 上/下一个月、周、年 —— 按当前视图决定步长 */
function step(delta) {
  if (prefs.view === VIEW_MONTH) shiftMonthBy(delta)
  else if (prefs.view === VIEW_YEAR) shiftYearBy(delta)
  else shiftWeekBy(delta)
}

// 切月时也试一次（节流会把频率压到 24h 一次）
watch(
  () => [prefs.year, prefs.month],
  async () => {
    await refreshIfStale()
    holidayVersion.value++
  }
)

function onKeyword(value) {
  setKeyword(value ?? '')
}

function onStatuses(value) {
  setStatusFilter(Array.isArray(value) ? value : [])
}

function onPickMonth(month) {
  setYearMonth(prefs.year, month)
  setView(VIEW_MONTH)
}

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(schedule) {
  editing.value = schedule
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
  try {
    await removeSchedule(id)
  } catch (e) {
    // 后端没写成功就别说「已删除」，弹窗也留着让用户重试
    message.error(e?.message ?? '删除失败')
    return
  }
  message.success('已删除')
  dialogOpen.value = false
  editing.value = null
}

/** 拖拽改期：直接落库，失败会在 store 里把 persistent 置 false 并提示 */
async function onReschedule(next) {
  try {
    await updateSchedule(next)
  } catch (e) {
    message.error(e?.message ?? '改期失败')
  }
}
</script>

<style scoped>
.gantt {
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
  gap: 12px;
  flex: none;
  flex-wrap: wrap;
}

.range-title {
  font-size: 16px;
  font-weight: 600;
  min-width: 96px;
}

.search {
  width: 180px;
  margin-left: auto;
}

.statuses {
  width: 170px;
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

.legend-bar {
  flex: none;
}

.grid-wrap {
  flex: 1;
  min-height: 0;
}
</style>
