/**
 * 人工理牌：**固定 8 列**模型（纯函数，不碰 DOM）。
 *
 * 为什么从「自由分组」改成固定 8 列：
 *   以前是「人工组 + 引擎自动列」混排，拖一张牌会让**自动那部分重新推导**，
 *   于是旁边的列看起来像被换掉了 —— 用户报的「拖过去变成交换」就是这个。
 *   固定 8 列之后，一次拖拽只动两列，其余原地不动，行为可预测。
 *
 * 8 这个数字不是随便定的：胡牌条件就是「8 个单元 + 2 张听头」，所以 8 列天然
 * 对应「离胡牌还差几列」。
 */

import {
  type Card,
  type Column,
  type ColumnKind,
  arrangeConcealed,
  isSentence,
  sentenceCompletions,
} from '@huapai/engine'

/** 手牌固定列数。 */
export const HAND_SLOTS = 8

/** 编组：8 个槽位，每个槽位是一串牌 id。 */
export type Arrangement = readonly (readonly number[])[]

export function createSlots(): number[][] {
  return Array.from({ length: HAND_SLOTS }, () => [])
}

/** 推断一个槽位里的牌看起来像什么（只影响列样式）。 */
export function classifyGroup(cards: readonly Card[]): ColumnKind {
  if (cards.length === 0) return 'loose'
  if (cards.length === 1) return 'loose'

  const chars = cards.map((card) => card.char)
  if (new Set(chars).size === 1) return cards.length >= 3 ? 'same' : 'pair'
  if (cards.length === 3 && isSentence(chars)) return 'sentence'
  if (cards.length === 2) {
    const a = chars[0]
    const b = chars[1]
    if (a !== undefined && b !== undefined && sentenceCompletions(a, b).length > 0) return 'kou'
  }
  return 'loose'
}

/**
 * 把任意形状的编组规整成**恰好 8 列**：
 *   1. 按顺序采纳玩家已经分好的部分（死牌丢弃）
 *   2. 剩下没人管的牌，逐张放进「当前最空」的那一列
 *
 * 第 2 步用「最空优先」而不是「塞最后一列」，是为了稳定：
 * 摸进一张新牌只会让**一列**变长，不会让整手牌重排。
 */
function packGroups(hand: readonly Card[], groups: Arrangement): number[][] {
  const alive = new Set(hand.map((card) => card.id))
  const slots = createSlots()
  const placed = new Set<number>()

  const limit = Math.min(groups.length, HAND_SLOTS)
  for (let index = 0; index < limit; index += 1) {
    for (const id of groups[index] ?? []) {
      if (!alive.has(id) || placed.has(id)) continue
      slots[index]?.push(id)
      placed.add(id)
    }
  }

  for (const card of hand) {
    if (placed.has(card.id)) continue
    let target = 0
    for (let index = 1; index < HAND_SLOTS; index += 1) {
      const current = slots[index]?.length ?? 0
      const best = slots[target]?.length ?? 0
      if (current < best) target = index
    }
    slots[target]?.push(card.id)
    placed.add(card.id)
  }

  return slots
}

/** 把任意编组规整成恰好 8 列。 */
export function normalizeSlots(
  hand: readonly Card[],
  arrangement: Arrangement = [],
): number[][] {
  return packGroups(hand, arrangement)
}

/**
 * 当前**实际生效**的 8 列。
 *
 * 约定：编组为空 = 玩家没手工理过牌 = 用引擎的语义分组（句/对/坎…）。
 * 所有读取与移动都必须走这个函数，否则「空编组」会被当成「随便填」，
 * 手工拖一次就会把整手牌的基准换掉。
 */
export function effectiveSlots(
  hand: readonly Card[],
  arrangement: Arrangement = [],
): number[][] {
  return arrangement.length === 0 ? autoSlots(hand) : packGroups(hand, arrangement)
}

/** 生成要渲染的 8 列。**空列也会保留**，这样它仍然是可拖拽的落点。 */
export function buildColumns(hand: readonly Card[], arrangement: Arrangement = []): Column[] {
  const byId = new Map(hand.map((card) => [card.id, card]))
  const slots = effectiveSlots(hand, arrangement)

  return slots.map((ids, index) => {
    const cards = ids
      .map((id) => byId.get(id))
      .filter((card): card is Card => card !== undefined)
    return {
      // key 用槽位序号而不是牌 id：牌在列间移动时 DOM 节点保持稳定
      key: `slot-${index}`,
      kind: classifyGroup(cards),
      cards,
    }
  })
}

/** 这张牌现在在第几列。 */
export function slotIndexOf(
  hand: readonly Card[],
  arrangement: Arrangement,
  cardId: number,
): number {
  const slots = effectiveSlots(hand, arrangement)
  return slots.findIndex((ids) => ids.includes(cardId))
}

/**
 * 把 `cardId` **移动**到 `targetSlot`（追加到该列末尾）。
 *
 * 注意是「移动」不是「交换」：源列少一张、目标列多一张，其它列完全不动。
 * 这正是之前行为不对的地方。
 */
export function moveCardToSlot(
  hand: readonly Card[],
  arrangement: Arrangement,
  cardId: number,
  targetSlot: number,
): number[][] {
  if (targetSlot < 0 || targetSlot >= HAND_SLOTS) return effectiveSlots(hand, arrangement)
  const slots = effectiveSlots(hand, arrangement)
  if (slots[targetSlot]?.includes(cardId)) return slots

  for (const slot of slots) {
    const index = slot.indexOf(cardId)
    if (index >= 0) slot.splice(index, 1)
  }
  slots[targetSlot]?.push(cardId)
  return slots
}

/**
 * 一键自动理牌：用引擎的语义分组（句/对/坎…）去填这 8 列。
 * 语义组多于 8 个时，多出来的牌交给 `normalizeSlots` 的最空优先规则。
 */
export function autoSlots(hand: readonly Card[]): number[][] {
  const groups = arrangeConcealed(hand).map((column) => column.cards.map((card) => card.id))
  return packGroups(hand, groups)
}

/** 玩家是不是没手工理过牌（决定「自动理牌」按钮要不要点亮）。 */
export function isAutoArrangement(hand: readonly Card[], arrangement: Arrangement): boolean {
  if (arrangement.length === 0) return true
  return isSameSlots(effectiveSlots(hand, arrangement), autoSlots(hand))
}

function isSameSlots(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): boolean {
  if (a.length !== b.length) return false
  return a.every((ids, index) => {
    const other = b[index] ?? []
    return ids.length === other.length && ids.every((id) => other.includes(id))
  })
}
