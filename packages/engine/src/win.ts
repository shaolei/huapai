/**
 * 胡牌分解器。
 *
 * 结构（docs/rules.md §4）：
 *
 *     胡牌 = 8 个单元（句 / 坎 / 扎 / 泛）+ 2 张听头
 *
 * 每个单元在「位置」上恒占 3 张 —— 扎 4 张、泛 5 张多出来的部分由补张换回，
 * 所以单元数恒为 8，实体张数 = 26 + 扎/招数 + 2 × 泛数。
 *
 * 听头 = 一对，或「同一句中的任意 2 张」（不要求相邻）。
 *
 * 实现要点：
 *  - **花/素不影响结构**，所以搜索状态只需要 22 个「字 → 张数」计数，搜索空间极小。
 *  - 每次取「第一个还有剩牌的字」，穷举它所能参与的全部单元形态（坎/扎/泛 + 含它的每个句），
 *    因此不会漏解。
 *  - 记忆化只记「失败状态」，用于剪枝；成功状态要全部收集，因为算胡要取最大。
 */

import { type Card, type TileChar, TILE_CHARS, tileIndex } from './cards'
import { SENTENCES } from './meld'
import type { RuleSet } from './rules'

export type UnitKind = 'sentence' | 'kan' | 'zha' | 'fan'

export const UNIT_SIZE: Readonly<Record<UnitKind, number>> = {
  sentence: 3,
  kan: 3,
  zha: 4,
  fan: 5,
}

export const UNIT_LABEL: Readonly<Record<UnitKind, string>> = {
  sentence: '句',
  kan: '坎',
  zha: '扎',
  fan: '泛',
}

/** 胡牌固定 8 个单元。 */
export const UNITS_PER_HAND = 8
/** 听头固定 2 张。 */
export const TINGTOU_SIZE = 2
/** 同字单元的三种形态。 */
const SAME_CHAR_UNITS: readonly (readonly [UnitKind, number])[] = [
  ['kan', 3],
  ['zha', 4],
  ['fan', 5],
]

const CHAR_COUNT = TILE_CHARS.length

export interface UnitDescriptor {
  readonly kind: UnitKind
  /** 句为 3 个字；坎/扎/泛为同一个字重复（长度等于张数）。 */
  readonly chars: readonly TileChar[]
}

export interface ShapeDescriptor {
  readonly units: readonly UnitDescriptor[]
  /** 听头：一对，或同属一个句的 2 张。 */
  readonly tingtou: readonly [TileChar, TileChar]
}

/** 当前规则集下生效的句表（拍板项①：是否含数序句）。 */
export function activeSentences(ruleSet: RuleSet): readonly (readonly TileChar[])[] {
  return ruleSet.includeNumericSentences ? SENTENCES : SENTENCES.slice(0, 6)
}

/** 字 → 该字所参与的句（用字表示，避免下标换算）。 */
function sentencesByChar(
  sentences: readonly (readonly TileChar[])[],
): ReadonlyMap<TileChar, readonly (readonly TileChar[])[]> {
  const map = new Map<TileChar, (readonly TileChar[])[]>()
  for (const sentence of sentences) {
    for (const char of sentence) {
      const list = map.get(char)
      if (list) {
        list.push(sentence)
      } else {
        map.set(char, [sentence])
      }
    }
  }
  return map
}

/** 22 个字 → 张数。 */
export function countTiles(cards: readonly Card[]): number[] {
  const counts = new Array<number>(CHAR_COUNT).fill(0)
  for (const card of cards) {
    const index = tileIndex(card.char)
    counts[index] = (counts[index] ?? 0) + 1
  }
  return counts
}

/** 2 张牌能否充当听头：一对，或同属一个句。 */
export function isTingtou(a: TileChar, b: TileChar, ruleSet: RuleSet): boolean {
  if (a === b) return true
  return activeSentences(ruleSet).some(
    (sentence) => sentence.includes(a) && sentence.includes(b),
  )
}

/** 一手牌所有可能的听头 2 张组合（去重）。 */
export function tingtouCandidates(
  cards: readonly Card[],
  ruleSet: RuleSet,
): [TileChar, TileChar][] {
  const counts = countTiles(cards)
  const out: [TileChar, TileChar][] = []
  for (let a = 0; a < CHAR_COUNT; a += 1) {
    const charA = TILE_CHARS[a] as TileChar
    if ((counts[a] ?? 0) === 0) continue
    if ((counts[a] ?? 0) >= 2) out.push([charA, charA])
    for (let b = a + 1; b < CHAR_COUNT; b += 1) {
      if ((counts[b] ?? 0) === 0) continue
      const charB = TILE_CHARS[b] as TileChar
      if (isTingtou(charA, charB, ruleSet)) out.push([charA, charB])
    }
  }
  return out
}

/**
 * 把 `counts` 恰好拆成 `unitsLeft` 个单元。
 * 每找到一个解就交给 `onShape`；`onShape` 返回 `true` 表示提前停止（判胡用）。
 */
function searchUnits(
  counts: readonly number[],
  unitsLeft: number,
  byChar: ReadonlyMap<TileChar, readonly (readonly TileChar[])[]>,
  acc: UnitDescriptor[],
  onShape: (units: readonly UnitDescriptor[]) => boolean,
  failed: Set<string>,
): boolean {
  // 找第一个还有剩牌的字
  let index = -1
  for (let i = 0; i < CHAR_COUNT; i += 1) {
    if ((counts[i] ?? 0) > 0) {
      index = i
      break
    }
  }

  if (index < 0) {
    // 牌用完：单元数必须刚好用完
    return unitsLeft === 0 ? onShape(acc) : false
  }
  if (unitsLeft === 0) return false

  const memoKey = `${counts.join('')}|${unitsLeft}`
  if (failed.has(memoKey)) return false

  const char = TILE_CHARS[index] as TileChar

  const branch = (nextCounts: number[], unit: UnitDescriptor): boolean => {
    acc.push(unit)
    const stop = searchUnits(nextCounts, unitsLeft - 1, byChar, acc, onShape, failed)
    acc.pop()
    return stop
  }

  // 1) 同字单元：坎 / 扎 / 泛
  for (const [kind, size] of SAME_CHAR_UNITS) {
    if ((counts[index] ?? 0) < size) continue
    const next = [...counts]
    next[index] = (next[index] ?? 0) - size
    const chars = new Array<TileChar>(size).fill(char)
    if (branch(next, { kind, chars })) return true
  }

  // 2) 句：含该字的每一个句，各取 1 张
  for (const sentence of byChar.get(char) ?? []) {
    if (!sentence.every((c) => (counts[tileIndex(c)] ?? 0) > 0)) continue
    const next = [...counts]
    for (const c of sentence) {
      const i = tileIndex(c)
      next[i] = (next[i] ?? 0) - 1
    }
    if (branch(next, { kind: 'sentence', chars: [...sentence] })) return true
  }

  failed.add(memoKey)
  return false
}

export interface DecomposeOptions {
  /** 最多收集多少个解（算胡取最大用；防止极端局面搜爆）。 */
  readonly limit?: number
  /**
   * 已经固定成型、**不允许被拆开重组**的单元（对／招／扎／开泛 亮出来的副露）。
   * 这些牌会先从计数里扣除，剩余牌只需再凑 `8 - fixedUnits.length` 个单元。
   */
  readonly fixedUnits?: readonly UnitDescriptor[]
}

const DEFAULT_LIMIT = 256

/** 从计数里扣掉固定单元的用牌；扣不动（牌不够）返回 `null`。 */
function subtractUnits(
  counts: readonly number[],
  fixedUnits: readonly UnitDescriptor[],
): number[] | null {
  const next = [...counts]
  for (const unit of fixedUnits) {
    for (const char of unit.chars) {
      const i = tileIndex(char)
      const left = (next[i] ?? 0) - 1
      if (left < 0) return null
      next[i] = left
    }
  }
  return next
}

/**
 * 枚举一手牌的全部合法分解。返回空数组 = 结构上不成立（还差口或有多余牌）。
 *
 * `options.fixedUnits` 用于带副露的局面：已亮出的单元固定，不再参与重组。
 */
export function decompose(
  cards: readonly Card[],
  ruleSet: RuleSet,
  options: DecomposeOptions = {},
): ShapeDescriptor[] {
  const limit = options.limit ?? DEFAULT_LIMIT
  const fixedUnits = options.fixedUnits ?? []
  const unitsLeft = UNITS_PER_HAND - fixedUnits.length
  if (unitsLeft < 0) return []

  const allCounts = countTiles(cards)
  const counts = subtractUnits(allCounts, fixedUnits)
  if (counts === null) return []

  const byChar = sentencesByChar(activeSentences(ruleSet))
  const results: ShapeDescriptor[] = []

  for (const [a, b] of tingtouCandidatesExcluding(cards, fixedUnits, ruleSet)) {
    if (results.length >= limit) break
    const next = [...counts]
    const ia = tileIndex(a)
    const ib = tileIndex(b)
    next[ia] = (next[ia] ?? 0) - 1
    next[ib] = (next[ib] ?? 0) - 1

    const failed = new Set<string>()
    searchUnits(
      next,
      unitsLeft,
      byChar,
      [],
      (units) => {
        results.push({ units: [...fixedUnits, ...units], tingtou: [a, b] })
        return results.length >= limit
      },
      failed,
    )
  }

  return results
}

/** 听头候选：只看**没被固定单元占用**的牌。 */
function tingtouCandidatesExcluding(
  cards: readonly Card[],
  fixedUnits: readonly UnitDescriptor[],
  ruleSet: RuleSet,
): [TileChar, TileChar][] {
  const counts = subtractUnits(countTiles(cards), fixedUnits) ?? []
  const out: [TileChar, TileChar][] = []
  for (let a = 0; a < CHAR_COUNT; a += 1) {
    const charA = TILE_CHARS[a] as TileChar
    if ((counts[a] ?? 0) === 0) continue
    if ((counts[a] ?? 0) >= 2) out.push([charA, charA])
    for (let b = a + 1; b < CHAR_COUNT; b += 1) {
      if ((counts[b] ?? 0) === 0) continue
      const charB = TILE_CHARS[b] as TileChar
      if (isTingtou(charA, charB, ruleSet)) out.push([charA, charB])
    }
  }
  return out
}

/** 只判结构是否成立，找到第一个解就停（比 `decompose` 快得多）。 */
export function isWinningShape(
  cards: readonly Card[],
  ruleSet: RuleSet,
  fixedUnits: readonly UnitDescriptor[] = [],
): boolean {
  return decompose(cards, ruleSet, { fixedUnits, limit: 1 }).length > 0
}

/** 手牌张数是否可能是合法胡牌（用于快速排除）。 */
export function isPlausibleWinSize(cardCount: number): boolean {
  // 8 个单元最少 3 张、最多 5 张，再加 2 张听头 → 26 .. 42
  return cardCount >= 26 && cardCount <= 42
}
