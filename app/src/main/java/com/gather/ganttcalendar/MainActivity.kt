package com.gather.ganttcalendar

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.gather.ganttcalendar.data.HolidaySync
import com.gather.ganttcalendar.data.ScheduleRepository
import com.gather.ganttcalendar.ui.ScheduleAdapter
import com.gather.ganttcalendar.ui.ScheduleEditActivity
import com.gather.ganttcalendar.widget.WidgetUpdater
import com.google.android.material.floatingactionbutton.FloatingActionButton

class MainActivity : AppCompatActivity() {
    private lateinit var adapter: ScheduleAdapter
    private val repo by lazy { ScheduleRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        adapter = ScheduleAdapter(emptyList()) { s ->
            startActivity(Intent(this, ScheduleEditActivity::class.java).putExtra("id", s.id))
        }
        findViewById<RecyclerView>(R.id.recycler).apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = this@MainActivity.adapter
        }
        findViewById<FloatingActionButton>(R.id.fabAdd).setOnClickListener {
            startActivity(Intent(this, ScheduleEditActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        val list = repo.getAll()
        adapter.submit(list)
        findViewById<TextView>(R.id.tvEmpty).visibility =
            if (list.isEmpty()) View.VISIBLE else View.GONE
        WidgetUpdater.refreshAll(this)
        // 节假日数据的联网更新（24h 节流、失败静默回退内置数据）；组件的渲染路径不联网
        HolidaySync.refreshIfStale(this)
    }
}
