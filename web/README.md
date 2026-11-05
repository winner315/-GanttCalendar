# 排期甘特图（Web 版）

把 `GanttCalendar`（Android 桌面小组件）改成的网页版：日历式甘特图直观显示排期，支持拖拽改期、月/周/年三视图、列表筛选、JSON 备份。

前端 Vue 3 + Vite，后端 Python（FastAPI）+ **本机 MySQL 8.0** —— 日程都落在 `schedule` 表里，
换浏览器 / 清缓存 / 换设备都不会丢。

## 启动

**双击 `start.bat`（推荐）**：会自动 `npm install`、建 `.venv` 装后端依赖，
然后在两个最小化窗口里各起一个服务，最后打开浏览器：

| | 地址 | 窗口标题 |
|---|---|---|
| 网页 | http://localhost:5174 | `GanttCalendar Web - dev server` |
| 后端 | http://127.0.0.1:8010/api/health | `GanttCalendar - api (8010)` |

关掉对应窗口即停止该服务。**后端的那个窗口是 MySQL 报错唯一能看到中文原因的地方**，出问题先看它。

### 第一次用：填 `.env`

复制 `web\.env.example` 为 `web\.env`，填自己的 MySQL 连接信息：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=你的账号
DB_PASSWORD=你的密码      # 留空即为空密码，不是"未配置"
DB_NAME=你的库名          # 库要先存在
DB_SSL=0
API_PORT=8010
```

`.env` 已被 gitignore，**密码不会进任何提交文件，也不会打印到日志**。
首次还要建表（幂等，重复跑没事）：

```bat
.venv\Scripts\python.exe -m server.migrate
```

> 桌面快捷方式（`assets\make-shortcut.bat`）生成的「排期甘特图」指向的就是 `start.bat`。

## 后端没起 / 连不上 MySQL 时

**明着报错，不降级**：顶栏一条红色「后端未连接」告警，带上 MySQL 的原始原因和一个「重试」按钮，
**日程一条都不显示**（甘特与列表同时为空）。绝不会静默退回浏览器本地存储 ——
那会让人以为"数据还在"，实际上两个存储已经分叉了。

`.env` 没填时后端进程会在启动时就打印中文指引并退出（这是有意的：早报错好过等第一个请求才报）。
`start.bat` 仍会把前端起起来，所以你会在页面上看到那条红色告警。

## 架构

```
浏览器 (5174，e2e 用 5184)
   │  fetch('/api/...')        ← src/api/schedules.js 是唯一出口
   ▼
Vite dev proxy /api ───────►  FastAPI @ 127.0.0.1:8010   (server/)
                                   │ PyMySQL，同步单连接
                                   ▼
                             MySQL 8.0 @ 3306 → 表 schedule
浏览器 IndexedDB 只剩 meta（节假日缓存）
```

一条贯穿的纪律：**API 边界用驼峰 `startDay/endDay`，DB 列用蛇形 `start_date/end_date`，
映射只存在于 `server/schedule/mapper.py` 一个文件里。**

### 接口

统一响应壳：成功 `{"ok": true, "data": …}`；失败 `{"ok": false, "error": "中文提示"}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 探活，返回库名与 MySQL 版本 |
| GET | `/api/schedules` | 全量列表 + 跳过计数 |
| POST | `/api/schedules` | 新建，返回带自增 id 的行 |
| PUT | `/api/schedules/{id}` | 改；不存在 → 404「日程不存在」 |
| DELETE | `/api/schedules/{id}` | 删；**删不存在不报错**，返回 `{deleted:false}` |
| PUT | `/api/schedules` | 批量替换（导入"覆盖"），整批走一个事务 |
| POST | `/api/schedules/bulk` | 批量追加（导入"合并"的差集） |

**批量替换必须走事务**：`DELETE FROM schedule` 与全部 `INSERT` 用同一条连接，
中途失败整体回滚。否则会出现"库已清空、新数据只写一半"且无法恢复 ——
这是全部接口里唯一能造成不可逆数据损失的。

## 功能

| 功能 | 说明 |
|---|---|
| 月 / 周 / 年三视图 | 顶栏单选切换；周视图周一起始，年视图点缩略月跳回该月 |
| 新建 / 编辑 / 删除 | 顶栏「新建日程」或点色带、点列表行；标题 + 起止日期 + 8 色 + 任务状态 |
| 日期合法性限定 | 创建/编辑时选日面板直接**禁掉非法日期**：结束日期早于开始日期的日子变灰选不了，反之开始日期晚于结束日期也不可选 |
| 任务状态 | 待办 / 进行中 / 已完成 / 已暂停；编辑框可选，列表页与甘特图中按状态筛（多选） |
| 已完成置灰 | 「已完成」日程在甘特色带（月/周/年三视图）整条置灰，列表状态列以灰色标签显示 |
| 备注 | 每条日程可填选填备注；鼠标放到甘特色条上悬浮显示标题与备注，备注超长以省略号截断展示 |
| 拖拽改期 | 拖色带中间整体平移，拖右边缘改工期；松手即写库，失败会弹回原位 |
| 搜索 / 筛选 | 标题关键词、颜色多选、状态多选、时间范围（与日程区间**有交集**即命中） |
| 列表页 | 表格展示标题/起止/天数/状态/颜色，列头排序，与甘特视图共用筛选条件 |
| 休 · 班 角标 | 休息日（法定节假日与周末**同色**）标「休」，调休补班标「班」；休息日格子另铺一层淡底 |
| JSON 备份 | 导出下载 `.json`；导入时先校验再选「合并」或「覆盖」（覆盖不可撤销，二次确认） |

## 数据存放与清理

- 日程：MySQL 表 `schedule`（`id / title / start_date / end_date / color / status / note`）
- 备注 `note`：选填 `VARCHAR(500)`，空串=无备注；甘特色带悬浮显示，超长省略号截断展示
- 任务状态 `status`：`todo` 待办 / `doing` 进行中 / `done` 已完成 / `paused` 已暂停
  —— 用 `VARCHAR(20)` 而非 `ENUM`，以后加取值不必 `ALTER TABLE`；取值范围由 `mapper.py` 校验，非法值归 `todo`
  —— 界面上已在编辑框提供四态选择，并支持按状态筛选；「已完成」在甘特色带整条置灰、列表状态列灰色标签
- 日期列存**天数序号**（`1970-01-01 = 0`）而非 `DATE`：结构上免疫时区，不会"偏一天"
- 偏好（当前视图、年月、筛选条件）：浏览器 `localStorage` 的 `gantt-prefs`
- 节假日缓存与同步时间戳：浏览器 IndexedDB 的 `gantt-calendar/meta`

清理：`DELETE FROM schedule;`（或 `TRUNCATE`，注意会重置自增）。
备份用顶栏「备份 → 导出 JSON」，换机器时导入回来即可。

> 偏好和节假日缓存仍在浏览器里：**换浏览器会丢筛选条件、但不会丢日程**。

## 关键设计

**日期一律用「天数序号」（dayNumber）**：`1970-01-01 = 0`，用 `Date.UTC` 计算。
与 Android 版的 `LocalDate.toEpochDay()` 完全同构，导出的 JSON 两端可互导；
用 UTC 而非本地时间构造是为了避开时区/夏令时导致的偏一天。

**主键必须是自增整数**：`store/schedule.js` 里有 `typeof id === 'number'` 守卫，
后端若返回字符串 id，改/删会**静默失效**（不报错）。所以 `mapper.py` 里有一道显式防线，
id 非正整数直接抛错，不制造静默故障。

**写操作是 server-first**：内存只是远端数据库的缓存，所以先落库、成功才改内存。
失败即抛且内存保持不变 —— 提前展示未确认的写入等于对用户撒谎。
唯一例外是 `load()`：它**绝不抛异常**（列表页是 fire-and-forget 调用），
失败时清空数据、置 `persistent=false`，交给告警组件显示。

**泳道布局算法**移植自 `GanttLayoutCalculator.kt`：按开始日排序，复用第一条「上一条结束日 < 本条开始日」的泳道，否则新开一条；相邻两天（5 号结束、6 号开始）共用一条泳道。
Web 版**取消了原小组件的 3 泳道上限**，所有泳道都画（容器纵向滚动），色带上始终显示标题。

**节假日口径**移植自 `HolidayData.kt`：数据来源优先，普通周末只在数据覆盖到的年份才标「休」，
没数据的年份**留空不猜**。数据来自 [holiday-cn](https://github.com/NateScarlet/holiday-cn)（MIT），
联网按 24h 节流更新，失败静默回退内置数据（见 `THIRD_PARTY_NOTICES.md`）。

**休息日不区分法定假与周末**，用同一种默认色 + 同一种格子淡底 ——
使用者关心的是「这天休不休」，红色那几天容易被误读成另有含义。
补班日仍单独用蓝色（语义相反，混色会误导）。

**年视图一天多条日程**：格子底部画一条分段细带，一天几条就分几段上色。
缩略格子太小画不出位置准确的色带，只表明「这天有安排」及其配色，看具体排期点进月视图。

## 目录

```
src/
  views/           GanttView（三视图 + 拖拽）、ListView（表格 + 筛选）
  components/      MonthGrid / WeekGrid / YearGrid / ScheduleDialog / BadgeLegend / BackupBar / BackendAlert
  api/             schedules.js（后端唯一出口）、holidaySync.js（holiday-cn 拉取 + 24h 节流）
  store/           schedule.js（日程，server-first）、prefs.js（视图与筛选偏好）、__fake-server.js（单测用内存后端）
  utils/           date / gantt / holiday / palette / idb / schedule / filter / backup（纯逻辑，均有单测）
  data/            holidays.json（内置节假日，2025–2026）
server/
  main.py          应用装配 + 生命周期
  config.py        读 .env + 必填校验
  db.py            PyMySQL 连接 / cursor / transaction / ping
  errors.py        统一异常 → {ok:false, error:"中文"}
  migrate.py       执行 sql/schema.sql
  schedule/        mapper.py（唯一映射层）/ repo.py（SQL）/ routes.py（7 个路由）
  tests/           test_mapper / test_config（无库）+ test_db / test_api（需 GC_TEST_DB）
sql/schema.sql     建表 DDL（幂等）
e2e/               run-all.mjs（一键全跑）/ verify.mjs（94 项）/ offline.mjs（断连验收）/ _db.mjs（库闸门）
assets/            桌面快捷方式相关：图标、生成脚本、快捷方式名
```

### 桌面快捷方式怎么做的

三个脚本，改完各自重跑一次即可（都已跑过，图标与快捷方式已在位）：

```bat
powershell -NoProfile -File assets\make-icon.ps1       :: 生成 assets\gantt.ico
powershell -NoProfile -File assets\make-shortcut.ps1   :: 在桌面创建快捷方式
```

两个绕不开的 Windows 坑，脚本里都按规避方式写好了：

- **PowerShell 5.1 按 ANSI 读 `.ps1` 和解码命令行参数** —— 脚本里写中文注释会直接把文件读坏，
  参数传中文名会变成乱码。所以脚本正文全用 ASCII 注释，
  快捷方式的中文名放在 UTF-8 文件 `assets\shortcut-name.txt` 里按指定编码读。
- **`.bat` 必须 CRLF 换行** —— 带 `goto` 标签的批处理用 LF 换行会被 cmd 当路径，
  直接报「找不到文件」。已加 `.gitattributes`（`*.bat text eol=crlf`）固定住，
  避免下次 checkout 又变回 LF。

快捷方式名默认为「排期甘特图」，想改就编辑 `assets\shortcut-name.txt` 再重跑 `make-shortcut.ps1`。

## 测试

```bat
:: 后端单测（纯逻辑，不需要数据库，永远能跑）
.venv\Scripts\python.exe -m pytest server\tests -q

:: 后端集成测试（需要测试库 gantt_calendar_e2e 已建好）
set GC_TEST_DB=gantt_calendar_e2e
.venv\Scripts\python.exe -m pytest server\tests -q

:: 前端单测
npm run test

:: 端到端（自带测试库 + 独占端口 5184，会自动起来再收拾干净）
npm run e2e
```

前端单测覆盖日期换算、泳道布局、节假日判定、数据校验、筛选、备份解析、API 模块与 store
（含「后端失败时写操作抛错且内存不变」「load 失败不抛」两组回归防线）。
端到端脚本在真实浏览器里验证渲染位置、拖拽改期、三视图、筛选排序、备份导入导出，
以及**刷新后数据仍在 MySQL**。

### e2e 会清空表 —— 有三层守卫

1. 专用库 `gantt_calendar_e2e`（配置写在 gitignore 的 `web\.env.e2e`）；
2. **硬闸门**：`e2e/_db.mjs` 在任何清库动作之前校验 `DB_NAME` 必须以 `_e2e` 结尾，
   否则打印拒绝横幅并 `exit(1)` —— 没有这条，一次误跑就会把真实排期全 `DELETE` 掉；
3. e2e 用独占端口 5184，不碰你可能正开着的 5174。

**不要**把 `DB_NAME` 指向真实库跑 e2e。

### 后端集成测试也会清空表 —— 同一道闸门

`server\tests\conftest.py` 的 `guard_test_db` 夹具在**任何清表动作之前**确认
连的是 `*_e2e` 库，不是就抛错（`test_api.py` 与 `test_db.py` 都依赖它）。
所以 `GC_TEST_DB` 指错库名时，结果是**一片 ERROR**，而不是把真实排期删掉。
`GC_TEST_DB` 优先于 `.env` 的 `DB_NAME` —— 否则 `.env` 会把测试库名盖回去。

## 局限

- **`file://` 双击 `dist/index.html` 永久不可用**：这是个前后端分离的应用，
  页面必须由服务器提供（Vite dev / preview），且该服务器要把 `/api` 代理到后端。
  换个没配 proxy 的静态服务器，页面能开但会一直显示红色告警。
- `npm run build` 后用 `npm run preview`（4173）也可以：`vite.config.js` 里
  **`preview` 单独也配了一份 `proxy`**（`preview` 不继承 `server.proxy`，这是 Vite 的已知行为）。
- 只监听 `127.0.0.1`、**无鉴权** —— 仅供本机自用，不要暴露到局域网。

## 与 Android 版的关系

`app/` 下的 Android 工程保持原样、未被改动。两版共用同一套数据语义（epochDay 天数序号、8 色索引、节假日口径），
可用「导出 JSON」在两端之间搬数据；表名也同为 `schedule`。
