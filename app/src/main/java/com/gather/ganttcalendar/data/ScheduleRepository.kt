package com.gather.ganttcalendar.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor

class ScheduleRepository(context: Context) {
    private val helper = ScheduleDbHelper(context)

    fun getAll(): List<Schedule> =
        helper.readableDatabase
            .query("schedule", null, null, null, null, null, "startDate ASC")
            .use { c -> c.toList() }

    fun getInRange(monthStart: Long, monthEnd: Long): List<Schedule> =
        helper.readableDatabase
            .query(
                "schedule", null,
                "startDate <= ? AND endDate >= ?",
                arrayOf(monthEnd.toString(), monthStart.toString()),
                null, null, "startDate ASC"
            )
            .use { c -> c.toList() }

    fun getById(id: Long): Schedule? =
        helper.readableDatabase
            .query("schedule", null, "id = ?", arrayOf(id.toString()), null, null, null)
            .use { c -> if (c.moveToFirst()) c.toSchedule() else null }

    fun insert(s: Schedule): Long =
        helper.writableDatabase.insert("schedule", null, s.toValues())

    fun update(s: Schedule) {
        helper.writableDatabase.update(
            "schedule", s.toValues(), "id = ?", arrayOf(s.id.toString())
        )
    }

    fun delete(id: Long) {
        helper.writableDatabase.delete("schedule", "id = ?", arrayOf(id.toString()))
    }

    private fun Cursor.toList(): List<Schedule> {
        val list = ArrayList<Schedule>()
        while (moveToNext()) list.add(toSchedule())
        return list
    }

    private fun Schedule.toValues(): ContentValues = ContentValues().apply {
        put("title", title)
        put("startDate", startDate)
        put("endDate", endDate)
        put("color", color)
    }

    private fun Cursor.toSchedule(): Schedule = Schedule(
        id = getLong(getColumnIndexOrThrow("id")),
        title = getString(getColumnIndexOrThrow("title")),
        startDate = getLong(getColumnIndexOrThrow("startDate")),
        endDate = getLong(getColumnIndexOrThrow("endDate")),
        color = getInt(getColumnIndexOrThrow("color"))
    )
}
