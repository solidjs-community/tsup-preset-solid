<p>
  <img width="100%" src="https://assets.solidjs.com/banner?background=tiles&project=tsup-preset-solid" alt="tsup-preset-solid">
</p>

# tsup-preset-solid

[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg?style=for-the-badge&logo=pnpm)](https://pnpm.io/)
[![npm](https://img.shields.io/npm/v/tsup-preset-solid?style=for-the-badge)](https://www.npmjs.com/package/tsup-preset-solid)
[![downloads](https://img.shields.io/npm/dw/tsup-preset-solid?color=blue&style=for-the-badge)](https://www.npmjs.com/package/tsup-preset-solid)

Preset for building your SolidJS packages with ease using [**tsup**](https://tsup.egoist.dev) _(powered by [**esbuild**](https://esbuild.github.io))_.

## Features

- **Preconfigured** - Just install, set your entries and use it.

- **Fast** - Uses [**esbuild**](https://esbuild.github.io) under the hood.

- **SolidStart support** - Includes `solid` export condition with preserved JSX.

- **Best practices** - Ensures that the built library works well with Solid's tooling ecosystem.

- **Development and server entries** - Creates a separate entry for development, server-side rendering and production form a single source.

- **Multiple entries** - Supports multiple package entries. _(submodules)_

- **Automatic package.json configuration** - Automatically writes export fields to `package.json` based on passed options.

> **Warning** This is a very fresh project, so diverging from the happy path may cause unexpected results. [Please report any issues you find.](https://github.com/solidjs-community/tsup-preset-solid/issues)

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
import { defineConfig } from 'tsup-preset-solid'

export default defineConfig(
  // entries (array or single object)
  [
    // first entry in array should be the main one (index)
    {
      // entries with '.tsx' extension will have `solid` export condition generated
      entry: 'src/index.tsx',
      // Setting `true` will generate a development-only entry
      devEntry: true,
      // Setting `true` will generate a server-only entry
      serverEntry: true,
    },
    {
      entry: 'src/additional.ts',
    },
  ],
  // additional options
  {
    // Setting `true` will console.log the package.json fields
    printInstructions: true,
    // Setting `true` will write export fields to package.json
    writePackageJson: true,
    // Setting `true` will remove all `console.*` calls and `debugger` statements
    dropConsole: true,
    // Setting `true` will generate a CommonJS build alongside ESM (default: `false`)
    cjs: true,
  },
)
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

1. **`solid` export condition** - This preset will automatically add `solid` export condition to your `package.json` if you have any `.tsx` entry files. This is required for SolidStart to work properly.

2. **"type": "module"** - This preset requires your package to be a module.

3. **Needs ESM** - This preset requires your package to be ESM. If you want to support CJS additionally, you can set `cjs: true` in the options. Other export format are not supported.

4. **development-only `solid` export issue** - Currently SolidStart has an issue with `development` and `solid` export condition. ([solid-start issue](https://github.com/solidjs/solid-start/issues/651))
