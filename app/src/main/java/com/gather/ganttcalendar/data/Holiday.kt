package com.gather.ganttcalendar.data

/**
 * 某一天的节假日信息。[epochDay] 与 [Schedule] 用同一套日期表示（LocalDate.toEpochDay）。
 * [isWorkday] 为 true 表示调休补班（本该休息的周末要上班），false 表示法定休息日。
 */
data class Holiday(val epochDay: Long, val name: String, val isWorkday: Boolean)
