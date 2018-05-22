'use strict';

const bodyParser = require('koa-bodyparser');
const debug = require('debug')('dvlp');
const fs = require('fs');
const Koa = require('koa');
const path = require('path');
const router = require('koa-route');

const DEFAULT_PORT = 3333;
const DEFAULT_LATENCY = 50;

/**
 * Create test server
 * @param {{ port: number, latency: number, webroot: string, routes: (app, router) => void }} [options]
 * @returns {Promise<{ app: Koa, port: number, server: http.Server, destroy: () => void }>}
 */
module.exports = function testServer({
  latency = DEFAULT_LATENCY,
  port = DEFAULT_PORT,
  routes = null,
  webroot = ''
} = {}) {
  return new Promise((resolve, reject) => {
    const app = new Koa();
    const connections = {};

    app.use(bodyParser());
    app.use(offline());
    app.use(config());
    app.use(slow(latency));
    if (routes) {
      routes(app, router);
    }
    app.use(all(webroot));

    const server = app.listen(port);

    // Store active connections for eventual clean up
    server.on('connection', (connection) => {
      const key = connection.remoteAddress + ':' + connection.remotePort;

      connections[key] = connection;
      connection.on('close', () => {
        delete connections[key];
      });
    });
    server.on('error', (err) => {
      reject(err);
    });
    server.on('listening', () => {
      resolve({
        app,
        port,
        server,
        destroy() {
          return new Promise((resolve, reject) => {
            if (server) {
              server.close(resolve);
            } else {
              reject(Error('no server started'));
            }
            for (const key in connections) {
              connections[key].destroy();
            }
          });
        }
      });
    });
  });
};

/**
 * Initialise 'app' with new 'options'
 * @param {Koa} app
 * @param {object} options
 */
function init(app, options = {}) {
  const { latency = DEFAULT_LATENCY, webroot = process.cwd() } = options;

  for (let i = 0, n = app.middleware.length; i < n; i++) {
    const middleware = app.middleware[i];

    if (latency && middleware.name && middleware.name == 'slow') {
      app.middleware[i] = slow(latency);
    }
    if (webroot && middleware.name && middleware.name == 'all') {
      app.middleware[i] = all(webroot);
    }
  }

  debug(`init with latency: ${latency}, webroot: ${webroot}`);
}

/**
 * Configuration middleware
 * Allows re-initialisation with new options
 */
function config() {
  return router.post('/config', async (ctx) => {
    init(ctx.app, ctx.request.body);
    ctx.body = ctx.request.body;
  });
}

/**
 * Handle all requests
 * @param {string} webroot
 */
function all(webroot) {
  return async function all(ctx) {
    const { error, maxage = 2, missing } = ctx.query;

    if (error != null || missing != null) {
      // Default is 404
      if (error != null) {
        ctx.status = 500;
        ctx.body = 'error';
      }
      debug(`not ok: ${ctx.path} responding with ${ctx.status}`);
      return;
    }

    // TODO: handle non-get requests

    const type = resolveType(ctx);
    const trimmedPath = ctx.path.slice(1);
    let isDummy = false;
    let filepath = path.resolve(path.join(webroot, trimmedPath));
    let body = '';
    let size = 5;
    let stat;

    if (!fs.existsSync(filepath)) {
      filepath = path.resolve(trimmedPath);
    }

    try {
      stat = fs.statSync(filepath);
      size = stat.size;
    } catch (err) {
      isDummy = true;
      body = '"hello"';
    }

    ctx.set('Content-Length', size);
    ctx.set('Cache-Control', `public, max-age=${maxage}`);
    ctx.type = type;
    ctx.body = body || fs.createReadStream(filepath);

    debug(
      isDummy
        ? `ok: ${ctx.path} responding with dummy file`
        : `ok: ${ctx.path} responding with file`
    );
  };
}

function offline() {
  return async function offline(ctx, next) {
    if ('offline' in ctx.query) {
      ctx.respond = false;
      ctx.socket.destroy();
      return;
    }
    return next();
  };
}

function slow(min) {
  return async function slow(ctx, next) {
    await latency(min);
    return next();
  };
}

function latency(min) {
  return new Promise((resolve) => {
    if (!min) {
      return resolve();
    }
    setTimeout(resolve, min + Math.random() * min);
  });
}

function resolveType(ctx) {
  const extension = path.extname(ctx.path).slice(1);
  let type = '';

  if (extension) {
    type = extension;
  } else if (ctx.accepts('html')) {
    type = 'html';
  } else if (ctx.accepts('js')) {
    type = 'js';
  } else if (ctx.accepts('css')) {
    type = 'css';
  }

  return type;
}
