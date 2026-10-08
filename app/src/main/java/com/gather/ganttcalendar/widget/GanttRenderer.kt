package com.gather.ganttcalendar.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.gather.ganttcalendar.R
import com.gather.ganttcalendar.data.Schedule
import com.gather.ganttcalendar.data.ScheduleRepository
import com.gather.ganttcalendar.model.GanttLayoutCalculator
import com.gather.ganttcalendar.ui.ScheduleAdapter
import com.gather.ganttcalendar.ui.ScheduleEditActivity
import com.gather.ganttcalendar.util.DateUtils

object GanttRenderer {
    private const val MAX_ROWS = 12

    fun render(context: Context, year: Int, month: Int): RemoteViews {
        val days = DateUtils.daysInMonth(year, month)
        val repo = ScheduleRepository(context)
        val schedules = repo.getInRange(
            DateUtils.monthStartEpoch(year, month),
            DateUtils.monthEndEpoch(year, month)
        )
        val bars = GanttLayoutCalculator.calculate(schedules, year, month)
        val rowCount = minOf(GanttLayoutCalculator.laneCount(bars), MAX_ROWS)

        val root = RemoteViews(context.packageName, R.layout.widget_calendar)
        // launcher 在 layout 相同时会 reapply 复用已有视图，addView 动作会被重放；
        // 先清空才能保证每次刷新都是幂等的（否则色条行会成倍重复）
        root.removeAllViews(R.id.rowsContainer)
        root.setTextViewText(R.id.tvMonth, DateUtils.monthTitle(year, month))

        for (lane in 0 until rowCount) {
            val row = RemoteViews(context.packageName, R.layout.widget_row)
            val laneBars = bars.filter { it.lane == lane }
            row.setTextViewText(R.id.tvRowTitle, laneBars.firstOrNull()?.schedule?.title ?: "")

            val barByDay = HashMap<Int, Schedule>()
            laneBars.forEach { b -> for (d in b.startDay..b.endDay) barByDay[d] = b.schedule }

            row.removeAllViews(R.id.cellsRow)
            for (day in 1..days) {
                val cell = RemoteViews(context.packageName, R.layout.widget_cell)
                val s = barByDay[day]
                val colorRes = if (s != null)
                    ScheduleAdapter.COLOR_RES[s.color.coerceIn(0, ScheduleAdapter.COLOR_RES.size - 1)]
                else R.color.cellEmpty
                cell.setInt(R.id.cell, "setBackgroundColor", ContextCompat.getColor(context, colorRes))
                if (s != null) {
                    val intent = Intent(context, ScheduleEditActivity::class.java).putExtra("id", s.id)
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    val pi = PendingIntent.getActivity(context, s.id.toInt(), intent, flags)
                    cell.setOnClickPendingIntent(R.id.cell, pi)
                }
                row.addView(R.id.cellsRow, cell)
            }
            root.addView(R.id.rowsContainer, row)
        }
        return root
    }
}
