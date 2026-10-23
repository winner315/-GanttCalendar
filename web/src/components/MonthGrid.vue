<template>
  <div class="month">
    <!-- 星期表头，周一起始 -->
    <div class="weekday-row">
      <div v-for="w in WEEKDAYS" :key="w" class="weekday">{{ w }}</div>
    </div>

    <div class="weeks" :style="{ '--lane-count': laneCount || 1 }">
      <div v-for="(week, wi) in weeks" :key="wi" class="week">
        <!-- 底层：7 个日期格子。色带画在上层，所以格子只负责日号与角标 -->
        <div class="cells">
          <div
            v-for="(cell, ci) in week.cells"
            :key="ci"
            class="cell"
            :class="{ 'cell--today': cell.isToday, 'cell--outside': !cell.inMonth }"
            :data-day="cell.dayNumber"
          >
            <template v-if="cell.inMonth">
              <span class="cell-day">{{ cell.day }}</span>
              <span
                v-if="cell.badge"
                class="cell-badge"
                :style="{ color: `var(${badgeColorVar(cell.badge)})` }"
                :title="badgeTitle(cell.badge)"
                >{{ badgeText(cell.badge) }}</span
              >
            </template>
          </div>
        </div>

        <!-- 上层：泳道色带。段与段之间按天宽定位，跨格延伸，事件名完整写出 -->
        <div class="lanes">
          <div v-for="lane in laneCount" :key="lane" class="lane">
            <div
              v-for="seg in laneSegs(wi, lane - 1)"
              :key="seg.schedule.id"
              class="seg"
              :class="{ 'seg--dragging': dragState && dragState.id === seg.schedule.id }"
              :style="segStyle(seg)"
              :title="segTitle(seg)"
              @pointerdown="onPointerDown($event, seg)"
              @click="onSegClick(seg)"
            >
              <span class="seg-text">{{ seg.schedule.title }}</span>
              <!-- 拖右边缘改工期 -->
              <span class="seg-handle" title="拖动改工期" @pointerdown.stop="onPointerDown($event, seg, 'end')" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!bars.length" class="empty">本月暂无日程</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { WEEKDAYS, daysInMonth, firstDayOffset, monthStart, toDayNumber, todayDayNumber } from '../utils/date.js'
import { calculateBars, daysFromPixels, laneCount as countLanes, moveBy, resizeEnd } from '../utils/gantt.js'
import { badgeColorVar, badgeText } from '../utils/holiday.js'
import { colorOf, textColorOn } from '../utils/palette.js'

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  schedules: { type: Array, default: () => [] },
  /** 角标表：Map<dayNumber, 'holiday'|'weekend'|'workday'> */
  badges: { type: Object, default: () => new Map() },
  /** 是否允许拖拽改期 */
  draggable: { type: Boolean, default: true },
})

const emit = defineEmits(['pick', 'reschedule'])

const monthFirst = computed(() => monthStart(props.year, props.month))
const monthLast = computed(() => toDayNumber(props.year, props.month, daysInMonth(props.year, props.month)))
const today = todayDayNumber()

/** 当月日程的色带（绝对天数序号 + 泳道） */
const bars = computed(() => calculateBars(props.schedules, monthFirst.value, monthLast.value))
const laneCount = computed(() => countLanes(bars.value))

/**
 * 铺出「周 × 7 天」的网格。首周可能从上月月末起、末周可能延伸到下月，
 * 这些格子只在网格里占位，不画日号（与 Android 版一致：留空不猜）。
 */
const weeks = computed(() => {
  const offset = firstDayOffset(props.year, props.month)
  const total = daysInMonth(props.year, props.month)
  const weekCount = Math.ceil((offset + total) / 7)
  const gridStart = monthFirst.value - offset
  const out = []
  for (let w = 0; w < weekCount; w++) {
    const cells = []
    for (let c = 0; c < 7; c++) {
      const dayNumber = gridStart + w * 7 + c
      const inMonth = dayNumber >= monthFirst.value && dayNumber <= monthLast.value
      cells.push({
        dayNumber,
        inMonth,
        day: inMonth ? dayNumber - monthFirst.value + 1 : null,
        isToday: dayNumber === today,
        badge: inMonth ? props.badges.get(dayNumber) : undefined,
      })
    }
    out.push({ cells, first: gridStart + w * 7, last: gridStart + w * 7 + 6 })
  }
  return out
})

/** 某一周某条泳道里的色带段（已裁到本周） */
function laneSegs(weekIndex, lane) {
  const week = weeks.value[weekIndex]
  if (!week) return []
  const out = []
  for (const bar of bars.value) {
    if (bar.lane !== lane) continue
    const startDay = Math.max(bar.startDay, week.first)
    const endDay = Math.min(bar.endDay, week.last)
    if (startDay > endDay) continue
    out.push({ ...bar, startDay, endDay, len: endDay - startDay + 1 })
  }
  return out.sort((a, b) => a.startDay - b.startDay)
}

/** 段用绝对定位按「天宽」摆放：left = (起始天 - 周一) × 天宽，width = 天数 × 天宽 */
function segStyle(seg) {
  const week = weeks.value.find((w) => seg.startDay >= w.first && seg.startDay <= w.last)
  const offset = week ? seg.startDay - week.first : 0
  const ghost = dragState.value && dragState.value.id === seg.schedule.id ? dragState.value : null
  const shiftPx = ghost ? ghost.deltaDays : 0
  const growDays = ghost && ghost.mode === 'end' ? ghost.deltaDays : 0
  const left = `calc(${offset + shiftPx} * (100% / 7))`
  const width = `calc(${seg.len + growDays} * (100% / 7))`
  return {
    left,
    width,
    background: colorOf(seg.schedule.color),
    color: textColorOn(seg.schedule.color),
    zIndex: ghost ? 5 : 1,
    opacity: ghost ? 0.75 : 1,
  }
}

function segTitle(seg) {
  return `${seg.schedule.title}（拖动改期，右边缘改工期）`
}

/* ---------------- 拖拽改期 ---------------- */

const dragState = ref(null)

/**
 * 拖完会紧跟一次 click 事件，若不拦就会「拖完顺手弹出编辑框」。
 * 用时间戳而不是布尔量：click 在 pointerup 之后同步派发，几百毫秒的窗口足够覆盖，
 * 又不会长期屏蔽后续的正常点击。
 */
let suppressClickUntil = 0
const SUPPRESS_MS = 250

function onPointerDown(event, seg, mode = 'move') {
  if (!props.draggable || event.button !== 0) return
  const week = event.currentTarget.closest('.week')
  if (!week) return
  const dayWidth = week.getBoundingClientRect().width / 7
  dragState.value = {
    id: seg.schedule.id,
    schedule: seg.schedule,
    mode,
    dayWidth,
    startX: event.clientX,
    deltaDays: 0,
    moved: false,
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  event.preventDefault()
}

function onPointerMove(event) {
  const drag = dragState.value
  if (!drag) return
  drag.deltaDays = daysFromPixels(event.clientX - drag.startX, drag.dayWidth)
  if (drag.deltaDays !== 0) drag.moved = true
}

function onPointerUp() {
  const drag = dragState.value
  const dragged = Boolean(drag?.moved)
  teardown()
  dragState.value = null
  if (!dragged) return
  suppressClickUntil = Date.now() + SUPPRESS_MS
  if (drag.deltaDays === 0) return
  const next = drag.mode === 'end' ? resizeEnd(drag.schedule, drag.deltaDays) : moveBy(drag.schedule, drag.deltaDays)
  emit('reschedule', next)
}

function onKeyDown(event) {
  if (event.key !== 'Escape') return
  teardown()
  dragState.value = null
}

function teardown() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('keydown', onKeyDown)
}

/** 拖动过就不算点击，避免改期顺手把编辑框也弹出来 */
function onSegClick(seg) {
  if (Date.now() < suppressClickUntil) return
  emit('pick', seg.schedule)
}

function badgeTitle(badge) {
  if (badge === 'holiday') return '法定节假日'
  if (badge === 'workday') return '调休补班日'
  return '周末'
}
</script>

<style scoped>
.month {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--day-cell-bg);
  border: 1px solid var(--cell-border);
  border-radius: 8px;
  overflow: hidden;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: none;
  border-bottom: 1px solid var(--cell-border);
}

.weekday {
  padding: 6px 0;
  text-align: center;
  font-size: 12px;
  color: #999999;
}

.weeks {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 高度富余时各周均分撑满，避免下方留一大片空白；泳道高度也随之变高更好点 */
.week {
  position: relative;
  display: flow-root;
  flex: 1 1 auto;
  min-height: calc(var(--lane-count) * 22px + 20px);
  border-bottom: 1px solid var(--cell-border);
}

.week:last-child {
  border-bottom: none;
}

.cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  height: 100%;
}

.cell {
  position: relative;
  border-right: 1px solid var(--cell-border);
  min-height: 20px;
  overflow: hidden;
}

.cell:last-child {
  border-right: none;
}

.cell--outside {
  background: #fafafa;
}

.cell--today {
  background: var(--today-bg);
  box-shadow: inset 0 0 0 1px var(--today-border);
}

.cell-day {
  display: block;
  text-align: center;
  font-size: 12px;
  line-height: 18px;
  color: var(--day-text);
}

.cell--today .cell-day {
  color: var(--today-text);
  font-weight: 600;
}

.cell-badge {
  position: absolute;
  top: 0;
  right: 2px;
  font-size: 10px;
  line-height: 12px;
}

/* 色带层：整周一块相对定位画布，段按天宽绝对定位，从而能跨格延伸 */
.lanes {
  position: absolute;
  inset: 18px 0 0 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.lane {
  position: relative;
  flex: 1;
  min-height: 22px;
}

.seg {
  position: absolute;
  top: 0;
  bottom: 2px;
  display: flex;
  align-items: center;
  padding: 0 12px 0 5px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  cursor: grab;
  pointer-events: auto;
  overflow: hidden;
  white-space: nowrap;
  touch-action: none;
}

.seg--dragging {
  cursor: grabbing;
}

.seg-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 右边缘 6px 是改工期的手柄 */
.seg-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
  background: rgba(255, 255, 255, 0.5);
}

.empty {
  flex: none;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  color: #999999;
  border-top: 1px solid var(--cell-border);
}
</style>
