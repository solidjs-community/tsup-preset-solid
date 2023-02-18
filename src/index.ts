import { solidPlugin } from 'esbuild-plugin-solid'
import fsp from 'fs/promises'
import path from 'path'
import { defineConfig as tsupDefineConfig, Options } from 'tsup'
import type { PackageJson } from 'type-fest'

export type EntryOptions = {
  name?: string | undefined
  /** entries with '.tsx' extension will have `solid` export condition generated */
  entry: string
  /** Setting `true` will generate a development-only entry (default: `false`) */
  devEntry?: boolean | string
  /** Setting `true` will generate a server-only entry (default: `false`) */
  serverEntry?: boolean | string
}

export type GlobalOptions = {
  /** Setting `true` will write export fields to package.json (default: `false`) */
  writePackageJson?: boolean | undefined
  /** Setting `true` will console.log the package.json fields (default: `false`)  */
  printInstructions?: boolean | undefined
  /** Setting `true` will remove all `console.*` calls and `debugger` statements (default: `false`) */
  dropConsole?: boolean | undefined
  tsupOptions?: (config: Options) => Options
  esbuildOptions?: Options['esbuildOptions']
  /** Additional esbuild plugins (solid one is already included) */
  esbuildPlugins?: Options['esbuildPlugins']
  /** Setting `true` will generate a CommonJS build alongside ESM (default: `false`) */
  cjs?: boolean | undefined
}

const CWD = process.cwd()
const PKG_PATH = path.join(CWD, 'package.json')
const CI =
  process.env['CI'] === 'true' ||
  process.env['GITHUB_ACTIONS'] === 'true' ||
  process.env['CI'] === '"1"' ||
  process.env['GITHUB_ACTIONS'] === '"1"'

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export function defineConfig(
  entryOptions: EntryOptions | EntryOptions[],
  globalOptions: GlobalOptions = {},
): ReturnType<typeof tsupDefineConfig> {
  return tsupDefineConfig(config => {
    const userEntries = asArray(entryOptions)
    const watching = !CI && !!config.watch
    const hasCjs = !!globalOptions.cjs
    const libFormat: Options['format'] = hasCjs ? ['esm', 'cjs'] : 'esm'
    const outDir = './dist/'

    const tsupOptions = globalOptions.tsupOptions ?? (x => x)
    const esbuildOptions = globalOptions.esbuildOptions ?? (x => x)
    const esbuildPlugins = globalOptions.esbuildPlugins ?? []

    const shouldCollectExports =
      !CI && !watching && !!(globalOptions?.writePackageJson || globalOptions?.printInstructions)

    const pkgfields: PackageJson = { browser: {}, exports: {}, typesVersions: {} }
    let buildsToComplete = watching ? Infinity : 0
    // Handle the last build to write the package.json
    async function onSuccess() {
      if (!shouldCollectExports || --buildsToComplete > 0) return

      if (globalOptions.printInstructions) {
        // eslint-disable-next-line no-console
        console.log(
          `\nTo use these exports, add the following to your package.json:\n\n${JSON.stringify(
            pkgfields,
            null,
            2,
          )}\n`,
        )
      }

      if (globalOptions.writePackageJson) {
        const pkg: PackageJson = await fsp.readFile(PKG_PATH, 'utf-8').then(JSON.parse)
        const newPkg = { ...pkg, ...pkgfields }
        await fsp.writeFile(PKG_PATH, JSON.stringify(newPkg, null, 2) + '\n', 'utf-8')
      }
    }

    const getExport = (fileName: string, exportName: string) =>
      `${userEntries.length === 1 ? '' : `${fileName}/`}${exportName}`

    //
    // Parse the entries
    //
    const parsedEntires = userEntries.map(options => {
      const entryFilename =
        options.name ?? path.basename(path.normalize(options.entry)).split('.')[0]!
      const mainExport = getExport(entryFilename, 'index')
      const devExport = getExport(entryFilename, 'dev')
      const serverExport = getExport(entryFilename, 'server')
      const typesExport = `${getExport(entryFilename, 'index')}.d.ts`

      const hasJSX = options.entry.endsWith('.jsx') || options.entry.endsWith('.tsx')
      const hasDev = !!options.devEntry
      const hasServer = !!options.serverEntry

      return {
        options,
        entryFilename,
        mainExport,
        devExport,
        serverExport,
        typesExport,
        hasJSX,
        hasDev,
        hasServer,
      }
    })

    type ParsedEntry = (typeof parsedEntires)[number]

    //
    // generate package.json exports
    //
    if (shouldCollectExports) {
      type Browser = Exclude<PackageJson['browser'], string | undefined>

      // "typeVersions" are for older versions of ts, but are still needed for some tools
      // They are only needed if there are multiple entries
      const typesVersions: NonNullable<NonNullable<PackageJson['typesVersions']>[string]> = {}
      if (userEntries.length !== 1) pkgfields.typesVersions = { '*': typesVersions }

      parsedEntires.forEach((e, i) => {
        const exports = {
          server: `${outDir}${e.serverExport}`,
          dev: `${outDir}${e.devExport}`,
          main: `${outDir}${e.mainExport}`,
          types: `${outDir}${e.typesExport}`,
        }

        if (i === 0) {
          pkgfields.main = `${e.hasServer ? exports.server : exports.main}.${hasCjs ? 'cjs' : 'js'}`
          pkgfields.module = `${e.hasServer ? exports.server : exports.main}.js`
          pkgfields.types = exports.types
        }
        if (e.hasServer) {
          const b = pkgfields.browser as Browser
          b[`${exports.server}.js`] = `${exports.main}.js`
          if (hasCjs) b[`${exports.server}.cjs`] = `${exports.main}.cjs`
        }

        const getImportConditions = (filename: string) => ({
          import: {
            types: exports.types,
            default: `${filename}.js`,
          },
          ...(hasCjs && { require: `${filename}.cjs` }),
        })
        const getConditions = (type: 'server' | 'main') => {
          const dev = e.hasDev && type === 'main'
          return {
            ...(e.hasJSX && {
              solid: dev
                ? {
                    development: `${exports.dev}.jsx`,
                    import: `${exports[type]}.jsx`,
                  }
                : `${exports[type]}.jsx`,
            }),
            ...(dev && { development: getImportConditions(exports.dev) }),
            ...getImportConditions(exports[type]),
          } as const
        }
        const allConditions: PackageJson.Exports = {
          ...(e.hasServer && {
            worker: getConditions('server'),
            browser: getConditions('main'),
            deno: getConditions('server'),
            node: getConditions('server'),
          }),
          ...getConditions('main'),
        }

        if (userEntries.length === 1) {
          pkgfields.exports = allConditions
        } else if (e.entryFilename === 'index') {
          ;(pkgfields.exports as any)['.'] = allConditions
        } else {
          ;(pkgfields.exports as any)[`./${e.entryFilename}`] = allConditions
          typesVersions[e.entryFilename] = [exports.types]
        }
      })
    }

    type Permutation = {
      readonly dev: boolean
      readonly server: boolean
      readonly jsx: boolean
      readonly entries: Set<ParsedEntry>
    }

    //
    // Generate all build permutations
    //
    const permutations = parsedEntires.reduce((acc: Permutation[], entry) => {
      for (const dev of [false, entry.hasDev]) {
        for (const server of [false, entry.hasServer]) {
          if (dev && server) continue
          for (const jsx of [false, entry.hasJSX]) {
            const permutation = acc.find(p => p.dev === dev && p.server === server && p.jsx === jsx)
            if (permutation) permutation.entries.add(entry)
            else acc.push({ dev, server, jsx, entries: new Set([entry]) })
          }
        }
      }
      return acc
    }, [])

    //
    // Generate the tsup config (build)
    //
    buildsToComplete = permutations.length

    return permutations.map(({ dev, jsx, server, entries }, i) => {
      const main = !dev && !jsx && !server

      return tsupOptions({
        target: 'esnext',
        platform: server ? 'node' : 'browser',
        format: watching || jsx ? 'esm' : libFormat,
        clean: i === 0,
        dts: main ? true : undefined,
        entry: (() => {
          const record: Record<string, string> = {}
          for (const e of entries) {
            record[dev ? e.devExport : server ? e.serverExport : e.mainExport] =
              dev && typeof e.options.devEntry === 'string'
                ? e.options.devEntry
                : server && typeof e.options.serverEntry === 'string'
                ? e.options.serverEntry
                : e.options.entry
          }
          return record
        })(),
        treeshake: watching ? false : { preset: 'safest' },
        replaceNodeEnv: true,
        esbuildOptions(esOptions, ctx) {
          esOptions.define = {
            ...esOptions.define,
            'process.env.NODE_ENV': dev ? `"development"` : `"production"`,
            'process.env.PROD': dev ? 'false' : 'true',
            'process.env.DEV': dev ? 'true' : 'false',
            'process.env.SSR': server ? 'true' : 'false',
            'import.meta.env.NODE_ENV': dev ? `"development"` : `"production"`,
            'import.meta.env.PROD': dev ? 'false' : 'true',
            'import.meta.env.DEV': dev ? 'true' : 'false',
            'import.meta.env.SSR': server ? 'true' : 'false',
          }
          esOptions.jsx = 'preserve'

          esOptions.chunkNames = '[name]/[hash]'

          if (!dev && globalOptions.dropConsole) esOptions.drop = ['console', 'debugger']

          return esbuildOptions(esOptions, ctx)
        },
        outExtension({ format }) {
          if (format === 'esm' && jsx) return { js: '.jsx' }
          return {}
        },
        esbuildPlugins: !jsx ? [solidPlugin() as any, ...esbuildPlugins] : esbuildPlugins,
        onSuccess,
      })
    })
  })
}
