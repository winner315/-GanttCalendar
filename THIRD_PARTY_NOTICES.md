# 第三方数据与许可

## 中国法定节假日数据（内置 + 联网更新）

- 来源：[NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn)
- 数据出处：国务院办公厅每年发布的《关于部分节假日安排的通知》（该仓库的 `papers` 字段附有 gov.cn 原文链接）
- 随 APK 内置的 `app/src/main/res/raw/holidays.json` 取自该仓库的 `2025.json` 与 `2026.json`，只保留 `name` / `date` / `isOffDay` 三个字段
- 联网更新从 `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json` 拉取当年与次年的数据
- 维护：每年 11 月国务院办公厅发布下一年安排后，重新拉取并更新内置文件

### 许可证（MIT）

```
MIT License

Copyright (c) 2019 NateScarlet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
