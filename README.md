# @ciderjs/gasnuki

[![Test Coverage](https://img.shields.io/badge/test%20coverage-79.24%25-yellowgreen)](https://github.com/luthpg/gasnuki)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@ciderjs/gasnuki.svg)](https://www.npmjs.com/package/@ciderjs/gasnuki)
[![GitHub issues](https://img.shields.io/github/issues/luthpg/gasnuki.svg)](https://github.com/luthpg/gasnuki/issues)

Type definitions and utilities for Google Apps Script client-side API

## Overview

`gasnuki` provides TypeScript type definitions and utilities for safely using the Google Apps Script client-side API. It helps ensure type-safe communication between Apps Script and your frontend.

## Installation

```bash
npm install @ciderjs/gasnuki
```

or

```bash
pnpm add @ciderjs/gasnuki
```

## Usage

1. Generate type definitions by running:

```bash
npx @ciderjs/gasnuki
```

... or, add project's npm-script in `package.json`:

```jsonc
{
  // others...
  "scripts": {
    "gas": "gasnuki"
  }
}
```

This will generate type definition files in the `types` directory by default.

2. Make sure the generated directory (default: `types`) is included in your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    // ... your options ...
  },
  "include": [
    "src",
    "types" // Add this line if your type definitions are in the 'types' directory
  ]
}
```

3. Then, you can use `google` with Type Definitions.

```ts
// Type-safe access to google.script.run
// Example: Call the server-side function getContent

google.script.run
  .withSuccessHandler((result) => {
    console.log(result);
  })
  .getContent('Sheet1');
```

## Features

- Type definitions for Google Apps Script client-side API
- Utility type to convert server-side function return types to void

## Contributing

Bug reports and pull requests are welcome. Please use the `issues` or `pull requests` section.

## License

MIT
