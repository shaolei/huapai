import {
  type GameAction,
  type MeldGroup,
  type PlayerState,
  type RuleSet,
  arrangeConcealed,
  actingSeat,
  playerAt,
} from '@huapai/engine'
import { useEffect, useMemo, useRef, useState } from 'react'

import { layoutHand } from '../game/layoutHand'
import { HUMAN_SEAT, type GameStore, type StoreSnapshot } from '../game/store'
import { CardFace } from './CardFace'

const SEAT_LABEL: Readonly<Record<number, string>> = { 1: '上家', 2: '下家' }
const VIA_LABEL: Readonly<Record<MeldGroup['via'], string>> = {
  dui: '对',
  zhao: '招',
  zha: '扎',
  fan: '泛',
}

function MeldChip({ meld, ruleSet }: { meld: MeldGroup; ruleSet: RuleSet }) {
  const hasFlower = meld.cards.some((card) => card.variant === 'flower')
  return (
    <span className={`hz-chip${meld.revealed ? ' is-open' : ' is-hidden'}`}>
      <b>{meld.char}</b>
      <em>×{meld.cards.length}</em>
      <i>{VIA_LABEL[meld.via]}</i>
      {hasFlower ? <i className="hz-mark hz-mark--flower">花</i> : null}
      {ruleSet.jingChars.includes(meld.char) ? <i className="hz-mark hz-mark--jing">精</i> : null}
    </span>
  )
}

function OpponentPanel({
  player,
  ruleSet,
  seat,
  isActing,
}: {
  player: PlayerState
  ruleSet: RuleSet
  seat: number
  isActing: boolean
}) {
  return (
    <section className={`hz-seat${isActing ? ' is-acting' : ''}`}>
      <header className="hz-seat__head">
        <span className="hz-seat__name">
          {SEAT_LABEL[seat] ?? seat}（AI）
        </span>
        <span className="hz-seat__count">{player.hand.length} 张</span>
      </header>
      <div className="hz-seat__melds">
        {player.melds.length === 0 ? (
          <span className="hz-hint">无副露</span>
        ) : (
          player.melds.map((meld, index) => (
            <MeldChip key={`${meld.char}-${index}`} meld={meld} ruleSet={ruleSet} />
          ))
        )}
      </div>
      {player.duiCount > 0 ? <span className="hz-hint">已对 {player.duiCount} 对</span> : null}
    </section>
  )
}

export function TableScreen({ store, snap }: { store: GameStore; snap: StoreSnapshot }) {
  const { state } = snap
  const ruleSet = state.ruleSet
  const human = playerAt(state, HUMAN_SEAT)
  const acting = actingSeat(state)

  const handRef = useRef<HTMLDivElement>(null)
  const [band, setBand] = useState({ width: 630, height: 182 })

  useEffect(() => {
    const element = handRef.current
    if (!element) return
    const update = (): void => {
      setBand({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = useMemo(() => arrangeConcealed(human.hand), [human.hand])
  const layout = useMemo(
    () => layoutHand({ columns, availableWidth: band.width, availableHeight: band.height }),
    [columns, band.width, band.height],
  )

  // 人类当前能打的牌（其余牌点了也没用）
  const discardable = useMemo(() => {
    const ids = new Set<number>()
    for (const action of snap.legal) {
      if (action.type === 'discard') ids.add(action.cardId)
    }
    return ids
  }, [snap.legal])

  const selectedAction: GameAction | null = useMemo(() => {
    if (snap.selectedCardId === null) return null
    return (
      snap.legal.find(
        (action) => action.type === 'discard' && action.cardId === snap.selectedCardId,
      ) ?? null
    )
  }, [snap.legal, snap.selectedCardId])

  const huAction = snap.legal.find(
    (action) => action.type === 'hu' || (action.type === 'claim' && action.kind === 'hu'),
  )
  const claimActions = snap.legal.filter(
    (action) => action.type === 'claim' && action.kind !== 'hu',
  )
  const meldActions = snap.legal.filter(
    (action) => action.type === 'zha' || action.type === 'fan',
  )
  const passAction = snap.legal.find((action) => action.type === 'pass')

  const recentDiscards = state.discards.slice(-16)

  const phaseHint =
    state.phase === 'finished'
      ? '本局结束'
      : state.phase === 'qingtong'
        ? '请统阶段'
        : acting === HUMAN_SEAT
          ? '轮到你'
          : `${SEAT_LABEL[acting] ?? acting}（AI）思考中…`

  return (
    <div className="hz-app">
      <header className="hz-info-bar">
        <span className="hz-info-bar__title">
          宜昌花牌 · {phaseHint}
          {acting === HUMAN_SEAT && state.phase === 'turn' ? ' · 请打一张' : ''}
          {acting === HUMAN_SEAT && state.phase === 'claim' ? ' · 请选择是否响应' : ''}
        </span>
        <span className="hz-info-bar__hint">
          {human.hand.length} 张 · 牌墙 {state.wall.length} · 主精（自动判定）
          {layout.scrolls ? ' · 手牌可横向滑动' : ''}
        </span>
      </header>

      <main className="hz-table">
        <OpponentPanel
          player={playerAt(state, 1)}
          ruleSet={ruleSet}
          seat={1}
          isActing={acting === 1}
        />

        <section className="hz-center">
          <div className="hz-center__wall">
            牌墙 <b>{state.wall.length}</b>
          </div>
          <div className="hz-discards">
            {recentDiscards.length === 0 ? (
              <span className="hz-hint">还没有人打牌</span>
            ) : (
              recentDiscards.map((record, index) => (
                <span key={`${record.card.id}-${index}`} className="hz-discard" title={`${record.seat} 号位打出`}>
                  <CardFace card={record.card} ruleSet={ruleSet} small />
                </span>
              ))
            )}
          </div>
        </section>

        <OpponentPanel
          player={playerAt(state, 2)}
          ruleSet={ruleSet}
          seat={2}
          isActing={acting === 2}
        />
      </main>

      <footer className="hz-hand-band">
        <div
          className="hz-hand"
          ref={handRef}
          style={{ overflowX: layout.scrolls ? 'auto' : 'hidden' }}
        >
          <div
            className="hz-hand__inner"
            style={{
              width: layout.totalWidth,
              height: layout.totalHeight,
              ['--hz-card-w' as string]: `${layout.cardWidth}px`,
              ['--hz-card-h' as string]: `${layout.cardHeight}px`,
              ['--hz-band' as string]: `${layout.stackStep}px`,
            }}
          >
            {layout.placed.map((column) => (
              <div
                key={column.key}
                className={`hz-col hz-col--${column.kind}${column.packed ? ' is-packed' : ''}`}
                style={{
                  left: column.x,
                  width: layout.cardWidth,
                  height: column.height,
                }}
              >
                {column.cards.map((card, index) => (
                  <div
                    key={card.id}
                    className="hz-col__slot"
                    style={{
                      top: column.offsets[index] ?? 0,
                      width: layout.cardWidth,
                      height: layout.cardHeight,
                    }}
                  >
                    <CardFace
                      card={card}
                      ruleSet={ruleSet}
                      selected={snap.selectedCardId === card.id}
                      onClick={
                        discardable.has(card.id) ? () => store.select(card.id) : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="hz-hand-band__melds">
          <span className="hz-zone-label">明牌</span>
          {human.melds.length === 0 ? (
            <span className="hz-hint">无</span>
          ) : (
            human.melds.map((meld, index) => (
              <MeldChip key={`${meld.char}-${index}`} meld={meld} ruleSet={ruleSet} />
            ))
          )}
        </div>
      </footer>

      {snap.legal.length > 0 ? (
        <div className="hz-action-bar">
          {huAction ? (
            <button
              type="button"
              className="hz-btn is-primary"
              onClick={() => store.play(huAction)}
            >
              胡
            </button>
          ) : null}

          {meldActions.map((action) =>
            action.type === 'zha' || action.type === 'fan' ? (
              <button
                key={`${action.type}-${action.char}`}
                type="button"
                className="hz-btn"
                onClick={() => store.play(action)}
              >
                {action.type === 'zha' ? '扎' : '开泛'} {action.char}
              </button>
            ) : null,
          )}

          {claimActions.map((action) =>
            action.type === 'claim' ? (
              <button
                key={action.kind}
                type="button"
                className="hz-btn is-primary"
                onClick={() => store.play(action)}
              >
                {action.kind === 'zhao' ? '招' : '对'}
              </button>
            ) : null,
          )}

          {selectedAction ? (
            <button
              type="button"
              className="hz-btn is-primary"
              onClick={() => store.play(selectedAction)}
            >
              打出{state.players[HUMAN_SEAT]?.hand.find((c) => c.id === snap.selectedCardId)?.char ?? ''}
            </button>
          ) : null}

          {passAction ? (
            <button type="button" className="hz-btn" onClick={() => store.play(passAction)}>
              {state.phase === 'qingtong' ? '不扎' : state.phase === 'claim' ? '过' : '不要'}
            </button>
          ) : null}

          {selectedAction === null && !huAction && claimActions.length === 0 && passAction === null ? (
            <span className="hz-hint hz-hint--bar">点手牌选牌，再按「打出」</span>
          ) : null}
        </div>
      ) : (
        <div className="hz-action-bar hz-action-bar--quiet">
          <span className="hz-hint hz-hint--bar">{phaseHint}</span>
        </div>
      )}

      {state.phase === 'finished' ? (
        <div className="hz-overlay">
          <div className="hz-overlay__box">
            <h2>
              {state.result?.kind === 'hu'
                ? `${state.result.winner === HUMAN_SEAT ? '你胡了！' : `${SEAT_LABEL[state.result.winner ?? -1] ?? 'AI'}胡了`}`
                : '黄庄（牌墙摸完）'}
            </h2>
            {state.result?.kind === 'hu' ? (
              <p>
                {state.result.hu} 胡 · {state.result.from === null ? '自摸' : '点炮'}
              </p>
            ) : (
              <p>无人胡牌，流局</p>
            )}
            <button type="button" className="hz-btn is-primary" onClick={() => store.newGame()}>
              再来一局
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
