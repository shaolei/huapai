import { afterEach, describe, expect, it } from 'vitest'

import { HAND_SLOTS } from './arrangement'
import { GameStore } from './store'

afterEach(() => {
  // 每个用例自己 dispose
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
  it('手牌永远是固定 8 列', () => {
    const store = makeStore()
    expect(store.getSnapshot().columns).toHaveLength(HAND_SLOTS)
    store.dispose()
  })

  it('移到另一列：目标列 +1、源列 -1、其余列不变', () => {
    const store = makeStore(4242)
    const before = store.getSnapshot().columns.map((c) => c.cards.map((x) => x.id))
    const moving = before[0]?.[0]
    expect(moving).toBeDefined()

    store.moveCardToSlot(moving!, 3)
    const after = store.getSnapshot().columns.map((c) => c.cards.map((x) => x.id))

    expect(after[3]).toEqual([...(before[3] ?? []), moving!])
    expect(after[0]).toEqual((before[0] ?? []).filter((id) => id !== moving))
    for (let i = 0; i < HAND_SLOTS; i += 1) {
      if (i === 0 || i === 3) continue
      expect(after[i], `第 ${i} 列不该变`).toEqual(before[i])
    }
    expect(store.getSnapshot().hasManualArrangement).toBe(true)
    store.dispose()
  })

  it('理牌不丢牌', () => {
    const store = makeStore(31)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    for (let slot = 0; slot < HAND_SLOTS; slot += 1) {
      store.moveCardToSlot(hand[slot]!.id, (slot + 3) % HAND_SLOTS)
    }
    const cards = store.getSnapshot().columns.flatMap((c) => c.cards.map((x) => x.id))
    expect(cards).toHaveLength(hand.length)
    expect(new Set(cards).size).toBe(hand.length)
    store.dispose()
  })

  it('自动理牌清空手工编组', () => {
    const store = makeStore(99)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    store.moveCardToSlot(hand[0]!.id, 5)
    expect(store.getSnapshot().hasManualArrangement).toBe(true)
    store.autoArrange()
    expect(store.getSnapshot().hasManualArrangement).toBe(false)
    expect(store.getSnapshot().columns).toHaveLength(HAND_SLOTS)
    store.dispose()
  })

  it('打掉牌之后，编组里不会留下已经不存在的牌', () => {
    const store = makeStore(2026)
    toDiscardTurn(store)
    const hand = store.getSnapshot().state.players[0]?.hand ?? []
    const victim = hand[0]!
    store.moveCardToSlot(hand[1]!.id, 0)
    store.play({ type: 'discard', seat: 0, cardId: victim.id })

    const after = store.getSnapshot()
    const ids = after.columns.flatMap((c) => c.cards.map((card) => card.id))
    expect(ids).not.toContain(victim.id)
    expect(ids).toHaveLength(after.state.players[0]?.hand.length ?? -1)
    store.dispose()
  })

  it('非法动作不会污染手牌与编组', () => {
    const store = makeStore(5)
    const before = store.getSnapshot()
    store.play({ type: 'discard', seat: 2, cardId: 999999 })
    expect(store.getSnapshot().state).toBe(before.state)
    store.dispose()
  })
})
