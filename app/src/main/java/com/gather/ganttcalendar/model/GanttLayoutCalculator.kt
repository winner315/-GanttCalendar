package com.gather.ganttcalendar.model

import com.gather.ganttcalendar.data.Schedule
import com.gather.ganttcalendar.util.DateUtils

object GanttLayoutCalculator {
    fun calculate(schedules: List<Schedule>, year: Int, month: Int): List<GanttBar> {
        val monthStart = DateUtils.monthStartEpoch(year, month)
        val monthEnd = DateUtils.monthEndEpoch(year, month)
        val sorted = schedules
            .filter { it.startDate <= monthEnd && it.endDate >= monthStart }
            .sortedBy { it.startDate }

        val laneLastEnd = mutableListOf<Int>()
        val result = mutableListOf<GanttBar>()
        for (s in sorted) {
            val startDay = (maxOf(s.startDate, monthStart) - monthStart).toInt() + 1
            val endDay = (minOf(s.endDate, monthEnd) - monthStart).toInt() + 1
            var lane = laneLastEnd.indexOfFirst { it < startDay }
            if (lane == -1) { lane = laneLastEnd.size; laneLastEnd.add(endDay) }
            else laneLastEnd[lane] = endDay
            result.add(GanttBar(s, startDay, endDay, lane))
        }
        return result
    }

    fun laneCount(bars: List<GanttBar>): Int =
        (bars.maxOfOrNull { it.lane } ?: -1) + 1
}
