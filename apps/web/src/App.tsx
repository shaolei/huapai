import { AI_DIFFICULTIES, type AiDifficulty } from '@huapai/engine'
import { useEffect, useMemo, useState } from 'react'

import { TableScreen } from './components/TableScreen'
import { GameStore, useGame } from './game/store'

type Screen = 'home' | 'table'

const DIFFICULTY_LABEL: Readonly<Record<AiDifficulty, string>> = {
  easy: '轻松',
  normal: '普通',
  hard: '较难',
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [difficulty, setDifficulty] = useState<AiDifficulty>('normal')

  // 换难度就换一个新的 store（等于重开一局）
  const store = useMemo(() => new GameStore({ difficulty }), [difficulty])
  useEffect(() => () => store.dispose(), [store])

  const snap = useGame(store)

  if (screen === 'table') {
    return <TableScreen store={store} snap={snap} />
  }

  return (
    <div className="hz-app hz-app--home">
      <header className="hz-info-bar">
        <span className="hz-info-bar__title">宜昌花牌 · 上大人</span>
        <span className="hz-info-bar__hint">单机 · 1 人 + 2 AI · 横屏</span>
      </header>

      <main className="hz-home">
        <h1 className="hz-home__title">宜昌花牌</h1>
        <p className="hz-home__sub">
          110 张 · 三人局 · 胡牌 = 8 个单元 + 2 张听头，且至少 17 胡
        </p>

        <div className="hz-home__group">
          <span className="hz-home__label">AI 难度</span>
          <div className="hz-home__buttons">
            {AI_DIFFICULTIES.map((item) => (
              <button
                key={item}
                type="button"
                className={`hz-btn${item === difficulty ? ' is-primary' : ''}`}
                onClick={() => setDifficulty(item)}
              >
                {DIFFICULTY_LABEL[item]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="hz-btn is-primary hz-btn--big"
          onClick={() => {
            store.newGame()
            store.start()
            setScreen('table')
          }}
        >
          开始游戏
        </button>

        <p className="hz-home__tip">
          手牌按「单元」分列堆叠：一列就是一句/坎/扎/泛，列数 = 你离胡牌还差多远。
        </p>
      </main>

      <div className="hz-rotate-guard">
        <div className="hz-rotate-guard__box">
          <strong>请横屏</strong>
          <span>本游戏按横屏设计，手牌单排好理牌。</span>
        </div>
      </div>
    </div>
  )
}
