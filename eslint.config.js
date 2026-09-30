import tseslint from 'typescript-eslint'

/**
 * 核心纪律：packages/engine 是纯 TypeScript —— 不得触碰 React、DOM 或任何 app 层代码。
 * tsconfig 那边靠 `"lib": ["ES2022"]`（无 DOM）守一道，这里靠 lint 再守一道。
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.cache/**',
      '**/coverage/**',
      'apps/web/android/**',
    ],
  },
  tseslint.configs.recommended,
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'react/**', 'react-dom/**'],
              message: 'engine 必须是纯 TS：不得引入 React。',
            },
            {
              group: ['@huapai/web', '../../apps/*', '../../../apps/*'],
              message: 'engine 不得反向依赖 app 层代码。',
            },
            {
              group: ['node:*', 'fs', 'path', 'os', 'child_process'],
              message: 'engine 不得触碰 Node/系统 API，保证可在浏览器与安卓 WebView 中运行。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/**/*.test.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['**/*.config.{js,ts}', '**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
)
