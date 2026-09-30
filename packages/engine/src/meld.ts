/**
 * 「轮」与「句」—— 胡牌结构的两个基础概念。
 *
 * 胡牌 = **8 个轮 + 1 个口**（26 张，无「将」）。
 * 一个轮可以是：句 / 对 / 坎 / 开招 / 统 / 开泛，**都只算 1 个轮**。
 *
 * 句表共 14 种（docs/rules.md §3.3）：
 *  - 固定句 6：上大人、孔乙己、化三千、七十土、八九子、可知礼
 *  - 数序句 8（乙通一）：乙二三、二三四、三四五、四五六、五六七、六七八、七八九、八九十
 * **其余任何 3 字组合都不算句。**
 */

import type { Card, TileChar } from './cards'

/** 数序句用的顺序：乙通「一」。 */
export const NUMERIC_ORDER = [
  '乙',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
] as const satisfies readonly TileChar[]

export type Sentence = readonly [TileChar, TileChar, TileChar]

const FIXED_SENTENCES: readonly Sentence[] = [
  ['上', '大', '人'],
  ['孔', '乙', '己'],
  ['化', '三', '千'],
  ['七', '十', '土'],
  ['八', '九', '子'],
  ['可', '知', '礼'],
]

const NUMERIC_SENTENCES: readonly Sentence[] = (() => {
  const out: Sentence[] = []
  for (let i = 0; i + 2 < NUMERIC_ORDER.length; i += 1) {
    out.push([NUMERIC_ORDER[i] as TileChar, NUMERIC_ORDER[i + 1] as TileChar, NUMERIC_ORDER[i + 2] as TileChar])
  }
  return out
})()

/** 全部 14 种句，固定句在前、数序句在后（即 UI 的列序）。 */
export const SENTENCES: readonly Sentence[] = [...FIXED_SENTENCES, ...NUMERIC_SENTENCES]

export const SENTENCE_COUNT = 14

function sentenceKey(chars: readonly TileChar[]): string {
  return [...chars].sort().join('')
}

const SENTENCE_KEYS: ReadonlySet<string> = new Set(SENTENCES.map(sentenceKey))

/** 判断 3 个字是否恰好构成句表中的一种句（与顺序无关）。 */
export function isSentence(chars: readonly TileChar[]): boolean {
  return chars.length === 3 && SENTENCE_KEYS.has(sentenceKey(chars))
}

/**
 * 给定 1 张牌，列出所有能与它组成句的**单张补齐**字。
 * 用于撂听（单张成「口」）的可胡字集合。
 */
export function sentencePartnersOf(char: TileChar): TileChar[] {
  const partners = new Set<TileChar>()
  for (const sentence of SENTENCES) {
    if (!sentence.includes(char)) continue
    for (const other of sentence) {
      if (other !== char) partners.add(other)
    }
  }
  return [...partners]
}

/**
 * 给定 2 个字，列出能把它们补成一个句的字（即这两张构成一个「口」）。
 * 空数组表示这 2 张不能成「口」。
 */
export function sentenceCompletions(a: TileChar, b: TileChar): TileChar[] {
  const completions = new Set<TileChar>()
  for (const sentence of SENTENCES) {
    if (sentence.includes(a) && sentence.includes(b)) {
      for (const candidate of sentence) {
        if (candidate !== a && candidate !== b) completions.add(candidate)
      }
    }
  }
  // 两张同字不能靠句补齐（那是坎/对的路子），这里只返回真正需要的第 3 个字。
  return a === b ? [] : [...completions]
}

/**
 * 轮的种类。命名对照（docs/rules.md §3.1）：
 *  - `sentence` 句：3 张构成句表中的一个句
 *  - `pair`     对：手 2 张同字 + 他家打出的第 3 张（明牌）
 *  - `triplet`  坎：3 张同字（暗）
 *  - `zhao`     开招：已有坎，他家打出第 4 张（明牌）
 *  - `tong`     统／扎：自摸第 4 张（暗），从牌底补 1 张
 *  - `fan`      开泛／统上顶：第 5 张
 */
export type MeldKind = 'sentence' | 'pair' | 'triplet' | 'zhao' | 'tong' | 'fan'

/** 每种轮的张数。对与坎都是 3 张，区别在于成型方式、明暗与算胡。 */
export const MELD_SIZE: Readonly<Record<MeldKind, number>> = {
  sentence: 3,
  pair: 3,
  triplet: 3,
  zhao: 4,
  tong: 4,
  fan: 5,
}

/** 中文名，用于 UI 与错误信息。 */
export const MELD_LABEL: Readonly<Record<MeldKind, string>> = {
  sentence: '句',
  pair: '对',
  triplet: '坎',
  zhao: '开招',
  tong: '统',
  fan: '开泛',
}

export interface Meld {
  readonly kind: MeldKind
  /** 构成这个轮的全部牌，数量等于 MELD_SIZE[kind]。 */
  readonly cards: readonly Card[]
  /** 是否已经亮在桌面上（对／开招 为 true）。 */
  readonly revealed: boolean
}

export function isMeldSizeValid(kind: MeldKind, count: number): boolean {
  return MELD_SIZE[kind] === count
}
