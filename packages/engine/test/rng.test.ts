import { describe, expect, it } from 'vitest'

import { createDeck } from '../src/cards'
import { mulberry32, shuffle } from '../src/rng'

describe('可复现随机', () => {
  it('同一个 seed 给出同一串随机数', () => {
    const a = mulberry32(20260930)
    const b = mulberry32(20260930)
    const left = Array.from({ length: 32 }, () => a())
    const right = Array.from({ length: 32 }, () => b())
    expect(left).toEqual(right)
  })

  it('不同 seed 给出不同序列', () => {
    const a = Array.from({ length: 16 }, mulberry32(1))
    const b = Array.from({ length: 16 }, mulberry32(2))
    expect(a).not.toEqual(b)
  })

  it('随机数落在 [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('洗牌', () => {
  const deck = createDeck()

  it('不丢牌也不造牌（多重集保持不变）', () => {
    const shuffled = shuffle(deck, mulberry32(42))
    expect(shuffled).toHaveLength(deck.length)
    const key = (cards: typeof deck) =>
      cards
        .map((card) => `${card.char}:${card.variant}`)
        .sort()
        .join('|')
    expect(key(shuffled)).toBe(key(deck))
  })

  it('同 seed 洗出同一副牌，不同 seed 洗出不同顺序', () => {
    const a = shuffle(deck, mulberry32(2026)).map((card) => card.id)
    const b = shuffle(deck, mulberry32(2026)).map((card) => card.id)
    const c = shuffle(deck, mulberry32(2027)).map((card) => card.id)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('不修改入参数组', () => {
    const before = deck.map((card) => card.id)
    shuffle(deck, mulberry32(1))
    expect(deck.map((card) => card.id)).toEqual(before)
  })

  it('空数组与单元素数组是安全的', () => {
    expect(shuffle([], mulberry32(1))).toEqual([])
    expect(shuffle([deck[0] as (typeof deck)[number]], mulberry32(1))).toHaveLength(1)
  })
})
