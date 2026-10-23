<template>
  <div class="week-view">
    <div class="days">
      <div v-for="day in days" :key="day.dayNumber" class="day" :class="{ 'day--today': day.isToday }" :data-day="day.dayNumber">
        <div class="day-head">
          <span class="day-weekday">周{{ day.weekday }}</span>
          <span class="day-date">{{ day.label }}</span>
          <span
            v-if="day.badge"
            class="day-badge"
            :style="{ color: `var(${badgeColorVar(day.badge)})` }"
            :title="badgeTitle(day.badge)"
            >{{ badgeText(day.badge) }}</span
          >
        </div>
      </div>
    </div>

    <div class="lanes" :style="{ '--lane-count': laneCount || 1 }">
      <div v-for="lane in Math.max(laneCount, 1)" :key="lane" class="lane">
        <div
          v-for="seg in laneSegs(lane - 1)"
          :key="seg.schedule.id"
          class="seg"
          :style="segStyle(seg)"
          :title="segTitle(seg)"
          @click="emit('pick', seg.schedule)"
        >
          <span class="seg-text">{{ seg.schedule.title }}</span>
        </div>
      </div>
    </div>

    <div v-if="!bars.length" class="empty">本周暂无日程</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { WEEKDAYS, formatMonthDay, fromDayNumber, todayDayNumber, weekdayIndex } from '../utils/date.js'
import { calculateBars, laneCount as countLanes } from '../utils/gantt.js'
import { badgeColorVar, badgeText } from '../utils/holiday.js'
import { colorOf, textColorOn } from '../utils/palette.js'

const props = defineProps({
  /** 本周任意一天（周三视图用今天作锚点） */
  anchor: { type: Number, required: true },
  schedules: { type: Array, default: () => [] },
  badges: { type: Object, default: () => new Map() },
})

const emit = defineEmits(['pick'])

/** 周一为一周的第一天，与月视图同口径（date.js 的 weekdayIndex / weekStart） */
const weekStart = computed(() => props.anchor - weekdayIndex(props.anchor))
const weekLast = computed(() => weekStart.value + 6)

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const dayNumber = weekStart.value + i
    return {
      dayNumber,
      weekday: WEEKDAYS[i],
      label: formatMonthDay(dayNumber),
      isToday: dayNumber === todayDayNumber(),
      badge: props.badges.get(dayNumber),
    }
  })
)

const bars = computed(() => calculateBars(props.schedules, weekStart.value, weekLast.value))
const laneCount = computed(() => countLanes(bars.value))

/** 本周一条泳道里的色带段（跨周日程裁到本周，位置按天宽算） */
function laneSegs(lane) {
  return bars.value
    .filter((bar) => bar.lane === lane)
    .map((bar) => ({ ...bar, len: bar.endDay - bar.startDay + 1 }))
    .sort((a, b) => a.startDay - b.startDay)
}

function segStyle(seg) {
  return {
    left: `calc(${seg.startDay - weekStart.value} * (100% / 7))`,
    width: `calc(${seg.len} * (100% / 7))`,
    background: colorOf(seg.schedule.color),
    color: textColorOn(seg.schedule.color),
  }
}

function segTitle(seg) {
  const from = fromDayNumber(seg.startDay)
  const to = fromDayNumber(seg.endDay)
  return `${seg.schedule.title}：${from.month}月${from.day}日 ~ ${to.month}月${to.day}日`
}

function badgeTitle(badge) {
  if (badge === 'holiday') return '法定节假日'
  if (badge === 'workday') return '调休补班日'
  return '周末'
}
</script>

<style scoped>
/* 周视图：每天一列横向铺开，看得比月视图细；一天一列所以用 grid 均分 */
.week-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--day-cell-bg);
  border: 1px solid var(--cell-border);
  border-radius: 8px;
  overflow: hidden;
}

.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: none;
  border-bottom: 1px solid var(--cell-border);
}

.day {
  position: relative;
  padding: 6px 0;
  border-right: 1px solid var(--cell-border);
  text-align: center;
}

.day:last-child {
  border-right: none;
}

.day--today {
  background: var(--today-bg);
}

.day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--legend-text);
}

.day--today .day-date {
  color: var(--today-text);
  font-weight: 600;
}

.day-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
}

.lanes {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* 泳道行高固定，不用 flex:1 撑满 —— 一周只有两三条日程时
     每条被撑到半屏高，色带变成大色块，很难看出「这是几天」 */
  overflow-y: auto;
}

.lane {
  position: relative;
  flex: none;
  height: 34px;
  margin-top: 2px;
  border-bottom: 1px solid #f5f5f5;
}

.seg {
  position: absolute;
  top: 3px;
  bottom: 3px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
}

.seg-text {
  overflow: hidden;
  text-overflow: ellipsis;
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
