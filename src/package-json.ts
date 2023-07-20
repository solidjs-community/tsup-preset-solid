import fsp from 'fs/promises'
import path from 'path'
import { ParsedPresetOptions, ParsedEntry, EntryExportPaths, CWD } from './preset'

export type PackageBrowser = Record<string, string | false>
export type PackageTypeVersions = Record<string, string[]>
export type PackageExportConditions = { [key: string]: PackageExports }
export type PackageExports =
    | null
    | string
    | (string | PackageExportConditions)[]
    | PackageExportConditions

export type PackageExportFields = {
    main: string
    module: string
    types: string
    browser: PackageBrowser
    exports: Record<string, PackageExportConditions> | PackageExportConditions
    /**
     *   "typeVersions" are for older versions of ts, but are still needed for some tools
     *   They are only needed if there are multiple entries
     */
    typesVersions: Record<string, PackageTypeVersions> | PackageTypeVersions
}

export const getImportConditions = (
    options: ParsedPresetOptions,
    entry: ParsedEntry,
    file_type: keyof EntryExportPaths,
): PackageExportConditions => ({
    import: {
        default: `${entry.paths[file_type]}.js`,
        types: entry.paths.types,
    },
    ...(options.with_cjs && { require: `${entry.paths[file_type]}.cjs` }),
})

export const getConditions = (
    options: ParsedPresetOptions,
    entry: ParsedEntry,
    type: 'server' | 'main',
): PackageExportConditions => {
    const add_dev = entry.type.dev && type === 'main'
    return {
        ...(entry.type.jsx && {
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

export function generatePackageJsonExports(options: ParsedPresetOptions): PackageExportFields {
    const types_versions: PackageTypeVersions = {}
    const browser: PackageBrowser = {}
    const package_json: PackageExportFields = {
        main: '',
        module: '',
        types: '',
        browser: browser,
        exports: {},
        typesVersions: options.single_entry ? { '*': types_versions } : types_versions,
    }

    for (let i = 0; i < options.entries.length; i++) {
        const entry = options.entries[i]!

        if (i === 0) {
            package_json.main = `${entry.type.server ? entry.paths.server : entry.paths.main}.${
                options.with_cjs ? 'cjs' : 'js'
            }`
            package_json.module = `${entry.type.server ? entry.paths.server : entry.paths.main}.js`
            package_json.types = entry.paths.types
        }
        if (entry.type.server) {
            browser[`${entry.paths.server}.js`] = `${entry.paths.main}.js`
            if (options.with_cjs) browser[`${entry.paths.server}.cjs`] = `${entry.paths.main}.cjs`
        }

        const conditions: PackageExports = {
            ...(entry.type.server && {
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
            package_json.exports['.'] = conditions
        } else {
            package_json.exports[`./${entry.filename}`] = conditions
            types_versions[entry.filename] = [exports.types]
        }
    }

    return package_json
}

export const DEFAULT_PKG_PATH = path.join(CWD, 'package.json')

export async function writePackageJson(
    fields: Record<string, any>,
    filename: string = DEFAULT_PKG_PATH,
    space: string | number = 2,
): Promise<void> {
    const pkg = await fsp.readFile(filename, 'utf-8').then(JSON.parse)
    const newPkg = { ...pkg, ...fields }
    await fsp.writeFile(filename, JSON.stringify(newPkg, null, space) + '\n', 'utf-8')
}
