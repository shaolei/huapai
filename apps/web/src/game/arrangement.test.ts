import type { Card, TileChar } from '@huapai/engine'
import { arrangeConcealed } from '@huapai/engine'
import { describe, expect, it } from 'vitest'

import {
  buildColumns,
  classifyGroup,
  hasManualGroups,
  isGrouped,
  mergeCards,
  pruneArrangement,
  ungroupCard,
} from './arrangement'

let nextId = 1
function card(char: TileChar, variant: 'plain' | 'flower' = 'plain'): Card {
  return { id: nextId++, char, variant }
}

function handOf(...chars: readonly TileChar[]): Card[] {
  return chars.map((char) => card(char))
}

describe('buildColumns', () => {
  it('没有人工编组时 == 引擎的自动编排', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六')
    expect(buildColumns(hand, []).map((c) => c.kind)).toEqual(
      arrangeConcealed(hand).map((c) => c.kind),
    )
  })

  it('人工组排在自动列之前，剩下的牌继续自动编排', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六')
    // 把「六」和一张「孔」编成一组；剩下的 上大人 + 孔孔 仍应自动排成一句 + 一对
    const columns = buildColumns(hand, [[hand[6]!.id, hand[3]!.id]])
    expect(columns[0]?.cards.map((c) => c.char)).toEqual(['六', '孔'])
    expect(columns.some((c) => c.kind === 'sentence')).toBe(true)
    expect(columns.some((c) => c.kind === 'pair')).toBe(true)
  })

  it('不丢牌：列里所有牌 = 手牌', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六', '七', '十', '土')
    const arrangement = [
      [hand[6]!.id, hand[3]!.id],
      [hand[0]!.id, hand[1]!.id, hand[2]!.id],
    ]
    const columns = buildColumns(hand, arrangement)
    const ids = columns.flatMap((c) => c.cards.map((x) => x.id)).sort()
    expect(ids).toEqual(hand.map((c) => c.id).sort())
  })

  it('人工组的列 key 稳定且不与自动列冲突', () => {
    const hand = handOf('上', '大', '人', '六')
    const columns = buildColumns(hand, [[hand[0]!.id, hand[1]!.id]])
    const keys = columns.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[0]?.startsWith('manual:')).toBe(true)
  })
})

describe('mergeCards', () => {
  it('把一张牌并进另一张所在的列', () => {
    const hand = handOf('上', '大', '人', '六')
    const merged = mergeCards(hand, [], hand[3]!.id, hand[0]!.id)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual([hand[0]!.id, hand[3]!.id])
  })

  it('并进已有组时追加到末尾（成为完整可见的那张）', () => {
    const hand = handOf('上', '大', '人', '六')
    const first = mergeCards(hand, [], hand[1]!.id, hand[0]!.id) // [上, 大]
    const second = mergeCards(hand, first, hand[3]!.id, hand[0]!.id) // [上, 大, 六]
    expect(second[0]).toEqual([hand[0]!.id, hand[1]!.id, hand[3]!.id])
  })

  it('把牌从原组搬走：不会同时出现在两组，原组剩下的牌留在原地', () => {
    const hand = handOf('上', '大', '人', '六')
    let arrangement = mergeCards(hand, [], hand[1]!.id, hand[0]!.id) // [上, 大]
    arrangement = mergeCards(hand, arrangement, hand[1]!.id, hand[3]!.id) // 大 搬到 六
    const flat = arrangement.flat()
    expect(new Set(flat).size).toBe(flat.length) // 没有重复
    // 大 现在和 六 一组
    const withLiu = arrangement.find((group) => group.includes(hand[3]!.id))
    expect(withLiu).toContain(hand[1]!.id)
    // 上 留在自己的单张组里（搬走大不会把上一起带走）
    const withShang = arrangement.find((group) => group.includes(hand[0]!.id))
    expect(withShang).toEqual([hand[0]!.id])
  })

  it('自己拖自己、或者目标/来源不在手上 → 原样返回', () => {
    const hand = handOf('上', '大')
    expect(mergeCards(hand, [], hand[0]!.id, hand[0]!.id)).toEqual([])
    expect(mergeCards(hand, [], 9999, hand[0]!.id)).toEqual([])
    expect(mergeCards(hand, [], hand[0]!.id, 9999)).toEqual([])
  })

  it('多次合并不丢牌', () => {
    const hand = handOf('上', '大', '人', '孔', '孔', '孔', '六')
    let arrangement: number[][] = []
    arrangement = mergeCards(hand, arrangement, hand[1]!.id, hand[0]!.id)
    arrangement = mergeCards(hand, arrangement, hand[2]!.id, hand[0]!.id)
    arrangement = mergeCards(hand, arrangement, hand[4]!.id, hand[3]!.id)
    const flat = arrangement.flat()
    expect(new Set(flat).size).toBe(flat.length)
    expect(flat.length).toBe(5)
    const columns = buildColumns(hand, arrangement)
    expect(columns.flatMap((c) => c.cards)).toHaveLength(hand.length)
  })
})

describe('ungroupCard', () => {
  it('把牌从组里拆出来', () => {
    const hand = handOf('上', '大', '人')
    const merged = mergeCards(hand, [], hand[1]!.id, hand[0]!.id)
    const split = ungroupCard(hand, merged, hand[1]!.id)
    expect(split.flat()).not.toContain(hand[1]!.id)
    expect(split.flat()).toContain(hand[0]!.id)
  })

  it('拆掉组里最后一张后整组消失', () => {
    const hand = handOf('上', '大')
    expect(ungroupCard(hand, [[hand[0]!.id]], hand[0]!.id)).toEqual([])
  })

  it('从两张的组里拆走一张，另一张留在组里', () => {
    const hand = handOf('上', '大')
    const merged = mergeCards(hand, [], hand[1]!.id, hand[0]!.id)
    expect(ungroupCard(hand, merged, hand[0]!.id)).toEqual([[hand[1]!.id]])
  })

  it('拆出来的牌回到自动编排，总数不变', () => {
    const hand = handOf('上', '大', '人', '六')
    const merged = mergeCards(hand, [], hand[1]!.id, hand[0]!.id)
    const split = ungroupCard(hand, merged, hand[1]!.id)
    const columns = buildColumns(hand, split)
    expect(columns.flatMap((c) => c.cards)).toHaveLength(hand.length)
  })
})

describe('摸牌 / 打牌后的剪枝', () => {
  it('打掉的牌会自动从人工组里消失', () => {
    const hand = handOf('上', '大', '人', '六')
    const merged = mergeCards(hand, [], hand[3]!.id, hand[0]!.id)
    const afterDiscard = hand.filter((c) => c.id !== hand[3]!.id)
    const pruned = pruneArrangement(merged, afterDiscard)
    expect(pruned.flat()).not.toContain(hand[3]!.id)
    expect(pruned.flat()).toContain(hand[0]!.id)
  })

  it('组里只剩死牌时整组被丢掉', () => {
    const hand = handOf('上', '大')
    const merged = mergeCards(hand, [], hand[1]!.id, hand[0]!.id)
    expect(pruneArrangement(merged, [])).toEqual([])
  })

  it('新摸进来的牌不在任何人工组里 → 会走自动编排', () => {
    const hand = handOf('上', '大')
    const merged = mergeCards(hand, [], hand[1]!.id, hand[0]!.id)
    const withDrawn = [...hand, card('九')]
    const columns = buildColumns(withDrawn, merged)
    const drawn = withDrawn[2]!
    expect(isGrouped(merged, drawn.id)).toBe(false)
    const drawnColumn = columns.find((c) => c.cards.some((c2) => c2.id === drawn.id))
    expect(drawnColumn?.kind).toBe('loose')
  })
})

describe('classifyGroup', () => {
  it('单张 → loose', () => {
    expect(classifyGroup([card('上')])).toBe('loose')
  })

  it('两张同字 → pair；三张同字 → same', () => {
    expect(classifyGroup([card('孔'), card('孔')])).toBe('pair')
    expect(classifyGroup([card('孔'), card('孔'), card('孔')])).toBe('same')
    expect(classifyGroup([card('孔'), card('孔'), card('孔'), card('孔')])).toBe('same')
  })

  it('三张成句 → sentence', () => {
    expect(classifyGroup([card('上'), card('大'), card('人')])).toBe('sentence')
    expect(classifyGroup([card('三'), card('四'), card('五')])).toBe('sentence')
  })

  it('两张同属一个句 → kou', () => {
    expect(classifyGroup([card('化'), card('三')])).toBe('kou')
    expect(classifyGroup([card('八'), card('九')])).toBe('kou')
  })

  it('乱七八糟的组合 → loose', () => {
    expect(classifyGroup([card('上'), card('孔')])).toBe('loose')
    expect(classifyGroup([card('上'), card('大'), card('孔')])).toBe('loose')
  })
})

describe('hasManualGroups', () => {
  it('空编组或全是死牌时为 false', () => {
    const hand = handOf('上', '大')
    expect(hasManualGroups([], hand)).toBe(false)
    expect(hasManualGroups([[9999]], hand)).toBe(false)
    expect(hasManualGroups([[hand[0]!.id]], hand)).toBe(true)
  })
})
