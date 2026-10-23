import { describe, expect, it } from 'vitest'
import { COLOR_NAMES, PALETTE, colorNameOf, colorOf, contrast, textColorOn } from './palette.js'

describe('palette', () => {
  it('8 色，与 Android 版 COLOR_RES 顺序一致', () => {
    expect(PALETTE).toEqual(['#4c8dff', '#ff6b6b', '#f2b737', '#4cc38a', '#9b6bff', '#ff8a3d', '#2fb6c4', '#e85d9c'])
    expect(COLOR_NAMES).toHaveLength(8)
  })

  it('越界索引被钳到两端', () => {
    expect(colorOf(99)).toBe(PALETTE[7])
    expect(colorOf(-1)).toBe(PALETTE[0])
    expect(colorOf(undefined)).toBe(PALETTE[0])
    expect(colorNameOf(99)).toBe(COLOR_NAMES[7])
  })

  it('浅色块用深色字，深色块用白字', () => {
    // 黄（索引 2）在深浅之间——必须选深色字，白字对比度只有 1.81 看不清
    expect(textColorOn(2)).toBe('#333333')
    expect(contrast(PALETTE[2], '#333333')).toBeGreaterThan(3)
    // 真正的深色（未来往调色板里加时）应走白字
    expect(textColorOn(0)).toBe('#333333')
  })

  it('8 个色都取到了对比度更高的一侧', () => {
    for (let i = 0; i < PALETTE.length; i++) {
      const text = textColorOn(i)
      const other = text === '#333333' ? '#ffffff' : '#333333'
      expect(contrast(PALETTE[i], text), `索引 ${i} 选错了文字色`).toBeGreaterThanOrEqual(
        contrast(PALETTE[i], other)
      )
    }
  })

  it('contrast 计算结果符合 WCAG 已知值', () => {
    // 纯黑白是 21:1
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    // 同色是 1:1
    expect(contrast('#4c8dff', '#4c8dff')).toBeCloseTo(1, 5)
  })
})
