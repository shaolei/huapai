/**
 * 算胡。
 *
 * 依据 [长阳花牌·百度百科] 与四项已拍板口径（docs/rules.md §9）：
 *  - ① 一个句含多个精 → **相加**（三四五：素三 1 + 花五 2 = 3 胡）
 *  - ② 主精**每位玩家各自判定**，×2 只作用于**该精字产生**的胡数
 *  - ③ 精表优先：三/五/七 的坎扎泛走精表，不走红黑表
 *  - ④ 听头不计胡
 *
 * 精的规律（在资料给的数字上归纳出来的统一式，逐项验证过）：
 *
 *     精单元胡数 = (5 + 花数) × 2^(张数 − 3)
 *
 *   坎 3 素 = 5×1 = 5；2 素 1 花 = 6；1 素 2 花 = 7
 *   扎 3 素 1 花 = 6×2 = 12；2 素 2 花 = 7×2 = 14
 *   泛 3 素 2 花 = 7×2×2 = 28
 */

import { type Card, type TileChar, isRedChar } from './cards'
import { countFlowerOf } from './hand'
import { SCORE_KEYS, type RuleSet, toHalfHu, toHu } from './rules'
import { UNIT_LABEL, decompose, type ShapeDescriptor, type UnitKind } from './win'

/** 单元种类 → 计分表键（句单独走精/红黑逻辑）。 */
const UNIT_SCORE_KEY: Readonly<Record<Exclude<UnitKind, 'sentence'>, 'triplet' | 'zhao' | 'fan'>> =
  {
    kan: 'triplet',
    zha: 'zhao',
    fan: 'fan',
  }

export interface ScoreItem {
  readonly label: string
  readonly hu: number
}

export interface ScoreResult {
  /** 总胡数（整数；资料里所有项都是整数胡）。 */
  readonly hu: number
  /** 半胡单位，供引擎内部比较门槛（避免浮点）。 */
  readonly halfHu: number
  readonly items: readonly ScoreItem[]
}

/** 一个精字在某个单元上的一次「用法」，用于把有限的花精分配出去。 */
interface JingUsage {
  readonly label: string
  readonly base: number
  readonly marginal: number
  readonly capacity: number
}

/**
 * 给一个已确定的分解算胡。
 *
 * @param mainJing 该玩家的主精（`null` = 不启用）；口径②是按人判定，所以由调用方传入。
 */
export function scoreShape(
  shape: ShapeDescriptor,
  cards: readonly Card[],
  ruleSet: RuleSet,
  mainJing: TileChar | null,
): ScoreResult {
  const items: ScoreItem[] = []
  const jingUsages = new Map<TileChar, JingUsage[]>()
  let hu = 0

  const addJingUsage = (char: TileChar, usage: JingUsage): void => {
    const list = jingUsages.get(char)
    if (list) {
      list.push(usage)
    } else {
      jingUsages.set(char, [usage])
    }
  }

  for (const unit of shape.units) {
    if (unit.kind === 'sentence') {
      const jings = unit.chars.filter((char) => ruleSet.jingChars.includes(char))
      if (jings.length === 0) {
        const red = unit.chars.every(isRedChar)
        const value = toHu(red ? ruleSet.score.redSentence : ruleSet.score.blackSentence)
        hu += value
        items.push({ label: `句 ${unit.chars.join('')}`, hu: value })
      } else {
        // 口径①：句里几个精就加几次（三四五 = 三 + 五）
        for (const char of jings) {
          addJingUsage(char, {
            label: `句 ${unit.chars.join('')}·精${char}`,
            base: toHu(ruleSet.jingPlainHu),
            marginal: toHu(ruleSet.jingFlowerHu) - toHu(ruleSet.jingPlainHu),
            capacity: 1,
          })
        }
      }
      continue
    }

    const char = unit.chars[0] as TileChar
    const size = unit.chars.length
    if (ruleSet.jingChars.includes(char)) {
      // 口径③：精表优先
      const mult = ruleSet.jingUnitSizeMultiplier ** (size - 3)
      addJingUsage(char, {
        label: `${UNIT_LABEL[unit.kind]} ${char}×${size}`,
        base: ruleSet.jingUnitBaseHu * mult,
        marginal: ruleSet.jingFlowerStepHu * mult,
        capacity: size,
      })
    } else {
      const key = SCORE_KEYS[UNIT_SCORE_KEY[unit.kind]][isRedChar(char) ? 'red' : 'black']
      const value = toHu(ruleSet.score[key])
      hu += value
      items.push({ label: `${UNIT_LABEL[unit.kind]} ${char}×${size}`, hu: value })
    }
  }

  // 分花精：每个精字各自独立；边际收益高的先用（扎 +2 > 坎/句 +1）。
  // 排在后面的用法就是把剩余的花精吃进听头 —— 口径④不计胡。
  for (const [char, usages] of jingUsages) {
    const available = countFlowerOf(cards, char)
    const sorted = [...usages].sort((a, b) => b.marginal - a.marginal)
    const mainMultiplier = mainJing === char ? ruleSet.mainJingMultiplier : 1
    let left = available
    for (const usage of sorted) {
      const taken = Math.min(left, usage.capacity)
      left -= taken
      const value = (usage.base + taken * usage.marginal) * mainMultiplier
      hu += value
      items.push({ label: taken > 0 ? `${usage.label}·花${taken}` : usage.label, hu: value })
    }
  }

  return { hu, halfHu: toHalfHu(hu), items }
}

/**
 * 判定某位玩家的主精：该玩家手上张数最多的精字；并列取「精字表顺序」靠前者。
 * 一个精都没有则返回 `null`。
 */
export function determineMainJing(cards: readonly Card[], ruleSet: RuleSet): TileChar | null {
  if (ruleSet.mainJingMode === 'none') return null
  let best: TileChar | null = null
  let bestCount = 0
  for (const char of ruleSet.jingChars) {
    let count = 0
    for (const card of cards) {
      if (card.char === char) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      best = char
    }
  }
  return best
}

export interface HandEvaluation {
  readonly isWin: boolean
  /** 胡数最大的那个分解；结构不成立时为 `null`。 */
  readonly best: { readonly shape: ShapeDescriptor; readonly score: ScoreResult } | null
  readonly mainJing: TileChar | null
}

/**
 * 完整判定：结构（8 单元 + 2 听头）+ 门槛（≥ `ruleSet.minHu`）。
 *
 * @param mainJingOverride 指定主精；不传则按口径②自动判定。
 */
export function evaluateHand(
  cards: readonly Card[],
  ruleSet: RuleSet,
  mainJingOverride?: TileChar | null,
): HandEvaluation {
  const mainJing =
    mainJingOverride === undefined ? determineMainJing(cards, ruleSet) : mainJingOverride

  let best: HandEvaluation['best'] = null
  for (const shape of decompose(cards, ruleSet)) {
    const score = scoreShape(shape, cards, ruleSet, mainJing)
    if (!best || score.halfHu > best.score.halfHu) {
      best = { shape, score }
    }
  }

  const isWin = best !== null && best.score.halfHu >= ruleSet.minHu
  return { isWin, best, mainJing }
}
