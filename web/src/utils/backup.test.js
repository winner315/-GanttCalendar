import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, backupFileName, exportJson, parseBackup, summarize } from './backup.js'
import { toDayNumber } from './date.js'

const at = new Date('2026-10-23T09:35:00Z')
const sample = [
  { title: '国庆放假', startDay: toDayNumber(2026, 10, 1), endDay: toDayNumber(2026, 10, 7), color: 0 },
  { title: '版本迭代', startDay: toDayNumber(2026, 10, 5), endDay: toDayNumber(2026, 10, 10), color: 1 },
]

describe('exportJson', () => {
  it('导出结构含版本与导出时间', () => {
    const doc = JSON.parse(exportJson(sample, at))
    expect(doc.version).toBe(BACKUP_VERSION)
    expect(doc.exportedAt).toBe('2026-10-23T09:35:00.000Z')
    expect(doc.schedules).toHaveLength(2)
  })

  it('只导出四个字段，不带 id（避免导入到别的库里撞 id）', () => {
    const doc = JSON.parse(exportJson([{ ...sample[0], id: 7 }], at))
    expect(Object.keys(doc.schedules[0]).sort()).toEqual(['color', 'endDay', 'startDay', 'title'])
  })

  it('导出的内容能被自己解析回来（往返一致）', () => {
    const back = parseBackup(exportJson(sample, at))
    expect(back.ok).toBe(true)
    expect(back.skipped).toBe(0)
    expect(back.schedules).toHaveLength(2)
    expect(back.schedules[0]).toMatchObject({ title: '国庆放假', color: 0 })
    expect(back.schedules[1].startDay).toBe(sample[1].startDay)
  })
})

describe('backupFileName', () => {
  it('文件名带日期时间', () => {
    expect(backupFileName(new Date(2026, 9, 23, 9, 5))).toBe('gantt-backup-20261023-0905.json')
  })
})

describe('parseBackup · 拒绝的场景（都返回 ok:false 而不是抛异常）', () => {
  it('非 JSON 文本', () => {
    const r = parseBackup('这不是 json {')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('JSON')
  })

  it('JSON 但不是对象（数组 / 字符串 / null）', () => {
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('"x"').ok).toBe(false)
    expect(parseBackup('null').ok).toBe(false)
  })

  it('缺少 version 字段', () => {
    expect(parseBackup('{"schedules":[]}').error).toContain('version')
  })

  it('version 不是整数', () => {
    expect(parseBackup('{"version":"1","schedules":[]}').error).toContain('整数')
  })

  it('version 高于当前支持（旧客户端读新备份）', () => {
    const r = parseBackup(JSON.stringify({ version: BACKUP_VERSION + 1, schedules: [] }))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('高于')
  })

  it('缺少 schedules 数组', () => {
    expect(parseBackup('{"version":1}').error).toContain('schedules')
  })

  it('所有条目都不合法时明确失败，而不是静默导入 0 条', () => {
    const r = parseBackup(JSON.stringify({ version: 1, schedules: [{ title: '' }, { startDay: 1 }] }))
    expect(r.ok).toBe(false)
    expect(r.skipped).toBe(2)
    expect(r.error).toContain('2 条')
  })
})

describe('parseBackup · 部分坏数据', () => {
  it('4 条坏数据被跳过，其余正常导入', () => {
    const doc = {
      version: 1,
      schedules: [
        sample[0],
        { title: '', startDay: 1, endDay: 2, color: 0 }, // 标题空
        { title: '结束早于开始', startDay: 100, endDay: 50, color: 0 }, // endDay < startDay
        { title: '日期非整数', startDay: 1.5, endDay: 3, color: 0 }, // 非整数
        { title: '日期超范围', startDay: -99999, endDay: 3, color: 0 }, // 早于 1900
        sample[1],
      ],
    }
    const r = parseBackup(JSON.stringify(doc))
    expect(r.ok).toBe(true)
    expect(r.schedules).toHaveLength(2)
    expect(r.skipped).toBe(4)
  })

  it('颜色越界被钳到 0..7，不算坏数据', () => {
    const r = parseBackup(
      JSON.stringify({ version: 1, schedules: [{ title: 'x', startDay: 1, endDay: 2, color: 99 }] })
    )
    expect(r.ok).toBe(true)
    expect(r.schedules[0].color).toBe(7)
  })

  it('color 缺失按 0 号色处理', () => {
    const r = parseBackup(JSON.stringify({ version: 1, schedules: [{ title: 'x', startDay: 1, endDay: 2 }] }))
    expect(r.schedules[0].color).toBe(0)
  })

  it('接受 startDate/endDate 字符串写法', () => {
    const r = parseBackup(
      JSON.stringify({ version: 1, schedules: [{ title: 'x', startDate: '2026-09-05', endDate: '2026-09-10' }] })
    )
    expect(r.ok).toBe(true)
    expect(r.schedules[0].startDay).toBe(toDayNumber(2026, 9, 5))
    expect(r.schedules[0].endDay).toBe(toDayNumber(2026, 9, 10))
  })

  it('schedules 不是数组时按缺失处理', () => {
    expect(parseBackup('{"version":1,"schedules":{}}').ok).toBe(false)
  })
})

describe('summarize', () => {
  it('空列表', () => {
    expect(summarize([])).toBe('0 条日程')
  })

  it('给出条数与整体时间跨度', () => {
    expect(summarize(sample)).toBe('2 条日程，2026-10-01 ~ 2026-10-10')
  })
})
