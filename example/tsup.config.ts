import { defineConfig } from 'tsup'
import * as preset from '../src' // 'tsup-preset-solid'

const preset_options: preset.PresetOptions = {
    // array or single object
    entries: [
        // default entry (index)
        {
            // entries with '.tsx' extension will have `solid` export condition generated
            entry: 'src/index.tsx',
            // set `true` or pass a specific path to generate a development-only entry
            dev_entry: 'src/dev.tsx',
            // set `true` or pass a specific path to generate a server-only entry
            server_entry: true,
        },
        {
            // non-default entries with "index" filename should have a name specified
            name: 'additional',
            entry: 'src/additional/index.ts',
            dev_entry: true,
        },
        {
            entry: 'src/shared.ts',
        },
    ],
    // Setting `true` will remove all `console.*` calls and `debugger` statements
    drop_console: true,
    // Setting `true` will generate a CommonJS build alongside ESM (default: `false`)
    cjs: true,
}

export default defineConfig(config => {
    const watching = !!config.watch

    const parsed_options = preset.parsePresetOptions(preset_options, watching)

    if (!watching) {
        const package_fields = preset.generatePackageExports(parsed_options)

        console.log(`package.json: \n\n${JSON.stringify(package_fields, null, 2)}\n\n`)

        /*
            will update ./package.json with the correct export fields
        */
        preset.writePackageJson(package_fields)
    }

    return preset.generateTsupOptions(parsed_options)
})
