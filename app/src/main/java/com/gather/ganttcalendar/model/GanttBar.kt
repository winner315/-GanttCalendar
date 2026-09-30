package com.gather.ganttcalendar.model

import com.gather.ganttcalendar.data.Schedule

data class GanttBar(
    val schedule: Schedule,
    val startDay: Int,
    val endDay: Int,
    val lane: Int
)
