import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'none',
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['src/*', 'src/**'],
              message:
                '❌ Do not use absolute imports starting with "src/". Use relative imports instead. Example: use "../../app-configs/configs/constant.config" instead of "src/app-configs/configs/constant.config"',
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**', '.eslintrc.js'],
  },
]
