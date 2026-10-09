package com.gather.ganttcalendar.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

class HolidayDataTest {

    private fun epoch(date: String): Long = LocalDate.parse(date).toEpochDay()

    @Test
    fun `parse 区分放假日与补班日`() {
        val map = HolidayData.parse(
            """
            {"year":2026,"days":[
              {"name":"元旦","date":"2026-01-01","isOffDay":true},
              {"name":"春节","date":"2026-02-14","isOffDay":false}
            ]}
            """.trimIndent()
        )
        assertEquals(2, map.size)
        assertEquals(Holiday(epoch("2026-01-01"), "元旦", false), map[epoch("2026-01-01")])
        assertEquals(Holiday(epoch("2026-02-14"), "春节", true), map[epoch("2026-02-14")])
    }

    @Test
    fun `parse 遇到坏数据返回空表而不抛异常`() {
        assertTrue(HolidayData.parse("不是 JSON").isEmpty())
        assertTrue(HolidayData.parse("""{"year":2026}""").isEmpty())
        assertTrue(HolidayData.parse("""{"days":[]}""").isEmpty())
    }

    @Test
    fun `parse 跳过日期非法的记录`() {
        val map = HolidayData.parse(
            """{"days":[{"name":"瞎写","date":"2026-13-45","isOffDay":true},
                        {"name":"元旦","date":"2026-01-01","isOffDay":true}]}"""
        )
        assertEquals(1, map.size)
        assertTrue(map.containsKey(epoch("2026-01-01")))
    }

    @Test
    fun `badges 标出法定假日与补班日`() {
        // 2026-10-01 周四（休）、10-10 周六（补班）、10-12 周一（普通工作日）
        val data = HolidayData.parse(
            """{"days":[{"name":"国庆节","date":"2026-10-01","isOffDay":true},
                        {"name":"国庆节","date":"2026-10-10","isOffDay":false}]}"""
        )
        val badges = HolidayData.badges(data, setOf(2026), epoch("2026-10-01"), epoch("2026-10-12"))
        assertEquals(false, badges[epoch("2026-10-01")])
        assertTrue("补班日即使落在周六也要标「班」", badges.getValue(epoch("2026-10-10")))
        assertTrue("普通周一不标", !badges.containsKey(epoch("2026-10-12")))
    }

    @Test
    fun `badges 在数据覆盖的年份里把普通周末标成休息`() {
        // 2026-10-17/18 是普通周六日，10-11 是普通周日
        val badges = HolidayData.badges(emptyMap(), setOf(2026), epoch("2026-10-11"), epoch("2026-10-31"))
        assertEquals(false, badges[epoch("2026-10-11")])
        assertEquals(false, badges[epoch("2026-10-17")])
        assertEquals(false, badges[epoch("2026-10-18")])
        assertTrue("普通工作日不标", !badges.containsKey(epoch("2026-10-19")))
    }

    @Test
    fun `badges 对没有数据的年份不猜`() {
        // 2027 年数据还没发布：周末也不标，免得把补班的周六错标成休息
        val badges = HolidayData.badges(emptyMap(), setOf(2025, 2026), epoch("2027-01-02"), epoch("2027-01-31"))
        assertTrue("没数据的年份不该有任何标注", badges.isEmpty())
    }

    /**
     * 内置数据自检：直接读 res/raw 原文断言真实日期，防止手抄/合并时把日期写错。
     * JVM 单测的工作目录是 app/，所以用相对路径取资源文件。
     */
    @Test
    fun `内置数据覆盖 2025-2026 且关键日期正确`() {
        val file = listOf(File("src/main/res/raw/holidays.json"), File("app/src/main/res/raw/holidays.json"))
            .firstOrNull { it.exists() }
        requireNotNull(file) { "找不到内置数据文件 src/main/res/raw/holidays.json" }

        val map = HolidayData.parse(file.readText())
        val years = map.keys.map { LocalDate.ofEpochDay(it).year }.toSet()
        assertEquals(setOf(2025, 2026), years)

        // 2026 国庆：10/1~10/7 放假，10/10（周六）补班
        assertTrue("2026-10-01 应为休息日", !map.getValue(epoch("2026-10-01")).isWorkday)
        assertTrue("2026-10-07 应为休息日", !map.getValue(epoch("2026-10-07")).isWorkday)
        assertTrue("2026-10-10 应为补班日", map.getValue(epoch("2026-10-10")).isWorkday)
        assertEquals("国庆节", map.getValue(epoch("2026-10-01")).name)

        // 2026 春节 2/15~2/23 放假，2/14 与 2/28 补班
        assertTrue("2026-02-15 应为休息日", !map.getValue(epoch("2026-02-15")).isWorkday)
        assertTrue("2026-02-14 应为补班日", map.getValue(epoch("2026-02-14")).isWorkday)

        // 2025 元旦只放 1 天，1/26 是春节前的补班日
        assertTrue("2025-01-01 应为休息日", !map.getValue(epoch("2025-01-01")).isWorkday)
        assertTrue("2025-01-26 应为补班日", map.getValue(epoch("2025-01-26")).isWorkday)
    }
}
