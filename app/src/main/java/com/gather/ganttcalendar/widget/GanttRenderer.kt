package com.gather.ganttcalendar.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import com.gather.ganttcalendar.R
import com.gather.ganttcalendar.data.DayBadge
import com.gather.ganttcalendar.data.HolidayData
import com.gather.ganttcalendar.data.ScheduleRepository
import com.gather.ganttcalendar.model.GanttBar
import com.gather.ganttcalendar.model.GanttLayoutCalculator
import com.gather.ganttcalendar.ui.ScheduleAdapter
import com.gather.ganttcalendar.ui.ScheduleEditActivity
import com.gather.ganttcalendar.util.DateUtils

/**
 * 日历式甘特渲染：底层 7 列日期格子，上层按泳道整条绘制色带。
 * 色带以「天」为单位用 weight 定位，所以能跨格延伸、事件名也能完整写出（不会被截在单格里）。
 * 日程不超过 [NAME_IN_BAR_MAX] 条时名字写在色带上，超过则色带不写字、改用上方图例。
 * 超出 [MAX_LANES] 的泳道本月不显示。
 */
object GanttRenderer {
    private const val MAX_LANES = 3
    private const val DAYS_PER_WEEK = 7

    /** 条数不超过这个值就把名字写在色带上，超过则色带上不写字、改用图例 */
    private const val NAME_IN_BAR_MAX = 3
    private const val LEGEND_PER_ROW = 3
    private const val LEGEND_MAX = 6

    /** 色带段按宽度分 layout：段宽只能是 layout_weight，而 weight 改不了，故 1~7 天各一份 */
    private val SEG_LAYOUTS = intArrayOf(
        R.layout.widget_seg_d1, R.layout.widget_seg_d2, R.layout.widget_seg_d3, R.layout.widget_seg_d4,
        R.layout.widget_seg_d5, R.layout.widget_seg_d6, R.layout.widget_seg_d7
    )

    private const val DARK_TEXT = 0xFF333333.toInt()

    /** 一条日程被周界裁出的一段：day 用当月天号（1 起） */
    private data class Seg(val week: Int, val startDay: Int, val endDay: Int, val bar: GanttBar) {
        val len: Int get() = endDay - startDay + 1
    }

    fun render(context: Context, year: Int, month: Int): RemoteViews {
        val days = DateUtils.daysInMonth(year, month)
        val offset = DateUtils.firstDayOffset(year, month)
        val monthStart = DateUtils.monthStartEpoch(year, month)
        val today = DateUtils.todayEpochDay()

        val monthEnd = DateUtils.monthEndEpoch(year, month)
        // 当月的「休/班」标注查一次：法定节假日、调休补班日，以及数据覆盖年份里的普通周末。
        // 渲染路径不联网（联网更新在 HolidaySync，落在 filesDir 里）
        val badges = HolidayData.badgesInRange(context, monthStart, monthEnd)

        val repo = ScheduleRepository(context)
        val schedules = repo.getInRange(monthStart, monthEnd)
        val bars = GanttLayoutCalculator.calculate(schedules, year, month)
        val visible = bars.filter { it.lane < MAX_LANES }
        // 同一泳道在所有周里必须等高，色带才连得起来，故用本月最大泳道数在每周里均分
        val laneCount = GanttLayoutCalculator.laneCount(visible).coerceIn(1, MAX_LANES)
        val nameInBar = visible.size <= NAME_IN_BAR_MAX

        val weeks = (offset + days + DAYS_PER_WEEK - 1) / DAYS_PER_WEEK
        // 先把每条日程被周界裁出的所有段切出来，跨周的条会得到多段
        val segs = ArrayList<Seg>()
        for (week in 0 until weeks) {
            val weekFirstDay = week * DAYS_PER_WEEK + 1 - offset
            val weekLastDay = weekFirstDay + DAYS_PER_WEEK - 1
            visible.forEach { b ->
                // 裁到本月与本周的交集：跨月、跨周的条都只保留落在这一周里的那段
                val s = maxOf(b.startDay, weekFirstDay, 1)
                val e = minOf(b.endDay, weekLastDay, days)
                if (s <= e) segs.add(Seg(week, s, e, b))
            }
        }
        // 名字落在格子最多的那段上；并列时 maxByOrNull 取第一段——
        // 比随机更稳，每次刷新名字不会跳位置
        val nameSeg = HashMap<Long, Seg>()
        segs.groupBy { it.bar.schedule.id }.forEach { (id, group) ->
            group.maxByOrNull { it.len }?.let { nameSeg[id] = it }
        }

        val root = RemoteViews(context.packageName, R.layout.widget_calendar)
        // launcher 在 layout 相同时会 reapply 复用已有视图，addView 动作会被重放；
        // 先清空才能保证每次刷新都是幂等的（否则日历行会成倍重复）
        root.removeAllViews(R.id.rowsContainer)
        root.removeAllViews(R.id.legendContainer)
        root.setTextViewText(R.id.tvMonth, DateUtils.monthTitle(year, month))

        if (!nameInBar) renderLegend(context, root, visible)

        for (week in 0 until weeks) {
            // 本周对应的天号区间；首周可能从 0 或负数起、末周可能超过当月天数，都靠空白块占位
            val weekFirstDay = week * DAYS_PER_WEEK + 1 - offset
            val weekLastDay = weekFirstDay + DAYS_PER_WEEK - 1

            val row = RemoteViews(context.packageName, R.layout.widget_row)
            row.removeAllViews(R.id.weekCells)
            row.removeAllViews(R.id.weekBars)

            for (col in 0 until DAYS_PER_WEEK) {
                val day = weekFirstDay + col
                val cell = RemoteViews(context.packageName, R.layout.widget_cell)
                if (day in 1..days) bindDay(context, cell, day, monthStart, today, badges[monthStart + day - 1])
                row.addView(R.id.weekCells, cell)
            }
            for (lane in 0 until laneCount) {
                val laneSegs = segs.filter { it.week == week && it.bar.lane == lane }.sortedBy { it.startDay }
                row.addView(
                    R.id.weekBars,
                    buildLane(context, laneSegs, weekFirstDay, weekLastDay, nameInBar, nameSeg)
                )
            }
            root.addView(R.id.rowsContainer, row)
        }
        return root
    }

    /** 一条泳道的一周：按天号从左到右摆「空白块 / 色带段」，weight 合计恒为 7 天 */
    private fun buildLane(
        context: Context,
        laneSegs: List<Seg>,
        weekFirstDay: Int,
        weekLastDay: Int,
        nameInBar: Boolean,
        nameSeg: Map<Long, Seg>
    ): RemoteViews {
        val laneRow = RemoteViews(context.packageName, R.layout.widget_lane_row)
        var cursor = weekFirstDay
        for (seg in laneSegs) {
            repeat(seg.startDay - cursor) { laneRow.addView(R.id.laneRow, blank(context)) }
            val color = colorOf(context, seg.bar)
            val segView = RemoteViews(context.packageName, SEG_LAYOUTS[seg.len - 1])
            segView.setInt(R.id.seg, "setBackgroundColor", color)
            segView.setTextViewText(
                R.id.tvSeg,
                if (nameInBar && nameSeg[seg.bar.schedule.id] == seg) seg.bar.schedule.title else ""
            )
            segView.setTextColor(R.id.tvSeg, if (isLight(color)) DARK_TEXT else Color.WHITE)
            segView.setOnClickPendingIntent(
                R.id.seg,
                PendingIntent.getActivity(
                    context, seg.bar.schedule.id.toInt(),
                    Intent(context, ScheduleEditActivity::class.java).putExtra("id", seg.bar.schedule.id),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            laneRow.addView(R.id.laneRow, segView)
            cursor = seg.endDay + 1
        }
        repeat(weekLastDay - cursor + 1) { laneRow.addView(R.id.laneRow, blank(context)) }
        return laneRow
    }

    private fun blank(context: Context) = RemoteViews(context.packageName, R.layout.widget_bar_blank)

    /** 图例：每行 [LEGEND_PER_ROW] 项，最多 [LEGEND_MAX] 项 —— 只列本月真正画出来的日程 */
    private fun renderLegend(context: Context, root: RemoteViews, bars: List<GanttBar>) {
        val items = bars.take(LEGEND_MAX)
        var i = 0
        while (i < items.size) {
            val row = RemoteViews(context.packageName, R.layout.widget_legend_row)
            row.removeAllViews(R.id.legendRow)
            for (j in i until minOf(i + LEGEND_PER_ROW, items.size)) {
                val item = RemoteViews(context.packageName, R.layout.widget_legend_item)
                item.setInt(R.id.legendDot, "setBackgroundColor", colorOf(context, items[j]))
                item.setTextViewText(R.id.legendText, items[j].schedule.title)
                row.addView(R.id.legendRow, item)
            }
            root.addView(R.id.legendContainer, row)
            i += LEGEND_PER_ROW
        }
    }

    private fun bindDay(
        context: Context,
        cell: RemoteViews,
        day: Int,
        monthStart: Long,
        today: Long,
        badge: DayBadge?
    ) {
        val isToday = monthStart + (day - 1) == today
        cell.setTextViewText(R.id.tvDay, day.toString())
        cell.setTextColor(
            R.id.tvDay,
            ContextCompat.getColor(context, if (isToday) R.color.todayText else R.color.dayText)
        )
        // 边框和高亮都画在格子背景上；日号自身保持透明，否则会在边框里再多一个白块
        cell.setInt(
            R.id.cell, "setBackgroundResource",
            if (isToday) R.drawable.cell_border_today else R.drawable.cell_border
        )
        cell.setInt(R.id.tvDay, "setBackgroundColor", Color.TRANSPARENT)

        // 「休 / 班」角标：法定节假日、调休补班日，以及数据覆盖年份里的普通周末。
        // 普通工作日与数据没覆盖到的年份不画，宁可空着也不猜
        if (badge == null) {
            cell.setViewVisibility(R.id.tvBadge, View.GONE)
        } else {
            val isWorkday = badge == DayBadge.WORKDAY
            cell.setTextViewText(R.id.tvBadge, if (isWorkday) "班" else "休")
            cell.setTextColor(
                R.id.tvBadge,
                ContextCompat.getColor(
                    context,
                    when (badge) {
                        DayBadge.HOLIDAY -> R.color.holidayBadgeText
                        DayBadge.WEEKEND -> R.color.weekendBadgeText
                        DayBadge.WORKDAY -> R.color.workdayBadgeText
                    }
                )
            )
            cell.setViewVisibility(R.id.tvBadge, View.VISIBLE)
        }
    }

    private fun colorOf(context: Context, bar: GanttBar): Int = ContextCompat.getColor(
        context,
        ScheduleAdapter.COLOR_RES[bar.schedule.color.coerceIn(0, ScheduleAdapter.COLOR_RES.size - 1)]
    )

    /** 调色板里有浅色块（如黄），白字在上面看不清，按亮度改用深色字 */
    private fun isLight(color: Int): Boolean = ColorUtils.calculateLuminance(color) > 0.6
}
