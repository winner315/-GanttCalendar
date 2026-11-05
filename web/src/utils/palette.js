/**
 * 日程 8 色调色板 —— 与 Android 版 res/values/colors.xml 的 c0~c7 一一对应。
 * 存储里存的是「索引」，不是色值，所以两端同一条数据能画出同样的颜色。
 */
export const PALETTE = ['#4c8dff', '#ff6b6b', '#f2b737', '#4cc38a', '#9b6bff', '#ff8a3d', '#2fb6c4', '#e85d9c']

/** 颜色名，供图例与列表展示 */
export const COLOR_NAMES = ['蓝', '红', '黄', '绿', '紫', '橙', '青', '粉']

export function colorOf(index) {
  return PALETTE[Math.min(Math.max(Number(index) || 0, 0), PALETTE.length - 1)]
}

export function colorNameOf(index) {
  return COLOR_NAMES[Math.min(Math.max(Number(index) || 0, 0), COLOR_NAMES.length - 1)]
}

/**
 * 甘特色带的背景色：按任务状态区分。
 * 「已完成」（done）整条置灰，让扫一眼就知道这条已经收尾；
 * 其余状态（todo/doing/paused）保留调度色，便于和同色系的其它日程区分。
 * 三视图（月/周/年）统一走这里，避免各写一份置灰逻辑。
 */
export function barColorOf(schedule) {
  if (schedule && schedule.status === 'done') return DONE_GREY
  return colorOf(schedule?.color)
}

/** 已完成色带的灰色（比普通格子底色略深，色带仍可被识别） */
export const DONE_GREY = '#b9b9b9'

/**
 * 色带上文字用深色还是白色。
 *
 * 这里**刻意偏离** Android 版的 `ColorUtils.calculateLuminance(color) > 0.6`：
 * 那套阈值下 8 个色全走白字，而黄底白字的对比度只有 1.81（AA 要求 4.5），
 * 在小组件的小字号上基本看不清。web 版改为「哪个对比度高用哪个」，
 * 结果是 8 个色都用深色字（这套调色板的亮度落在 0.25~0.53 区间）。
 * 白字分支留着，是为了将来有人往调色板里加真正的深色时不会写错。
 */
export function textColorOn(index) {
  const bg = colorOf(index)
  return contrast(bg, DARK_TEXT) >= contrast(bg, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT
}

export const DARK_TEXT = '#333333'
export const LIGHT_TEXT = '#ffffff'

function luminance(hex) {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(value.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 对比度，1 ~ 21 */
export function contrast(bgHex, fgHex) {
  const [l1, l2] = [luminance(bgHex), luminance(fgHex)].sort((a, b) => b - a)
  return (l1 + 0.05) / (l2 + 0.05)
}
