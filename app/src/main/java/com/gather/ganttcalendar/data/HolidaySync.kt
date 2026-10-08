package com.gather.ganttcalendar.data

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.gather.ganttcalendar.widget.WidgetUpdater
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.util.concurrent.Executors

/**
 * 节假日数据的联网更新：拉 holiday-cn 的按年 JSON 存到 filesDir，下次渲染优先用它。
 *
 * 只在 App 回到前台时按 24h 节流触发，**渲染路径绝不联网** —— 组件的 onUpdate 是主线程
 * BroadcastReceiver，做网络会 ANR。任何失败（断网、证书、解析不出内容）都静默回退内置数据。
 */
object HolidaySync {
    private const val TAG = "HolidaySync"
    private const val PREFS = "holiday_prefs"
    private const val KEY_LAST_SYNC = "lastSync"
    private const val INTERVAL_MS = 24 * 60 * 60 * 1000L
    private const val TIMEOUT_MS = 15_000
    private const val BASE_URL = "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/"

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    fun refreshIfStale(context: Context) {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(KEY_LAST_SYNC, 0L) < INTERVAL_MS) return
        // 先落时间戳：这次失败也要等到下个周期再试，不能每次回前台都去请求
        prefs.edit().putLong(KEY_LAST_SYNC, now).apply()

        io.execute {
            val year = LocalDate.now().year
            var changed = false
            // 下一年的安排通常 11 月才发布，顺带探测；拉不到空数据就当没有
            for (y in year..year + 1) {
                if (fetch(app, y)) changed = true
            }
            if (changed) main.post { WidgetUpdater.refreshAll(app) }
        }
    }

    /** [return] 是否拿到了有效数据并落盘 */
    private fun fetch(context: Context, year: Int): Boolean = try {
        val conn = URL("$BASE_URL$year.json").openConnection() as HttpURLConnection
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        try {
            if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                HolidayData.saveDownloaded(context, year, conn.inputStream.bufferedReader().use { it.readText() })
            } else {
                false
            }
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "拉取 $year 年节假日数据失败，继续用内置数据：${e.message}")
        false
    }
}
