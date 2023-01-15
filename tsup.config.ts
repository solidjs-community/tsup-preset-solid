import { defineConfig, Options } from 'tsup'

export default defineConfig(config => {
  const watching = !!config.watch
  const inputPath = 'src/index.ts'

  return {
    clean: true,
    target: 'esnext',
    format: 'esm',
    entry: [inputPath],
    dts: inputPath,
  } satisfies Options
})
