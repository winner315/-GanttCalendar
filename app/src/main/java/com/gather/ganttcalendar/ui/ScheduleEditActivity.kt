package com.gather.ganttcalendar.ui

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.DatePicker
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.gather.ganttcalendar.R
import com.gather.ganttcalendar.data.Schedule
import com.gather.ganttcalendar.data.ScheduleRepository
import java.time.LocalDate

class ScheduleEditActivity : AppCompatActivity() {
    private val repo by lazy { ScheduleRepository(this) }
    private var editId: Long = 0
    private var selectedColor = 0
    private lateinit var colorViews: List<View>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_schedule_edit)
        editId = intent.getLongExtra("id", 0)

        val etTitle = findViewById<EditText>(R.id.etTitle)
        val dpStart = findViewById<DatePicker>(R.id.dpStart)
        val dpEnd = findViewById<DatePicker>(R.id.dpEnd)
        val colorRow = findViewById<LinearLayout>(R.id.colorRow)
        val btnDelete = findViewById<Button>(R.id.btnDelete)

        colorViews = ScheduleAdapter.COLOR_RES.map { res ->
            View(this).apply {
                layoutParams = LinearLayout.LayoutParams(0, 72).also {
                    it.weight = 1f; it.marginEnd = 8
                }
                setBackgroundColor(ContextCompat.getColor(this@ScheduleEditActivity, res))
                setOnClickListener {
                    selectedColor = ScheduleAdapter.COLOR_RES.indexOf(res)
                    updateColorSelection()
                }
                colorRow.addView(this)
            }
        }
        updateColorSelection()

        if (editId != 0L) {
            repo.getById(editId)?.let { s ->
                etTitle.setText(s.title)
                setDate(dpStart, s.startDate)
                setDate(dpEnd, s.endDate)
                selectedColor = s.color
                updateColorSelection()
                btnDelete.visibility = View.VISIBLE
            }
        }

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            val title = etTitle.text.toString().trim()
            if (title.isEmpty()) {
                Toast.makeText(this, "请输入标题", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val start = getDate(dpStart); val end = getDate(dpEnd)
            if (start > end) {
                Toast.makeText(this, "开始日期不能晚于结束日期", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (editId == 0L) repo.insert(Schedule(title = title, startDate = start, endDate = end, color = selectedColor))
            else repo.update(Schedule(editId, title, start, end, selectedColor))
            finish()
        }

        btnDelete.setOnClickListener {
            if (editId != 0L) repo.delete(editId)
            finish()
        }
    }

    private fun updateColorSelection() {
        colorViews.forEachIndexed { i, v ->
            v.alpha = if (i == selectedColor) 1f else 0.4f
            (v.layoutParams as LinearLayout.LayoutParams).height = if (i == selectedColor) 88 else 60
            v.requestLayout()
        }
    }

    private fun setDate(p: DatePicker, epochDay: Long) {
        val d = LocalDate.ofEpochDay(epochDay)
        p.updateDate(d.year, d.monthValue - 1, d.dayOfMonth)
    }

    private fun getDate(p: DatePicker): Long =
        LocalDate.of(p.year, p.month + 1, p.dayOfMonth).toEpochDay()
}
