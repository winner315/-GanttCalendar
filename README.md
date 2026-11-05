# GanttCalendar · 排期甘特图（Web 版）

用日历式甘特图直观显示排期的网页工具：**Vue 3 + Vite 前端 + FastAPI 后端 + 本机 MySQL 8.0**。
支持拖拽改期、月/周/年三视图、列表筛选、休·班角标、JSON 备份导入导出。

> 本仓库只保留 Web 版。早期同名的 Android 桌面小组件版（`app/`）已移除。

## 启动

```bat
cd web
copy .env.example .env     :: 填自己的 MySQL 连接信息（首次还要 .venv\Scripts\python.exe -m server.migrate 建表）
start.bat                  :: 自动装依赖，起前端 5174 + 后端 8010，然后打开浏览器
```

功能：月/周/年三视图、新建/编辑/删除、**拖拽改期**（拖中间平移、拖右边缘改工期）、
标题/颜色/时间范围筛选、列表页排序、休·班角标、JSON 备份导入导出。

数据存在**本机 MySQL** 里，前后端都只听 `127.0.0.1`、不对外、无鉴权、不联网存档。
后端没起或连不上库时会显示红色告警并**不显示任何数据**（不退回浏览器本地存储）。
详见 [`web/README.md`](web/README.md)。

## 目录

```
web/
  src/    前端（Vue 3 + Vite）：GanttView（三视图 + 拖拽）/ ListView / 组件 / store / utils
  server/ 后端（FastAPI + PyMySQL）：main / config / db / errors / migrate / schedule（mapper/repo/routes）
  sql/    建表 DDL（幂等）
  e2e/    Playwright 端到端验收（自带 _e2e 库 + 独占端口 5184）
  assets/ 桌面快捷方式相关：图标、生成脚本
  tests/  后端单测（server/tests）+ 前端单测（src/**/*.test.js）
```

数据语义：日期用「天数序号」（`1970-01-01 = 0`，`Date.UTC`），8 色索引，节假日口径
（数据优先，普通周末只在数据覆盖到的年份才标「休」，没数据留空不猜）。详见 [`web/README.md`](web/README.md)。

## 节假日数据

内置 2025–2026 年法定节假日与调休数据，并会按 24 小时节流联网更新当年与次年数据；
拉取失败静默回退内置数据（断网照常显示角标）。数据来源
[NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn)（MIT），
出处为国务院办公厅每年的节假日安排通知，许可与维护说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。