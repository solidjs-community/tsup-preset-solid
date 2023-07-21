import { defineConfig } from 'tsup'
import * as preset from '../src' // 'tsup-preset-solid'

const preset_options: preset.PresetOptions = {
    entries: [
        {
            entry: 'src/index.tsx',
            dev_entry: 'src/dev.tsx',
            // server_entry: 'src/server.tsx',
            // dev_entry: true,
            server_entry: true,
        },
        {
            name: 'additional',
            entry: 'src/additional/index.ts',
            // dev_entry: true,
            server_entry: true,
        },
        {
            entry: 'src/shared.ts',
        },
    ],
    drop_console: true,
    // cjs: true,
}

export default defineConfig(config => {
    const parsed_options = preset.parsePresetOptions(preset_options, config)

    if (!config.watch) {
        const package_fields = preset.generatePackageExports(parsed_options)

        console.log(`package.json: \n\n${JSON.stringify(package_fields, null, 4)}\n\n`)

        /*
            will update ./package.json with the correct export fields
        */
        preset.writePackageJson(package_fields)
    }

    return preset.generateTsupOptions(parsed_options)
})
