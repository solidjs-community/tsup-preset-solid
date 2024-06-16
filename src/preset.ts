import path from 'path'
import * as tsup from 'tsup'
import * as esbuild from 'esbuild'
import { solidPlugin } from 'esbuild-plugin-solid'

export interface EntryOptions {
    name?: string | undefined
    /** entries with '.tsx' extension will have `solid` export condition generated */
    entry: string
    /** Setting `true` will generate a development-only entry (default: `false`) */
    dev_entry?: boolean | string
    /** Setting `true` will generate a server-only entry (default: `false`) */
    server_entry?: boolean | string
}

export type ModifyEsbuildOptions = (
    modify_esbuild_options: esbuild.BuildOptions,
    permutation: BuildItem,
) => esbuild.BuildOptions

export interface PresetOptions {
    entries: EntryOptions | EntryOptions[]
    /** Setting `true` will remove all `console.*` calls and `debugger` statements (default: `false`) */
    drop_console?: boolean | undefined
    /** Pass options to esbuild */
    modify_esbuild_options?: ModifyEsbuildOptions
    /** Additional esbuild plugins (solid one is already included) */
    esbuild_plugins?: esbuild.Plugin[]
    /** Setting `true` will generate a CommonJS build alongside ESM (default: `false`) */
    cjs?: boolean | undefined
    /** Change the output directory (default: "dist") */
    out_dir?: string | undefined
}

export interface ParsedPresetOptions {
    single_entry: boolean
    entries: ParsedEntry[]
    index_entry: ParsedEntry
    out_dir: string
    cjs: boolean
    format: tsup.Options['format']
    /*
    Passed directly to {@link generateTsupOptions}
    TODO: move to generateTsupOptions
    */
    drop_console: boolean
    watching: boolean
    modify_esbuild_options: ModifyEsbuildOptions
    esbuild_plugins: esbuild.Plugin[]
}

export interface ParsedEntry {
    options: EntryOptions
    filename: string
    type: EntryType
    exports: EntryExportPaths
    paths: EntryExportPaths
}

export interface EntryExportPaths {
    main: string
    dev: string
    server: string
}

export interface EntryType {
    dev: boolean
    server: boolean
    jsx: boolean
}

export interface BuildItem {
    entries: Set<ParsedEntry>
    type: EntryType
}

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

/**
 * From windows to unix. And add `"./"` if missing.
 * @example
 * normalizeFilepath('src\\index.ts') // => './src/index.ts'
 */
export function normalizeFilepath(filepath: string): string {
    filepath = filepath.replace(/\\/g, '/')
    if (!filepath.startsWith('./')) filepath = './' + filepath
    return filepath
}

/**
 * Parses the options passed to the preset and returns a normalized object.
 * Parsed options can then be passed to `generateTsupOptions` to generate the tsup options.
 * Or to `generatePackageExports` to generate the package.json export fields.
 */
export function parsePresetOptions(
    preset_options: PresetOptions,
    watching: boolean = false,
): ParsedPresetOptions {
    const entries = asArray(preset_options.entries)
    const with_cjs = !!preset_options.cjs
    const out_dir = preset_options.out_dir ?? 'dist/'
    const single_entry = entries.length === 1

    const getExport: (fileName: string, exportName: string) => string = single_entry
        ? (_, exportname) => exportname
        : (filename, exportname) => `${filename}/${exportname}`

    const parsed_entries: ParsedEntry[] = entries.map(options => {
        const filename = options.name ?? path.basename(path.normalize(options.entry)).split('.')[0]!

        const exports: EntryExportPaths = {
            main: getExport(filename, 'index'),
            dev: getExport(filename, 'dev'),
            server: getExport(filename, 'server'),
        }

        return {
            options,
            filename,
            exports,
            paths: {
                main: normalizeFilepath(path.join(out_dir, exports.main)),
                dev: normalizeFilepath(path.join(out_dir, exports.dev)),
                server: normalizeFilepath(path.join(out_dir, exports.server)),
            },
            type: {
                dev: !!options.dev_entry,
                server: !!options.server_entry,
                jsx: options.entry.endsWith('.jsx') || options.entry.endsWith('.tsx'),
            },
        }
    })

    parsed_entries.sort((a, b) => {
        if (a.filename === 'index') return -1
        if (b.filename === 'index') return 1
        return a.filename.localeCompare(b.filename)
    })

    return {
        watching,
        format: with_cjs ? ['esm', 'cjs'] : 'esm',
        cjs: with_cjs,
        out_dir,
        modify_esbuild_options: preset_options.modify_esbuild_options ?? (x => x),
        esbuild_plugins: preset_options.esbuild_plugins ?? [],
        entries: parsed_entries,
        index_entry: parsed_entries.find(p => p.filename === 'index') ?? parsed_entries[0]!,
        drop_console: !!preset_options.drop_console,
        single_entry,
    }
}

/**
 * Generates an array of tsup options used by tsup to build the project.
 * Each options item is a separate build.
 * And one build can contain multiple entries.
 */
export function generateTsupOptions(
    options: ParsedPresetOptions,
    // TODO name this type
    generate_options: {
        /** Change the base directory (default: ".") */
        base_dir?: string | undefined
    } = {},
): tsup.Options[] {
    const items: BuildItem[] = []

    for (const entry of options.entries) {
        for (const dev of [false, entry.type.dev]) {
            for (const server of [false, entry.type.server]) {
                if (dev && server) continue

                for (const jsx of [false, entry.type.jsx]) {
                    const item = items.find(
                        p => p.type.dev === dev && p.type.server === server && p.type.jsx === jsx,
                    )

                    if (item) {
                        item.entries.add(entry)
                    } else {
                        items.push({ type: { dev, server, jsx }, entries: new Set([entry]) })
                    }
                }
            }
        }
    }

    const base_dir = generate_options.base_dir ?? '.'
    const out_dir = path.join(base_dir, options.out_dir)

    return items.map((item, i): tsup.Options => {
        const { type, entries } = item
        const is_main = !type.dev && !type.jsx && !type.server

        const tsup_entry: Record<string, string> = {}
        for (const entry of entries) {
            const export_path = type.dev
                ? entry.exports.dev
                : type.server
                ? entry.exports.server
                : entry.exports.main

            const entry_path =
                type.dev && typeof entry.options.dev_entry === 'string'
                    ? entry.options.dev_entry
                    : type.server && typeof entry.options.server_entry === 'string'
                    ? entry.options.server_entry
                    : entry.options.entry

            tsup_entry[export_path] = path.join(base_dir, entry_path)
        }

        return {
            target: 'esnext',
            platform: type.server ? 'node' : 'browser',
            format: options.watching || type.jsx ? 'esm' : options.format,
            clean: !options.watching && i === 0,
            dts: is_main ? true : undefined,
            entry: tsup_entry,
            outDir: out_dir,
            treeshake: options.watching ? false : { preset: 'safest' },
            replaceNodeEnv: true,
            esbuildOptions(es_options) {
                es_options.define = {
                    ...es_options.define,
                    'process.env.NODE_ENV': type.dev ? `"development"` : `"production"`,
                    'process.env.PROD': type.dev ? 'false' : 'true',
                    'process.env.DEV': type.dev ? 'true' : 'false',
                    'process.env.SSR': type.server ? 'true' : 'false',
                    'import.meta.env.NODE_ENV': type.dev ? `"development"` : `"production"`,
                    'import.meta.env.PROD': type.dev ? 'false' : 'true',
                    'import.meta.env.DEV': type.dev ? 'true' : 'false',
                    'import.meta.env.SSR': type.server ? 'true' : 'false',
                }
                es_options.jsx = 'preserve'

                es_options.chunkNames = '[name]/[hash]'

                if (!type.dev && options.drop_console) es_options.drop = ['console', 'debugger']

                return options.modify_esbuild_options(es_options, item)
            },
            outExtension({ format }) {
                if (format === 'esm' && type.jsx) return { js: '.jsx' }
                return {}
            },
            esbuildPlugins: !type.jsx
                ? [
                      solidPlugin({ solid: { generate: type.server ? 'ssr' : 'dom' } }),
                      ...options.esbuild_plugins,
                  ]
                : options.esbuild_plugins,
        }
    })
}
