/**
 * 规则开关（RuleSet）。
 *
 * docs/rules.md §9 有 9 项「待业务方拍板」的口径，来源之间互相冲突。
 * 与其把某个说法硬编码进引擎，不如**全部下沉为配置**：
 * 换口径 = 换一个 RuleSet 默认值 + 一条测试，不改引擎结构。
 *
 * 算胡一律用**半胡**为整数单位（1 胡 = 2 半胡），避免浮点误差。
 */

import type { TileChar } from './cards'

/** 1 胡 = 2 个半胡单位。 */
export const HALF_HU_PER_HU = 2

/** 胡 → 半胡。 */
export function toHalfHu(huValue: number): number {
  return huValue * HALF_HU_PER_HU
}

/** 半胡 → 胡（可能带 .5）。 */
export function toHu(halfHuValue: number): number {
  return halfHuValue / HALF_HU_PER_HU
}

/** 计分键：红/黑 × 轮型。 */
export type ScoreKey =
  | 'redSentence'
  | 'blackSentence'
  | 'redPair'
  | 'blackPair'
  | 'redTriplet'
  | 'blackTriplet'
  | 'redZhao'
  | 'blackZhao'
  | 'redTong'
  | 'blackTong'
  | 'redFan'
  | 'blackFan'

/** 轮型 → 红字与黑字的计分键。黑字减半，所以黑句与黑对子是 0 胡。 */
export const SCORE_KEYS = {
  sentence: { red: 'redSentence', black: 'blackSentence' },
  pair: { red: 'redPair', black: 'blackPair' },
  triplet: { red: 'redTriplet', black: 'blackTriplet' },
  zhao: { red: 'redZhao', black: 'blackZhao' },
  tong: { red: 'redTong', black: 'blackTong' },
  fan: { red: 'redFan', black: 'blackFan' },
} as const satisfies Record<string, { red: ScoreKey; black: ScoreKey }>

/** 一个局面上可以抢占出牌权的动作，按优先级从高到低排列。 */
export type ActionPriorityKey = 'hu' | 'shao' | 'zhao' | 'tong' | 'dui'

export interface RuleSet {
  readonly id: string
  readonly label: string

  // ── ① 句表 ────────────────────────────────────────────────
  /** 是否把「乙二三 … 八九十」这 8 个数序句也算作句。关闭则只有 6 个固定句。 */
  readonly includeNumericSentences: boolean

  // ── ② 人数与发牌 ──────────────────────────────────────────
  readonly playerCount: number
  /** 每位闲家的手牌张数。 */
  readonly handSize: number
  /** 庄家的手牌张数（多 1 张「灌头」）。 */
  readonly dealerHandSize: number

  // ── ③ 胡牌门槛（半胡） ────────────────────────────────────
  readonly minHu: number
  /** 是否启用宜昌档位（屁胡 / 清胡 / 枯胡 / 台胡）。 */
  readonly yichangTiers: boolean
  /** 宜昌档位门槛（半胡），升序。 */
  readonly thresholdTiers: readonly number[]

  // ── ④ 计分表（半胡） ──────────────────────────────────────
  readonly score: Readonly<Record<ScoreKey, number>>

  // ── ⑤ 精字 ────────────────────────────────────────────────
  /** 哪些字算精。5 条为乙三五七九（基线），3 条为三五七。 */
  readonly jingChars: readonly TileChar[]
  /** 素精在句中的胡数（半胡）。 */
  readonly jingPlainHu: number
  /** 花精在句中的胡数（半胡）。 */
  readonly jingFlowerHu: number
  /** 精的**同字单元**基础胡数（3 张素精 = 5 胡）。 */
  readonly jingUnitBaseHu: number
  /** 精单元每多一张花精增加的胡数。 */
  readonly jingFlowerStepHu: number
  /** 精单元每多一张牌的倍数：扎 = ×2、泛 = ×2×2。 */
  readonly jingUnitSizeMultiplier: number

  // ── ⑥ 主精 ────────────────────────────────────────────────
  /** 主精；`null` 表示本期不定主精。 */
  readonly mainJing: TileChar | null
  readonly mainJingMultiplier: number
  /** 主精怎么定：每位玩家各自判定 / 全局判定一次 / 不启用。 */
  readonly mainJingMode: 'per-player' | 'global' | 'none'

  // ── ⑦ 操作优先级 ──────────────────────────────────────────
  readonly priority: readonly ActionPriorityKey[]
  /** 是否允许「过胡不胡」后在同一巡再胡。 */
  readonly allowPassThenHu: boolean

  // ── ⑧ 绍牌 ────────────────────────────────────────────────
  /** 绍牌是否绝对优先（即便他家已落叫）。 */
  readonly shaoBeatsAll: boolean

  // ── ⑨ 黄庄 ────────────────────────────────────────────────
  /** 同一庄最多重开几盘（「黄三盘」）。 */
  readonly maxDealerRepeats: number
  /** 黄庄是否罚庄家付「开醒钱」。 */
  readonly drawPenalty: boolean

  // ── 结算 ──────────────────────────────────────────────────
  /** 自摸是否两家伙（另两家都付）。 */
  readonly selfDrawBothPay: boolean
}

/** 红字全分、黑字减半的基线计分表。 */
const BASELINE_SCORE: Readonly<Record<ScoreKey, number>> = {
  redSentence: toHalfHu(1),
  blackSentence: 0,
  redPair: toHalfHu(1),
  blackPair: 0,
  redTriplet: toHalfHu(2),
  blackTriplet: toHalfHu(1),
  redZhao: toHalfHu(4),
  blackZhao: toHalfHu(2),
  redTong: toHalfHu(4),
  blackTong: toHalfHu(2),
  redFan: toHalfHu(8),
  blackFan: toHalfHu(4),
}

/** 基线：三人花牌（docs/rules.md §1–§5 的默认口径）。 */
export const BASELINE_RULES: RuleSet = {
  id: 'baseline-3p',
  label: '三人花牌（基线）',

  includeNumericSentences: true,

  playerCount: 3,
  handSize: 25,
  dealerHandSize: 26,

  minHu: toHalfHu(17),
  yichangTiers: false,
  thresholdTiers: [toHalfHu(11), toHalfHu(21), toHalfHu(42)],

  score: BASELINE_SCORE,

  jingChars: ['乙', '三', '五', '七', '九'],
  jingPlainHu: toHalfHu(1),
  jingFlowerHu: toHalfHu(2),
  jingUnitBaseHu: 5,
  jingFlowerStepHu: 1,
  jingUnitSizeMultiplier: 2,

  mainJing: '三',
  mainJingMultiplier: 2,
  mainJingMode: 'per-player',

  priority: ['hu', 'shao', 'zhao', 'tong', 'dui'],
  allowPassThenHu: true,

  shaoBeatsAll: true,

  maxDealerRepeats: 3,
  drawPenalty: false,

  selfDrawBothPay: true,
}

/** 宜昌本地档：门槛 21 胡（屁胡），并启用 11/21/42 三档。 */
export const YICHANG_RULES: RuleSet = {
  ...BASELINE_RULES,
  id: 'yichang-3p',
  label: '宜昌本地档（21 胡屁胡 / 11 胡清胡 / 42 胡台胡）',
  minHu: toHalfHu(21),
  yichangTiers: true,
}

/** 只认 6 个固定句的变体（拍板项①的另一个选项）。 */
export const FIXED_SENTENCE_ONLY_RULES: RuleSet = {
  ...BASELINE_RULES,
  id: 'fixed-sentences-3p',
  label: '仅固定句变体',
  includeNumericSentences: false,
}

/** 经只取 3 条的变体（拍板项⑤的另一个选项）。 */
export const THREE_JING_RULES: RuleSet = {
  ...BASELINE_RULES,
  id: 'three-jing-3p',
  label: '经取 3 条（三/五/七）',
  jingChars: ['三', '五', '七'],
}

/** 全部内置规则集，供设置页展示。 */
export const PRESET_RULESETS: readonly RuleSet[] = [
  BASELINE_RULES,
  YICHANG_RULES,
  FIXED_SENTENCE_ONLY_RULES,
  THREE_JING_RULES,
]

export function findRuleSet(id: string): RuleSet | undefined {
  return PRESET_RULESETS.find((ruleSet) => ruleSet.id === id)
}

export function isJing(char: TileChar, ruleSet: RuleSet): boolean {
  return ruleSet.jingChars.includes(char)
}
