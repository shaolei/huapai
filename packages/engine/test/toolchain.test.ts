import { describe, expect, it } from 'vitest'

import { ENGINE_VERSION } from '../src/index'

describe('engine 工具链自检', () => {
  it('导出引擎版本号', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
  })
})
