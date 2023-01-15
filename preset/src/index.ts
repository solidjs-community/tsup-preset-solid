import { solidPlugin } from 'esbuild-plugin-solid'
import path from 'path'
import { defineConfig as tsupDefineConfig, Format, Options } from 'tsup'
import type { PackageJson } from 'type-fest'

const cwd = process.cwd()

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export type PresetOptions = {
  entry: string
  devEntry?: true | undefined | string
  serverEntry?: true | undefined | string
  dropConsole?: true | undefined
  foramt?: Options['format']
  outDir?: string | undefined
  tsupOptions?: (config: Options) => Options
}

export type ExportOptions = {
  writePackageJson?: true | undefined
  printInstructions?: true | undefined
}

const DEFAULT_FORMAT: Format[] = ['esm', 'cjs']

export function defineConfig(
  userOptions: PresetOptions | PresetOptions[],
  exportsOptons?: ExportOptions,
): ReturnType<typeof tsupDefineConfig> {
  return tsupDefineConfig(config => {
    const watching = !!config.watch
    const shouldCollectExports = !!(
      exportsOptons?.writePackageJson || exportsOptons?.printInstructions
    )

    type Browser = Exclude<PackageJson['browser'], string | undefined>
    type Exports = {
      [path: string]: PackageJson.Exports
    }
    const exports: PackageJson = {
      type: 'module',
      browser: {},
      exports: {},
    }

    const isSingleEntry = !Array.isArray(userOptions) || userOptions.length === 1

    const nestedOptions = asArray(userOptions).map((options, i) => {
      const outDir = options.outDir ? `./${options.outDir}` : './dist'
      const entryFilename = path.basename(path.normalize(options.entry)).split('.')[0]
      const mainExport = `${outDir}/${
        isSingleEntry ? entryFilename : `${entryFilename}/${entryFilename}`
      }`
      const userFormat = options.foramt ?? DEFAULT_FORMAT
      const hasCjs = userFormat.includes('cjs')
      const hasJSX = options.entry.endsWith('.jsx') || options.entry.endsWith('.tsx')
      const hasDev = !!options.devEntry
      const hasServer = !!options.serverEntry
      const devExport = `${mainExport}.dev`
      const serverExport = `${mainExport}.server`
      const handleOptions = options.tsupOptions ?? (o => o)

      const typesExport = `${outDir}/${entryFilename}.d.ts`

      if (shouldCollectExports) {
        if (i === 0) {
          exports.main = `${hasServer ? serverExport : mainExport}.${hasCjs ? 'cjs' : 'js'}`
          exports.module = `${hasServer ? serverExport : mainExport}.js`
          exports.types = typesExport
        }
        if (hasServer) {
          const b = exports.browser as Browser
          b[`${serverExport}.js`] = `${mainExport}.js`
          if (hasCjs) b[`${serverExport}.cjs`] = `${mainExport}.cjs`
        }

        function getConditions(type: 'server' | 'main') {
          const filename = type === 'server' ? serverExport : mainExport
          return {
            ...(hasDev &&
              type === 'main' && {
                development: {
                  import: {
                    types: typesExport,
                    default: `${devExport}.js`,
                  },
                  ...(hasCjs && { require: `${devExport}.cjs` }),
                },
              }),
            import: {
              types: typesExport,
              import: `${filename}.js`,
            },
            ...(hasCjs && { require: `${filename}.cjs` }),
          } as const
        }

        ;(exports.exports as Exports)[`${entryFilename === 'index' ? '.' : `./${entryFilename}`}`] =
          {
            ...(hasServer && {
              worker: getConditions('server'),
              deno: getConditions('server'),
              node: getConditions('server'),
            }),
            browser: getConditions('main'),
            ...getConditions('main'),
          }
      }

      const permutations = [{ dev: false, solid: false, server: false }]
      if (hasDev) {
        permutations.push({ dev: true, solid: false, server: false })
        if (hasJSX) permutations.push({ dev: true, solid: true, server: false })
      }
      if (hasServer) {
        permutations.push({ dev: false, solid: false, server: true })
        if (hasJSX) permutations.push({ dev: false, solid: true, server: true })
      }
      if (hasJSX) permutations.push({ dev: false, solid: true, server: false })

      return permutations.map(({ dev, solid, server }, j) => {
        return handleOptions({
          target: 'esnext',
          format: solid || watching ? 'esm' : userFormat,
          clean: i === 0 && j === 0,
          dts: j === 0 ? options.entry : undefined,
          entry: {
            [`${dev ? devExport : server ? serverExport : mainExport}`]:
              dev && typeof options.devEntry === 'string'
                ? options.devEntry
                : server && typeof options.serverEntry === 'string'
                ? options.serverEntry
                : options.entry,
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

            if (!dev && options.dropConsole) esbuildOptions.drop = ['console', 'debugger']

            return esbuildOptions
          },
          outExtension({ format }) {
            if (format === 'esm' && solid) return { js: '.jsx' }
            return {}
          },
          esbuildPlugins: !solid ? [solidPlugin() as any] : undefined,
        })
      })
    })

    console.log(JSON.stringify(exports, null, 2))

    return nestedOptions.flat()
  })
}
