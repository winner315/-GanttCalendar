package com.gather.ganttcalendar.util

import org.junit.Assert.assertEquals
import org.junit.Test

class DateUtilsTest {
    @Test fun daysInMonth_normal() = assertEquals(30, DateUtils.daysInMonth(2026, 9))
    @Test fun daysInMonth_leapFeb() = assertEquals(29, DateUtils.daysInMonth(2024, 2))
    @Test fun daysInMonth_nonLeapFeb() = assertEquals(28, DateUtils.daysInMonth(2026, 2))
    @Test fun monthStart_isDay1() =
        assertEquals(DateUtils.toEpochDay(2026, 9, 1), DateUtils.monthStartEpoch(2026, 9))
    @Test fun monthEnd_isLastDay() =
        assertEquals(DateUtils.toEpochDay(2026, 9, 30), DateUtils.monthEndEpoch(2026, 9))
    @Test fun monthTitle_format() = assertEquals("2026年9月", DateUtils.monthTitle(2026, 9))
    @Test fun shiftMonth_forward() = assertEquals(2027 to 1, DateUtils.shiftMonth(2026, 12, 1))
    @Test fun shiftMonth_backward() = assertEquals(2025 to 12, DateUtils.shiftMonth(2026, 1, -1))
}
