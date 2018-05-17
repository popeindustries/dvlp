'use strict';

const body = require('./body');
const Koa = require('koa');
const send = require('koa-send');

const app = new Koa();

app.use(async (ctx) => {
  if (ctx.accepts('html')) {
    return (ctx.body = `<!doctype html>
    <html lang="en-gb">
      <head>
        <meta charset="utf-8">
        <script type="module" src="module.js"></script>
      </head>
      <body>
      ${body}
      </body>
    </html>`);
  }
  await send(ctx, ctx.path, { root: __dirname + '/www' });
});

app.listen(process.env.PORT || 8000);
