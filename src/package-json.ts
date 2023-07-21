import fsp from 'fs/promises'
import path from 'path'
import { ParsedPresetOptions, ParsedEntry, EntryExportPaths } from './preset'

export namespace Package {
    export type Browser = Record<string, string | false>
    export type TypeVersions = Record<string, string[]>
    export type ExportConditions = { [key: string]: Exports }
    export type Exports = null | string | (string | ExportConditions)[] | ExportConditions

    export interface ExportFields {
        main: string
        module: string
        types: string
        browser: Browser
        exports: Record<string, ExportConditions> | ExportConditions
        /**
         *   "typeVersions" are for older versions of ts, but are still needed for some tools
         *   They are only needed if there are multiple entries
         */
        typesVersions: Record<string, TypeVersions>
    }
}

export const getImportConditions = (
    options: ParsedPresetOptions,
    entry: ParsedEntry,
    file_type: keyof EntryExportPaths,
): Package.ExportConditions => ({
    import: {
        types: entry.paths.types,
        default: `${entry.paths[file_type]}.js`,
    },
    ...(options.cjs && { require: `${entry.paths[file_type]}.cjs` }),
})

export const getConditions = (
    options: ParsedPresetOptions,
    entry: ParsedEntry,
    type: 'server' | 'main',
): Package.ExportConditions => {
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

/**
 * Generates the export fields for package.json based on the passed preset {@link options}.
 *
 * Use this to update your package.json with the correct export fields. See {@link writePackageJson} for an example.
 *
 * @param options
 * @returns The export fields for package.json. See {@link Package.ExportFields} for info on the individual fields.
 */
export function generatePackageExports(options: ParsedPresetOptions): Package.ExportFields {
    const types_versions: Package.TypeVersions = {}
    const browser: Package.Browser = {}
    const package_json: Package.ExportFields = {
        main: '',
        module: '',
        types: '',
        browser: browser,
        exports: {},
        typesVersions: options.single_entry ? {} : { '*': types_versions },
    }

    for (let i = 0; i < options.entries.length; i++) {
        const entry = options.entries[i]!

        if (i === 0) {
            package_json.main = `${entry.type.server ? entry.paths.server : entry.paths.main}.${
                options.cjs ? 'cjs' : 'js'
            }`
            package_json.module = `${entry.type.server ? entry.paths.server : entry.paths.main}.js`
            package_json.types = entry.paths.types
        }
        if (entry.type.server) {
            browser[`${entry.paths.server}.js`] = `${entry.paths.main}.js`
            if (options.cjs) browser[`${entry.paths.server}.cjs`] = `${entry.paths.main}.cjs`
        }

        const conditions: Package.Exports = {
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
            types_versions[entry.filename] = [entry.paths.types]
        }
    }

    return package_json
}

export const CWD = process.cwd()
export const DEFAULT_PKG_PATH = path.join(CWD, 'package.json')

const asWarning = (message: string) => `\x1b[33m${message}\x1b[0m`

/**
 * Writes passed {@link fields} to package.json at {@link filename}.
 *
 * @param fields The fields to write to package.json
 * @param filename Defaults to package.json in the current working directory.
 * @param space See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#Parameters} for more info. If not provided, will be inferred from package.json.
 */
export async function writePackageJson(
    fields: Record<string, any>,
    filename: string = DEFAULT_PKG_PATH,
    space?: string | number,
): Promise<void> {
    const buffer = await fsp.readFile(filename, 'utf-8')
    const pkg: Record<string, any> = JSON.parse(buffer)
    const newPkg = { ...pkg, ...fields }

    if (newPkg['type'] !== 'module') {
        newPkg['type'] = 'module'
        // eslint-disable-next-line no-console
        console.log(
            asWarning(
                `\nWarning: package.json type field was not set to "module". This preset requires packages to be esm first. Setting it to "module".\n`,
            ),
        )
    }

    /*
        infer the indentation from package.json if not provided
    */
    if (space === undefined) {
        const first_indent = buffer.indexOf('\n') + 1
        for (let i = first_indent; i < buffer.length; i++) {
            if (buffer[i] !== ' ' && buffer[i] !== '\t') {
                space = buffer.slice(first_indent, i)
                break
            }
        }
    }

    await fsp.writeFile(filename, JSON.stringify(newPkg, null, space) + '\n', 'utf-8')
}
