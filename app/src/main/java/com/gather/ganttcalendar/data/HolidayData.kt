package com.gather.ganttcalendar.data

import android.content.Context
import com.gather.ganttcalendar.R
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap

/**
 * 国家法定节假日与调休（补班）数据。
 *
 * 数据源是 [holiday-cn](https://github.com/NateScarlet/holiday-cn)（MIT），schema 只有
 * `name` / `date` / `isOffDay` 三个字段 —— `isOffDay=false` 即调休补班日，没有单独的调休字段。
 *
 * 取值优先级：联网下载到 filesDir 的当年数据 > 随 APK 打包的内置数据。
 * 两者格式一致，所以同一个 [parse] 就够用。数据是静态的：每年 11 月国务院办公厅发布下一年
 * 安排后更新一次，平时不会变。查不到数据的年份**不猜**（不按「周末即休息」瞎标），留空。
 */
object HolidayData {
    private const val CACHE_PREFIX = "holiday-"

    /** 内置数据整份解析一次后常驻内存 —— 组件每帧渲染都要查表，不能每次读资源 */
    @Volatile private var builtInByYear: Map<Int, Map<Long, Holiday>>? = null

    /** 联网下载的数据按年缓存；[saveDownloaded] 写入后清掉对应年份 */
    private val downloaded = ConcurrentHashMap<Int, Map<Long, Holiday>>()

    /**
     * 解析 holiday-cn 格式的 JSON，只读 `days[]`。
     * 数据坏了（JSON 非法、日期解析失败）就跳过该条，不抛异常 —— 调用方拿到空表即可回退。
     */
    fun parse(json: String): Map<Long, Holiday> {
        val out = HashMap<Long, Holiday>()
        val days = runCatching { JSONObject(json).optJSONArray("days") }.getOrNull() ?: return out
        for (i in 0 until days.length()) {
            val o = days.optJSONObject(i) ?: continue
            val date = o.optString("date")
            if (date.isEmpty()) continue
            val epochDay = runCatching { LocalDate.parse(date).toEpochDay() }.getOrNull() ?: continue
            // days[] 里出现的都是特殊日子，缺 isOffDay 时按「休息」处理更接近直觉
            out[epochDay] = Holiday(epochDay, o.optString("name", ""), !o.optBoolean("isOffDay", true))
        }
        return out
    }

    /** 当月命中的节假日；[startEpoch]/[endEpoch] 含端点 */
    fun inRange(context: Context, startEpoch: Long, endEpoch: Long): Map<Long, Holiday> {
        val out = HashMap<Long, Holiday>()
        val firstYear = LocalDate.ofEpochDay(startEpoch).year
        val lastYear = LocalDate.ofEpochDay(endEpoch).year
        // 跨年要多查一年：holiday-cn 按「通知标题年份」归档，12 月的日期可能落在下一年的文件里
        for (year in firstYear..lastYear) {
            forYear(context, year).forEach { (epochDay, holiday) ->
                if (epochDay in startEpoch..endEpoch) out[epochDay] = holiday
            }
        }
        return out
    }

    /** 保存联网下载的原始 JSON；解析不出内容则视为无效、不落盘。[return] 是否写入成功 */
    fun saveDownloaded(context: Context, year: Int, json: String): Boolean {
        if (parse(json).isEmpty()) return false
        return runCatching {
            File(context.filesDir, "$CACHE_PREFIX$year.json").writeText(json)
            downloaded.remove(year)
            true
        }.getOrDefault(false)
    }

    private fun forYear(context: Context, year: Int): Map<Long, Holiday> {
        downloaded[year]?.let { return it }
        readCache(context, year)?.let {
            downloaded[year] = it
            return it
        }
        return builtIn(context)[year] ?: emptyMap()
    }

    private fun readCache(context: Context, year: Int): Map<Long, Holiday>? {
        val file = File(context.filesDir, "$CACHE_PREFIX$year.json")
        if (!file.exists()) return null
        return runCatching { parse(file.readText()) }.getOrNull()?.takeIf { it.isNotEmpty() }
    }

    private fun builtIn(context: Context): Map<Int, Map<Long, Holiday>> =
        builtInByYear ?: synchronized(this) {
            builtInByYear ?: loadBuiltIn(context).also { builtInByYear = it }
        }

    private fun loadBuiltIn(context: Context): Map<Int, Map<Long, Holiday>> {
        val json = runCatching {
            context.resources.openRawResource(R.raw.holidays).bufferedReader().use { it.readText() }
        }.getOrNull() ?: return emptyMap()
        val byYear = HashMap<Int, MutableMap<Long, Holiday>>()
        parse(json).forEach { (epochDay, holiday) ->
            byYear.getOrPut(LocalDate.ofEpochDay(epochDay).year) { HashMap() }[epochDay] = holiday
        }
        return byYear
    }
}
