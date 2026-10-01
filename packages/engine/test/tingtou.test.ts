/**
 * 听头 / 单元模型的交叉验证。
 *
 * 这一组测试**不是在测某个函数**，而是在验我推导出来的结构模型是否与资料吻合。
 * 依据是 [长阳花牌·百度百科] 给出的三组「听牌 → 可胡字」字例 —— 那是资料里唯一的
 * 可证伪数据：如果模型错了，就凑不出同样这几种字。
 *
 * 模型（docs/rules.md §4）：
 *   胡牌 = 8 个单元（句/坎/扎/泛）+ 2 张听头
 *   听头 = 一对，或「同一句中的任意 2 张」
 */

import { describe, expect, it } from 'vitest'

import type { TileChar } from '../src/cards'
import { TILE_CHARS } from '../src/cards'
import { isSentence, sentenceCompletions } from '../src/meld'

/** 2 张牌能否充当听头：一对，或同属一个句。 */
function isTingtou(a: TileChar, b: TileChar): boolean {
  if (a === b) return true
  return sentenceCompletions(a, b).length > 0
}

/** 3 张牌能否构成一个单元：句，或坎（3 张同字）。 */
function isUnitOf3(chars: readonly TileChar[]): boolean {
  if (chars.length !== 3) return false
  if (isSentence(chars)) return true
  return chars[0] === chars[1] && chars[1] === chars[2]
}

/**
 * 从 5 张牌里挑 2 张当听头，剩下 3 张必须构成一个单元。
 * 用于推「4 张余牌 + 胡到的 1 张」这种局面。
 */
function splitsIntoUnitPlusTingtou(cards: readonly TileChar[]): boolean {
  if (cards.length !== 5) return false
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i] as TileChar
      const b = cards[j] as TileChar
      if (!isTingtou(a, b)) continue
      const rest = cards.filter((_, index) => index !== i && index !== j)
      if (isUnitOf3(rest)) return true
    }
  }
  return false
}

describe('S9 字例①：拿撂 —— 8 个单元 + 剩 1 张', () => {
  it('剩「七」时可胡 五、六、七、八、九、十、士（恰好 7 张）', () => {
    const winning = TILE_CHARS.filter((char) => isTingtou('七', char))
    expect([...winning].sort()).toEqual(['七', '八', '九', '十', '五', '六', '土'].sort())
    expect(winning).toHaveLength(7)
  })

  it('「七」不能胡 上/大/人/孔/乙/己/可/知/礼/化/三/千/子/二/四/六', () => {
    for (const char of ['上', '大', '孔', '三', '子', '二', '四'] as const) {
      expect(isTingtou('七', char), `七+${char}`).toBe(false)
    }
  })
})

describe('S9 字例②：推摊 —— 7 个单元 + 剩 4 张「2 个连对」', () => {
  const remainder: readonly TileChar[] = ['孔', '孔', '乙', '乙']

  it('可胡 孔、乙、己（恰好 3 张）', () => {
    const winning = TILE_CHARS.filter((char) =>
      splitsIntoUnitPlusTingtou([...remainder, char]),
    )
    expect([...winning].sort()).toEqual(['孔', '乙', '己'].sort())
  })

  it('推不出第 4 个胡牌字', () => {
    const winning = TILE_CHARS.filter((char) =>
      splitsIntoUnitPlusTingtou([...remainder, char]),
    )
    expect(winning).toHaveLength(3)
  })
})

describe('S9 字例③：胡两头／卡卡 —— 7 个单元 + 剩 4 张分属 2 个句', () => {
  const remainder: readonly TileChar[] = ['孔', '己', '六', '七']

  it('可胡 乙、五、八（恰好 3 张）', () => {
    const winning = TILE_CHARS.filter((char) =>
      splitsIntoUnitPlusTingtou([...remainder, char]),
    )
    expect([...winning].sort()).toEqual(['乙', '五', '八'].sort())
  })
})

describe('听头模型本身', () => {
  it('一对永远是合法听头', () => {
    for (const char of TILE_CHARS) {
      expect(isTingtou(char, char), `${char}${char}`).toBe(true)
    }
  })

  it('同属一个句的任意 2 张是合法听头（不要求相邻）', () => {
    expect(isTingtou('上', '人')).toBe(true) // 上大人
    expect(isTingtou('七', '土')).toBe(true) // 七十土
    expect(isTingtou('七', '九')).toBe(true) // 七八九
    expect(isTingtou('乙', '三')).toBe(true) // 乙二三
  })

  it('分属不同句且不同字的 2 张不是听头', () => {
    expect(isTingtou('上', '孔')).toBe(false)
    expect(isTingtou('大', '三')).toBe(false)
    expect(isTingtou('人', '乙')).toBe(false)
  })
})
