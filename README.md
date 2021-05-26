[![NPM Version](https://img.shields.io/npm/v/dvlp.svg?style=flat)](https://npmjs.org/package/dvlp)
[![Build Status](https://img.shields.io/github/workflow/status/popeindustries/dvlp/test/master)](https://github.com/popeindustries/dvlp/actions)

# 💥 dvlp

**dvlp** is a no-configuration, no-conditionals, no-middleware, no-nonsense (no-vowels!) **_dev server toolkit_** to help you develop quickly and easily for the web. You shouldn't have to jump through hoops to get a development environment up and running, and you definitely shouldn't have to include development-only stuff in your high-quality production code! **dvlp** is full of hacks so your code doesn't have to be!

### Philosophy

- **No bundling**: write JS modules and load them directly in the browser
- **No middleware**: write application servers without special dev/build/bundle middleware
- **No infrastructure**: mock external JSON/EventSource/WebSocket resources
- **No waiting**: restart application servers in the blink of an eye
- **No refreshing**: automatically reload browsers on file change

### How it works

**dvlp** allows you to easily serve files from one or more project directories (`static` mode), or from your custom application server (`app` mode). In both cases, **dvlp** automatically injects the necessary reload script into HTML responses to enable reloading, watches all files for changes, restarts the `app` server if necessary, and reloads all connected browsers.

In addition, when working with JS modules, **dvlp** will ensure that so-called _bare_ imports (`import "lodash"`), which are not supported by browsers, work by re-writing all import paths to valid urls. Since most `node_modules` packages are still published as CommonJS modules, each bare import is also bundled and converted to an ESM module using [esbuild](https://esbuild.github.io). These bundles are versioned and cached for efficient reuse in the `.dvlp` directory under your project root.

### Bonus!

**dvlp** also includes a [`testServer`](#--testserveroptions-promisetestserver) for handling various network request scenarios (mocking, latency, errors, offline, etc.) during testing.

## Installation

Install globally or locally in your project with npm/yarn:

```bash
$ npm install dvlp
```

## Usage

```text
Usage: dvlp [options] [path...]

Start a development server, restarting and reloading connected browsers on file changes.
  Serves static files from one or more "path" directories, or a custom application
  server if "path" is a single application server file.

Options:
  -p, --port <port>   port number
  -m, --mock <path>   path to mock files (directory, file, glob pattern)
  -k, --hooks <path>  path to optional hooks registration file
  --ssl <path>        enable https mode by specifying path to directory containing
                      ".crt" and ".key" files (directory, glob pattern)
  -s, --silent        suppress default logging
  --no-reload         disable reloading connected browsers on file change
  -v, --version       output the version number
  -h, --help          display help for command
```

Add a script to your package.json `scripts`:

```json
{
  "scripts": {
    "dev": "dvlp --port 8000 src/app.js"
  }
}
```

...and launch:

```text
$ npm run dev
```

### Hooks

In some cases, source code may need to be transformed into a valid format before it is executed, or a response body modified before sending it to the browser. In these cases, you can register `hooks` to convert file contents on the fly when imported by an application server or requested by the browser.

<details>
<summary>Registering hooks</summary>

Create a Node.js module that exposes one or more supported lifecycle hook functions:

```js
// scripts/hooks.js
import sass from 'sass';

const RE_SASS = /\.s[ac]ss$/;

module.exports = {
  /**
   * Bundle non-esm node_modules dependency requested by the browser.
   * This hook is run after file read.
   *
   * @param { string } id
   * @param { string } filePath
   * @param { string } fileContents
   * @param { { esbuild: Pick<import("esbuild"), 'build'> } } context
   */
  async onDependencyBundle(id, filePath, fileContents, context) {
    if (id === 'some/package') {
      // Transform
    }
  }

  /**
   * Transform file contents for file requested by the browser.
   * This hook is run after file read, and before any modifications by dvlp.
   *
   * @param { string } filePath
   * @param { string } fileContents
   * @param { { client: { manufacturer: string, name: string, ua: string, version: string }, esbuild: Pick<import("esbuild"), 'build', 'transform'> } } context
   */
  async onTransform(filePath, fileContents, context) {
    // Note: .ts, .tsx, .jsx files are transformed by default

    if (RE_SASS.test(filePath)) {
      return sass.renderSync({
        file: filePath,
      }).css;
    }
  },

  /**
   * Transform file contents for file imported by Node.js application server.
   * This hook is run after file read.
   *
   * @param { string } filePath
   * @param { string } fileContents
   */
  onServerTransform(filePath, fileContents) {
    // Note: .ts, .tsx, .jsx files are transformed by default
  },

  /**
   * Manually resolve import specifier.
   * This hook is run for each import statement.
   * If returns "false", import re-writing is skipped.
   * If returns "undefined", import specifier is re-written using default resolver.
   * If "context.isDynamic", also possible to return replacement for whole expression.
   *
   * @param { string } specifier
   * @param { { importer: string, isDynamic: boolean } } context
   * @param { (specifier: string, importer: string) => string | undefined } defaultResolve
   */
  onResolveImport(specifier, context, defaultResolve) {
    if (context.isDynamic) {
      return `dynamicImport('./some-path-prefix/${specifier}.js', '${context.importer}')`;
    }
  },

  /**
   * Manually handle response for incoming server request.
   * If returns "true", further processing by dvlp will be aborted.
   *
   * @param { IncomingMessage | Http2ServerRequest } request
   * @param { ServerResponse | Http2ServerResponse } response
   * @returns { Promise<boolean> | boolean | undefined }
   */
  onRequest(request, response) {
    if (request.url === '/something') {
      response.writeHead(200);
      response.end('handled');
      return true;
    }
  },

  /**
   * Modify response body before sending to the browser.
   * This hook is run after all modifications by dvlp, and before sending to the browser.
   *
   * @param { string } filePath
   * @param { string } responseBody
   */
  onSend(filePath, responseBody) {
    if (RE_JS.test(filePath)) {
      return responseBody.replace('__VERSION__', '1.0.0');
    }
  },
};
```

...reference the original file as you normally would:

```html
<link rel="stylesheet" href="src/index.sass" />
```

...and pass a reference to the `hooks.js` file with the `-k, --hooks` option:

```json
{
  "scripts": {
    "dev": "dvlp --hooks scripts/hooks.js --port 8000 src/app.js"
  }
}
```

</details>

### Mocking

When developing locally, it's often useful to mock responses for requests made by your server or browser application, especially when working with an external API. **dvlp** lets you quickly and easily mock endpoints by intercepting requests that match those registered with the `-m, --mock` option.

<details>

<summary>Mocking request/response</summary>

Mock a response by creating a `.json` file describing the mocked `request/response`:

```json
{
  "request": {
    "url": "http://www.someapi.com/v1/id/101010",
    "ignoreSearch": true
  },
  "response": {
    "headers": {
      "x-custom": "custom header"
    },
    "body": {
      "user": {
        "name": "Nancy",
        "id": "101010"
      }
    }
  }
}
```

(_Setting `request.ignoreSearch = true` will ignore query parameters when matching an incoming request with the mocked response_)

Bad responses can also be mocked by setting `hang`, `error`, `missing`, or `offline` response properties:

```json
{
  "request": {
    "url": "http://www.someapi.com/v1/id/101010"
  },
  "response": {
    "error": true,
    "body": {}
  }
}
```

Multiple mocked responses may also be included in a single file:

```json
[
  {
    "request": {
      "url": "http://www.someapi.com/v1/id/101010"
    },
    "response": {
      "body": {}
    }
  },
  {
    "request": {
      "url": "http://www.someapi.com/v1/id/202020"
    },
    "response": {
      "body": {}
    }
  }
]
```

Though JSON responses are probably the most common, it's also possible to mock other types of payloads by linking the `response.body` to an external file:

```json
{
  "request": {
    "url": "http://www.someplace.com/images/avatar.jpg"
  },
  "response": {
    "body": "../assets/avatar.jpg"
  }
}
```

(_File paths referenced in `response.body` are relative to the mock file, not the web/project root_)

Register mocked responses with the command-line option `-m, --mock` and a path to your mock files:

```json
{
  "scripts": {
    "dev": "dvlp --mock path/to/mock/files --port 8000 src/app.js"
  }
}
```

Your `path/to/mock/files` could be one of the following:

- path to directory of files: `path/to/mock/directory`
- path to a single file: `path/to/mock.json`

(_The following require wrapping in `""`_)

- globbed path to multiple files/directories: `"path/to/mock/{api,assets}"`
- multiple files/directories separated by space, `,`, `:`, or `;`: `"path/to/mock1.json, path/to/mock2.json"`

</details>

<details>

<summary>Mocking stream/events</summary>

Mock a `WebSocket` or `EventStream` by creating a `.json` file describing the mocked `stream/events`:

```json
{
  "stream": {
    "url": "ws://www.somesocket.com/stream",
    "ignoreSearch": true,
    "protocol": "socket.io"
  },
  "events": [
    {
      "name": "hello Bob",
      "connect": true,
      "message": {
        "people": ["Bob Builder"]
      },
      "options": {
        "event": "update",
        "namespace": "/people"
      }
    },
    {
      "name": "hello Ernie",
      "message": {
        "people": ["Bob Builder", "Ernie Engineer"]
      },
      "options": {
        "event": "update",
        "namespace": "/people"
      }
    }
  ]
}
```

(_Setting `request.ignoreSearch = true` will ignore query parameters when matching an incoming request with the mocked response_)

(_Specifying a `stream.protocol = "socket.io"` will negotiate WebSocket responses using the Socket.io protocol_)

An event's `name` is a custom, unique string used to identify the event for manual triggering (see below). Adding the property `connect: true` will flag an event to be triggered automatically on initial connection.

A sequence of events may also be described by nesting events under the `sequence` property:

```json
{
  "stream": {
    "url": "http://www.someeventsource.com/stream"
  },
  "events": [
    {
      "name": "a sequence of unfortunate events",
      "sequence": [
        {
          "message": "oh",
          "options": {
            "event": "update"
          }
        },
        {
          "message": "no",
          "options": {
            "event": "update",
            "delay": 100
          }
        },
        {
          "message": "not",
          "options": {
            "event": "update",
            "delay": 50
          }
        },
        {
          "message": "again!",
          "options": {
            "event": "update",
            "delay": 10
          }
        }
      ]
    }
  ]
}
```

Register mocked responses with the command-line option `-m, --mock` and a path to your mock files:

```json
{
  "scripts": {
    "dev": "dvlp --mock path/to/mock/files --port 8000 src/app.js"
  }
}
```

Your `path/to/mock/files` could be one of the following:

- path to directory of files: `path/to/mock/directory`
- path to a single file: `path/to/mock.json`

(_Note that the following require wrapping in `""`_)

- globbed path to multiple files/directories: `"path/to/mock/{api,assets}"`
- multiple files/directories separated by space, `,`, or `;`: `"path/to/mock1.json, path/to/mock2.json"`

</details>

<details>

<summary>Triggering mocked stream events</summary>

Once registered, mocked stream events may be triggerd from your browser's console:

```js
dvlp.pushEvent('ws://www.somesocket.com/stream', 'hello Ernie');
```

</details>

<details>

<summary>Mocking in the browser</summary>

All mocks registered with the `-m, --mock` option are also enabled by default in the browser. In addition, similar to the [`testServer`](#--testserveroptions-promisetestserver), you can register mocks programatically:

```js
import { testBrowser } from 'dvlp/test-browser';

describe('some test', () => {
  before(() => {
    testBrowser.disableNetwork();
  });
  after(() => {
    testBrowser.enableNetwork();
  });

  it('should fetch mock data', async () => {
    const href = 'https://www.google.com';
    testBrowser.mockResponse(
      href,
      (req, res) => {
        res.writeHead(500);
        res.end('error');
      },
      true,
    );
    const res = await fetch(href);
    assert.equal(res.status, 500);
  });
});
```

</details>

### Bundling

As mentioned in [How it works](#how-it-works), **dvlp** will bundle CommonJS packages imported from `node_modules` in order to convert them to es6 modules. [esbuild](https://esbuild.github.io) is used to create these bundles, and they are then cached on disk inside the `.dvlp` directory under your project root.

In the (rare) case you need to customise bundling to work with the packages you're importing, you can register a `onDependencyBundle` [hook](#hooks).

### SSL

Enable development against a secure http2 server by passing the path or glob pattern to your `.crt` and `.key` files with the `--ssl` option.

> Follow the directions [here](https://deliciousbrains.com/ssl-certificate-authority-for-local-https-development/) to generate a self-signed certificate for local development

## Debugging

**dvlp** uses the [debug.js](https://github.com/visionmedia/debug) debugging utility internally. Set the following environment variable before running to see detailed debug messages:

```text
$ DEBUG=dvlp* npm run dev
```

## JS API

#### - `server(filePath: string|[string]|() => void, [options]): Promise<{ destroy: () => void }>`

Serve files at `filePath`, starting static file server if one or more directories, or app server if a single file or function (which starts an application server when imported/called).

`options` include:

- **`certsPath: string|[string]`**: the path or glob pattern containing ".crt" and ".key" files (default `''`)
- **`directories: [string]`**: additional directories to use for resolving file requests (default `[]`)
- **`hooksPath: string`**: the path to a hooks registration file (default `''`)
- **`mockPath: string|[string]`** the path(s) to load mock files from (default `''`)
- **`port: number`**: port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `8080`)
- **`reload: boolean`**: enable/disable browser reloading (default `true`)
- **`silent: boolean`**: disable/enable default logging (default `false`)

```js
import { server } from 'dvlp';
const appServer = await server('path/to/app.js', { port: 8080 });
```

#### - `testServer([options]): Promise<TestServer>`

Create a server for handling network requests during testing.

`options` include:

- **`autorespond: boolean`** enable/disable automatic dummy responses. If unable to resolve a request to a local file or mock, the server will respond with a dummy response of the appropriate type (default `false`)
- **`latency: number`** the amount of artificial latency to introduce (in `ms`) for responses (default `50`)
- **`port: number`** the port to expose on `localhost`. Will use `process.env.PORT` if not specified here (default `8080`)
- **`webroot: String`** the subpath from `process.cwd()` to prepend to relative paths (default `''`)

```js
import { testServer } from 'dvlp/test';
const mockApi = await testServer({ port: 8080, latency: 20, webroot: 'src' });
```

Returns a **`TestServer`** instance with the following methods:

- **`loadMockFiles(filePath: string|[string]): void`** load and register mock response files (see [mocking](#mocking))

```json
{
  "request": {
    "url": "http://www.someapi.com/v1/id/101010"
  },
  "response": {
    "body": {
      "user": {
        "name": "Nancy",
        "id": "101010"
      }
    }
  }
}
```

```js
mockApi.loadMockFiles('path/to/mock/101010.json');
const res = await fetch('http://www.someapi.com/v1/id/101010');
console.log(await res.json()); // => { user: { name: "nancy", id: "101010" } }
```

- **`mockResponse(request: string|object, response: object|(req, res) => void, once: boolean, onMockCallback: () => void): () => void`** add a mock `response` for `request`, optionally removing it after first use, and/or triggering a callback when successfully mocked (see [mocking](#mocking)). Returns a function that may be called to remove the added mock at any time.

```js
mockApi.mockResponse(
  '/api/user/1234',
  {
    body: {
      id: '1234',
      name: 'bob',
    },
  },
  true,
);
const res = await fetch('http://localhost:8080/api/user/1234');
console.log(await res.json()); // => { id: "1234", name: "bob" }
```

Or pass a response handler:

```js
const removeMock = mockApi.mockResponse(
  '/api/user/1234',
  (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ id: '1234', name: 'bob' }));
  },
  true,
);
const res = await fetch('http://localhost:8080/api/user/1234');
console.log(await res.json()); // => { id: "1234", name: "bob" }
removeMock();
```

- **`mockPushEvents(stream: string|object, events: object|[object]): () => void`** add one or more mock `events` for a WebSocket/EventSource `stream` (see [mocking](#mocking)). Returns a function that may be called to remove the added mock at any time.

```js
const removeMock = mockApi.mockPushEvents('ws://www.somesocket.com/stream', [
  {
    name: 'hi',
    message: 'hi!',
  },
  {
    name: 'so scary',
    message: 'boo!',
  },
]);
ws = new WebSocket('ws://www.somesocket.com/stream');
ws.addEventListener('message', (event) => {
  console.log(event.data); // => hi!
  removeMock();
});
```

- **`pushEvent(stream: string|object, event: string|object’):void`** push data to WebSocket/EventSource clients. A string passed as 'event' will be handled as a named mock push event (see [mocking](#mocking))

```js
mockApi.pushEvent('ws://www.somesocket.com/stream', 'so scary');
```

- **`destroy(): Promise<void>`** stop and clean up running server

In addition, `testServer` supports the following special query parameters:

- **`offline`** simulate an offline state by terminating the request (`fetch('http://localhost:3333/foo.js?offline')`)
- **`error`** return a 500 server error response (`fetch('http://localhost:3333/foo.js?error')`)
- **`missing`** return a 404 not found response (`fetch('http://localhost:3333/foo.js?missing')`)
- **`maxage=value`** configure `Cache-Control: public, max-age={value}` cache header (`fetch('http://localhost:3333/foo.js?maxage=10')`)
- **`hang`** hold connection open without responding (`fetch('http://localhost:3333/foo.js?hang')`)

#### - `testServer.disableNetwork(rerouteAllRequests: boolean): void`

Disable all network requests with origin that is not `localhost`. Prevents all external network requests for the current Node.js process. If `rerouteAllRequests` is set to `true`, all external requests will be re-routed to the current running server.

```js
testServer.disableNetwork();
await fetch('https://github.com/popeindustries/dvlp');
// => Error "network connections disabled"
```

#### - `testServer.enableNetwork(): void`

Re-enables all previously disabled external network requests for the current Node.js process.

## JS API (browser)

#### - `testBrowser.mockResponse(request: string|object, response: object|(req, res) => void, once: boolean, onMockCallback: () => void): () => void`

Add a mock `response` for `request`, optionally removing it after first use, and/or triggering a callback when successfully mocked (see [mocking](#mocking)). Returns a function that may be called to remove the added mock at any time.

```js
// Also available as "window.dvlp"
import { testBrowser } from 'dvlp/test-browser';

testBrowser.mockResponse(
  'http://localhost:8080/api/user/1234',
  {
    body: {
      id: '1234',
      name: 'bob',
    },
  },
  true,
);
```

#### - `testBrowser.pushEvent(stream: string|object, event: string|object’):void`

Push data to WebSocket/EventSource clients. A string passed as 'event' will be handled as a named mock push event (see [mocking](#mocking)).

```js
testBrowser.pushEvent('ws://www.somesocket.com/stream', 'so scary');
```

#### - `testBrowser.disableNetwork(rerouteAllRequests: boolean): void`

Disable all network requests with origin that is not `localhost`. Prevents all external AJAX/Fetch/EventSource/WebSocket requests originating from the current browser window. If `rerouteAllRequests` is set to `true`, all external requests will be re-routed to the running **dvlp** service.

```js
testBrowser.disableNetwork();
await fetch('https://github.com/popeindustries/dvlp');
// => Error "network connections disabled"
```

#### - `testServer.enableNetwork(): void`

Re-enables all previously disabled requests originating from the current browser window.
