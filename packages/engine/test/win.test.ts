import { describe, expect, it } from 'vitest'

import { type Card, type CardVariant, type TileChar, createDeck } from '../src/cards'
import { BASELINE_RULES } from '../src/rules'
import { mulberry32, shuffle } from '../src/rng'
import { decompose, isPlausibleWinSize, isWinningShape, UNITS_PER_HAND } from '../src/win'

let nextId = 10_000

type Spec = TileChar | readonly [TileChar, 'flower']

/** 按字造牌；`['五','flower']` 表示一张花五。 */
function build(specs: readonly Spec[]): Card[] {
  return specs.map((spec) => {
    if (typeof spec === 'string') {
      return { id: nextId++, char: spec, variant: 'plain' as CardVariant }
    }
    return { id: nextId++, char: spec[0], variant: spec[1] as CardVariant }
  })
}

/** docs/rules.md §7 的示例手牌：8 个三张单元 + 听头（花七 七），共 26 张。 */
function handExample(): Card[] {
  return build([
    '上', '大', '人', // 上大人
    '乙', '二', '三', // 乙二三
    '三', '四', ['五', 'flower'], // 三四五
    '孔', '孔', '孔',
    '四', '四', '四',
    '七', '七', '七',
    '八', '九', '十',
    '九', '九', ['九', 'flower'],
    ['七', 'flower'], '七', // 听头
  ])
}

describe('胡牌结构：8 个单元 + 2 张听头', () => {
  it('示例手牌是 26 张且结构成立', () => {
    const hand = handExample()
    expect(hand).toHaveLength(26)
    expect(isWinningShape(hand, BASELINE_RULES)).toBe(true)
  })

  it('分解结果恒为 8 个单元 + 2 张听头', () => {
    const shapes = decompose(handExample(), BASELINE_RULES)
    expect(shapes.length).toBeGreaterThan(0)
    for (const shape of shapes) {
      expect(shape.units).toHaveLength(UNITS_PER_HAND)
      expect(shape.tingtou).toHaveLength(2)
      // 单元张数之和 + 听头 2 张 = 手牌总张数
      const unitCards = shape.units.reduce((sum, unit) => sum + unit.chars.length, 0)
      expect(unitCards + 2).toBe(26)
    }
  })

  it('存在一个解恰好是「4 句 + 4 坎 + 听头对子」', () => {
    const shapes = decompose(handExample(), BASELINE_RULES)
    const target = shapes.find(
      (shape) =>
        shape.units.filter((unit) => unit.kind === 'sentence').length === 4 &&
        shape.units.filter((unit) => unit.kind === 'kan').length === 4 &&
        shape.tingtou[0] === '七' &&
        shape.tingtou[1] === '七',
    )
    expect(target).toBeDefined()
  })

  it('把「八九十」换成两张无关单张后结构不成立', () => {
    const broken = build([
      '上', '大', '人',
      '乙', '二', '三',
      '三', '四', ['五', 'flower'],
      '孔', '孔', '孔',
      '四', '四', '四',
      '七', '七', '七',
      '六', '己', '乙', // 原本是八九十
      '九', '九', ['九', 'flower'],
      ['七', 'flower'], '七',
    ])
    expect(broken).toHaveLength(26)
    expect(isWinningShape(broken, BASELINE_RULES)).toBe(false)
  })

  it('张数不对就一定不成立', () => {
    const short = handExample().slice(1)
    expect(isWinningShape(short, BASELINE_RULES)).toBe(false)
  })
})

describe('四张／五张单元（扎 / 泛）', () => {
  /** 1 个扎（孔×4）+ 7 个三张单元 + 听头 = 27 张。 */
  function handWithZha(): Card[] {
    return build([
      '孔', '孔', '孔', '孔', // 扎
      '上', '大', '人',
      '乙', '二', '三',
      '三', '四', ['五', 'flower'],
      '四', '四', '四',
      '七', '七', '七',
      '八', '九', '十',
      '九', '九', ['九', 'flower'],
      ['七', 'flower'], '七',
    ])
  }

  it('含 1 个扎的手牌是 27 张，仍然成立', () => {
    const hand = handWithZha()
    expect(hand).toHaveLength(27)
    expect(isWinningShape(hand, BASELINE_RULES)).toBe(true)
  })

  it('分解里确实出现了「扎」这个单元', () => {
    const shapes = decompose(handWithZha(), BASELINE_RULES)
    expect(shapes.some((shape) => shape.units.some((unit) => unit.kind === 'zha'))).toBe(true)
  })

  it('26 张起、42 张止 才可能是合法胡牌张数', () => {
    expect(isPlausibleWinSize(25)).toBe(false)
    expect(isPlausibleWinSize(26)).toBe(true)
    expect(isPlausibleWinSize(27)).toBe(true)
    expect(isPlausibleWinSize(42)).toBe(true)
    expect(isPlausibleWinSize(43)).toBe(false)
  })

  it('含 1 个泛的手牌是 28 张（26 + 2），仍然成立', () => {
    const hand = build([
      '孔', '孔', '孔', '孔', '孔', // 泛（5 张，多出 2 张）
      '上', '大', '人',
      '乙', '二', '三',
      '三', '四', ['五', 'flower'],
      '四', '四', '四',
      '七', '七', '七',
      '八', '九', '十',
      '九', '九', ['九', 'flower'],
      ['七', 'flower'], '七',
    ])
    expect(hand).toHaveLength(28)
    expect(isWinningShape(hand, BASELINE_RULES)).toBe(true)
    const shapes = decompose(hand, BASELINE_RULES)
    expect(shapes.some((shape) => shape.units.some((unit) => unit.kind === 'fan'))).toBe(true)
  })
})

describe('鲁棒性', () => {
  it('随机 25 张牌判胡不崩溃，且不会误判为胡', () => {
    const deck = createDeck()
    for (let seed = 0; seed < 60; seed += 1) {
      const hand = shuffle(deck, mulberry32(seed + 500)).slice(0, 25)
      expect(() => isWinningShape(hand, BASELINE_RULES)).not.toThrow()
      // 25 张（无扎/泛）不满足 26 张门槛
      expect(isWinningShape(hand, BASELINE_RULES), `seed=${seed}`).toBe(false)
    }
  })

  it('空手牌不成立', () => {
    expect(isWinningShape([], BASELINE_RULES)).toBe(false)
  })
})
