# GanttCalendar · 排期甘特图

用日历式甘特图直观显示排期的工具。一个仓库两种形态：

| | Android 版（`app/`） | Web 版（`web/`） |
|---|---|---|
| 形态 | 桌面小组件 + App | 纯前端单页 |
| 启动 | 安装 APK，桌面添加小部件 | `web/start.bat` 或 `npm run dev` |
| 数据 | SQLite（`gantt.db`，表 `schedule`） | 浏览器 IndexedDB |
| 视图 | 月视图 | 月 / 周 / 年 + 列表页 |
| 拖拽改期 | 无 | 有 |
| 备份 | 无 | 导出 / 导入 JSON |
| 状态 | 可用，保持原样 | 新实现，功能超集 |

两版**共用同一套数据语义**（天数序号、8 色索引、节假日口径），导出的 JSON 可互相搬运。

## Web 版（推荐）

```bat
cd web
start.bat          :: 首次会自动 npm install，然后起在 http://localhost:5174
```

功能：月/周/年三视图、新建/编辑/删除、**拖拽改期**（拖中间平移、拖右边缘改工期）、
标题/颜色/时间范围筛选、列表页排序、休·班角标、JSON 备份导入导出。

数据只存在你自己浏览器里，没有后端、不上传。详见 [`web/README.md`](web/README.md)。

## Android 版

App 内用列表增删改日程，桌面小组件按月渲染日历式泳道色带。

> 小部件受 `RemoteViews` 白名单限制，有三处妥协：最多 3 条泳道、色带宽度只能靠 weight 分配、
> 日程数少时名字才写在色带上（多了改用图例）。Web 版没有这些限制。

```bat
gradlew assembleDebug     :: 产出 app/build/outputs/apk/debug/app-debug.apk
gradlew test              :: 单元测试（日期换算 / 泳道布局 / 节假日判定）
```

小组件依赖后台刷新，小米/红米需手动授权，见 [`docs/小米适配说明.md`](docs/小米适配说明.md)。

## 节假日数据

两版都内置 2025–2026 年的法定节假日与调休数据，并会按 24 小时节流联网更新当年与次年数据；
拉取失败静默回退内置数据（Android 端不联网也能正常渲染，Web 端断网照常显示角标）。

数据来源 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn)（MIT），
出处为国务院办公厅每年的节假日安排通知，许可与维护说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

**标注口径**：节假日数据优先，普通周末只在数据覆盖到的年份才标「休」——
没数据的年份**留空不猜**，不凭规律推断。

## 目录

```
app/      Android 工程（Kotlin，minSdk 26）
web/      Web 工程（Vue 3 + Vite，无后端）
docs/     小米适配说明等
tasks/    开发踩坑记录
```

## 更多

- Web 版功能、设计口径与测试方式：[`web/README.md`](web/README.md)
- 踩坑与容易想当然的口径：[`tasks/lessons.md`](tasks/lessons.md)
