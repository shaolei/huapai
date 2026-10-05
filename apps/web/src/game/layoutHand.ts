/**
 * 手牌区的像素布局（纯函数，不碰 DOM）。
 *
 * 输入是 `arrangeConcealed()` 给出的「列」（一列 = 一个单元），输出每列的位置与列内叠压偏移。
 *
 * **硬保证**（由 `layoutHand.test.ts` 的属性测试守住）：
 *   - 除非主动退化成 `scrolls`，否则 `totalWidth ≤ availableWidth` 且 `totalHeight ≤ availableHeight`
 *   - 不丢列、不丢牌
 *
 * 打包优先级（计划书 §5.4）：
 *   1. 先用默认叠压步进 dy
 *   2. 散张按「一列最多几张」重排（这是列数的主要来源）
 *   3. 宽度还超 → 把「对 / 口」这类提示列也并入散张池重排
 *   4. 还超 → 等比缩小牌面（下限 0.6）
 *   5. 还超 → 退化成横向滚动，并如实报告 `scrolls = true`
 *
 * 高度方向：dy 与列内张数互相制约 —— 5 张一列时
 * `cardHeight + 4 × dy ≤ availableHeight` 必须先满足，否则先压 dy 再压牌高。
 */

import type { Card, Column, ColumnKind } from '@huapai/engine'

export const CARD_W = 30
export const CARD_H = 92
/** 顶部「字带」高度：叠压后仍然可见的那一段，字画在这里。 */
export const CARD_BAND = 30
/** 列内叠压步进（默认）。 */
export const STACK_STEP = 30
export const MIN_STACK_STEP = 22
export const COLUMN_GAP = 8
/** 牌面最小缩放比，低于它宁可变滚动也不把牌压成看不懂。 */
export const MIN_SCALE = 0.6
/**
 * 牌面最大放大比。手牌列数少时，与其留一大片空白，不如把牌放大。
 * 上限保持在 1.5：再大就会显得笨重，也不像"一手牌"了。
 */
export const MAX_SCALE_UP = 1.5

export interface LayoutInput {
  readonly columns: readonly Column[]
  readonly availableWidth: number
  readonly availableHeight: number
  readonly cardWidth?: number
  readonly cardHeight?: number
  readonly stackStep?: number
  readonly gap?: number
  /**
   * 是否允许「打包」（把散张并成一列、必要时吸收提示列）。
   * 默认开启；**手牌固定 8 列时必须关掉** —— 否则布局层会把固定列重新分块，
   * 玩家拖拽的语义就废了。
   */
  readonly packing?: boolean
}

export interface PlacedColumn {
  readonly key: string
  readonly kind: ColumnKind
  /** 列内的牌，顺序与 `offsets` 一一对应（最后一张完整可见）。 */
  readonly cards: readonly Card[]
  /** 列内每张牌相对列左上角的垂直偏移，长度 = 列内张数。 */
  readonly offsets: readonly number[]
  /** 列左上角的 x。y 由 CSS 按底部对齐决定，这里只给高度。 */
  readonly x: number
  readonly height: number
  /** 因为放不下而被并进来的列（UI 可以据此弱化分组提示）。 */
  readonly packed: boolean
}

export interface HandLayout {
  readonly placed: readonly PlacedColumn[]
  readonly totalWidth: number
  readonly totalHeight: number
  readonly cardWidth: number
  readonly cardHeight: number
  readonly stackStep: number
  readonly scale: number
  /** 已退化成横向滚动（所有硬保证都不再成立，UI 需要允许横向滚动）。 */
  readonly scrolls: boolean
}

/** 一列要多少张才撑满可用高度。 */
function capacityFor(cardHeight: number, step: number, availableHeight: number): number {
  if (step <= 0) return Number.MAX_SAFE_INTEGER
  return Math.max(2, Math.floor((availableHeight - cardHeight) / step) + 1)
}

function columnHeightOf(count: number, cardHeight: number, step: number): number {
  return cardHeight + Math.max(0, count - 1) * step
}

function widthOf(columnCount: number, cardWidth: number, gap: number): number {
  return columnCount * cardWidth + Math.max(0, columnCount - 1) * gap
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

interface Working {
  readonly key: string
  readonly kind: ColumnKind
  readonly cards: readonly Card[]
  readonly packed: boolean
}

const MAX_LOOSE_PER_COLUMN = 6

/**
 * 把列重排到能放进给定宽度。
 *
 * `absorbHintColumns` 为真时，把「对 / 口」这类只是提示的列也拆进散张池一起重排。
 */
function repack(
  columns: readonly Column[],
  capacity: number,
  absorbHintColumns: boolean,
): Working[] {
  const kept: Working[] = []
  const pool: Card[] = []

  for (const column of columns) {
    const isHint = column.kind === 'pair' || column.kind === 'kou'
    if (column.kind === 'loose' || (absorbHintColumns && isHint)) {
      pool.push(...column.cards)
      continue
    }
    kept.push({ key: column.key, kind: column.kind, cards: column.cards, packed: false })
  }

  const cap = Math.max(1, Math.min(capacity, MAX_LOOSE_PER_COLUMN))
  for (const group of chunk(pool, cap)) {
    kept.push({
      key: group.map((card) => card.id).join('+'),
      kind: 'loose',
      cards: group,
      packed: group.length > 1,
    })
  }

  return kept
}

function measure(
  working: readonly Working[],
  cardWidth: number,
  cardHeight: number,
  step: number,
  gap: number,
): { width: number; height: number } {
  const width = widthOf(working.length, cardWidth, gap)
  let height = 0
  for (const column of working) {
    height = Math.max(height, columnHeightOf(column.cards.length, cardHeight, step))
  }
  return { width, height }
}

/** 主入口。 */
export function layoutHand(input: LayoutInput): HandLayout {
  const gap = input.gap ?? COLUMN_GAP
  const baseCardWidth = input.cardWidth ?? CARD_W
  const baseCardHeight = input.cardHeight ?? CARD_H
  const baseStep = input.stackStep ?? STACK_STEP
  const availableWidth = Math.max(1, input.availableWidth)
  const availableHeight = Math.max(1, input.availableHeight)

  // 高度方向先定 dy：最长的列要能塞进可用高度。
  const maxCount = input.columns.reduce((max, column) => Math.max(max, column.cards.length), 1)
  const heightBudget = maxCount > 1 ? (availableHeight - baseCardHeight) / (maxCount - 1) : baseStep
  const step = Math.max(
    MIN_STACK_STEP,
    Math.min(baseStep, Number.isFinite(heightBudget) ? heightBudget : baseStep),
  )

  let cardHeight = baseCardHeight
  // 5 张一列时若连 MIN_STACK_STEP 都放不下，就只能压牌高。
  const neededAtMinStep = columnHeightOf(maxCount, cardHeight, Math.min(step, baseStep))
  if (neededAtMinStep > availableHeight) {
    cardHeight = Math.max(40, availableHeight - (maxCount - 1) * MIN_STACK_STEP)
  }

  interface Attempt {
    readonly working: Working[]
    readonly cardWidth: number
    readonly cardHeight: number
    readonly step: number
    readonly width: number
    readonly height: number
    readonly ok: boolean
  }

  const fit = (scale: number, absorbHints: boolean): Attempt => {
    const scaledWidth = baseCardWidth * scale
    const scaledHeight = cardHeight * scale
    const scaledStep = step * scale
    const capacity = capacityFor(scaledHeight, scaledStep, availableHeight)
    const working: Working[] =
      input.packing === false
        ? input.columns.map((column) => ({
            key: column.key,
            kind: column.kind,
            cards: column.cards,
            packed: false,
          }))
        : repack(input.columns, capacity, absorbHints)
    const { width, height } = measure(working, scaledWidth, scaledHeight, scaledStep, gap)
    return {
      working,
      cardWidth: scaledWidth,
      cardHeight: scaledHeight,
      step: scaledStep,
      width,
      height,
      ok: width <= availableWidth + 0.5 && height <= availableHeight + 0.5,
    }
  }

  // 逐级放宽：正常 → 吸收提示列 → 等比缩小牌面
  let chosen = fit(1, false)
  if (!chosen.ok) chosen = fit(1, true)
  if (!chosen.ok) {
    for (let candidate = 0.95; candidate >= MIN_SCALE - 1e-9; candidate -= 0.05) {
      chosen = fit(candidate, true)
      if (chosen.ok) break
    }
  }

  const scrolls = !chosen.ok

  // 装得下就再**向上**缩放，把多余的空间还给可读性：
  // 手牌列数少的时候，硬留 30px 的牌只会得到两侧一大片空白。
  // 宽高同时约束（缩放是等比的，所以两个上限都要看），且不超过 MAX_SCALE_UP。
  let finalCardWidth = chosen.cardWidth
  let finalCardHeight = chosen.cardHeight
  let finalStep = chosen.step
  if (!scrolls && chosen.width > 0 && chosen.height > 0) {
    const grow = Math.min(
      availableWidth / chosen.width,
      availableHeight / chosen.height,
      MAX_SCALE_UP,
    )
    if (grow > 1) {
      finalCardWidth = chosen.cardWidth * grow
      finalCardHeight = chosen.cardHeight * grow
      finalStep = chosen.step * grow
    }
  }

  const gapScaled = gap * (finalCardWidth / baseCardWidth)
  const placed: PlacedColumn[] = []
  let x = 0
  for (const column of chosen.working) {
    const offsets = Array.from({ length: column.cards.length }, (_, index) => index * finalStep)
    placed.push({
      key: column.key,
      kind: column.kind,
      cards: column.cards,
      offsets,
      x,
      height: columnHeightOf(column.cards.length, finalCardHeight, finalStep),
      packed: column.packed,
    })
    x += finalCardWidth + gapScaled
  }

  const totalWidth = placed.length === 0 ? 0 : x - gapScaled
  const totalHeight = placed.reduce((max, column) => Math.max(max, column.height), 0)

  return {
    placed,
    totalWidth,
    totalHeight,
    cardWidth: finalCardWidth,
    cardHeight: finalCardHeight,
    stackStep: finalStep,
    scale: finalCardWidth / baseCardWidth,
    scrolls,
  }
}
