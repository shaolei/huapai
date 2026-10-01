/**
 * AI 的估值启发式。
 *
 * 注意这是**启发式**，不是求解器：花牌的「8 单元 + 2 听头 + ≥17 胡」组合空间很大，
 * 一期不做完全搜索。目标是三档难度有**可测量的强弱差**，而不是打出最优解。
 *
 * 两个核心量：
 *  - `handProgress`：把手牌贪心拆成单元，量出「离胡牌还差多远」+ 已有胡数
 *  - `dangerOf`   ：这张牌打出去，大概有多容易被别人吃胡
 */

import { type Card, type TileChar, TILE_CHARS, tileIndex } from '../cards'
import type { GameState } from '../game'
import type { RuleSet } from '../rules'
import { scoreUnits } from '../score'
import { activeSentences, isTingtou, type UnitDescriptor } from '../win'

export interface HandProgress {
  /** 贪心拆出来的单元（句/坎/扎/泛）。 */
  readonly units: readonly UnitDescriptor[]
  /** 找到的听头 2 张；没有则为 `null`。 */
  readonly tingtou: readonly [TileChar, TileChar] | null
  /** 剩下没归入任何单元、也没进听头的散张。 */
  readonly loose: readonly TileChar[]
  /** 已成型单元的胡数。 */
  readonly hu: number
  /** 综合评分，越大越好。 */
  readonly score: number
}

type ExtractMode = 'sameFirst' | 'kanFirst'

/**
 * 一种贪心拆法。
 *
 * - `sameFirst`：先把同字 3/4/5 张全部抽成坎/扎/泛，再抽句。
 *   对「有真扎/泛」的手牌最合适（4 张同字会老实变成一个扎）。
 * - `kanFirst`：每个字只先抽 3 张坎，把余牌留给句，再抽句。
 *   对「需要拆开同字去凑句」的手牌更合适 ——
 *   例如一手真能胡的牌，若先把 5 张七当泛，就会把八九喂不饱、永远少两个单元。
 *
 * 两种拆法各有盲区，所以 `handProgress` 两个都跑，取评分高的那个。
 */
function extractOnce(
  cards: readonly Card[],
  ruleSet: RuleSet,
  mainJing: TileChar | null,
  mode: ExtractMode,
): HandProgress {
  const counts = new Map<TileChar, number>()
  for (const card of cards) {
    counts.set(card.char, (counts.get(card.char) ?? 0) + 1)
  }
  const left = (char: TileChar): number => counts.get(char) ?? 0
  const take = (char: TileChar, count: number): void => {
    counts.set(char, left(char) - count)
  }

  const units: UnitDescriptor[] = []
  const addSameUnit = (char: TileChar, size: number): void => {
    units.push({
      kind: size === 3 ? 'kan' : size === 4 ? 'zha' : 'fan',
      chars: new Array<TileChar>(size).fill(char),
    })
    take(char, size)
  }

  // 1) 同字单元
  for (const char of TILE_CHARS) {
    const count = left(char)
    if (count < 3) continue
    addSameUnit(char, mode === 'kanFirst' ? 3 : Math.min(count, 5))
  }

  // 2) 句
  for (const sentence of activeSentences(ruleSet)) {
    while (sentence.every((char) => left(char) > 0)) {
      for (const char of sentence) take(char, 1)
      units.push({ kind: 'sentence', chars: [...sentence] })
    }
  }

  // 3) 听头：优先对子，其次同属一个句的两张
  let tingtou: [TileChar, TileChar] | null = null
  outer: for (let i = 0; i < TILE_CHARS.length; i += 1) {
    const a = TILE_CHARS[i] as TileChar
    if (left(a) === 0) continue
    for (let j = i; j < TILE_CHARS.length; j += 1) {
      const b = TILE_CHARS[j] as TileChar
      if (left(b) === 0) continue
      if (left(b) < (a === b ? 2 : 1)) continue
      if (!isTingtou(a, b, ruleSet)) continue
      tingtou = [a, b]
      take(a, 1)
      take(b, 1)
      break outer
    }
  }

  const loose: TileChar[] = []
  for (const char of TILE_CHARS) {
    for (let i = 0; i < left(char); i += 1) loose.push(char)
  }

  const hu = scoreUnits(units, cards, ruleSet, mainJing).hu
  // 单元数是主导项（8 个单元 + 2 听头才叫胡）；散张越少越好；
  // 胡数只作次要项 —— 门槛是硬性的 17 胡，但先得把结构凑出来。
  const score =
    Math.min(units.length, 8) * 1000 + (tingtou ? 300 : 0) + Math.min(hu, 250) - loose.length * 2

  return { units, tingtou, loose, hu, score }
}

/**
 * 贪心拆解手牌并打分（两种拆法取优）。
 *
 * 这是启发式而非求解器：花牌「8 单元 + 2 听头」的组合空间不小，
 * 一期用两个互补的贪心拆法覆盖常见形状，够 AI 拉开难度差。
 */
export function handProgress(
  cards: readonly Card[],
  ruleSet: RuleSet,
  mainJing: TileChar | null,
): HandProgress {
  const sameFirst = extractOnce(cards, ruleSet, mainJing, 'sameFirst')
  const kanFirst = extractOnce(cards, ruleSet, mainJing, 'kanFirst')
  return sameFirst.score >= kanFirst.score ? sameFirst : kanFirst
}

/**
 * 打出这张牌有多危险（越大越容易被吃胡）。
 *
 * 启发式依据：
 *  - 对手已经把这个字收进副露 → 极危险
 *  - 这个字在场上现得越多 → 别人手里越少 → 越安全
 *  - 精字大家都留 → 略危险
 *  - 牌墙越浅，对手越可能已经听牌 → 整体放大
 */
export function dangerOf(state: GameState, self: number, card: Card): number {
  let danger = 0

  for (const player of state.players) {
    if (player.seat === self) continue
    for (const meld of player.melds) {
      if (meld.char !== card.char) continue
      // 对手已亮出 3 张 → 他大概率在等这个字；已 4/5 张则他已经成型，反而不用等
      danger += meld.cards.length >= 4 ? 12 : 26
    }
  }

  let visible = 0
  for (const record of state.discards) {
    if (record.card.char === card.char) visible += 1
  }
  for (const player of state.players) {
    for (const meld of player.melds) {
      for (const meldCard of meld.cards) {
        if (meldCard.char === card.char) visible += 1
      }
    }
  }
  danger -= visible * 6

  if (state.ruleSet.jingChars.includes(card.char)) danger += 8

  const spent = Math.max(0, 34 - state.wall.length)
  const stage = 1 + (spent / 34) * 1.5
  return danger * stage
}

/** 去掉某张牌之后的手牌（用于评估「打这张会怎样」）。 */
export function withoutCard(cards: readonly Card[], cardId: number): Card[] {
  return cards.filter((card) => card.id !== cardId)
}

/** 字的下标，用于稳定排序。 */
export function charOrder(char: TileChar): number {
  return tileIndex(char)
}
