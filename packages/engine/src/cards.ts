/**
 * 牌张与牌库。
 *
 * 宜昌花牌：**110 张 = 22 个字 × 每字 5 张**。
 *  - 红字 9：上 大 人 可 知 礼 三 五 七（计胡高）
 *  - 经字 5：乙 三 五 七 九（每字 2 张**花字** + 3 张**素字**）
 *  - 黑字 13：其余（计胡减半）
 *
 * 红 / 经 / 黑是三种**叠标记**，不是互斥分组：三、五、七既是红字又是经字；
 * 乙、九是黑字同时也是经字。所以 `isBlackChar = !isRedChar`。
 *
 * 依据见 docs/rules.md §1。
 */

/** 22 个字，顺序即牌库生成顺序与 UI 展示顺序。 */
export const TILE_CHARS = [
  '上',
  '大',
  '人',
  '可',
  '知',
  '礼',
  '孔',
  '乙',
  '己',
  '化',
  '三',
  '千',
  '七',
  '十',
  '土',
  '八',
  '九',
  '子',
  '二',
  '四',
  '五',
  '六',
] as const

export type TileChar = (typeof TILE_CHARS)[number]

const TILE_INDEX: ReadonlyMap<TileChar, number> = new Map(TILE_CHARS.map((c, i) => [c, i]))

/** 字 → 稳定下标（0..21）。用于排序与位运算，不随牌面文案变化。 */
export function tileIndex(char: TileChar): number {
  const index = TILE_INDEX.get(char)
  if (index === undefined) {
    throw new Error(`未知牌字：${char}`)
  }
  return index
}

/** 红字 9 个。 */
const RED_SET: ReadonlySet<TileChar> = new Set<TileChar>([
  '上',
  '大',
  '人',
  '可',
  '知',
  '礼',
  '三',
  '五',
  '七',
])

/** 经字 5 个，每字带 2 张花字。 */
const JING_SET: ReadonlySet<TileChar> = new Set<TileChar>(['乙', '三', '五', '七', '九'])

export function isRedChar(char: TileChar): boolean {
  return RED_SET.has(char)
}

/** 黑字 = 非红字（13 个），计胡减半。 */
export function isBlackChar(char: TileChar): boolean {
  return !RED_SET.has(char)
}

export function isJingChar(char: TileChar): boolean {
  return JING_SET.has(char)
}

export const RED_CHARS: readonly TileChar[] = TILE_CHARS.filter(isRedChar)
export const BLACK_CHARS: readonly TileChar[] = TILE_CHARS.filter(isBlackChar)
export const JING_CHARS: readonly TileChar[] = TILE_CHARS.filter(isJingChar)

/** 花字（带花边，计胡翻倍）还是素字。**花字不是百搭**，只是同字的加花版。 */
export type CardVariant = 'flower' | 'plain'

export interface Card {
  /** 0..109，一副牌里唯一且稳定。 */
  readonly id: number
  readonly char: TileChar
  readonly variant: CardVariant
}

export const COPIES_PER_CHAR = 5
/** 每个经字里花字的张数。 */
export const FLOWER_COPIES_PER_JING = 2
export const CHAR_COUNT = TILE_CHARS.length
export const DECK_SIZE = CHAR_COUNT * COPIES_PER_CHAR

export function isFlower(card: Card): boolean {
  return card.variant === 'flower'
}

/**
 * 生成一副完整的 110 张牌。
 * 每个字的 5 张里，经字的前 2 张是花字，其余为素字；非经字全部是素字。
 * 牌序固定，保证同 seed 的测试与回放可复现。
 */
export function createDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const char of TILE_CHARS) {
    const flowerCopies = isJingChar(char) ? FLOWER_COPIES_PER_JING : 0
    for (let copy = 0; copy < COPIES_PER_CHAR; copy += 1) {
      deck.push({ id, char, variant: copy < flowerCopies ? 'flower' : 'plain' })
      id += 1
    }
  }
  return deck
}
