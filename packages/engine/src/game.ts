/**
 * 游戏状态机（纯函数）。
 *
 * 设计契约：
 *  - `reduce(state, action)` **完全确定**：同 seed + 同动作序列 → 同状态。
 *  - 状态**可 JSON 序列化** → 存档续玩、回放、CI 里跑整局回归测试都是免费的。
 *  - `legalActions(state)` 是**唯一的合法动作来源**：UI 只渲染按钮、AI 只挑一个，
 *    两边不可能出现规则不一致。
 *  - 非法动作直接抛 `IllegalActionError`，不静默吞掉。
 *
 * 流程（依据 docs/rules.md §2–§3.2）：
 *   发牌（庄 26 / 闲 25）→ 请统（末家→二家→庄家，可扎）→ 庄家先打
 *   → 摸 1 打 1；对／招／扎／开泛按补张规则；牌墙空 = 黄庄
 */

import { type Card, type TileChar, createDeck } from './cards'
import { BASELINE_RULES, type RuleSet } from './rules'
import { mulberry32, shuffle } from './rng'
import { type ShapeDescriptor, type UnitKind } from './win'
import { evaluateHand } from './score'

export const SEATS = 3

export type Phase = 'qingtong' | 'turn' | 'claim' | 'finished'

/** 副露：已经亮出（或暗扎）成型的单元，**不允许再被拆开重组**。 */
export interface MeldGroup {
  /** 计分/结构口径（句不会副露，所以这里只有这三种）。 */
  readonly kind: Exclude<UnitKind, 'sentence'>
  readonly char: TileChar
  readonly cards: readonly Card[]
  /** 明牌（对／招）还是暗牌（扎／开泛）。 */
  readonly revealed: boolean
  /** 成型方式，供 UI 区分「对」与「坎」。 */
  readonly via: 'dui' | 'zhao' | 'zha' | 'fan'
}

export interface PlayerState {
  readonly seat: number
  readonly hand: readonly Card[]
  readonly melds: readonly MeldGroup[]
  /** 本局已经「对」了几次（限 `ruleSet.maxDui` 对）。 */
  readonly duiCount: number
}

export interface DiscardRecord {
  readonly seat: number
  readonly card: Card
}

export interface ClaimOption {
  readonly seat: number
  readonly kind: 'hu' | 'zhao' | 'dui'
}

export interface GameResult {
  readonly kind: 'hu' | 'draw'
  readonly winner: number | null
  /** 点炮者；自摸为 `null`。 */
  readonly from: number | null
  readonly hu: number
  readonly shape: ShapeDescriptor | null
}

export type GameEvent =
  | { readonly type: 'dealt'; readonly seat: number; readonly count: number }
  | { readonly type: 'drew'; readonly seat: number; readonly card: Card; readonly fromBottom: boolean }
  | { readonly type: 'discarded'; readonly seat: number; readonly card: Card }
  | {
      readonly type: 'melded'
      readonly seat: number
      readonly kind: MeldGroup['kind']
      readonly char: TileChar
      readonly via: MeldGroup['via']
    }
  | { readonly type: 'hu'; readonly seat: number; readonly from: number | null; readonly hu: number }
  | { readonly type: 'draw' }
  | { readonly type: 'passed'; readonly seat: number }

export interface GameState {
  readonly ruleSet: RuleSet
  readonly seed: number
  readonly dealer: number
  readonly players: readonly PlayerState[]
  /** 牌墙：普通摸牌从前端取，补张从后端取（「在牌底起一张牌」）。 */
  readonly wall: readonly Card[]
  readonly discards: readonly DiscardRecord[]
  readonly phase: Phase
  readonly currentSeat: number
  /** 进入本回合前是否需要摸一张。 */
  readonly needsDraw: boolean
  readonly qingtongQueue: readonly number[]
  readonly qingtongIndex: number
  readonly pendingClaims: readonly ClaimOption[]
  readonly claimIndex: number
  readonly result: GameResult | null
  readonly log: readonly GameEvent[]
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalActionError'
  }
}

export type GameAction =
  | { readonly type: 'discard'; readonly seat: number; readonly cardId: number }
  | { readonly type: 'zha'; readonly seat: number; readonly char: TileChar }
  | { readonly type: 'fan'; readonly seat: number; readonly char: TileChar }
  | { readonly type: 'hu'; readonly seat: number }
  | { readonly type: 'claim'; readonly seat: number; readonly kind: 'hu' | 'zhao' | 'dui' }
  | { readonly type: 'pass'; readonly seat: number }

// ─────────────────────────────────────────────── 建局

export interface CreateGameOptions {
  readonly seed: number
  readonly dealer?: number
  readonly ruleSet?: RuleSet
}

export function createGame(options: CreateGameOptions): GameState {
  const ruleSet = options.ruleSet ?? BASELINE_RULES
  const dealer = ((options.dealer ?? 0) % SEATS + SEATS) % SEATS
  const deck = shuffle(createDeck(), mulberry32(options.seed))

  // 轮转发牌：庄家拿 dealerHandSize，其余 handSize。
  const order: number[] = []
  for (let round = 0; round < ruleSet.dealerHandSize; round += 1) {
    for (let offset = 0; offset < SEATS; offset += 1) {
      const seat = (dealer + offset) % SEATS
      const size = seat === dealer ? ruleSet.dealerHandSize : ruleSet.handSize
      if (round < size) order.push(seat)
    }
  }

  const hands: Card[][] = [[], [], []]
  order.forEach((seat, index) => {
    const card = deck[index]
    if (card) hands[seat]?.push(card)
  })

  const players: PlayerState[] = Array.from({ length: SEATS }, (_, seat) => ({
    seat,
    hand: hands[seat] ?? [],
    melds: [],
    duiCount: 0,
  }))

  const wall = deck.slice(order.length)

  // 请统顺序：末家 → 二家 → 庄家
  const qingtongQueue = [dealer + 2, dealer + 1, dealer].map((seat) => seat % SEATS)

  const log: GameEvent[] = players.map((player) => ({
    type: 'dealt',
    seat: player.seat,
    count: player.hand.length,
  }))

  return {
    ruleSet,
    seed: options.seed,
    dealer,
    players,
    wall,
    discards: [],
    phase: 'qingtong',
    currentSeat: qingtongQueue[0] ?? dealer,
    needsDraw: false,
    qingtongQueue,
    qingtongIndex: 0,
    pendingClaims: [],
    claimIndex: 0,
    result: null,
    log,
  }
}

// ─────────────────────────────────────────────── 查询

export function playerAt(state: GameState, seat: number): PlayerState {
  const player = state.players[seat]
  if (!player) throw new IllegalActionError(`座位越界：${seat}`)
  return player
}

/** 玩家的全部牌（暗牌 + 副露）。花精要按整手牌数，所以判胡用这个。 */
export function allCardsOf(player: PlayerState): Card[] {
  return [...player.hand, ...player.melds.flatMap((meld) => meld.cards)]
}

/** 副露对应的固定单元，交给分解器时不再重组。 */
export function fixedUnitsOf(player: PlayerState): { kind: MeldGroup['kind']; chars: TileChar[] }[] {
  return player.melds.map((meld) => ({
    kind: meld.kind,
    chars: meld.cards.map((card) => card.char),
  }))
}

function handCountOf(player: PlayerState, char: TileChar): number {
  let count = 0
  for (const card of player.hand) if (card.char === char) count += 1
  return count
}

/** 手上所有能「扎」的字（4 张以上）。 */
export function zhaCandidates(player: PlayerState): TileChar[] {
  const out: TileChar[] = []
  for (const card of player.hand) {
    if (out.includes(card.char)) continue
    if (handCountOf(player, card.char) >= 4) out.push(card.char)
  }
  return out
}

/** 手上所有能「开泛」的字（已有扎，且手上还有同字）。 */
export function fanCandidates(player: PlayerState): TileChar[] {
  const out: TileChar[] = []
  for (const meld of player.melds) {
    if (meld.kind !== 'zha') continue
    if (handCountOf(player, meld.char) >= 1) out.push(meld.char)
  }
  return out
}

/** 该玩家现在是否能自摸胡。 */
export function canHuNow(state: GameState, seat: number): boolean {
  const player = playerAt(state, seat)
  const evaluation = evaluateHand(allCardsOf(player), state.ruleSet, {
    fixedUnits: fixedUnitsOf(player),
  })
  return evaluation.isWin
}

/** 别人打出 `card` 时，该玩家能不能胡。 */
export function canHuOn(state: GameState, seat: number, card: Card): boolean {
  const player = playerAt(state, seat)
  const evaluation = evaluateHand([...allCardsOf(player), card], state.ruleSet, {
    fixedUnits: fixedUnitsOf(player),
  })
  return evaluation.isWin
}

/** 别人打出 `card` 时，该玩家能不能「招」（手上有暗坎）。 */
export function canZhaoOn(state: GameState, seat: number, card: Card): boolean {
  const player = playerAt(state, seat)
  return handCountOf(player, card.char) >= 3
}

/** 别人打出 `card` 时，该玩家能不能「对」（手上有 2 张，且没超限）。 */
export function canDuiOn(state: GameState, seat: number, card: Card): boolean {
  const player = playerAt(state, seat)
  if (player.duiCount >= state.ruleSet.maxDui) return false
  return handCountOf(player, card.char) >= 2
}

/** 当前必须作出反应的座位。 */
export function actingSeat(state: GameState): number {
  if (state.phase === 'claim') return state.pendingClaims[state.claimIndex]?.seat ?? -1
  return state.currentSeat
}

// ─────────────────────────────────────────────── 合法动作

export function legalActions(state: GameState): GameAction[] {
  if (state.phase === 'finished') return []

  if (state.phase === 'qingtong') {
    const seat = state.currentSeat
    const player = playerAt(state, seat)
    const actions: GameAction[] = [
      ...zhaCandidates(player).map((char) => ({ type: 'zha' as const, seat, char })),
      ...fanCandidates(player).map((char) => ({ type: 'fan' as const, seat, char })),
    ]
    actions.push({ type: 'pass', seat })
    return actions
  }

  if (state.phase === 'claim') {
    const option = state.pendingClaims[state.claimIndex]
    if (!option) return []
    return [
      { type: 'claim', seat: option.seat, kind: option.kind },
      { type: 'pass', seat: option.seat },
    ]
  }

  const seat = state.currentSeat
  const player = playerAt(state, seat)
  const actions: GameAction[] = player.hand.map((card) => ({
    type: 'discard' as const,
    seat,
    cardId: card.id,
  }))
  if (canHuNow(state, seat)) actions.push({ type: 'hu', seat })
  for (const char of zhaCandidates(player)) actions.push({ type: 'zha', seat, char })
  for (const char of fanCandidates(player)) actions.push({ type: 'fan', seat, char })
  return actions
}

// ─────────────────────────────────────────────── 内部转移

function withLog(state: GameState, events: readonly GameEvent[]): GameEvent[] {
  return [...state.log, ...events]
}

interface Drawn {
  readonly state: GameState
  readonly card: Card | null
  readonly events: GameEvent[]
}

/** 摸牌；牌墙空则黄庄。 */
function draw(state: GameState, seat: number, fromBottom: boolean): Drawn {
  if (state.wall.length === 0) {
    const finished: GameState = {
      ...state,
      phase: 'finished',
      result: { kind: 'draw', winner: null, from: null, hu: 0, shape: null },
      log: withLog(state, [{ type: 'draw' }]),
    }
    return { state: finished, card: null, events: [] }
  }

  const wall = [...state.wall]
  const card = fromBottom ? wall.pop() : wall.shift()
  if (!card) return { state, card: null, events: [] }

  const players = state.players.map((player) =>
    player.seat === seat ? { ...player, hand: [...player.hand, card] } : player,
  )
  const event: GameEvent = { type: 'drew', seat, card, fromBottom }
  return {
    state: { ...state, players, wall, log: withLog(state, [event]) },
    card,
    events: [event],
  }
}

/** 进入某座位的回合（需要则先摸牌）。 */
function enterTurn(state: GameState, seat: number, needsDraw: boolean): GameState {
  const base: GameState = { ...state, phase: 'turn', currentSeat: seat, needsDraw, pendingClaims: [], claimIndex: 0 }
  if (!needsDraw) return base
  return draw(base, seat, false).state
}

/** 计算某张弃牌引发的响应，按优先级 + 下家优先排序。 */
function computeClaims(state: GameState, discarder: number, card: Card): ClaimOption[] {
  const order = ['hu', 'zhao', 'dui'] as const
  const found: ClaimOption[] = []
  for (let offset = 1; offset < SEATS; offset += 1) {
    const seat = (discarder + offset) % SEATS
    for (const kind of order) {
      if (kind === 'hu' && canHuOn(state, seat, card)) found.push({ seat, kind })
      if (kind === 'zhao' && canZhaoOn(state, seat, card)) found.push({ seat, kind })
      if (kind === 'dui' && canDuiOn(state, seat, card)) found.push({ seat, kind })
    }
  }
  const rank = new Map(order.map((kind, index) => [kind, index]))
  const turnRank = (seat: number): number => (seat - discarder + SEATS) % SEATS
  return found.sort((a, b) => {
    const byKind = (rank.get(a.kind) ?? 0) - (rank.get(b.kind) ?? 0)
    if (byKind !== 0) return byKind
    return turnRank(a.seat) - turnRank(b.seat)
  })
}

function takeFromHand(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const ids = new Set(cards.map((card) => card.id))
  return hand.filter((card) => !ids.has(card.id))
}

function cardsOfChar(player: PlayerState, char: TileChar, count: number): Card[] {
  return player.hand.filter((card) => card.char === char).slice(0, count)
}

/** 结算胡牌。 */
function finishWithHu(
  state: GameState,
  winner: number,
  from: number | null,
  extraCard: Card | null,
): GameState {
  const player = playerAt(state, winner)
  const cards = extraCard ? [...allCardsOf(player), extraCard] : allCardsOf(player)
  const evaluation = evaluateHand(cards, state.ruleSet, { fixedUnits: fixedUnitsOf(player) })
  const hu = evaluation.best?.score.hu ?? 0
  const event: GameEvent = { type: 'hu', seat: winner, from, hu }
  return {
    ...state,
    phase: 'finished',
    result: { kind: 'hu', winner, from, hu, shape: evaluation.best?.shape ?? null },
    log: withLog(state, [event]),
  }
}

// ─────────────────────────────────────────────── 归约

function requireActing(state: GameState, seat: number): void {
  const expected = actingSeat(state)
  if (seat !== expected) {
    throw new IllegalActionError(`还没轮到座位 ${seat}（当前应行动：${expected}）`)
  }
}

export function reduce(state: GameState, action: GameAction): GameState {
  if (state.phase === 'finished') {
    throw new IllegalActionError('本局已结束')
  }
  requireActing(state, action.seat)

  switch (action.type) {
    case 'discard': {
      if (state.phase !== 'turn') throw new IllegalActionError('当前不能打牌')
      const player = playerAt(state, action.seat)
      const card = player.hand.find((item) => item.id === action.cardId)
      if (!card) throw new IllegalActionError(`手上没有这张牌：${action.cardId}`)

      const players = state.players.map((item) =>
        item.seat === action.seat ? { ...item, hand: takeFromHand(item.hand, [card]) } : item,
      )
      const discards = [...state.discards, { seat: action.seat, card }]
      const event: GameEvent = { type: 'discarded', seat: action.seat, card }
      const next: GameState = { ...state, players, discards, log: withLog(state, [event]) }

      const claims = computeClaims(next, action.seat, card)
      if (claims.length > 0) {
        return { ...next, phase: 'claim', pendingClaims: claims, claimIndex: 0 }
      }
      return enterTurn(next, (action.seat + 1) % SEATS, true)
    }

    case 'hu': {
      if (state.phase !== 'turn') throw new IllegalActionError('只能用 claim 胡别人的牌')
      if (!canHuNow(state, action.seat)) throw new IllegalActionError('当前牌型不满足胡牌条件')
      return finishWithHu(state, action.seat, null, null)
    }

    case 'zha': {
      const player = playerAt(state, action.seat)
      const valid = state.phase === 'turn' || state.phase === 'qingtong'
      if (!valid) throw new IllegalActionError('当前不能扎')

      const own = cardsOfChar(player, action.char, 4)
      const fromHand = own.length === 4
      const duiMeld = player.melds.find(
        (meld) => meld.via === 'dui' && meld.char === action.char && meld.kind === 'kan',
      )
      const upgradeCards = duiMeld ? cardsOfChar(player, action.char, 1) : []

      if (!fromHand && !(duiMeld && upgradeCards.length === 1)) {
        throw new IllegalActionError(`不能扎「${action.char}」：手上不足 4 张，也没有可升级的对`)
      }

      const used = fromHand ? own : upgradeCards
      const cards = duiMeld ? [...duiMeld.cards, ...used] : own
      const melds = player.melds
        .filter((meld) => meld !== duiMeld)
        .concat({
          kind: 'zha',
          char: action.char,
          cards,
          revealed: Boolean(duiMeld),
          via: 'zha',
        })

      const updated: GameState = {
        ...state,
        players: state.players.map((item) =>
          item.seat === action.seat ? { ...item, hand: takeFromHand(item.hand, used), melds } : item,
        ),
        log: withLog(state, [
          { type: 'melded', seat: action.seat, kind: 'zha', char: action.char, via: 'zha' },
        ]),
      }
      return draw(updated, action.seat, true).state
    }

    case 'fan': {
      const player = playerAt(state, action.seat)
      if (state.phase !== 'turn' && state.phase !== 'qingtong') {
        throw new IllegalActionError('当前不能开泛')
      }
      const meldIndex = player.melds.findIndex(
        (meld) => meld.kind === 'zha' && meld.char === action.char,
      )
      const base = player.melds[meldIndex]
      if (!base) throw new IllegalActionError(`没有可开泛的扎：${action.char}`)
      const used = cardsOfChar(player, action.char, 1)
      if (used.length < 1) throw new IllegalActionError(`手上没有「${action.char}」可以开泛`)

      const melds = [...player.melds]
      melds[meldIndex] = {
        kind: 'fan',
        char: action.char,
        cards: [...base.cards, ...used],
        revealed: base.revealed,
        via: 'fan',
      }
      const updated: GameState = {
        ...state,
        players: state.players.map((item) =>
          item.seat === action.seat ? { ...item, hand: takeFromHand(item.hand, used), melds } : item,
        ),
        log: withLog(state, [
          { type: 'melded', seat: action.seat, kind: 'fan', char: action.char, via: 'fan' },
        ]),
      }
      return draw(updated, action.seat, true).state
    }

    case 'claim': {
      if (state.phase !== 'claim') throw new IllegalActionError('当前没有可响应的牌')
      const option = state.pendingClaims[state.claimIndex]
      if (!option || option.seat !== action.seat || option.kind !== action.kind) {
        throw new IllegalActionError('这个响应不合法')
      }
      const discardRecord = state.discards[state.discards.length - 1]
      if (!discardRecord) throw new IllegalActionError('没有可响应的弃牌')
      const card = discardRecord.card

      if (action.kind === 'hu') {
        return finishWithHu(state, action.seat, discardRecord.seat, card)
      }

      const player = playerAt(state, action.seat)
      const need = action.kind === 'zhao' ? 3 : 2
      const used = cardsOfChar(player, card.char, need)
      if (used.length < need) throw new IllegalActionError('手上牌不够，无法响应')

      const meld: MeldGroup =
        action.kind === 'zhao'
          ? { kind: 'zha', char: card.char, cards: [...used, card], revealed: true, via: 'zhao' }
          : { kind: 'kan', char: card.char, cards: [...used, card], revealed: true, via: 'dui' }

      const players = state.players.map((item) =>
        item.seat === action.seat
          ? {
              ...item,
              hand: takeFromHand(item.hand, used),
              melds: [...item.melds, meld],
              duiCount: item.duiCount + (action.kind === 'dui' ? 1 : 0),
            }
          : item,
      )

      // 弃牌已被别人取走，从弃牌堆里移除
      const discards = state.discards.slice(0, -1)
      const event: GameEvent = {
        type: 'melded',
        seat: action.seat,
        kind: meld.kind,
        char: card.char,
        via: meld.via,
      }
      const claimed: GameState = {
        ...state,
        players,
        discards,
        log: withLog(state, [event]),
      }

      if (action.kind === 'zhao') {
        // 招：补一张，然后由招的人打牌
        return draw({ ...claimed, phase: 'turn', currentSeat: action.seat }, action.seat, true).state
      }
      // 对：不摸牌、不退张，直接打 1 张
      return { ...claimed, phase: 'turn', currentSeat: action.seat, needsDraw: false, pendingClaims: [], claimIndex: 0 }
    }

    case 'pass': {
      if (state.phase === 'claim') {
        const nextIndex = state.claimIndex + 1
        if (nextIndex < state.pendingClaims.length) {
          return {
            ...state,
            claimIndex: nextIndex,
            log: withLog(state, [{ type: 'passed', seat: action.seat }]),
          }
        }
        const discarder = state.discards[state.discards.length - 1]?.seat ?? state.currentSeat
        return enterTurn(
          { ...state, log: withLog(state, [{ type: 'passed', seat: action.seat }]) },
          (discarder + 1) % SEATS,
          true,
        )
      }

      if (state.phase === 'qingtong') {
        const nextIndex = state.qingtongIndex + 1
        const nextSeat = state.qingtongQueue[nextIndex]
        if (nextSeat === undefined) {
          // 请统结束 → 庄家先打
          return {
            ...state,
            phase: 'turn',
            currentSeat: state.dealer,
            needsDraw: false,
            log: withLog(state, [{ type: 'passed', seat: action.seat }]),
          }
        }
        return {
          ...state,
          qingtongIndex: nextIndex,
          currentSeat: nextSeat,
          log: withLog(state, [{ type: 'passed', seat: action.seat }]),
        }
      }

      throw new IllegalActionError('当前没有可以过的操作')
    }
  }
}

/** 给 UI / 测试用：某人手上的字计数。 */
export function handCountsOf(player: PlayerState): Map<TileChar, number> {
  const counts = new Map<TileChar, number>()
  for (const card of player.hand) {
    counts.set(card.char, (counts.get(card.char) ?? 0) + 1)
  }
  return counts
}
