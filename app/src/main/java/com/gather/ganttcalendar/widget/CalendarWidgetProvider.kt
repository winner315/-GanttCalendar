package com.gather.ganttcalendar.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.gather.ganttcalendar.R
import com.gather.ganttcalendar.util.DateUtils

class CalendarWidgetProvider : AppWidgetProvider() {
    companion object {
        const val ACTION_PREV = "com.gather.ganttcalendar.PREV_MONTH"
        const val ACTION_NEXT = "com.gather.ganttcalendar.NEXT_MONTH"
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { mgr.updateAppWidget(it, buildViews(context)) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_PREV || intent.action == ACTION_NEXT) {
            val (y, m) = WidgetPrefs.getYearMonth(context)
            val delta = if (intent.action == ACTION_NEXT) 1 else -1
            val (ny, nm) = DateUtils.shiftMonth(y, m, delta)
            WidgetPrefs.setYearMonth(context, ny, nm)
            val mgr = AppWidgetManager.getInstance(context)
            mgr.getAppWidgetIds(ComponentName(context, CalendarWidgetProvider::class.java))
                .forEach { mgr.updateAppWidget(it, buildViews(context)) }
        }
    }

    private fun buildViews(context: Context): RemoteViews {
        val (year, month) = WidgetPrefs.getYearMonth(context)
        val rv = GanttRenderer.render(context, year, month)
        rv.setOnClickPendingIntent(R.id.btnPrev, broadcast(context, ACTION_PREV))
        rv.setOnClickPendingIntent(R.id.btnNext, broadcast(context, ACTION_NEXT))
        return rv
    }

    private fun broadcast(context: Context, action: String): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(
            context, action.hashCode(),
            Intent(context, CalendarWidgetProvider::class.java).setAction(action), flags
        )
    }
}
