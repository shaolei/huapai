import type { Column } from '@huapai/engine'
import { arrangeConcealed, createDeck, mulberry32, shuffle } from '@huapai/engine'
import { describe, expect, it } from 'vitest'

import { CARD_H, CARD_W, COLUMN_GAP, MAX_SCALE_UP, STACK_STEP, layoutHand } from './layoutHand'

const deck = createDeck()

function columnsFrom(seed: number, count: number): Column[] {
  return arrangeConcealed(shuffle(deck, mulberry32(seed)).slice(0, count))
}

/** 两个验收尺寸（计划书 §5.2）：800×360 与 915×412 的底部带可用空间。 */
const VIEWPORTS: readonly (readonly [number, number, string])[] = [
  [736, 182, '915×412'],
  [630, 182, '800×360'],
  [560, 160, '更小的屏'],
  [380, 140, '极窄'],
]

describe('layoutHand 基本行为', () => {
  it('空手牌 → 零尺寸且不滚动', () => {
    const layout = layoutHand({ columns: [], availableWidth: 630, availableHeight: 182 })
    expect(layout.placed).toEqual([])
    expect(layout.totalWidth).toBe(0)
    expect(layout.totalHeight).toBe(0)
    expect(layout.scrolls).toBe(false)
  })

  it('单列 3 张的列高 = (牌高 + 2 × 步进) × 缩放', () => {
    const one: Column[] = [
      {
        key: 'a',
        kind: 'same',
        cards: [deck[0], deck[1], deck[2]].filter(Boolean) as Column['cards'],
      },
    ]
    const layout = layoutHand({ columns: one, availableWidth: 630, availableHeight: 182 })
    expect(layout.placed).toHaveLength(1)
    expect(layout.placed[0]?.offsets).toEqual([
      0,
      STACK_STEP * layout.scale,
      STACK_STEP * 2 * layout.scale,
    ])
    expect(layout.totalHeight).toBeCloseTo((CARD_H + STACK_STEP * 2) * layout.scale, 5)
    expect(layout.scrolls).toBe(false)
  })

  it('列内的偏移是递增的，且首张为 0', () => {
    const layout = layoutHand({
      columns: columnsFrom(9, 25),
      availableWidth: 630,
      availableHeight: 182,
    })
    for (const column of layout.placed) {
      expect(column.offsets[0]).toBe(0)
      for (let i = 1; i < column.offsets.length; i += 1) {
        expect(column.offsets[i]).toBeGreaterThan(column.offsets[i - 1] ?? -1)
      }
    }
  })

  it('列的 x 单调递增且间距一致', () => {
    const layout = layoutHand({
      columns: columnsFrom(3, 20),
      availableWidth: 736,
      availableHeight: 182,
    })
    for (let i = 1; i < layout.placed.length; i += 1) {
      const prev = layout.placed[i - 1]
      const current = layout.placed[i]
      expect(current?.x).toBeGreaterThan(prev?.x ?? Infinity)
    }
    if (layout.placed.length > 1) {
      const first = layout.placed[0]
      const second = layout.placed[1]
      expect((second?.x ?? 0) - (first?.x ?? 0)).toBeCloseTo(
        (CARD_W + COLUMN_GAP) * layout.scale,
        5,
      )
    }
  })
})

describe('硬保证：不溢出、不丢牌', () => {
  it('任意手牌张数 × 任意尺寸：要么装得下，要么明确 scrolls', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      for (const count of [1, 4, 9, 13, 20, 25, 26, 28]) {
        const columns = columnsFrom(seed, count)
        for (const [width, height, label] of VIEWPORTS) {
          const layout = layoutHand({ columns, availableWidth: width, availableHeight: height })
          const placedCards = layout.placed.reduce((sum, column) => sum + column.offsets.length, 0)
          const where = `seed=${seed} n=${count} ${label}`
          expect(placedCards, `丢牌：${where}`).toBe(count)
          if (!layout.scrolls) {
            expect(layout.totalWidth, `宽度溢出：${where}`).toBeLessThanOrEqual(width + 0.5)
            expect(layout.totalHeight, `高度溢出：${where}`).toBeLessThanOrEqual(height + 0.5)
          }
        }
      }
    }
  })

  it('列的高度永远不超过可用高度（只要不滚动）', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const layout = layoutHand({
        columns: columnsFrom(seed + 500, 25),
        availableWidth: 630,
        availableHeight: 182,
      })
      if (layout.scrolls) continue
      for (const column of layout.placed) {
        expect(column.height).toBeLessThanOrEqual(182.5)
      }
    }
  })

  it('牌面尺寸永不为负、永不为零', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const layout = layoutHand({
        columns: columnsFrom(seed, 25),
        availableWidth: 300,
        availableHeight: 120,
      })
      expect(layout.cardWidth).toBeGreaterThan(0)
      expect(layout.cardHeight).toBeGreaterThan(0)
      expect(layout.stackStep).toBeGreaterThan(0)
      expect(layout.scale).toBeGreaterThan(0)
      expect(layout.scale).toBeLessThanOrEqual(MAX_SCALE_UP)
    }
  })
})

describe('打包行为', () => {
  it('开局 25 张散张会被并进少数几列，而不是撑出 25 列', () => {
    // 全部当成散张：最坏情况
    const hand = shuffle(deck, mulberry32(77)).slice(0, 25)
    const looseColumns: Column[] = hand.map((card, index) => ({
      key: `loose-${index}`,
      kind: 'loose',
      cards: [card],
    }))
    const layout = layoutHand({
      columns: looseColumns,
      availableWidth: 630,
      availableHeight: 182,
    })
    expect(layout.placed.length).toBeLessThan(10)
    expect(layout.scrolls).toBe(false)
    const placedCards = layout.placed.reduce((sum, column) => sum + column.offsets.length, 0)
    expect(placedCards).toBe(25)
    // 打包过的列要如实标记
    expect(layout.placed.some((column) => column.packed)).toBe(true)
  })

  it('非常窄的屏会缩小牌面而不是直接滚动', () => {
    const layout = layoutHand({
      columns: columnsFrom(2, 25),
      availableWidth: 420,
      availableHeight: 182,
    })
    if (!layout.scrolls) {
      expect(layout.totalWidth).toBeLessThanOrEqual(420.5)
    }
    expect(layout.cardWidth).toBeLessThanOrEqual(CARD_W * MAX_SCALE_UP)
  })

  it('空间充裕时把牌放大，而不是留一大片空白', () => {
    const layout = layoutHand({
      columns: columnsFrom(4, 26),
      availableWidth: 2000,
      availableHeight: 400,
    })
    expect(layout.scrolls).toBe(false)
    // 空间足够 → 会放大，但封顶
    expect(layout.scale).toBeGreaterThan(1)
    expect(layout.scale).toBeLessThanOrEqual(MAX_SCALE_UP)
    expect(layout.placed.every((column) => !column.packed)).toBe(true)
  })

  it('放大后依然不溢出（宽高两个方向都要守住）', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      for (const count of [3, 8, 18, 25]) {
        for (const [width, height] of [
          [736, 182],
          [630, 182],
          [900, 200],
        ] as const) {
          const layout = layoutHand({
            columns: columnsFrom(seed + 300, count),
            availableWidth: width,
            availableHeight: height,
          })
          if (layout.scrolls) continue
          expect(layout.totalWidth, `seed=${seed} n=${count}`).toBeLessThanOrEqual(width + 0.5)
          expect(layout.totalHeight, `seed=${seed} n=${count}`).toBeLessThanOrEqual(height + 0.5)
        }
      }
    }
  })
})
