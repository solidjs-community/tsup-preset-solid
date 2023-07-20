import fsp from 'fs/promises'
import path from 'path'
import * as tsup from 'tsup'
import * as esbuild from 'esbuild'
import { PackageJson } from 'type-fest'
import { solidPlugin } from 'esbuild-plugin-solid'

const CWD = process.cwd()
const PKG_PATH = path.join(CWD, 'package.json')
const CI =
    process.env['CI'] === 'true' ||
    process.env['GITHUB_ACTIONS'] === 'true' ||
    process.env['CI'] === '"1"' ||
    process.env['GITHUB_ACTIONS'] === '"1"'

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export type EntryOptions = {
    name?: string | undefined
    /** entries with '.tsx' extension will have `solid` export condition generated */
    entry: string
    /** Setting `true` will generate a development-only entry (default: `false`) */
    dev_entry?: boolean | string
    /** Setting `true` will generate a server-only entry (default: `false`) */
    server_entry?: boolean | string
}

export type ModifyEsbuildOptions = (
    esbuild_options: esbuild.BuildOptions,
    permutation: BuildPermutation,
) => esbuild.BuildOptions

export type PresetOptions = {
    entries: EntryOptions | EntryOptions[]
    /** Setting `true` will write export fields to package.json (default: `false`) */
    write_package_json?: boolean | undefined
    /** Setting `true` will console.log the package.json fields (default: `false`)  */
    print_instructions?: boolean | undefined
    /** Setting `true` will remove all `console.*` calls and `debugger` statements (default: `false`) */
    drop_console?: boolean | undefined
    /** Pass options to esbuild */
    esbuild_options?: ModifyEsbuildOptions
    /** Additional esbuild plugins (solid one is already included) */
    esbuild_plugins?: tsup.Options['esbuildPlugins']
    /** Setting `true` will generate a CommonJS build alongside ESM (default: `false`) */
    cjs?: boolean | undefined
}

export type ParsedPresetOptions = {
    watching: boolean
    single_entry: boolean
    entries: ParsedEntry[]
    out_dir: string
    with_cjs: boolean
    format: tsup.Options['format']
    drop_console: boolean
    esbuild_options: ModifyEsbuildOptions
    esbuild_plugins: esbuild.Plugin[]
}

export type ParsedEntry = {
    options: EntryOptions
    filename: string
    main_export: string
    dev_export: string
    server_export: string
    types_export: string
    with_jsx: boolean
    with_dev: boolean
    with_server: boolean
    paths: EntryExportPaths
}

export type EntryExportPaths = {
    server: string
    dev: string
    main: string
    types: string
}

export type BuildPermutation = {
    entries: Set<ParsedEntry>
    dev: boolean
    server: boolean
    jsx: boolean
}

export function parsePresetOptions(
    preset_options: PresetOptions,
    cli_options: tsup.Options,
): ParsedPresetOptions {
    const entries = asArray(preset_options.entries)
    const watching = !CI && !!cli_options.watch
    const hasCjs = !!preset_options.cjs
    const libFormat: tsup.Options['format'] = hasCjs ? ['esm', 'cjs'] : 'esm'
    const outDir = './dist/'

    const tsupOptions = preset_options.tsup_options ?? (x => x)
    const esbuildOptions = preset_options.esbuild_options ?? (x => x)
    const esbuildPlugins = preset_options.esbuild_plugins ?? []

    const shouldCollectExports =
        !CI &&
        !watching &&
        !!(preset_options.write_package_json || preset_options.print_instructions)

    const pkgfields: PackageJson = { browser: {}, exports: {}, typesVersions: {} }
    let buildsToComplete = watching ? Infinity : 0
    // Handle the last build to write the package.json
    async function onSuccess() {
        if (!shouldCollectExports || --buildsToComplete > 0) return

        if (preset_options.print_instructions) {
            // eslint-disable-next-line no-console
            console.log(
                `\nTo use these exports, add the following to your package.json:\n\n${JSON.stringify(
                    pkgfields,
                    null,
                    2,
                )}\n`,
            )
        }

        if (preset_options.write_package_json) {
            const pkg: PackageJson = await fsp.readFile(PKG_PATH, 'utf-8').then(JSON.parse)
            const newPkg = { ...pkg, ...pkgfields }
            await fsp.writeFile(PKG_PATH, JSON.stringify(newPkg, null, 2) + '\n', 'utf-8')
        }
    }

    const getExport = (fileName: string, exportName: string) =>
        `${entries.length === 1 ? '' : `${fileName}/`}${exportName}`

    //
    // Parse the entries
    //
    const parsedEntires = entries.map(options => {
        const entryFilename =
            options.name ?? path.basename(path.normalize(options.entry)).split('.')[0]!
        const mainExport = getExport(entryFilename, 'index')
        const devExport = getExport(entryFilename, 'dev')
        const serverExport = getExport(entryFilename, 'server')
        const typesExport = `${getExport(entryFilename, 'index')}.d.ts`

        const hasJSX = options.entry.endsWith('.jsx') || options.entry.endsWith('.tsx')
        const hasDev = !!options.dev_entry
        const hasServer = !!options.server_entry

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

    return {
        watching,
    }
}

export const getImportConditions = (
    options: ParsedPresetOptions,
    entry: ParsedEntry,
    file_type: keyof EntryExportPaths,
): PackageJson.ExportConditions => ({
    import: {
        types: entry.paths.types,
        default: `${entry.paths[file_type]}.js`,
    },
    ...(options.with_cjs && { require: `${entry.paths[file_type]}.cjs` }),
})

export const getConditions = (
    options: ParsedPresetOptions,
    entry: ParsedEntry,
    type: 'server' | 'main',
): PackageJson.ExportConditions => {
    const add_dev = entry.with_dev && type === 'main'
    return {
        ...(entry.with_jsx && {
            solid: add_dev
                ? {
                      development: `${entry.paths.dev}.jsx`,
                      import: `${entry.paths[type]}.jsx`,
                  }
                : `${entry.paths[type]}.jsx`,
        }),
        ...(add_dev && { development: getImportConditions(options, entry, 'dev') }),
        ...getImportConditions(options, entry, type),
    }
}

export function generatePackageJsonExports(options: ParsedPresetOptions): PackageJson {
    /*
        "typeVersions" are for older versions of ts, but are still needed for some tools
        They are only needed if there are multiple entries
    */
    const types_versions: Record<string, string[]> = {}
    const browser: Record<string, string | false> = {}
    const package_json: PackageJson = {
        browser: browser,
        exports: {},
        typesVersions: options.single_entry ? { '*': types_versions } : (types_versions as any),
    }

    for (let i = 0; i < options.entries.length; i++) {
        const entry = options.entries[i]!

        if (i === 0) {
            package_json.main = `${entry.with_server ? entry.paths.server : entry.paths.main}.${
                options.with_cjs ? 'cjs' : 'js'
            }`
            package_json.module = `${entry.with_server ? entry.paths.server : entry.paths.main}.js`
            package_json.types = entry.paths.types
        }
        if (entry.with_server) {
            browser[`${entry.paths.server}.js`] = `${entry.paths.main}.js`
            if (options.with_cjs) browser[`${entry.paths.server}.cjs`] = `${entry.paths.main}.cjs`
        }

        const conditions: PackageJson.Exports = {
            ...(entry.with_server && {
                worker: getConditions(options, entry, 'server'),
                browser: getConditions(options, entry, 'main'),
                deno: getConditions(options, entry, 'server'),
                node: getConditions(options, entry, 'server'),
            }),
            ...getConditions(options, entry, 'main'),
        }

        if (options.single_entry) {
            package_json.exports = conditions
        } else if (entry.filename === 'index') {
            ;(package_json.exports as any)['.'] = conditions
        } else {
            ;(package_json.exports as any)[`./${entry.filename}`] = conditions
            types_versions[entry.filename] = [exports.types]
        }
    }

    return package_json
}

export function generateTsupOptions(options: ParsedPresetOptions): tsup.Options[] {
    const permutations: BuildPermutation[] = []

    for (const entry of options.entries) {
        for (const dev of [false, entry.with_dev]) {
            for (const server of [false, entry.with_server]) {
                if (dev && server) continue
                for (const jsx of [false, entry.with_jsx]) {
                    const permutation = permutations.find(
                        p => p.dev === dev && p.server === server && p.jsx === jsx,
                    )
                    if (permutation) permutation.entries.add(entry)
                    else permutations.push({ dev, server, jsx, entries: new Set([entry]) })
                }
            }
        }
    }

    // buildsToComplete = permutations.length

    return permutations.map((permutation, i) => {
        const { dev, server, jsx, entries } = permutation
        const is_main = !dev && !jsx && !server

        const tsup_entry: Record<string, string> = {}
        for (const entry of entries) {
            tsup_entry[dev ? entry.dev_export : server ? entry.server_export : entry.main_export] =
                dev && typeof entry.options.dev_entry === 'string'
                    ? entry.options.dev_entry
                    : server && typeof entry.options.server_entry === 'string'
                    ? entry.options.server_entry
                    : entry.options.entry
        }

        return {
            target: 'esnext',
            platform: server ? 'node' : 'browser',
            format: options.watching || jsx ? 'esm' : options.format,
            clean: !options.watching && i === 0,
            dts: is_main ? true : undefined,
            entry: tsup_entry,
            treeshake: options.watching ? false : { preset: 'safest' },
            replaceNodeEnv: true,
            esbuildOptions(esOptions) {
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

                if (!dev && options.drop_console) esOptions.drop = ['console', 'debugger']

                return options.esbuild_options(esOptions, permutation)
            },
            outExtension({ format }) {
                if (format === 'esm' && jsx) return { js: '.jsx' }
                return {}
            },
            esbuildPlugins: !jsx
                ? [
                      solidPlugin({ solid: { generate: server ? 'ssr' : 'dom' } }),
                      ...options.esbuild_plugins,
                  ]
                : options.esbuild_plugins,
            onSuccess,
        }
    })
}

export function defineConfig(preset_options: PresetOptions): ReturnType<typeof tsup.defineConfig> {
    return tsup.defineConfig(cli_options => {
        const options = parsePresetOptions(preset_options, cli_options)

        return generateTsupOptions(options)
    })
}
