/**
 * 人工理牌（编组）模型 —— 纯函数，不碰 DOM。
 *
 * 设计：玩家亲手分的组是一个**有序的「牌 id 组」列表**，其余牌继续走引擎的
 * `arrangeConcealed` 自动编排。这样：
 *   - 玩家不动的部分，自动化永远生效（新摸的牌自动进散张池）
 *   - 摸牌/打牌/副露导致牌离开手牌时，只需要把死 id 剪掉
 *
 * 显示顺序 = 人工组（按玩家排的顺序）+ 自动列。人工组排前面，
 * 因为那是玩家显式表达的意图。
 */

import {
  type Card,
  type Column,
  type ColumnKind,
  type TileChar,
  arrangeConcealed,
  isSentence,
  sentenceCompletions,
} from '@huapai/engine'

/** 人工编组：一串「牌 id 组」，顺序即显示顺序。 */
export type Arrangement = readonly (readonly number[])[]

/** 剪掉已经不在手上的牌；顺手丢掉空组。 */
export function pruneArrangement(
  arrangement: Arrangement,
  hand: readonly Card[],
): number[][] {
  const alive = new Set(hand.map((card) => card.id))
  return arrangement
    .map((group) => group.filter((id) => alive.has(id)))
    .filter((group) => group.length > 0)
}

/** 推断一个人工组看起来像什么（只影响 UI 的列样式与提示）。 */
export function classifyGroup(cards: readonly Card[]): ColumnKind {
  if (cards.length === 0) return 'loose'
  if (cards.length === 1) return 'loose'

  const chars = cards.map((card) => card.char)
  const distinct = new Set(chars)
  if (distinct.size === 1) {
    // 同字：3 张及以上算同字单元，2 张算对
    return cards.length >= 3 ? 'same' : 'pair'
  }
  if (cards.length === 3 && isSentence(chars)) return 'sentence'
  if (cards.length === 2) {
    const a = chars[0]
    const b = chars[1]
    if (a !== undefined && b !== undefined && sentenceCompletions(a, b).length > 0) return 'kou'
  }
  return 'loose'
}

/** 人工组 + 自动列，合成最终要渲染的列。 */
export function buildColumns(hand: readonly Card[], arrangement: Arrangement): Column[] {
  const pruned = pruneArrangement(arrangement, hand)
  const byId = new Map(hand.map((card) => [card.id, card]))
  const grouped = new Set<number>()
  const manual: Column[] = []

  for (const group of pruned) {
    const cards: Card[] = []
    for (const id of group) {
      const card = byId.get(id)
      if (card) cards.push(card)
      grouped.add(id)
    }
    if (cards.length === 0) continue
    manual.push({
      key: `manual:${group.join('-')}`,
      kind: classifyGroup(cards),
      cards,
    })
  }

  const rest = hand.filter((card) => !grouped.has(card.id))
  return [...manual, ...arrangeConcealed(rest)]
}

/**
 * 把 `fromId` 并进 `toId` 所在的那一列（拖到别的牌上）。
 * `toId` 原本是散牌时会为它新建一列。顺序上把 `fromId` 追加到末尾，
 * 于是它成为该列**完整可见**的那一张。
 */
export function mergeCards(
  hand: readonly Card[],
  arrangement: Arrangement,
  fromId: number,
  toId: number,
): number[][] {
  const pruned = pruneArrangement(arrangement, hand)
  if (fromId === toId || !hand.some((card) => card.id === toId)) return pruned
  if (!hand.some((card) => card.id === fromId)) return pruned

  let groups = pruned
    .map((group) => group.filter((id) => id !== fromId))
    .filter((group) => group.length > 0)

  let index = groups.findIndex((group) => group.includes(toId))
  if (index < 0) {
    groups = [...groups, [toId]]
    index = groups.length - 1
  }
  const target = groups[index]
  if (!target) return groups
  groups[index] = [...target, fromId]
  return groups
}

/** 把 `cardId` 从它所在的组里拆出来，回到自动编排（拖到空白处）。 */
export function ungroupCard(
  hand: readonly Card[],
  arrangement: Arrangement,
  cardId: number,
): number[][] {
  return pruneArrangement(arrangement, hand)
    .map((group) => group.filter((id) => id !== cardId))
    .filter((group) => group.length > 0)
}

/** 这张牌现在在不在某个人工组里。 */
export function isGrouped(arrangement: Arrangement, cardId: number): boolean {
  return arrangement.some((group) => group.includes(cardId))
}

/** 供 UI 判断要不要点亮「自动理牌」按钮。 */
export function hasManualGroups(arrangement: Arrangement, hand: readonly Card[]): boolean {
  return pruneArrangement(arrangement, hand).length > 0
}

/** 某个字是否在人工组里（UI 提示用）。 */
export function groupedChars(arrangement: Arrangement, hand: readonly Card[]): Set<TileChar> {
  const byId = new Map(hand.map((card) => [card.id, card]))
  const out = new Set<TileChar>()
  for (const group of pruneArrangement(arrangement, hand)) {
    for (const id of group) {
      const card = byId.get(id)
      if (card) out.add(card.char)
    }
  }
  return out
}
