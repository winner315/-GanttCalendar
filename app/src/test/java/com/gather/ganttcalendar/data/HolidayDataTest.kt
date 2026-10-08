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
