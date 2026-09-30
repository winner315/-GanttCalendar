package com.gather.ganttcalendar.widget

import android.content.Context
import com.gather.ganttcalendar.util.DateUtils

object WidgetPrefs {
    private const val PREF = "widget_prefs"
    private const val KEY_YEAR = "year"
    private const val KEY_MONTH = "month"

    fun getYearMonth(context: Context): Pair<Int, Int> {
        val sp = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val (ty, tm) = DateUtils.todayYearMonth()
        return sp.getInt(KEY_YEAR, ty) to sp.getInt(KEY_MONTH, tm)
    }

    fun setYearMonth(context: Context, year: Int, month: Int) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putInt(KEY_YEAR, year).putInt(KEY_MONTH, month).apply()
    }
}
