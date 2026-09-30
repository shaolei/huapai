import { describe, expect, it } from 'vitest'

import type { Card, TileChar } from '../src/cards'
import {
  addCards,
  cardsOfChar,
  concealedSize,
  countByChar,
  countFlowerOf,
  countOf,
  createHand,
  groupByChar,
  removeCards,
  totalSize,
} from '../src/hand'
import type { Meld } from '../src/meld'

/** 造测试用牌：花字只在与经字组合时出现，方便验证。 */
function cards(...specs: readonly (readonly [TileChar, number])[]): Card[] {
  const out: Card[] = []
  let id = 0
  for (const [char, count] of specs) {
    for (let i = 0; i < count; i += 1) {
      out.push({ id: id++, char, variant: 'plain' })
    }
  }
  return out
}

describe('手牌结构', () => {
  it('空手牌', () => {
    const hand = createHand()
    expect(concealedSize(hand)).toBe(0)
    expect(totalSize(hand)).toBe(0)
  })

  it('createHand 复制入参，不共享引用', () => {
    const source = cards(['上', 1])
    const hand = createHand(source)
    source.push({ id: 999, char: '大', variant: 'plain' })
    expect(hand.concealed).toHaveLength(1)
  })

  it('totalSize = 暗牌 + 每一轮的牌', () => {
    const melds: Meld[] = [
      { kind: 'sentence', cards: cards(['上', 3]), revealed: false },
      { kind: 'zhao', cards: cards(['九', 4]), revealed: true },
    ]
    const hand = createHand(cards(['三', 5], ['乙', 2]), melds)
    expect(concealedSize(hand)).toBe(7)
    expect(totalSize(hand)).toBe(7 + 3 + 4)
  })
})

describe('计数', () => {
  const cardsOfTest = cards(['三', 3], ['九', 2], ['上', 1])

  it('countOf 按字计数', () => {
    expect(countOf(cardsOfTest, '三')).toBe(3)
    expect(countOf(cardsOfTest, '九')).toBe(2)
    expect(countOf(cardsOfTest, '七')).toBe(0)
  })

  it('countByChar 给出完整分组', () => {
    const counts = countByChar(cardsOfTest)
    expect(counts.get('三')).toBe(3)
    expect(counts.get('九')).toBe(2)
    expect(counts.get('上')).toBe(1)
    expect(counts.size).toBe(3)
  })

  it('groupByChar 保留原顺序', () => {
    const groups = groupByChar(cardsOfTest)
    expect(groups.get('三')?.map((card) => card.id)).toEqual([0, 1, 2])
    expect(groups.get('九')?.map((card) => card.id)).toEqual([3, 4])
  })

  it('cardsOfChar 只挑出该字', () => {
    expect(cardsOfChar(cardsOfTest, '九')).toHaveLength(2)
  })

  it('countFlowerOf 只数花字（素经 1 胡 / 花经 2 胡靠它区分）', () => {
    const mixed: Card[] = [
      { id: 0, char: '三', variant: 'flower' },
      { id: 1, char: '三', variant: 'flower' },
      { id: 2, char: '三', variant: 'plain' },
      { id: 3, char: '九', variant: 'plain' },
    ]
    expect(countFlowerOf(mixed, '三')).toBe(2)
    expect(countFlowerOf(mixed, '九')).toBe(0)
    expect(countFlowerOf(mixed, '上')).toBe(0)
  })
})

describe('不可变更新', () => {
  it('removeCards 按 id 删除且不改原数组', () => {
    const source = cards(['三', 3])
    const removed = removeCards(source, [source[1] as Card])
    expect(source).toHaveLength(3)
    expect(removed.map((card) => card.id)).toEqual([0, 2])
  })

  it('removeCards 忽略不存在的 id', () => {
    const source = cards(['三', 2])
    const removed = removeCards(source, [{ id: 999, char: '上', variant: 'plain' }])
    expect(removed).toHaveLength(2)
  })

  it('addCards 追加到末尾且不改原数组', () => {
    const source = cards(['三', 1])
    const added = addCards(source, cards(['上', 1]))
    expect(source).toHaveLength(1)
    expect(added.map((card) => card.char)).toEqual(['三', '上'])
  })
})
