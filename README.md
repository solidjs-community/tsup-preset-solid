<p>
  <img width="100%" src="https://assets.solidjs.com/banner?background=tiles&project=tsup-preset-solid" alt="tsup-preset-solid">
</p>

# tsup-preset-solid

[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg?style=for-the-badge&logo=pnpm)](https://pnpm.io/)
[![npm](https://img.shields.io/npm/v/tsup-preset-solid?style=for-the-badge)](https://www.npmjs.com/package/tsup-preset-solid)
[![downloads](https://img.shields.io/npm/dw/tsup-preset-solid?color=blue&style=for-the-badge)](https://www.npmjs.com/package/tsup-preset-solid)

Preset for building your SolidJS packages with ease using [**tsup**](https://tsup.egoist.dev) _(powered by [**esbuild**](https://esbuild.github.io))_.

## Features

-   **Preconfigured** - Just install, set your entries and you're done.

-   **Fast** - Uses [**esbuild**](https://esbuild.github.io) under the hood.

-   **SolidStart support** - Includes `solid` export condition with preserved JSX.

-   **Best practices** - Ensures that the built library works well with Solid's tooling ecosystem.

-   **Development and server entries** - Creates a separate entry for development, server-side rendering and production form a single source.

-   **Multiple entries** - Supports multiple package entries. _(submodules)_

-   **Automatic package.json configuration** - Automatically writes export fields to `package.json` based on passed options.

> **Warning** This preset is tailored towards a specific usage, mainly for primitives libraries or small headless libraries, so diverging from the happy path may cause unexpected results. [Please report any issues you find.](https://github.com/solidjs-community/tsup-preset-solid/issues)

## Quick start

### Install it:

```bash
npm i -D tsup tsup-preset-solid
# or
pnpm add -D tsup tsup-preset-solid
```

### Add it to your `tsup.config.ts`

```ts
// tsup.config.ts
import { defineConfig } from 'tsup'
import * as preset from 'tsup-preset-solid'

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
    // Set to `true` to remove all `console.*` calls and `debugger` statements in prod builds
    drop_console: true,
    // Set to `true` to generate a CommonJS build alongside ESM
    cjs: false,
}

export default defineConfig(config => {
    const watching = !!config.watch

    const parsed_data = preset.parsePresetOptions(preset_options, watching)

    if (!watching) {
        const package_fields = preset.generatePackageExports(parsed_data)

        console.log(`\npackage.json: \n${JSON.stringify(package_fields, null, 2)}\n\n`)

        /*
            will update ./package.json with the correct export fields
        */
        preset.writePackageJson(package_fields)
    }

    return preset.generateTsupOptions(parsed_data)
})
```

### Add scripts to your `package.json`

```json
{
    "scripts": {
        "build": "tsup",
        "dev": "tsup --watch"
    }
}
```

## Usage gotchas

1. **`solid` export condition**

    This preset will automatically add `solid` export condition to your `package.json` if you have any `.tsx` entry files. This is required for SolidStart to work properly.

2. **"type": "module"**

    This preset requires your package to be a module.

3. **Needs ESM**

    This preset requires your package to be ESM. If you want to support CJS additionally, you can set `cjs: true` in the options. Other export format are not supported.

4. **development-only `solid` export issue**

    Currently SolidStart has an issue with `development` and `solid` export condition. ([solid-start issue](https://github.com/solidjs/solid-start/issues/651))

    This can be "fixed" by overriding the `@rollup/plugin-node-resolve` dependency in your `package.json`:

    ```json
    {
        "pnpm": {
            "overrides": {
                "@rollup/plugin-node-resolve": "13.3.0"
            }
        }
    }
    ```
