[![NPM Version](https://img.shields.io/npm/v/dvlp.svg?style=flat)](https://npmjs.org/package/dvlp)
[![Build Status](https://img.shields.io/travis/popeindustries/dvlp.svg?style=flat)](https://travis-ci.org/popeindustries/dvlp)

# 💥 dvlp

**dvlp** is a no-configuration, no-conditionals, no-middleware, no-nonsense (no-vowels!) **dev server toolkit** to help you develop quickly and easily for the web. You shouldn't have to jump through hoops to get a development environment up and running, and you definitely shouldn't have to include development-only stuff in your high-quality production code! **dvlp** is full of hacks so your code doesn't have to be!

### Motivation

Back in the _good old days_, our web development workflow went something like this: write HTML/CSS/JS, refresh browser, repeat. Years later, with the help of Node.js and emerging standards, we started pre-processing our CSS and transpiling our JS to take advantage of more expressive, agreeable language features. At the same time, as writing code became easier and more enjoyable, we began bundling and packaging our (growing amount of) code for delivery to the browser. The modern web development workflow soon looked like this: write HTML/JSX/SCSS/LESS/CSS/TS/JS, transpile, compile, bundle, (hot) reload, repeat. For those of us ambitious enough to tackle a full-stack, universal JS application, you would also need to include a well timed server restart (somewhere) in there.

Today, history's pendulum is starting to swing back the other way. Thanks to JS modules and excellent Node.js/browser support for new language features, it's time for a _simpler_, more _comfortable_ workflow. Bundling should be treated as a production optimization (like minification), and our application web servers shouldn't be responsible for building our development assets.

Less setup, less complexity, and less waiting is surely the path to developer happiness and comfort.

### Philosophy

* **No bundling**: write JS modules and load them directly in the browser
* **No middleware**: write application servers without special dev/build/bundle middleware
* **No waiting**: restart application servers in a blink of an eye
* **No refreshing**: automatically reload browsers on file change

### How it works

**dvlp** allows you to easily serve files from one or more project directories (`static` mode), or from your custom application server (`app` mode). In both cases, **dvlp** automatically injects the necessary reload script into HTML responses to enable reloading, watches all files for changes, restarts the `app` server if necessary, and reloads all connected browsers.

In addition, when working with JS modules, **dvlp** will ensure that so-called _bare_ imports (which are not supported by browsers) work by re-writing all import paths to valid urls. Since most `node_modules` packages are still published as CommonJS modules, each bare import is also bundled and converted to an ESM module using [Rollup.js](https://rollupjs.org). These bundles are versioned and cached for efficient reuse in the `.dvlp` directory under the project root.

### Bonus!

**dvlp** also includes a simple [`testServer`](#testserveroptions--port-number-latency-number-webroot-string--promise-destroy---void-) for handling various network request scenarios during testing.

## Installation

Install globally or locally in your project with npm/yarn:

```bash
$ npm install dvlp
```

## Usage

```text
$ dvlp -h

  Usage: dvlp [options] [path...]

  Start a development server, restarting and reloading connected browsers on file changes.
  Serves static files from one or more "path" directories, or a custom application
  server if "path" is a single file

  Options:

    -p, --port <port>           port number
    -r, --rollup-config <path>  path to optional Rollup.js config
    --no-reload                 disable reloading connected browsers on file change
    -v, --version               output the version number
    -h, --help                  output usage information
```

Add a script to your package.json `scripts`:

```json
{
  "scripts": {
    "dev": "dvlp --port 8000 path/to/my/app.js"
  }
}
```

... and launch:

```text
$ npm run dev
```

## Debugging

**dvlp** uses the [debug.js](https://github.com/visionmedia/debug) debugging utility. Set the following environment variable before running to see detailed debug messages:

```bash
$ DEBUG=dvlp* npm run dev
```

## JS API

##### `server(filepath: string|[string], [options]: { port: number, reload: boolean, rollupConfig: string }): Promise<{ destroy: () => void }>`

Serve files at `filepath`, starting static file server if one or more directories, or app server if a single file.

`options` include:

* **`port: number`**: port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `8080`)
* **`reload: boolean`**: enable/disable browser reloading (default `true`)
* **`rollupConfig: string`**: path to optional [Rollup.js](https://rollupjs.org) config file to configure bundling of bare imports

##### `testServer([options]: { port: number, latency: number, webroot: string }): Promise<{ latency: number, webroot: string, mock: (url: string, response: string|object) => void, destroy: () => Promise<void> }>`

Create a server for handling network requests during testing.

`options` include:

* **`port: number`** the port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `3333`)
* **`latency: number`** the minimum amount of random artificial latency to introduce (in `ms`) for responses (default `50`)
* **`webroot: String`** the subpath from `process.cwd()` to preppend to relative paths (default `''`)

```js
const { testServer } = require('dvlp');
const { mock, destroy } = await testServer({ port: 8080, latency: 20, webroot: 'lib' });
```

If unable to resolve a request to a local file, `testServer` will respond with a dummy file of the appropriate type. This makes it easy to test ServiceWorker pre-caching, for example, without having to correctly resolve paths or create mocks. In addition, `testServer` supports the following special query parameters:

* **`offline`** simulate an offline state by terminating the request (`fetch('http://localhost:3333/foo.js?offline')`)
* **`error`** return a 500 server error response (`fetch('http://localhost:3333/foo.js?error')`)
* **`missing`** return a 404 not found response (`fetch('http://localhost:3333/foo.js?missing')`)
* **`maxage=value`** configure `Cache-Control: public, max-age={value}` cache header (`fetch('http://localhost:3333/foo.js?maxage=10')`)

Returns a **`TestServer`** instance with the following properties:

* **`latency: number`** the minimum amount of random artificial latency to introduce (in `ms`) for responses (default `50`)
* **`webroot: String`** the subpath from `process.cwd()` to preppend to relative paths (default `''`)
* **`mock: (url: string, response: string|object) => void`** add a one-time mock `response` for `url`. Will return a `text/html` response if `response` type is `string`, or `application/json` response if type is `object`
* **`destroy: () => Promise<void>`** stop and clean up running server

```js
mock('/api/user/1234', { id: '1234', name: 'bob' });
const res = await fetch('http://localhost:8080/api/user/1234');
console.log(await res.body()); // => { "id": "1234", "name": "bob" }
```
