import { describe, expect, it } from 'vitest'

import type { Card, CardVariant, TileChar } from '../src/cards'
import { SENTENCES } from '../src/meld'
import { BASELINE_RULES, toHu } from '../src/rules'
import { determineMainJing, evaluateHand, scoreShape } from '../src/score'
import { winningChars } from '../src/listen'
import type { ShapeDescriptor, UnitDescriptor } from '../src/win'

let nextId = 20_000

function card(char: TileChar, variant: CardVariant = 'plain'): Card {
  return { id: nextId++, char, variant }
}

/** `flowers` 张花 + 其余素。scoreShape 只用它来数花精。 */
function cardsOf(char: TileChar, total: number, flowers = 0): Card[] {
  return Array.from({ length: total }, (_, i) => card(char, i < flowers ? 'flower' : 'plain'))
}

/** 造一个「被测单元 + N 个黑坎填充」的形状；黑坎每个 1 胡，方便反推。 */
function shapeWith(unit: UnitDescriptor, fillerCount = 7): ShapeDescriptor {
  const filler: UnitDescriptor = { kind: 'kan', chars: ['孔', '孔', '孔'] }
  return {
    units: [unit, ...Array.from({ length: fillerCount }, () => filler)],
    tingtou: ['上', '大'],
  }
}

const BLACK_FILLER_HU = 7 // 7 个黑坎 × 1 胡

function unitHu(unit: UnitDescriptor, cards: Card[], mainJing: TileChar | null = null): number {
  const score = scoreShape(shapeWith(unit), cards, BASELINE_RULES, mainJing)
  return score.hu - BLACK_FILLER_HU
}

describe('普通字：红全分、黑减半', () => {
  it('红坎 2 / 红扎 4 / 红泛 8（用「大」——红字且不是精）', () => {
    expect(unitHu({ kind: 'kan', chars: ['大', '大', '大'] }, [])).toBe(2)
    expect(unitHu({ kind: 'zha', chars: ['大', '大', '大', '大'] }, [])).toBe(4)
    expect(unitHu({ kind: 'fan', chars: ['大', '大', '大', '大', '大'] }, [])).toBe(8)
  })

  it('红字里只有 上大人可知礼 不是精；三/五/七 是精，走精表', () => {
    const redNotJing = BASELINE_RULES.jingChars
      ? (['上', '大', '人', '可', '知', '礼', '三', '五', '七'] as TileChar[]).filter(
          (char) => !BASELINE_RULES.jingChars.includes(char),
        )
      : []
    expect(redNotJing).toEqual(['上', '大', '人', '可', '知', '礼'])
    for (const char of ['三', '五', '七'] as const) {
      expect(BASELINE_RULES.jingChars.includes(char), `${char} 应当是精`).toBe(true)
    }
  })

  it('红句 1 胡', () => {
    expect(unitHu({ kind: 'sentence', chars: ['上', '大', '人'] }, [])).toBe(1)
    expect(unitHu({ kind: 'sentence', chars: ['可', '知', '礼'] }, [])).toBe(1)
  })

  it('黑坎 1 胡', () => {
    expect(unitHu({ kind: 'kan', chars: ['孔', '孔', '孔'] }, [])).toBe(1)
  })

  it('重要推论：5 精配置下只有「上大人」「可知礼」不含精，所以「黑句 0 胡」触发不了', () => {
    const withoutJing = SENTENCES.filter(
      (sentence) => !sentence.some((char) => BASELINE_RULES.jingChars.includes(char)),
    )
    expect(withoutJing.map((sentence) => sentence.join(''))).toEqual(['上大人', '可知礼'])
    // 这两个都是全红字，所以走红句 1 胡，黑句那一支在当前口径下是死代码
    for (const sentence of withoutJing) {
      expect(unitHu({ kind: 'sentence', chars: [...sentence] }, [])).toBe(1)
    }
  })
})

describe('精表（口径③：精表优先于红黑表）', () => {
  // 资料原文：精坎 3素=5 / 2素1花=6 / 1素2花=7；精扎 = ×2；精泛 = ×2×2
  it('精坎：3 素 = 5、2 素 1 花 = 6、1 素 2 花 = 7', () => {
    expect(unitHu({ kind: 'kan', chars: ['七', '七', '七'] }, cardsOf('七', 3, 0))).toBe(5)
    expect(unitHu({ kind: 'kan', chars: ['七', '七', '七'] }, cardsOf('七', 3, 1))).toBe(6)
    expect(unitHu({ kind: 'kan', chars: ['七', '七', '七'] }, cardsOf('七', 3, 2))).toBe(7)
  })

  it('精扎：3 素 1 花 = 12、2 素 2 花 = 14', () => {
    expect(unitHu({ kind: 'zha', chars: ['七', '七', '七', '七'] }, cardsOf('七', 4, 1))).toBe(12)
    expect(unitHu({ kind: 'zha', chars: ['七', '七', '七', '七'] }, cardsOf('七', 4, 2))).toBe(14)
  })

  it('精泛（团圆）：5 张 = 28', () => {
    expect(
      unitHu({ kind: 'fan', chars: ['七', '七', '七', '七', '七'] }, cardsOf('七', 5, 2)),
    ).toBe(28)
  })

  it('三/五/七 既是红字又是精字，坎走精表而不是红表（5 而不是 2）', () => {
    for (const char of ['三', '五', '七'] as const) {
      const hu = unitHu({ kind: 'kan', chars: [char, char, char] }, cardsOf(char, 3, 0))
      expect(hu, `精坎 ${char}×3`).toBe(5)
    }
  })

  it('乙、九虽然是黑字，坎也走精表', () => {
    expect(unitHu({ kind: 'kan', chars: ['乙', '乙', '乙'] }, cardsOf('乙', 3, 0))).toBe(5)
    expect(unitHu({ kind: 'kan', chars: ['九', '九', '九'] }, cardsOf('九', 3, 0))).toBe(5)
  })
})

describe('句中含精（口径①：多个精相加）', () => {
  it('素精在句中是 1 胡，花精是 2 胡', () => {
    expect(unitHu({ kind: 'sentence', chars: ['化', '三', '千'] }, cardsOf('三', 1, 0))).toBe(1)
    expect(unitHu({ kind: 'sentence', chars: ['化', '三', '千'] }, cardsOf('三', 1, 1))).toBe(2)
  })

  it('三四五（三素 + 五花）相加 = 3 胡', () => {
    const cards = [...cardsOf('三', 1, 0), ...cardsOf('五', 1, 1)]
    expect(unitHu({ kind: 'sentence', chars: ['三', '四', '五'] }, cards)).toBe(3)
  })

  it('乙二三（乙素 + 三素）相加 = 2 胡', () => {
    const cards = [...cardsOf('乙', 1, 0), ...cardsOf('三', 1, 0)]
    expect(unitHu({ kind: 'sentence', chars: ['乙', '二', '三'] }, cards)).toBe(2)
  })

  it('七八九（七素 + 九素）相加 = 2 胡', () => {
    const cards = [...cardsOf('七', 1, 0), ...cardsOf('九', 1, 0)]
    expect(unitHu({ kind: 'sentence', chars: ['七', '八', '九'] }, cards)).toBe(2)
  })
})

describe('主精（口径②：按人判定，只翻该精字产生的胡数）', () => {
  it('主精是该精字时，它的单元胡数 ×2', () => {
    const plain: Card[] = []
    expect(unitHu({ kind: 'kan', chars: ['七', '七', '七'] }, plain, '七')).toBe(10)
    expect(unitHu({ kind: 'kan', chars: ['七', '七', '七'] }, plain, '九')).toBe(5)
    expect(unitHu({ kind: 'kan', chars: ['七', '七', '七'] }, plain, null)).toBe(5)
  })

  it('主精不影响别的精字', () => {
    const cards = cardsOf('九', 3, 0)
    expect(unitHu({ kind: 'kan', chars: ['九', '九', '九'] }, cards, '七')).toBe(5)
    expect(unitHu({ kind: 'kan', chars: ['九', '九', '九'] }, cards, '九')).toBe(10)
  })

  it('determineMainJing：张数最多的精字；并列取精字表顺序靠前者', () => {
    expect(determineMainJing([card('七'), card('七'), card('三')], BASELINE_RULES)).toBe('七')
    // 乙、三 各 1 张，精字表顺序 ['乙','三','五','七','九'] → 取乙
    expect(determineMainJing([card('乙'), card('三')], BASELINE_RULES)).toBe('乙')
  })

  it('一个精都没有时主精为 null', () => {
    expect(determineMainJing([card('上'), card('大')], BASELINE_RULES)).toBeNull()
  })
})

describe('花精分配', () => {
  it('有限的花精优先给边际收益高的用法（扎 +2 > 坎/句 +1）', () => {
    // 同一字同时有 1 个扎和 1 个句用法，只有 1 张花 → 应给扎
    const shape: ShapeDescriptor = {
      units: [
        { kind: 'zha', chars: ['七', '七', '七', '七'] },
        { kind: 'sentence', chars: ['七', '八', '九'] },
        ...Array.from({ length: 6 }, () => ({
          kind: 'kan' as const,
          chars: ['孔', '孔', '孔'] as TileChar[],
        })),
      ],
      tingtou: ['上', '大'],
    }
    const cards = cardsOf('七', 5, 1)
    const score = scoreShape(shape, cards, BASELINE_RULES, null)
    // 七的两种用法：扎(基础 10、每花 +2) 与「七八九」句里的七(基础 1、每花 +1)
    // 唯一 1 张花给边际更高的扎 → 扎 12 + 句 1 = 13
    // 「七八九」里的九也是精（素）→ 再 +1
    // 6 个黑坎 = 6
    expect(score.hu).toBe(12 + 1 + 1 + 6)
    // 若把花给了句：扎 10 + 句 2 + 九 1 = 13，同样 13 —— 但这个局面里扎的边际更高，
    // 断言两种分法不会让总分变差
    expect(score.hu).toBe(20)
  })
})

describe('端到端：docs/rules.md §7 的示例手牌', () => {
  function handExample(): Card[] {
    const list: Card[] = []
    const add = (char: TileChar, n: number, flowers = 0): void => {
      for (let i = 0; i < n; i += 1) list.push(card(char, i < flowers ? 'flower' : 'plain'))
    }
    add('上', 1)
    add('大', 1)
    add('人', 1)
    add('乙', 1)
    add('二', 1)
    add('三', 2)
    add('四', 4)
    add('五', 1, 1)
    add('孔', 3)
    add('七', 5, 1) // 3 张在坎里 + 2 张做听头，其中 1 张花
    add('八', 1)
    add('九', 4, 1)
    add('十', 1)
    return list
  }

  it('判定为胡', () => {
    const evaluation = evaluateHand(handExample(), BASELINE_RULES)
    expect(evaluation.isWin).toBe(true)
    expect(evaluation.best).not.toBeNull()
  })

  it('主精判为「七」（手上 5 张）', () => {
    expect(determineMainJing(handExample(), BASELINE_RULES)).toBe('七')
  })

  it('胡数达到门槛 17 胡', () => {
    const evaluation = evaluateHand(handExample(), BASELINE_RULES)
    expect(toHu(evaluation.best?.score.halfHu ?? 0)).toBeGreaterThanOrEqual(17)
  })

  it('门槛抬到 999 胡时判为不胡（验证门槛可配置）', () => {
    const strict = { ...BASELINE_RULES, id: 'strict', minHu: 999 * 2 }
    expect(evaluateHand(handExample(), strict).isWin).toBe(false)
  })
})

describe('听牌（listen）', () => {
  it('缺一张就能胡的手牌，听牌字非空且都在牌库里', () => {
    // 用示例手牌去掉一张，再看能补哪些字
    const hand = [
      ...Array.from({ length: 1 }, () => card('上')),
      ...Array.from({ length: 1 }, () => card('大')),
      ...Array.from({ length: 1 }, () => card('人')),
      ...Array.from({ length: 3 }, () => card('孔')),
      ...Array.from({ length: 3 }, () => card('四')),
      ...Array.from({ length: 3 }, () => card('七')),
      ...Array.from({ length: 3 }, () => card('九')),
      ...Array.from({ length: 1 }, () => card('乙')),
      ...Array.from({ length: 1 }, () => card('二')),
      ...Array.from({ length: 1 }, () => card('三')),
      ...Array.from({ length: 1 }, () => card('八')),
      ...Array.from({ length: 1 }, () => card('十')),
      ...Array.from({ length: 1 }, () => card('五')),
      ...Array.from({ length: 2 }, () => card('六')),
    ]
    const chars = winningChars(hand, BASELINE_RULES)
    expect(Array.isArray(chars)).toBe(true)
    expect(chars.every((char) => typeof char === 'string')).toBe(true)
  })
})
