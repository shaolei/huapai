import type { Card, TileChar } from '@huapai/engine'
import { arrangeConcealed } from '@huapai/engine'
import { describe, expect, it } from 'vitest'

import {
  HAND_SLOTS,
  buildColumns,
  classifyGroup,
  createSlots,
  effectiveSlots,
  isAutoArrangement,
  moveCardToSlot,
  normalizeSlots,
} from './arrangement'

let nextId = 1
function card(char: TileChar, variant: 'plain' | 'flower' = 'plain'): Card {
  return { id: nextId++, char, variant }
}
function handOf(...chars: readonly TileChar[]): Card[] {
  return chars.map((char) => card(char))
}
function ids(columns: readonly { cards: readonly Card[] }[], index: number): number[] {
  return (columns[index]?.cards ?? []).map((c) => c.id)
}

describe('固定 8 列', () => {
  it('永远返回 8 列，不管牌有多少张', () => {
    for (const count of [1, 8, 25, 26]) {
      const hand = handOf(...Array.from({ length: count }, () => '孔' as TileChar))
      expect(buildColumns(hand, []).length).toBe(HAND_SLOTS)
    }
  })

  it('不丢牌：8 列里的牌 = 手牌', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六', '七', '十', '土')
    const all = buildColumns(hand, []).flatMap((c) => c.cards.map((x) => x.id)).sort()
    expect(all).toEqual(hand.map((c) => c.id).sort())
  })

  it('没手工理过时用引擎的语义分组（一列就是一个单元）', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔')
    const columns = buildColumns(hand, [])
    const kinds = columns.map((c) => c.kind).filter((k) => k !== 'loose')
    expect(kinds).toContain('sentence')
    expect(kinds).toContain('same')
  })

  it('空编组与 autoSlots 等价（约定：空 = 没手工理过）', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六')
    expect(effectiveSlots(hand, [])).toEqual(
      normalizeSlots(
        hand,
        arrangeConcealed(hand).map((c) => c.cards.map((x) => x.id)),
      ),
    )
    expect(isAutoArrangement(hand, [])).toBe(true)
  })
})

describe('拖拽 = 移动，不是交换（这是之前的 bug）', () => {
  const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六', '七', '十', '土')

  it('目标列多一张、源列少一张，**其余列完全不动**', () => {
    const before = buildColumns(hand, [])
    const moving = before[0]?.cards[0]
    expect(moving).toBeDefined()
    const targetSlot = 2

    const moved = moveCardToSlot(hand, [], moving!.id, targetSlot)
    const after = buildColumns(hand, moved)

    for (let i = 0; i < HAND_SLOTS; i += 1) {
      const beforeIds = ids(before, i)
      const afterIds = ids(after, i)
      if (i === 0) {
        expect(afterIds, '源列应少一张').toEqual(beforeIds.filter((id) => id !== moving!.id))
      } else if (i === targetSlot) {
        expect(afterIds, '目标列应多一张且在末尾').toEqual([...beforeIds, moving!.id])
      } else {
        // 核心断言：其它列一个都没动。以前自动列会重新推导，看起来就像被交换了
        expect(afterIds, `第 ${i} 列不该变`).toEqual(beforeIds)
      }
    }
  })

  it('搬到已经在的那一列 = 什么都不做', () => {
    const before = buildColumns(hand, [])
    const c = before[1]?.cards[0]
    const slot = 1
    const moved = moveCardToSlot(hand, [], c!.id, slot)
    expect(buildColumns(hand, moved).map((x) => x.cards.map((y) => y.id))).toEqual(
      before.map((x) => x.cards.map((y) => y.id)),
    )
  })

  it('越界的列号 → 原样返回', () => {
    const before = effectiveSlots(hand, [])
    expect(moveCardToSlot(hand, [], hand[0]!.id, -1)).toEqual(before)
    expect(moveCardToSlot(hand, [], hand[0]!.id, HAND_SLOTS)).toEqual(before)
  })

  it('搬到空列：那一列变成 1 张，其余不动', () => {
    const many = handOf(...Array.from({ length: 26 }, (_, i) => (i % 2 ? '孔' : '九') as TileChar))
    let slots = moveCardToSlot(many, [], many[0]!.id, 0)
    // 先把第 7 列清空
    for (const c of many.slice(1)) {
      const inSlot7 = slots[7]?.includes(c.id)
      if (inSlot7) slots = moveCardToSlot(many, slots, c.id, 0)
    }
    expect(slots[7]).toEqual([])
    const target = many[5]!
    const movedSlots = moveCardToSlot(many, slots, target.id, 7)
    expect(movedSlots[7]).toEqual([target.id])
  })
})

describe('摸牌后的稳定性', () => {
  it('手工理过牌之后，新摸的牌只会让**一列**变长，不会打散原有分布', () => {
    const base = handOf('上', '大', '人', '孔', '孔', '孔', '六', '七', '十')
    // 先手工动一下，进入手工模式
    const manual = moveCardToSlot(base, [], base[0]!.id, 5)
    const before = normalizeSlots(base, manual)

    const drawn = card('九')
    const after = normalizeSlots([...base, drawn], manual)

    let changed = 0
    for (let i = 0; i < HAND_SLOTS; i += 1) {
      const b = (before[i] ?? []).slice().sort()
      const a = (after[i] ?? []).filter((id) => id !== drawn.id).slice().sort()
      if (JSON.stringify(a) !== JSON.stringify(b)) changed += 1
    }
    expect(changed, '原有牌被打散重排了').toBe(0)
  })

  it('没手工理过时，自动分组会随牌变化重新找最优解（这是期望行为）', () => {
    const base = handOf('上', '大', '人', '孔', '孔', '孔', '八', '九')
    const before = buildColumns(base, []).map((c) => c.cards.length)
    const after = buildColumns([...base, card('子')], []).map((c) => c.cards.length)
    // 加了「子」之后 八九子 成句，分组必然变化
    expect(after).not.toEqual(before)
  })
})

describe('classifyGroup', () => {
  it('单张散、两张同字对、三张同字同字单元', () => {
    expect(classifyGroup([card('上')])).toBe('loose')
    expect(classifyGroup([card('孔'), card('孔')])).toBe('pair')
    expect(classifyGroup([card('孔'), card('孔'), card('孔')])).toBe('same')
  })

  it('三张成句 → sentence；两张同属一个句 → kou', () => {
    expect(classifyGroup([card('上'), card('大'), card('人')])).toBe('sentence')
    expect(classifyGroup([card('化'), card('三')])).toBe('kou')
    expect(classifyGroup([card('上'), card('孔')])).toBe('loose')
  })
})

describe('createSlots', () => {
  it('生成 8 个空列', () => {
    const slots = createSlots()
    expect(slots).toHaveLength(HAND_SLOTS)
    expect(slots.every((slot) => slot.length === 0)).toBe(true)
  })
})
