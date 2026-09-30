package com.gather.ganttcalendar.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.gather.ganttcalendar.R
import com.gather.ganttcalendar.data.Schedule
import java.time.LocalDate

class ScheduleAdapter(
    private var items: List<Schedule>,
    private val onClick: (Schedule) -> Unit
) : RecyclerView.Adapter<ScheduleAdapter.VH>() {

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val dot: View = v.findViewById(R.id.colorDot)
        val title: TextView = v.findViewById(R.id.tvTitle)
        val range: TextView = v.findViewById(R.id.tvRange)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_schedule, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val s = items[position]
        holder.title.text = s.title
        val fmt = { d: Long -> LocalDate.ofEpochDay(d).let { "${it.monthValue}月${it.dayOfMonth}日" } }
        holder.range.text = "${fmt(s.startDate)} - ${fmt(s.endDate)}"
        holder.dot.setBackgroundColor(
            ContextCompat.getColor(holder.itemView.context, COLOR_RES[s.color.coerceIn(0, COLOR_RES.size - 1)])
        )
        holder.itemView.setOnClickListener { onClick(s) }
    }

    fun submit(list: List<Schedule>) { items = list; notifyDataSetChanged() }

    companion object {
        val COLOR_RES = intArrayOf(
            R.color.c0, R.color.c1, R.color.c2, R.color.c3,
            R.color.c4, R.color.c5, R.color.c6, R.color.c7
        )
    }
}
