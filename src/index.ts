import { solidPlugin } from 'esbuild-plugin-solid'
import fsp from 'fs/promises'
import path from 'path'
import { defineConfig as tsupDefineConfig, Format, Options } from 'tsup'
import type { PackageJson } from 'type-fest'

const cwd = process.cwd()
const isCI =
  process.env['CI'] === 'true' ||
  process.env['GITHUB_ACTIONS'] === 'true' ||
  process.env['CI'] === '"1"' ||
  process.env['GITHUB_ACTIONS'] === '"1"'

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export type PresetOptions = {
  entry: string
  devEntry?: true | undefined | string
  serverEntry?: true | undefined | string
  dropConsole?: true | undefined
  foramt?: 'esm' | ('esm' | 'cjs')[]
  outDir?: string | undefined
  tsupOptions?: (config: Options) => Options
  esbuildPlugins?: Options['esbuildPlugins']
}

export type ExportOptions = {
  writePackageJson?: true | undefined
  printInstructions?: true | undefined
}

const DEFAULT_FORMAT: Format[] = ['esm', 'cjs']

export function defineConfig(
  options: PresetOptions | PresetOptions[],
  exportsOptons?: ExportOptions,
): ReturnType<typeof tsupDefineConfig> {
  return tsupDefineConfig(config => {
    const watching = !isCI && !!config.watch
    const shouldCollectExports =
      !isCI && !watching && !!(exportsOptons?.writePackageJson || exportsOptons?.printInstructions)

    type Browser = Exclude<PackageJson['browser'], string | undefined>
    const exports: PackageJson = {
      type: 'module',
      browser: {},
      exports: {},
    }

    const entries = asArray(options)
    let buildsToComplete = watching ? Infinity : 0

    // Handle the last build to write the package.json
    async function onSuccess() {
      if (!shouldCollectExports || --buildsToComplete > 0) return

      if (exportsOptons.printInstructions) {
        // eslint-disable-next-line no-console
        console.log(
          `\nTo use these exports, add the following to your package.json:\n\n${JSON.stringify(
            exports,
            null,
            2,
          )}\n`,
        )
      }

      if (exportsOptons.writePackageJson) {
        const pkgPath = path.join(cwd, 'package.json')
        const pkg: PackageJson = await fsp.readFile(pkgPath, 'utf-8').then(JSON.parse)
        const newPkg = { ...pkg, ...exports }
        await fsp.writeFile(pkgPath, JSON.stringify(newPkg, null, 2) + '\n', 'utf-8')
      }
    }

    const nestedOptions = asArray(options).map((entry, i) => {
      const outFormat = entry.foramt ?? DEFAULT_FORMAT

      const hasCjs = outFormat.includes('cjs')
      const hasJSX = entry.entry.endsWith('.jsx') || entry.entry.endsWith('.tsx')
      const hasDev = !!entry.devEntry
      const hasServer = !!entry.serverEntry

      const outDir = entry.outDir ? `./${entry.outDir}/` : './dist/'
      const entryFilename = path.basename(path.normalize(entry.entry)).split('.')[0]
      const mainExport = `${entryFilename}${entries.length === 1 ? '' : `/${entryFilename}`}`
      const devExport = `${mainExport}.dev`
      const serverExport = `${mainExport}.server`
      const typesExport = `${entryFilename}.d.ts`

      const handleOptions = entry.tsupOptions ?? (o => o)
      const esbuildPlugins = entry.esbuildPlugins ?? []

      if (shouldCollectExports) {
        if (i === 0) {
          exports.main = `${outDir}${hasServer ? serverExport : mainExport}.${
            hasCjs ? 'cjs' : 'js'
          }`
          exports.module = `${outDir}${hasServer ? serverExport : mainExport}.js`
          exports.types = `${outDir}${typesExport}`
        }
        if (hasServer) {
          const b = exports.browser as Browser
          b[`${outDir}${serverExport}.js`] = `${outDir}${mainExport}.js`
          if (hasCjs) b[`${outDir}${serverExport}.cjs`] = `${outDir}${mainExport}.cjs`
        }

        const getImportConditions = (filename: string) => ({
          import: {
            types: `${outDir}${typesExport}`,
            default: `${outDir}${filename}.js`,
          },
          ...(hasCjs && { require: `${outDir}${filename}.cjs` }),
        })
        const getConditions = (type: 'server' | 'main') =>
          ({
            ...(hasDev &&
              type === 'main' && {
                development: getImportConditions(devExport),
              }),
            ...getImportConditions(type === 'server' ? serverExport : mainExport),
          } as const)
        const allConditions: PackageJson.Exports = {
          ...(hasJSX && {
            solid: hasDev
              ? {
                  development: `${outDir}${devExport}.jsx`,
                  import: `${outDir}${mainExport}.jsx`,
                }
              : `${outDir}${mainExport}.jsx`,
          }),
          ...(hasServer && {
            worker: getConditions('server'),
            deno: getConditions('server'),
            node: getConditions('server'),
          }),
          browser: getConditions('main'),
          ...getConditions('main'),
        }

        if (entries.length === 1) exports.exports = allConditions
        else {
          ;(exports.exports as any)[`${entryFilename === 'index' ? '.' : `./${entryFilename}`}`] =
            allConditions
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
        // each permutation is a separate build
        buildsToComplete++

        return handleOptions({
          target: 'esnext',
          format: solid || watching ? 'esm' : outFormat,
          clean: i === 0 && j === 0,
          dts: j === 0 ? entry.entry : undefined,
          entry: {
            [`${dev ? devExport : server ? serverExport : mainExport}`]:
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
          outExtension({ format }) {
            if (format === 'esm' && solid) return { js: '.jsx' }
            return {}
          },
          esbuildPlugins: !solid ? [solidPlugin() as any, ...esbuildPlugins] : esbuildPlugins,
          onSuccess,
        })
      })
    })

    return nestedOptions.flat()
  })
}
