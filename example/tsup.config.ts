import { defineConfig } from '../src'

export default defineConfig(
  [
    {
      entry: 'src/index.tsx',
      // devEntry: 'src/dev.tsx',
      // serverEntry: 'src/server.tsx',
      devEntry: true,
      serverEntry: true,
      dropConsole: true,
      foramt: 'esm',
    },
    {
      entry: 'src/additional.ts',
    },
  ],
  {
    printInstructions: true,
  },
)
