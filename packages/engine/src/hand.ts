/**
 * 手牌与副露。
 *
 * 手牌一律用**不可变**方式更新（返回新数组），这样状态机可以随时保留历史、
 * 支持 undo 与回放，UI 侧直接比较引用即可判断是否变化。
 *
 * 结构上「暗牌 + 明牌（轮）」就是全部信息；`轮` 的定义见 meld.ts。
 */

import type { Card, TileChar } from './cards'
import type { Meld } from './meld'

export interface Hand {
  /** 手上的暗牌（未成轮的部分）。 */
  readonly concealed: readonly Card[]
  /** 已经成型的轮（含明牌与暗坎）。 */
  readonly melds: readonly Meld[]
}

export function createHand(concealed: readonly Card[] = [], melds: readonly Meld[] = []): Hand {
  return { concealed: [...concealed], melds: [...melds] }
}

/** 字 → 张数，用于胡牌分解与算胡这类计数密集的计算。 */
export function countByChar(cards: readonly Card[]): Map<TileChar, number> {
  const counts = new Map<TileChar, number>()
  for (const card of cards) {
    counts.set(card.char, (counts.get(card.char) ?? 0) + 1)
  }
  return counts
}

export function countOf(cards: readonly Card[], char: TileChar): number {
  let total = 0
  for (const card of cards) {
    if (card.char === char) total += 1
  }
  return total
}

/** 花字张数（算胡时素经 1 胡、花经 2 胡）。 */
export function countFlowerOf(cards: readonly Card[], char: TileChar): number {
  let total = 0
  for (const card of cards) {
    if (card.char === char && card.variant === 'flower') total += 1
  }
  return total
}

export function cardsOfChar(cards: readonly Card[], char: TileChar): Card[] {
  return cards.filter((card) => card.char === char)
}

/** 手上暗牌张数。 */
export function concealedSize(hand: Hand): number {
  return hand.concealed.length
}

/** 暗牌 + 全部轮里的牌。 */
export function totalSize(hand: Hand): number {
  return hand.melds.reduce((sum, meld) => sum + meld.cards.length, concealedSize(hand))
}

/** 移除指定的牌（按 id），返回新数组。找不到的 id 会被忽略。 */
export function removeCards(cards: readonly Card[], removed: readonly Card[]): Card[] {
  const ids = new Set(removed.map((card) => card.id))
  return cards.filter((card) => !ids.has(card.id))
}

export function addCards(cards: readonly Card[], added: readonly Card[]): Card[] {
  return [...cards, ...added]
}

/** 按牌字分组，每组内部保持原顺序。 */
export function groupByChar(cards: readonly Card[]): Map<TileChar, Card[]> {
  const groups = new Map<TileChar, Card[]>()
  for (const card of cards) {
    const group = groups.get(card.char)
    if (group) {
      group.push(card)
    } else {
      groups.set(card.char, [card])
    }
  }
  return groups
}
