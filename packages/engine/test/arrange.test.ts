import { describe, expect, it } from 'vitest'

import { arrangeConcealed, columnCards } from '../src/arrange'
import type { Card, TileChar } from '../src/cards'
import { createDeck } from '../src/cards'
import { mulberry32, shuffle } from '../src/rng'

/** 造测试用牌。 */
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

describe('分列编排', () => {
  it('空手牌排成零列', () => {
    expect(arrangeConcealed([])).toEqual([])
  })

  it('3 张同字 = 1 列坎', () => {
    const columns = arrangeConcealed(cards(['孔', 3]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.kind).toBe('same')
    expect(columns[0]?.cards).toHaveLength(3)
  })

  it('4 张同字 = 1 列统（不是两列）', () => {
    const columns = arrangeConcealed(cards(['九', 4]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.kind).toBe('same')
    expect(columns[0]?.cards).toHaveLength(4)
  })

  it('5 张同字 = 1 列开泛', () => {
    const columns = arrangeConcealed(cards(['七', 5]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.cards).toHaveLength(5)
  })

  it('上大人 = 1 列句', () => {
    const columns = arrangeConcealed(cards(['上', 1], ['大', 1], ['人', 1]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.kind).toBe('sentence')
    expect(new Set(columns[0]?.cards.map((card) => card.char))).toEqual(new Set(['上', '大', '人']))
  })

  it('两组相同的句排成两列', () => {
    const columns = arrangeConcealed(cards(['上', 2], ['大', 2], ['人', 2]))
    expect(columns).toHaveLength(2)
    expect(columns.every((col) => col.kind === 'sentence')).toBe(true)
  })

  it('化三 = 1 列口（等千）', () => {
    const columns = arrangeConcealed(cards(['化', 1], ['三', 1]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.kind).toBe('kou')
  })

  it('九九 = 1 列对', () => {
    const columns = arrangeConcealed(cards(['九', 2], ['九', 0]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.kind).toBe('pair')
  })

  it('孤立单张 = 1 列散张', () => {
    const columns = arrangeConcealed(cards(['上', 1]))
    expect(columns).toHaveLength(1)
    expect(columns[0]?.kind).toBe('loose')
    expect(columns[0]?.cards).toHaveLength(1)
  })

  it('句排在同字轮之前，散张排在最后', () => {
    const columns = arrangeConcealed(cards(['上', 1], ['大', 1], ['人', 1], ['孔', 3], ['六', 1]))
    expect(columns.map((col) => col.kind)).toEqual(['sentence', 'same', 'loose'])
  })

  it('列的 key 稳定且唯一', () => {
    const hand = cards(['上', 1], ['大', 1], ['人', 1], ['孔', 3])
    const columns = arrangeConcealed(hand)
    const keys = columns.map((col) => col.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(arrangeConcealed(hand).map((col) => col.key)).toEqual(keys)
  })
})

describe('不丢牌 / 不造牌', () => {
  /** 多重集指纹：字 + 花/素 + 出现次数。 */
  function fingerprint(list: readonly Card[]): string {
    return list
      .map((card) => `${card.char}:${card.variant}`)
      .sort()
      .join('|')
  }

  it('一整手示例牌的每一张都落在某一列里', () => {
    const hand = cards(
      ['上', 1], ['大', 1], ['人', 1],
      ['乙', 1], ['二', 1], ['三', 3],
      ['孔', 3], ['四', 3], ['七', 3],
      ['八', 1], ['九', 4], ['十', 1],
    )
    const columns = arrangeConcealed(hand)
    expect(columnCards(columns)).toHaveLength(hand.length)
    expect(fingerprint(columnCards(columns))).toBe(fingerprint(hand))
  })

  it('随机 200 副牌都不丢牌、不造牌、每列非空', () => {
    const deck = createDeck()
    for (let seed = 0; seed < 200; seed += 1) {
      const hand = shuffle(deck, mulberry32(seed)).slice(0, 25)
      const columns = arrangeConcealed(hand)
      expect(columnCards(columns), `seed=${seed}`).toHaveLength(hand.length)
      expect(fingerprint(columnCards(columns)), `seed=${seed}`).toBe(fingerprint(hand))
      expect(columns.every((col) => col.cards.length > 0), `seed=${seed}`).toBe(true)
    }
  })

  it('随机牌里出现的同字轮张数只可能是 3/4/5', () => {
    const deck = createDeck()
    for (let seed = 0; seed < 100; seed += 1) {
      const hand = shuffle(deck, mulberry32(seed + 1000)).slice(0, 25)
      for (const col of arrangeConcealed(hand)) {
        if (col.kind === 'same') continue
        expect(col.cards.length).toBeLessThanOrEqual(3)
      }
      const sameColumns = arrangeConcealed(hand).filter((col) => col.kind === 'same')
      for (const col of sameColumns) {
        expect([3, 4, 5]).toContain(col.cards.length)
        expect(new Set(col.cards.map((card) => card.char)).size).toBe(1)
      }
    }
  })
})
