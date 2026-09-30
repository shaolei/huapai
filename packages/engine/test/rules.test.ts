import { describe, expect, it } from 'vitest'

import {
  BASELINE_RULES,
  FIXED_SENTENCE_ONLY_RULES,
  PRESET_RULESETS,
  SCORE_KEYS,
  THREE_JING_RULES,
  YICHANG_RULES,
  findRuleSet,
  isJing,
  toHalfHu,
  toHu,
} from '../src/rules'

describe('半胡单位换算', () => {
  it('1 胡 = 2 半胡', () => {
    expect(toHalfHu(1)).toBe(2)
    expect(toHalfHu(17)).toBe(34)
    expect(toHu(34)).toBe(17)
  })

  it('不会引入浮点误差', () => {
    expect(toHu(toHalfHu(17))).toBe(17)
    expect(toHu(toHalfHu(0.5))).toBe(0.5)
    expect(Number.isInteger(BASELINE_RULES.minHu)).toBe(true)
  })
})

describe('基线 RuleSet', () => {
  it('三人局：25 张手牌、庄 26 张', () => {
    expect(BASELINE_RULES.playerCount).toBe(3)
    expect(BASELINE_RULES.handSize).toBe(25)
    expect(BASELINE_RULES.dealerHandSize).toBe(26)
  })

  it('门槛 17 胡，且默认不启用宜昌档位', () => {
    expect(toHu(BASELINE_RULES.minHu)).toBe(17)
    expect(BASELINE_RULES.yichangTiers).toBe(false)
  })

  it('经取 5 条（乙三五七九），主经为「三」且 ×2', () => {
    expect(BASELINE_RULES.jingChars).toEqual(['乙', '三', '五', '七', '九'])
    expect(BASELINE_RULES.mainJing).toBe('三')
    expect(BASELINE_RULES.mainJingMultiplier).toBe(2)
  })

  it('操作优先级为 胡 > 绍 > 开招 > 统 > 对', () => {
    expect(BASELINE_RULES.priority).toEqual(['hu', 'shao', 'zhao', 'tong', 'dui'])
  })

  it('黄三盘、不罚分、绍牌绝对优先、自摸两家伙', () => {
    expect(BASELINE_RULES.maxDealerRepeats).toBe(3)
    expect(BASELINE_RULES.drawPenalty).toBe(false)
    expect(BASELINE_RULES.shaoBeatsAll).toBe(true)
    expect(BASELINE_RULES.selfDrawBothPay).toBe(true)
  })
})

describe('计分表', () => {
  it('红字全分：句 1 / 对 1 / 坎 2 / 招统 4 / 开泛 8', () => {
    expect(toHu(BASELINE_RULES.score.redSentence)).toBe(1)
    expect(toHu(BASELINE_RULES.score.redPair)).toBe(1)
    expect(toHu(BASELINE_RULES.score.redTriplet)).toBe(2)
    expect(toHu(BASELINE_RULES.score.redZhao)).toBe(4)
    expect(toHu(BASELINE_RULES.score.redTong)).toBe(4)
    expect(toHu(BASELINE_RULES.score.redFan)).toBe(8)
  })

  it('黑字减半：黑句与黑对子为 0 胡，黑坎 1 / 黑招统 2 / 黑开泛 4', () => {
    expect(toHu(BASELINE_RULES.score.blackSentence)).toBe(0)
    expect(toHu(BASELINE_RULES.score.blackPair)).toBe(0)
    expect(toHu(BASELINE_RULES.score.blackTriplet)).toBe(1)
    expect(toHu(BASELINE_RULES.score.blackZhao)).toBe(2)
    expect(toHu(BASELINE_RULES.score.blackTong)).toBe(2)
    expect(toHu(BASELINE_RULES.score.blackFan)).toBe(4)
  })

  it('每一格都是整数半胡（避免浮点）', () => {
    for (const value of Object.values(BASELINE_RULES.score)) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('SCORE_KEYS 覆盖全部轮型 × 红黑', () => {
    const keys = Object.values(SCORE_KEYS).flatMap((entry) => [entry.red, entry.black])
    expect(new Set(keys).size).toBe(12)
    for (const key of keys) {
      expect(BASELINE_RULES.score[key]).toBeTypeOf('number')
    }
  })
})

describe('预设变体', () => {
  it('宜昌档：门槛 21 胡并启用 11/21/42 三档', () => {
    expect(toHu(YICHANG_RULES.minHu)).toBe(21)
    expect(YICHANG_RULES.yichangTiers).toBe(true)
    expect(YICHANG_RULES.thresholdTiers.map(toHu)).toEqual([11, 21, 42])
  })

  it('仅固定句变体：关闭数序句，其余与基线一致', () => {
    expect(FIXED_SENTENCE_ONLY_RULES.includeNumericSentences).toBe(false)
    expect(FIXED_SENTENCE_ONLY_RULES.minHu).toBe(BASELINE_RULES.minHu)
  })

  it('经取 3 条变体', () => {
    expect(THREE_JING_RULES.jingChars).toEqual(['三', '五', '七'])
  })

  it('预设 id 唯一且可查找', () => {
    const ids = PRESET_RULESETS.map((ruleSet) => ruleSet.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findRuleSet('yichang-3p')).toBe(YICHANG_RULES)
    expect(findRuleSet('nope')).toBeUndefined()
  })

  it('变体只覆盖自己的开关，不污染基线', () => {
    expect(BASELINE_RULES.minHu).toBe(toHalfHu(17))
    expect(BASELINE_RULES.jingChars).toHaveLength(5)
    expect(YICHANG_RULES.id).not.toBe(BASELINE_RULES.id)
  })
})

describe('经判定', () => {
  it('基线：乙三五七九是经，其余不是', () => {
    for (const char of ['乙', '三', '五', '七', '九'] as const) {
      expect(isJing(char, BASELINE_RULES), `「${char}」`).toBe(true)
    }
    for (const char of ['上', '大', '二', '四', '六', '八', '十'] as const) {
      expect(isJing(char, BASELINE_RULES), `「${char}」`).toBe(false)
    }
  })

  it('3 条变体下乙、九不再算经', () => {
    expect(isJing('乙', THREE_JING_RULES)).toBe(false)
    expect(isJing('九', THREE_JING_RULES)).toBe(false)
    expect(isJing('三', THREE_JING_RULES)).toBe(true)
  })
})
