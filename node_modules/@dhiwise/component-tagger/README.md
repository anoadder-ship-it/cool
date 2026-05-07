# @dhiwise/component-tagger

Automatically annotate JSX components and HTML elements with data attributes.

## Installation

```bash
npm install @dhiwise/component-tagger
```

## Usage

### Vite

```js
// vite.config.js
import { defineConfig } from 'vite';
import componentTagger from '@dhiwise/component-tagger';

export default defineConfig({
  plugins: [
    componentTagger({
      verbose: true,
      attributePrefix: 'data-component',
    }),
  ],
});
```

### Next.js

```js
// next.config.js
const componentTagger = require('@dhiwise/component-tagger/nextLoader');

module.exports = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(js|jsx|ts|tsx)$/,
      use: [
        {
          loader: componentTagger,
          options: {
            verbose: true,
          },
        },
      ],
    });
    return config;
  },
};
```

### HTML (CLI)

```bash
npx @dhiwise/component-tagger-html --output-dir public
```

## Features

- Automatically tags JSX components with data attributes
- Supports Vite, Webpack, Next.js, and HTML
- Configurable attribute prefixes and content extraction

## License

MIT
