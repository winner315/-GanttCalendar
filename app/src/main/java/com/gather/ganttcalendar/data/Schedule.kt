package com.gather.ganttcalendar.data

data class Schedule(
    val id: Long = 0,
    val title: String,
    val startDate: Long,
    val endDate: Long,
    val color: Int
)
