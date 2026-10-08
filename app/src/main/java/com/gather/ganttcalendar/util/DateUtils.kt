package com.gather.ganttcalendar.util

import java.time.LocalDate
import java.time.YearMonth

object DateUtils {
    fun toEpochDay(year: Int, month: Int, day: Int): Long =
        LocalDate.of(year, month, day).toEpochDay()

    fun daysInMonth(year: Int, month: Int): Int = YearMonth.of(year, month).lengthOfMonth()

    fun monthStartEpoch(year: Int, month: Int): Long = toEpochDay(year, month, 1)

    fun monthEndEpoch(year: Int, month: Int): Long =
        toEpochDay(year, month, daysInMonth(year, month))

    fun monthTitle(year: Int, month: Int): String = "${year}年${month}月"

    fun shiftMonth(year: Int, month: Int, delta: Int): Pair<Int, Int> {
        val ym = YearMonth.of(year, month).plusMonths(delta.toLong())
        return ym.year to ym.monthValue
    }

    fun todayYearMonth(): Pair<Int, Int> {
        val now = LocalDate.now()
        return now.year to now.monthValue
    }

    /** 当月 1 号在「周一起始」这一周里的位置，0=周一、6=周日 */
    fun firstDayOffset(year: Int, month: Int): Int =
        LocalDate.of(year, month, 1).dayOfWeek.value - 1

    fun todayEpochDay(): Long = LocalDate.now().toEpochDay()
}
