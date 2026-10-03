import { afterEach, describe, expect, it } from 'vitest'

import { GameStore } from './store'

afterEach(() => {
  // 每个用例自己 dispose，这里只做兜底
})

function makeStore(seed = 777): GameStore {
  const store = new GameStore({ seed, difficulty: 'easy', aiDelayMs: 0 })
  store.newGame(seed)
  store.runAiUntilHuman()
  return store
}

/** 一路推进到「人类真的有牌可打」的回合（请统/响应阶段是打不了牌的）。 */
function toDiscardTurn(store: GameStore): void {
  for (let i = 0; i < 60; i += 1) {
    const snap = store.getSnapshot()
    if (snap.legal.some((action) => action.type === 'discard')) return
    const next =
      snap.legal.find((action) => action.type === 'pass') ??
      snap.legal.find((action) => action.type === 'zha' || action.type === 'fan')
    if (!next) return
    store.play(next)
  }
}

describe('store 里的理牌接线', () => {
  it('合并两张牌之后，列里确实多了一张', () => {
    const store = makeStore()
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    const [first, second] = [hand[0], hand[1]]
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    const before = store.getSnapshot().columns.length
    store.mergeCards(second!.id, first!.id)
    const after = store.getSnapshot()

    // 两张牌现在同一列
    const column = after.columns.find((c) => c.cards.some((card) => card.id === first!.id))
    expect(column?.cards.some((card) => card.id === second!.id)).toBe(true)
    // 列数减少或持平（合并不可能让列变多）
    expect(after.columns.length).toBeLessThanOrEqual(before)
    expect(after.hasManualArrangement).toBe(true)
    store.dispose()
  })

  it('合并不会丢牌：所有牌仍然出现在某一列里', () => {
    const store = makeStore(4242)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    for (let i = 1; i < Math.min(8, hand.length); i += 1) {
      store.mergeCards(hand[i]!.id, hand[0]!.id)
    }
    const cards = store.getSnapshot().columns.flatMap((c) => c.cards.map((x) => x.id))
    expect(cards).toHaveLength(hand.length)
    expect(new Set(cards).size).toBe(hand.length)
    store.dispose()
  })

  it('拆牌会把牌移出人工组', () => {
    const store = makeStore(99)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    store.mergeCards(hand[1]!.id, hand[0]!.id)
    store.ungroupCard(hand[1]!.id)
    const columns = store.getSnapshot().columns
    const withFirst = columns.find((c) => c.cards.some((card) => card.id === hand[0]!.id))
    expect(withFirst?.cards.map((card) => card.id)).toEqual([hand[0]!.id])
    store.dispose()
  })

  it('自动理牌清空人工组', () => {
    const store = makeStore(31)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    store.mergeCards(hand[1]!.id, hand[0]!.id)
    expect(store.getSnapshot().hasManualArrangement).toBe(true)
    store.autoArrange()
    expect(store.getSnapshot().hasManualArrangement).toBe(false)
    store.dispose()
  })

  it('打掉牌之后，人工组里不会留下已经不存在的牌', () => {
    const store = makeStore(2026)
    toDiscardTurn(store)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    const victim = hand[0]!
    store.mergeCards(hand[1]!.id, victim.id)
    store.play({ type: 'discard', seat: 0, cardId: victim.id })

    const after = store.getSnapshot()
    const ids = after.columns.flatMap((c) => c.cards.map((card) => card.id))
    expect(ids).not.toContain(victim.id)
    // 剩下的牌数量守恒
    expect(ids).toHaveLength(after.state.players[0]?.hand.length ?? -1)
    store.dispose()
  })

  it('非法动作不会污染手牌与编组', () => {
    const store = makeStore(5)
    const before = store.getSnapshot()
    store.play({ type: 'discard', seat: 2, cardId: 999999 })
    const after = store.getSnapshot()
    expect(after.state).toBe(before.state)
    store.dispose()
  })
})
