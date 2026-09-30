/**
 * 手牌分列编排 —— 把一个「列」当作一个「轮」。
 *
 * 花牌的胡牌条件字面就是「8 个轮 + 1 个口」，所以 UI 直接按轮分列显示：
 * **有几列就等于有几个轮**，数牌、找缺口、看听牌都变成一眼的事。
 *
 * 本模块只做**几何无关**的编排（哪些牌归到一列、列的顺序），不涉及任何像素。
 * 列的像素布局由 app 层的 `layoutHand` 负责，两者都是纯函数、都可单测。
 *
 * 编排策略（v1，对应计划书里「无解时的退化路径」）：
 *   1. 同字轮优先：3 张坎 / 4 张统 / 5 张开泛，一个轮只占一列
 *   2. 句：按句表顺序贪心
 *   3. 口：两张能补成一个句
 *   4. 对：两张同字
 *   5. 剩下的散张各自一列
 *
 * 展示顺序与抽取顺序不同：句排在前（按句表），因为句是玩家最常扫的形态。
 * 后续接入 `win.ts` 的最优分解后，本模块会成为「人工覆盖 / 无解」时的回退。
 */

import { type Card, type TileChar, TILE_CHARS, tileIndex } from './cards'
import { SENTENCES, sentenceCompletions } from './meld'

export type ColumnKind =
  | 'sentence' // 句：3 张构成句表中的一个句
  | 'same' // 同字轮：3 张坎 / 4 张统 / 5 张开泛
  | 'kou' // 口：只差 1 张即可成句的 2 张
  | 'pair' // 对：两张同字（等第 3 张）
  | 'loose' // 散张

export interface Column {
  /** 稳定 key（成员牌 id 拼接），供 React 列表复用。 */
  readonly key: string
  readonly kind: ColumnKind
  /**
   * 叠压顺序：`cards[0]` 在最上（最先被压住，只露顶部的「字带」），
   * **最后一张完整可见** —— 就是真花牌竖着拿在手里的样子。
   */
  readonly cards: readonly Card[]
}

/** 把一个字手上剩的张数记成可变池，方便「取走 n 张」。 */
type Pool = Map<TileChar, Card[]>

function buildPool(cards: readonly Card[]): Pool {
  const pool: Pool = new Map()
  for (const card of cards) {
    const group = pool.get(card.char)
    if (group) {
      group.push(card)
    } else {
      pool.set(card.char, [card])
    }
  }
  return pool
}

/**
 * 按「轮」把手牌编排成列。
 *
 * 保证：**所有牌恰好出现一次**，不入不丢（顺序会被重排）。
 */
export function arrangeConcealed(cards: readonly Card[]): Column[] {
  const pool = buildPool(cards)

  const remaining = (char: TileChar): number => pool.get(char)?.length ?? 0
  const take = (char: TileChar, count: number): Card[] => pool.get(char)?.splice(0, count) ?? []
  const column = (kind: ColumnKind, taken: Card[]): Column => ({
    key: taken.map((card) => card.id).join('-'),
    kind,
    cards: taken,
  })

  const sentences: Column[] = []
  const same: Column[] = []
  const kous: Column[] = []
  const pairs: Column[] = []
  const loose: Column[] = []

  // 1) 同字轮：3 张坎 / 4 张统 / 5 张开泛 —— 一个轮只占一列。
  for (const char of TILE_CHARS) {
    const count = remaining(char)
    if (count >= 3) {
      same.push(column('same', take(char, Math.min(count, 5))))
    }
  }

  // 2) 句：按句表顺序贪心，能凑几组凑几组。
  for (const sentence of SENTENCES) {
    while (sentence.every((char) => remaining(char) > 0)) {
      sentences.push(column('sentence', sentence.flatMap((char) => take(char, 1))))
    }
  }

  // 3) 口：两张不同字、且只差 1 张就能成句。
  for (const a of TILE_CHARS) {
    for (const b of TILE_CHARS) {
      if (tileIndex(b) <= tileIndex(a)) continue
      if (sentenceCompletions(a, b).length === 0) continue
      while (remaining(a) > 0 && remaining(b) > 0) {
        kous.push(column('kou', [...take(a, 1), ...take(b, 1)]))
      }
    }
  }

  // 4) 对：剩下的同字成双。
  for (const char of TILE_CHARS) {
    while (remaining(char) >= 2) {
      pairs.push(column('pair', take(char, 2)))
    }
  }

  // 5) 散张：一张一列。
  for (const char of TILE_CHARS) {
    while (remaining(char) > 0) {
      loose.push(column('loose', take(char, 1)))
    }
  }

  return [...sentences, ...same, ...kous, ...pairs, ...loose]
}

/** 列里所有牌（用于校验不丢牌）。 */
export function columnCards(columns: readonly Column[]): Card[] {
  return columns.flatMap((col) => col.cards)
}
