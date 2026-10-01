import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { App } from './App'

// 项目里不启用 vitest globals，所以 RTL 的自动清理不会生效，必须自己收尾，
// 否则同一个文件里的多次 render 会在 DOM 里叠加。
afterEach(cleanup)

describe('App', () => {
  it('首屏是首页：有标题、难度选择和开始按钮', () => {
    render(<App />)
    expect(screen.getByText('宜昌花牌')).toBeDefined()
    expect(screen.getByText('开始游戏')).toBeDefined()
    expect(screen.getByText('轻松')).toBeDefined()
    expect(screen.getByText('普通')).toBeDefined()
    expect(screen.getByText('较难')).toBeDefined()
  })

  it('说明了核心规则口径（8 个单元 + 2 张听头、≥17 胡）', () => {
    render(<App />)
    expect(screen.getByText(/8 个单元 \+ 2 张听头/)).toBeDefined()
  })

  it('有竖屏遮罩节点（CSS 在竖屏时显示）', () => {
    render(<App />)
    expect(screen.getByText('请横屏')).toBeDefined()
  })
})
