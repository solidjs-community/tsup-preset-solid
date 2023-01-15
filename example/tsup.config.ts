import { defineConfig } from '../preset/src'

export default defineConfig(
  [
    {
      entry: 'src/index.tsx',
      // devEntry: 'src/dev.tsx',
      // serverEntry: 'src/server.tsx',
      devEntry: true,
      // serverEntry: true,
      dropConsole: true,
    },
    {
      entry: 'src/additional.ts',
    },
  ],
  {
    printInstructions: true,
  },
)
