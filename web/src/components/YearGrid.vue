<template>
  <div class="year-view">
    <div v-for="m in months" :key="m.month" class="mini" @click="emit('pickMonth', m.month)">
      <div class="mini-head">
        <span class="mini-title">{{ m.month }}月</span>
        <span v-if="m.count" class="mini-count">{{ m.count }} 条</span>
      </div>
      <div class="mini-grid">
        <div
          v-for="cell in m.cells"
          :key="cell.dayNumber"
          class="mini-cell"
          :class="{
            'mini-cell--outside': !cell.inMonth,
            'mini-cell--today': cell.isToday,
            'mini-cell--rest': cell.badge && cell.badge !== 'workday',
          }"
          :style="cell.inMonth && colorAtCell(m, cell.dayNumber) ? { background: colorAtCell(m, cell.dayNumber) } : undefined"
          :title="cell.title"
        >
          <span v-if="cell.inMonth">{{ cell.day }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { daysInMonth, firstDayOffset, formatMonthDay, monthStart, toDayNumber, todayDayNumber } from '../utils/date.js'
import { calculateBars } from '../utils/gantt.js'
import { colorOf } from '../utils/palette.js'
const props = defineProps({
  year: { type: Number, required: true },
  schedules: { type: Array, default: () => [] },
  /** 角标表覆盖整年 */
  badges: { type: Object, default: () => new Map() },
})

const emit = defineEmits(['pickMonth'])

const today = todayDayNumber()

/**
 * 12 个缩略月。每天一个小方块，日程在缩略图上只体现为「有色块」——
 * 细到这个尺寸画不出位置准确的色带，所以用颜色点标出「这天有安排」，
 * 想看清具体排期点进月视图。
 */
const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const first = monthStart(props.year, month)
    const last = toDayNumber(props.year, month, daysInMonth(props.year, month))
    const bars = calculateBars(props.schedules, first, last)
    // 日历格子上该用哪个颜色：取这天命中的第一条日程
    const colorAt = new Map()
    for (const bar of bars) {
      for (let d = bar.startDay; d <= bar.endDay; d++) {
        if (!colorAt.has(d)) colorAt.set(d, bar.schedule.color)
      }
    }
    const offset = firstDayOffset(props.year, month)
    const total = daysInMonth(props.year, month)
    const gridStart = first - offset
    const cells = []
    for (let c = 0; c < Math.ceil((offset + total) / 7) * 7; c++) {
      const dayNumber = gridStart + c
      const inMonth = dayNumber >= first && dayNumber <= last
      const badge = inMonth ? props.badges.get(dayNumber) : undefined
      const titles = bars
        .filter((b) => dayNumber >= b.startDay && dayNumber <= b.endDay)
        .map((b) => b.schedule.title)
      cells.push({
        dayNumber,
        inMonth,
        day: inMonth ? dayNumber - first + 1 : null,
        isToday: dayNumber === today,
        badge,
        title: inMonth
          ? [
              formatMonthDay(dayNumber),
              badge ? (badge === 'workday' ? '调休补班' : badge === 'holiday' ? '法定节假日' : '周末') : '',
              ...titles,
            ]
              .filter(Boolean)
              .join(' · ')
          : '',
      })
    }
    return {
      month,
      count: new Set(bars.map((b) => b.schedule.id)).size,
      cells,
      colorAt,
    }
  })
)

/** 缩略格子上的日程色：仅当这天有日程时画，一天多条的取第一条的颜色 */
function colorAtCell(monthData, dayNumber) {
  const color = monthData.colorAt.get(dayNumber)
  return color === undefined ? undefined : colorOf(color)
}
</script>

<style scoped>
.year-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  align-content: start;
  padding-bottom: 8px;
}

.mini {
  background: var(--day-cell-bg);
  border: 1px solid var(--cell-border);
  border-radius: 8px;
  padding: 8px 10px 10px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.mini:hover {
  border-color: var(--today-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mini-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

.mini-title {
  font-size: 13px;
  font-weight: 600;
}

.mini-count {
  font-size: 11px;
  color: var(--legend-text);
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

.mini-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--day-text);
  border-radius: 3px;
  background: #fbfbfc;
}

.mini-cell--outside {
  background: transparent;
  color: transparent;
}

/* 休息日底色略灰，与角标口径一致（补班日不染色） */
.mini-cell--rest {
  background: #f0f1f3;
}

.mini-cell--today {
  outline: 1px solid var(--today-border);
  background: var(--today-bg);
  color: var(--today-text);
  font-weight: 600;
}
</style>
