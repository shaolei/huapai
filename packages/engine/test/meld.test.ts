import { describe, expect, it } from 'vitest'

import type { TileChar } from '../src/cards'
import {
  MELD_LABEL,
  MELD_SIZE,
  NUMERIC_ORDER,
  SENTENCES,
  SENTENCE_COUNT,
  isMeldSizeValid,
  isSentence,
  sentenceCompletions,
  sentencePartnersOf,
} from '../src/meld'

describe('句表', () => {
  it('恰好 14 种句', () => {
    expect(SENTENCES).toHaveLength(SENTENCE_COUNT)
    expect(SENTENCE_COUNT).toBe(14)
  })

  it('固定句 6 种在前', () => {
    expect(SENTENCES.slice(0, 6)).toEqual([
      ['上', '大', '人'],
      ['孔', '乙', '己'],
      ['化', '三', '千'],
      ['七', '十', '土'],
      ['八', '九', '子'],
      ['可', '知', '礼'],
    ])
  })

  it('数序句 8 种在后（乙通一）', () => {
    expect(NUMERIC_ORDER).toEqual(['乙', '二', '三', '四', '五', '六', '七', '八', '九', '十'])
    expect(SENTENCES.slice(6)).toEqual([
      ['乙', '二', '三'],
      ['二', '三', '四'],
      ['三', '四', '五'],
      ['四', '五', '六'],
      ['五', '六', '七'],
      ['六', '七', '八'],
      ['七', '八', '九'],
      ['八', '九', '十'],
    ])
  })

  it('句表内没有重复项', () => {
    const keys = SENTENCES.map((sentence) => [...sentence].sort().join(''))
    expect(new Set(keys).size).toBe(SENTENCES.length)
  })

  it('isSentence 接受全部 14 种句（与顺序无关）', () => {
    for (const sentence of SENTENCES) {
      expect(isSentence(sentence), sentence.join('')).toBe(true)
      expect(isSentence([...sentence].reverse()), `${sentence.join('')} 逆序`).toBe(true)
    }
  })

  it('isSentence 拒绝非句组合', () => {
    const rejected: readonly (readonly TileChar[])[] = [
      ['上', '大', '孔'],
      ['上', '大', '人', '可'],
      ['上', '大'],
      ['三', '三', '三'],
      ['上', '上', '大'],
      ['孔', '乙', '三'], // 「孔乙己」是句，「孔乙三」不是
      ['七', '八', '十'], // 七八九 / 八九十 是句，七八十 不是
    ]
    for (const chars of rejected) {
      expect(isSentence(chars), chars.join('')).toBe(false)
    }
  })
})

describe('口与补齐', () => {
  it('【化三】等【千】成「化三千」', () => {
    expect(sentenceCompletions('化', '三')).toEqual(['千'])
  })

  it('【八九】等【子】或【十】，也能等【七】走七八九', () => {
    expect(sentenceCompletions('八', '九').sort()).toEqual(['七', '十', '子'].sort())
  })

  it('【七十】只能等【土】', () => {
    expect(sentenceCompletions('七', '十')).toEqual(['土'])
  })

  it('两张同字不构成句的「口」', () => {
    expect(sentenceCompletions('三', '三')).toEqual([])
    expect(sentenceCompletions('孔', '孔')).toEqual([])
  })

  it('无关的两张牌没有补齐', () => {
    expect(sentenceCompletions('上', '孔')).toEqual([])
    expect(sentenceCompletions('大', '九')).toEqual([])
  })

  it('单张【三】的句搭档是 乙/二/四/五/化/千', () => {
    expect(sentencePartnersOf('三').sort()).toEqual(['乙', '二', '四', '五', '化', '千'].sort())
  })

  it('单张【上】只能搭档 大/人', () => {
    expect(sentencePartnersOf('上').sort()).toEqual(['大', '人'].sort())
  })
})

describe('轮', () => {
  it('轮的中文名与张数', () => {
    expect(MELD_LABEL.sentence).toBe('句')
    expect(MELD_LABEL.pair).toBe('对')
    expect(MELD_LABEL.triplet).toBe('坎')
    expect(MELD_LABEL.zhao).toBe('开招')
    expect(MELD_LABEL.tong).toBe('统')
    expect(MELD_LABEL.fan).toBe('开泛')
  })

  it('对/坎同为 3 张，招/统为 4 张，开泛为 5 张', () => {
    expect(MELD_SIZE.pair).toBe(3)
    expect(MELD_SIZE.triplet).toBe(3)
    expect(MELD_SIZE.zhao).toBe(4)
    expect(MELD_SIZE.tong).toBe(4)
    expect(MELD_SIZE.fan).toBe(5)
  })

  it('张数校验', () => {
    expect(isMeldSizeValid('sentence', 3)).toBe(true)
    expect(isMeldSizeValid('sentence', 4)).toBe(false)
    expect(isMeldSizeValid('fan', 5)).toBe(true)
  })
})
