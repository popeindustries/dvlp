[![NPM Version](https://img.shields.io/npm/v/dvlp.svg?style=flat)](https://npmjs.org/package/dvlp)
[![Build Status](https://img.shields.io/travis/popeindustries/dvlp.svg?style=flat)](https://travis-ci.org/popeindustries/dvlp)

# dvlp

**dvlp** is a no-configuration, no-conditionals, no-middleware, no-nonsense **server toolbox** to help you quickly develop for the web. You shouldn't have to jump through hoops to get a development web server up and running, and you definitely shouldn't have to ship development-only functionality in your production code. **dvlp** is full of hacks so your code doesn't have to be!

### Motivation

Back in the _good old days_, our web development workflow went something like this: write HTML/CSS/JS, refresh browser, repeat. Years later, with the help of Node.js and emerging standards, we started pre-processing our CSS and transpiling our JS to take advantage of more expressive, agreeable language features. At the same time, as writing code became easier and more enjoyable, we began bundling and packaging our (growing amount of) code for delivery to the browser. The modern web development workflow soon looked like this: write HTML/JSX/SCSS/LESS/CSS/TS/JS, transpile, compile, bundle, (hot) reload, repeat. For those of us ambitious enough to tackle a full-stack, universal JS application, you would also need to include a well timed server restart (somewhere) in there.

Today, history's pendulum is starting to swing back the other way. Thanks to JS modules and excellent Node.js/browser support for new language features, it's time for a _simpler_, more _comfortable_ workflow. Bundling should be treated as a production optimization (like minification), and our web servers shouldn't be responsible for building browser compatible versions of our assets.

### Philosophy

* **No bundling**: write JS modules and load them directly in the browser
* **No middleware**: write JS servers without special dev/build/bundle middleware
* **No refreshing**: automatically restart servers and reload browsers on file change

### How it works

**dvlp** allows you to easily serve files from one or more project directories (`static` mode), or from your custom application server (`app` mode). In both cases, **dvlp** automatically injects the necessary reload script into HTML responses to enable reloading, watches all files for changes, restarts the `app` server if necessary, and reloads all connected browsers.

In addition, when working with JS modules, **dvlp** will ensure that so-called _bare_ imports (which are not natively supported by browsers) work by bundling and caching them in the background. Continue writing `import * from 'lodash'` without worry that `lodash` is not a valid url reference!

## Installation

Install globally or locally in your project with npm/yarn:

```bash
$ npm install dvlp
```

## Usage

When installed locally, add a script to your package.json `scripts`:

```json
{
  "scripts": {
    "dev": "dvlp --port 8000 path/to/my/app.js"
  }
}
```

```text
$ dvlp -h

  Usage: dvlp [options] <path...>

  Start a development server, restarting and reloading connected browsers on file changes.
  Serves static files from one or more <path> directories, or a custom application
  server if <path> is a single file

  Options:

    -p, --port <port>      port number
    -c, --config <config>  path to optional Rollup.js config file
    --no-reload            disable reloading connected browsers on file change
    -v, --version          output the version number
    -h, --help             output usage information
```

## JS API

##### `server(filepath: string|[string], [options]: { port: number, reload: boolean }): Promise<{ destroy: () => void }>`

Serve files at `filepath`, starting static file server if one or more directories, or app server if a single file.

`options` include:

* **`port: number`**: port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `8080`)
* **`reload: boolean`**: enable/disable browser reloading (default `true`)
* **`config: string`**: path to optional [Rollup.js](https://rollupjs.org) config file

#### `testServer([options]: { port: number, latency: number, webroot: string }): Promise<{ destroy: () => void }>`

Create a server for handling network requests during testing.

`options` include:

* **`port: number`** the port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `3333`)
* **`latency: number`** the minimum amount of random artificial latency to introduce (in `ms`) for responses (default `50`)
* **`webroot: String`** the subpath from `process.cwd()` to preppend to relative paths (default `''`)

```js
const { testServer } = require('dvlp');
const { destroy } = await testServer({ port: 8080, latency: 20, webroot: 'lib' });
```

If unable to resolve a request to a local file, `testServer` will respond with a dummy file of the appropriate type. This makes it easy to test ServiceWorker pre-caching, for example, without having to correctly resolve paths or create mocks. In addition, `testServer` supports the following special query parameters:

* **`offline`** simulate an offline state by terminating the request (`fetch('http://localhost:3333/foo.js?offline')`)
* **`error`** return a 500 server error response (`fetch('http://localhost:3333/foo.js?error')`)
* **`missing`** return a 404 not found response (`fetch('http://localhost:3333/foo.js?missing')`)
* **`maxage=value`** configure `Cache-Control: public, max-age={value}` cache header (`fetch('http://localhost:3333/foo.js?maxage=10')`)
