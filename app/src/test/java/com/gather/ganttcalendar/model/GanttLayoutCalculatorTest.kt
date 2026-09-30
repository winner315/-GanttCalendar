package com.gather.ganttcalendar.model

import com.gather.ganttcalendar.data.Schedule
import com.gather.ganttcalendar.util.DateUtils
import org.junit.Assert.assertEquals
import org.junit.Test

class GanttLayoutCalculatorTest {
    private fun s(title: String, y1: Int, m1: Int, d1: Int, y2: Int, m2: Int, d2: Int) =
        Schedule(title = title, startDate = DateUtils.toEpochDay(y1, m1, d1),
                 endDate = DateUtils.toEpochDay(y2, m2, d2), color = 0)

    @Test fun daysAreClippedToMonth() {
        val bars = GanttLayoutCalculator.calculate(
            listOf(s("跨月", 2026, 8, 28, 2026, 9, 3)), 2026, 9)
        assertEquals(1, bars.size)
        assertEquals(1, bars[0].startDay)
        assertEquals(3, bars[0].endDay)
    }

    @Test fun overlappingGoToDifferentLanes() {
        val bars = GanttLayoutCalculator.calculate(listOf(
            s("A", 2026, 9, 1, 2026, 9, 10),
            s("B", 2026, 9, 5, 2026, 9, 15)
        ), 2026, 9)
        val a = bars.first { it.schedule.title == "A" }
        val b = bars.first { it.schedule.title == "B" }
        assertEquals(0, a.lane)
        assertEquals(1, b.lane)
    }

    @Test fun nonOverlappingReuseSameLane() {
        val bars = GanttLayoutCalculator.calculate(listOf(
            s("A", 2026, 9, 1, 2026, 9, 3),
            s("B", 2026, 9, 4, 2026, 9, 6)
        ), 2026, 9)
        assertEquals(0, bars.first { it.schedule.title == "B" }.lane)
        assertEquals(1, GanttLayoutCalculator.laneCount(bars))
    }

    @Test fun outOfMonthExcluded() {
        val bars = GanttLayoutCalculator.calculate(listOf(
            s("旧", 2026, 7, 1, 2026, 7, 5)
        ), 2026, 9)
        assertEquals(0, bars.size)
    }
}
