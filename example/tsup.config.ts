import { defineConfig } from '../src'

export default defineConfig(
    [
        {
            entry: 'src/index.tsx',
            // devEntry: 'src/dev.tsx',
            // serverEntry: 'src/server.tsx',
            devEntry: true,
            serverEntry: true,
        },
        {
            name: 'additional',
            entry: 'src/additional/index.ts',
            // devEntry: true,
            serverEntry: true,
        },
        {
            entry: 'src/shared.ts',
        },
    ],
    {
        writePackageJson: true,
        // printInstructions: true,
        dropConsole: true,
        // cjs: true,
    },
)
