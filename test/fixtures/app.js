'use strict';

const Koa = require('koa');
const body = require('./body');
const send = require('send');

const app = new Koa();

app.use(async (ctx) => {
  console.log(ctx.path);
  if (ctx.accepts('html')) {
    ctx.body = `<!doctype html>
    <html lang="en-gb">
      <head>
        <meta charset="utf-8">
        <script type="module" src="./www/module.js"></script>
      </head>
      <body>
      ${body}
      </body>
    </html>`;
  } else {
    send(ctx.req, ctx.path, { cacheControl: false }).pipe(ctx.res);
  }
});

app.listen(process.env.PORT || 8000);
