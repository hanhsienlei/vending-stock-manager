import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    // Build output, dependencies, and the agent worktrees that live inside the
    // repository. The worktree globs mirror `vite.config.ts`'s test excludes,
    // and for the same reason: each worktree carries a full copy of the source,
    // so linting them doubles every report.
    ignores: ['dist', 'dev-dist', 'node_modules', '.claude/**', '.worktrees/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // An unused argument named with a leading underscore is a deliberate
      // signal that a signature is being satisfied, not an oversight.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Warn, not error. Every current report is the load-on-mount pattern:
      // `useEffect(() => { void reload() })`, where `reload` is async and its
      // `setState` calls run after an `await`, so they land in a microtask
      // rather than synchronously in the effect body. The rule cannot see
      // through that boundary. The pattern is still worth migrating to a
      // proper external store eventually, so this stays visible instead of
      // being switched off (see docs/known-gaps.md).
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  {
    // `clicked = this` inside `function (this: HTMLAnchorElement)` is a spy
    // capturing which anchor was clicked, which is the assertion itself. The
    // rule exists for `const self = this` closures and misreads this one.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-this-alias': 'off' },
  },

  {
    // Node context: config files and the domain purity test, which reads the
    // source tree off disk.
    files: ['*.config.{ts,js}', 'src/domain/purity.test.ts'],
    languageOptions: { globals: globals.node },
  },
)
