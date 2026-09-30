import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App 骨架', () => {
  it('渲染出三段式横屏版面', () => {
    render(<App />)
    expect(screen.getByText('宜昌花牌 · 上大人')).toBeDefined()
    expect(screen.getByText('上家（AI）')).toBeDefined()
    expect(screen.getByText('下家（AI）')).toBeDefined()
    expect(screen.getByText('请横屏')).toBeDefined()
  })
})
