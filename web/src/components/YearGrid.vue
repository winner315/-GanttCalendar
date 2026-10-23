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
            'mini-cell--rest': isRest(cell.badge),
          }"
          :title="cell.title"
        >
          <span v-if="cell.inMonth" class="mini-day">{{ cell.day }}</span>
          <!-- 这天的日程色带：一天多条就按条数平分，颜色都看得到 -->
          <span v-if="cell.colors.length" class="mini-cues">
            <span v-for="(c, i) in cell.colors" :key="i" class="mini-cue" :style="{ background: c }" />
          </span>
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
import { isRest } from '../utils/holiday.js'
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
 * 细到这个尺寸画不出位置准确的色带，所以格子底部用一条分段细带上色
 * （一天多条就按条数平分，几条的颜色都看得到），想看清具体排期点进月视图。
 */
const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const first = monthStart(props.year, month)
    const last = toDayNumber(props.year, month, daysInMonth(props.year, month))
    const bars = calculateBars(props.schedules, first, last)
    // 这天命中的日程颜色，一天多条全都留着（按开始日排序，跨这天时段落的顺序）
    const colorsAt = new Map()
    for (const bar of bars) {
      for (let d = bar.startDay; d <= bar.endDay; d++) {
        if (!colorsAt.has(d)) colorsAt.set(d, [])
        colorsAt.get(d).push(bar.schedule.color)
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
        colors: inMonth ? (colorsAt.get(dayNumber) ?? []).map(colorOf) : [],
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
    }
  })
)
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

/* 休息日底色，与月/周视图同一变量（补班日不染色） */
.mini-cell--rest {
  background: var(--rest-cell-bg);
}

.mini-cell--today {
  outline: 1px solid var(--today-border);
  background: var(--today-bg);
  color: var(--today-text);
  font-weight: 600;
}

/* 日期数字稍上移，给底部色带留位置；数字本身仍居中可读 */
.mini-day {
  transform: translateY(-2px);
}

.mini-cues {
  position: absolute;
  left: 1px;
  right: 1px;
  bottom: 1px;
  height: 3px;
  display: flex;
  gap: 1px;
  border-radius: 1.5px;
  overflow: hidden;
}

.mini-cue {
  flex: 1;
  min-width: 0;
}
</style>
