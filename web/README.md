# 排期甘特图（Web 版）

把 `GanttCalendar`（Android 桌面小组件）改成的纯前端网页版：日历式甘特图直观显示排期，支持拖拽改期、月/周/年三视图、列表筛选、JSON 备份。

纯前端单页，**没有后端、不联网存数据** —— 日程只存在你自己浏览器的 IndexedDB 里。
唯一的外部请求是拉取法定节假日数据（可离线，失败自动回退内置数据）。

## 启动

**桌面快捷方式（推荐）**：`assets\make-shortcut.bat` 会在桌面创建「排期甘特图」——
双击即启服务并打开浏览器，服务窗口最小化在任务栏（关掉它即停止服务）。

**命令行**：

```bat
start.bat          :: 与快捷方式等价：起服务 + 等端口就绪 + 打开浏览器
:: 或手动
npm install
npm run dev        :: http://localhost:5174
```

> ⚠️ **不要**双击 `dist/index.html` 直接打开。
> 实测现代 Chrome 下 `file://` 打开会因为 CORS 拒载 `type="module"` 脚本与样式表
> （origin 为 `null`），页面白屏 —— 与 IndexedDB 无关，`file://` 下 IndexedDB 反而是可用的。
> 静态产物要走本地服务器：
>
> ```bat
> npm run build
> npm run preview    :: http://localhost:4173
> ```

## 功能

| 功能 | 说明 |
|---|---|
| 月 / 周 / 年三视图 | 顶栏单选切换；周视图周一起始，年视图点缩略月跳回该月 |
| 新建 / 编辑 / 删除 | 顶栏「新建日程」或点色带、点列表行；标题 + 起止日期 + 8 色 |
| 拖拽改期 | 拖色带中间整体平移，拖右边缘改工期；松手即落库 |
| 搜索 / 筛选 | 标题关键词、颜色多选、时间范围（与日程区间**有交集**即命中） |
| 列表页 | 表格展示标题/起止/天数/颜色，列头排序，与甘特视图共用筛选条件 |
| 休 · 班 角标 | 休息日（法定节假日与周末**同色**）标「休」，调休补班标「班」；休息日格子另铺一层淡底 |
| JSON 备份 | 导出下载 `.json`；导入时先校验再选「合并」或「覆盖」（覆盖不可撤销，二次确认） |

## 数据存放与清理

- 日程：浏览器 **IndexedDB** 的 `gantt-calendar/schedules`（`id / title / startDay / endDay / color`）
- 偏好（当前视图、年月、筛选条件）：`localStorage` 的 `gantt-prefs`
- 节假日缓存与同步时间戳：IndexedDB 的 `gantt-calendar/meta`

清理：浏览器开发者工具 → Application → Storage → Clear site data；或换台机器时先「导出 JSON」再导入。

> `file://` 下 origin 是 `null`，与 `http://localhost:5174` 是**两个独立存储**，
> 这也是必须走本地服务的原因之一 —— 换端口/换协议都会看到「数据不见了」，实际是换了库。
换浏览器 / 换设备 / 用隐私模式打开都是各自独立的数据，不会同步。

> 浏览器禁用了本地存储（隐私模式、站点数据被禁）时页面照常能用，但顶栏会提示「数据刷新后会丢失」。

## 关键设计

**日期一律用「天数序号」（dayNumber）**：`1970-01-01 = 0`，用 `Date.UTC` 计算。
与 Android 版的 `LocalDate.toEpochDay()` 完全同构，导出的 JSON 两端可互导；
用 UTC 而非本地时间构造是为了避开时区/夏令时导致的偏一天。

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
  components/      MonthGrid / WeekGrid / YearGrid / ScheduleDialog / BadgeLegend / BackupBar
  store/           schedule.js（日程 CRUD，落 IndexedDB）、prefs.js（视图与筛选偏好）
  utils/           date / gantt / holiday / palette / idb / schedule / filter / backup（纯逻辑，均有单测）
  api/             holidaySync.js（holiday-cn 拉取 + 24h 节流）
  data/            holidays.json（内置节假日，2025–2026）
e2e/               verify.mjs（Playwright 端到端验收，94 项）
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
npm run test                      :: vitest，纯逻辑单测
node e2e/verify.mjs               :: Playwright 端到端（需先起 dev server）
set E2E_BASE=http://localhost:5174  :: 换端口时指定
```

单测覆盖日期换算、泳道布局、节假日判定、数据校验、筛选、备份解析、存储层与联网同步；
端到端脚本在真实浏览器里验证渲染位置、拖拽改期、三视图、筛选排序、备份导入导出与刷新后留存。

## 与 Android 版的关系

`app/` 下的 Android 工程保持原样、未被改动。两版共用同一套数据语义（epochDay 天数序号、8 色索引、节假日口径），
可用「导出 JSON」在两端之间搬数据。
