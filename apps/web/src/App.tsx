import { ENGINE_VERSION } from '@huapai/engine'

/**
 * M0 骨架：横屏三带版面的占位实现。
 *  - 顶部信息条 28
 *  - 主区（左 AI ｜ 弃牌/牌墙 ｜ 右 AI）128
 *  - 底部带（手牌列区 ｜ 明牌列区）182
 * M5 会把三个带换成真实牌桌。
 */
export function App() {
  return (
    <div className="hz-app">
      <header className="hz-info-bar">
        <span className="hz-info-bar__title">宜昌花牌 · 上大人</span>
        <span className="hz-info-bar__hint">M0 骨架就绪 · engine v{ENGINE_VERSION}</span>
      </header>

      <main className="hz-table">
        <section className="hz-seat hz-seat--left">
          <span className="hz-seat__name">上家（AI）</span>
          <span className="hz-seat__count">25 张</span>
        </section>

        <section className="hz-center">
          <span className="hz-center__label">牌墙 / 弃牌堆</span>
        </section>

        <section className="hz-seat hz-seat--right">
          <span className="hz-seat__name">下家（AI）</span>
          <span className="hz-seat__count">25 张</span>
        </section>
      </main>

      <footer className="hz-hand-band">
        <div className="hz-hand-band__hand">
          <span className="hz-zone-label">你的手牌（M5：分列竖向堆叠）</span>
        </div>
        <div className="hz-hand-band__melds">
          <span className="hz-zone-label">明牌（对 / 开招 / 踏船 / 开泛）</span>
        </div>
      </footer>

      <div className="hz-rotate-guard">
        <div className="hz-rotate-guard__box">
          <strong>请横屏</strong>
          <span>本游戏按横屏设计，手牌单排好理牌。</span>
        </div>
      </div>
    </div>
  )
}
