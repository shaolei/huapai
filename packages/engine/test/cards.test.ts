import { describe, expect, it } from 'vitest'

import {
  BLACK_CHARS,
  CHAR_COUNT,
  COPIES_PER_CHAR,
  DECK_SIZE,
  FLOWER_COPIES_PER_JING,
  JING_CHARS,
  RED_CHARS,
  TILE_CHARS,
  createDeck,
  isBlackChar,
  isFlower,
  isJingChar,
  isRedChar,
  tileIndex,
} from '../src/cards'

describe('牌库构成', () => {
  const deck = createDeck()

  it('110 张 = 22 字 × 5 张', () => {
    expect(CHAR_COUNT).toBe(22)
    expect(COPIES_PER_CHAR).toBe(5)
    expect(DECK_SIZE).toBe(110)
    expect(deck).toHaveLength(110)
  })

  it('每个字恰好 5 张', () => {
    for (const char of TILE_CHARS) {
      expect(deck.filter((card) => card.char === char)).toHaveLength(COPIES_PER_CHAR)
    }
  })

  it('牌 id 唯一且恰好覆盖 0..109', () => {
    const ids = deck.map((card) => card.id).sort((a, b) => a - b)
    expect(ids).toEqual(Array.from({ length: DECK_SIZE }, (_, i) => i))
  })

  it('经字每字 2 张花字 + 3 张素字；非经字全为素字', () => {
    for (const char of TILE_CHARS) {
      const flowers = deck.filter((card) => card.char === char && isFlower(card))
      const expected = isJingChar(char) ? FLOWER_COPIES_PER_JING : 0
      expect(flowers, `字「${char}」的花字张数`).toHaveLength(expected)
    }
  })

  it('整副牌共 10 张花字（5 个经字 × 2）', () => {
    expect(deck.filter(isFlower)).toHaveLength(JING_CHARS.length * FLOWER_COPIES_PER_JING)
  })

  it('红字 9 / 黑字 13 / 经字 5，且「黑 = 非红」', () => {
    expect(RED_CHARS).toHaveLength(9)
    expect(BLACK_CHARS).toHaveLength(13)
    expect(JING_CHARS).toHaveLength(5)
    for (const char of TILE_CHARS) {
      expect(isBlackChar(char), `字「${char}」黑字判定`).toBe(!isRedChar(char))
    }
  })

  it('三/五/七 同时是红字与经字；乙/九 是黑字且是经字', () => {
    for (const char of ['三', '五', '七'] as const) {
      expect(isRedChar(char)).toBe(true)
      expect(isJingChar(char)).toBe(true)
    }
    for (const char of ['乙', '九'] as const) {
      expect(isBlackChar(char)).toBe(true)
      expect(isJingChar(char)).toBe(true)
    }
  })

  it('tileIndex 稳定且恰好覆盖 0..21', () => {
    const indexes = TILE_CHARS.map((char) => tileIndex(char)).sort((a, b) => a - b)
    expect(indexes).toEqual(Array.from({ length: CHAR_COUNT }, (_, i) => i))
  })

  it('字序固定（回放与 UI 列序都依赖它）', () => {
    expect(TILE_CHARS[0]).toBe('上')
    expect(TILE_CHARS[TILE_CHARS.length - 1]).toBe('六')
  })
})
