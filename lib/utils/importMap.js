/*
{
  "imports": {
    "/node_modules/als-polyfill/index.mjs": [
      "@std/kv-storage",
      "/node_modules/als-polyfill/index.mjs"
    ]
  }
}
{
  "imports": {
    "querystringify": "/node_modules/querystringify/index.js"
  },
  "scopes": {
    "/node_modules/socksjs-client/": {
      "querystringify": "/node_modules/socksjs-client/querystringify/index.js"
    }
  }
}
{
  "imports": {
    "a": "/a-1.mjs",
    "b": "/b-1.mjs",
    "c": "/c-1.mjs"
  },
  "scopes": {
    "/scope2/": {
      "a": "/a-2.mjs"
    },
    "/scope2/scope3/": {
      "a": "/a-3.mjs",
      "b": "/b-3.mjs"
    }
  }
}
*/

export class ImportMap {
  constructor() {}
}
