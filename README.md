# gasnuki

Type definitions and utilities for Google Apps Script client-side API

## Overview

`gasnuki` provides TypeScript type definitions and utilities for safely using the Google Apps Script client-side API. It helps ensure type-safe communication between Apps Script and your frontend.

## Installation

```bash
npm install gasnuki
```

or

```bash
yarn add gasnuki
```

## Usage

1. Generate type definitions by running:

```bash
npx gasnuki
```

This will generate type definition files in the `types` directory by default.

2. Make sure the generated directory (default: `types`) is included in your `tsconfig.json`:

```json
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