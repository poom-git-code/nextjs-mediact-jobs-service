import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'src/app/repositories/**/*.{js,ts}',
        'src/app/controllers/**/*.{js,ts}',
        'src/app/external-services/**/*.{js,ts}',
        'src/app-configs/**/*.{js,ts}',
        'src/modules/**/*.{js,ts}',
        'src/app.module.ts',
        'src/main.ts',
      ],
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      src: path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    // SWC plugin to support emitDecoratorMetadata for NestJS
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
})
