import { solidPlugin } from 'esbuild-plugin-solid'
import { defineConfig as tsupDefineConfig, Format, Options } from 'tsup'

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export type PresetOptions = {
  entry: string
  devEntry?: true | undefined | string
  serverEntry?: true | undefined | string
  dropConsole?: true | undefined
  foramt?: Options['format']
  tsupOptions?: (config: Options) => Options
}

const DEFAULT_FORMAT: Format[] = ['esm', 'cjs']

export function defineConfig(
  options: PresetOptions | PresetOptions[],
): ReturnType<typeof tsupDefineConfig> {
  return tsupDefineConfig(config => {
    const watching = !!config.watch

    const nestedOptions = asArray(options).map((entry, i) => {
      const isJSX = entry.entry.endsWith('.jsx') || entry.entry.endsWith('.tsx')
      const isDev = !!entry.devEntry
      const isServer = !!entry.serverEntry
      const userFormat = entry.foramt ?? DEFAULT_FORMAT
      const handleOptions = entry.tsupOptions ?? (o => o)

      const permutations = [{ dev: false, solid: false, server: false }]
      if (isDev) {
        permutations.push({ dev: true, solid: false, server: false })
        if (isJSX) permutations.push({ dev: true, solid: true, server: false })
      }
      if (isServer) {
        permutations.push({ dev: false, solid: false, server: true })
        if (isJSX) permutations.push({ dev: false, solid: true, server: true })
      }
      if (isJSX) permutations.push({ dev: false, solid: true, server: false })

      return permutations.map(({ dev, solid, server }, j) =>
        handleOptions({
          target: 'esnext',
          format: solid || watching ? 'esm' : userFormat,
          clean: i === 0 && j === 0,
          dts: j === 0 ? entry.entry : undefined,
          entry: {
            [`index${dev ? '.dev' : server ? '.server' : ''}`]:
              dev && typeof entry.devEntry === 'string'
                ? entry.devEntry
                : server && typeof entry.serverEntry === 'string'
                ? entry.serverEntry
                : entry.entry,
          },
          treeshake: watching ? false : { preset: 'safest' },
          replaceNodeEnv: !watching,
          esbuildOptions(esbuildOptions) {
            esbuildOptions.define = {
              ...esbuildOptions.define,
              'process.env.NODE_ENV': dev ? `"development"` : `"production"`,
              'process.env.PROD': dev ? 'false' : 'true',
              'process.env.DEV': dev ? 'true' : 'false',
              'process.env.SSR': server ? 'true' : 'false',
              'import.meta.env.NODE_ENV': dev ? `"development"` : `"production"`,
              'import.meta.env.PROD': dev ? 'false' : 'true',
              'import.meta.env.DEV': dev ? 'true' : 'false',
              'import.meta.env.SSR': server ? 'true' : 'false',
            }
            esbuildOptions.jsx = 'preserve'

            if (!dev && entry.dropConsole) esbuildOptions.drop = ['console', 'debugger']

            return esbuildOptions
          },
          outExtension: ({ format }) => {
            if (format === 'esm' && solid) return { js: '.jsx' }
            return {}
          },
          esbuildPlugins: !solid ? [solidPlugin() as any] : undefined,
        }),
      )
    })

    return nestedOptions.flat()
  })
}
