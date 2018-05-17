'use strict';

const body = require('./body');
const fs = require('fs');
const Koa = require('koa');
const path = require('path');

const app = new Koa();

app.use(async (ctx) => {
  if (ctx.accepts('html')) {
    return (ctx.body = `<!doctype html>
    <html lang="en-gb">
      <head>
        <meta charset="utf-8">
        <script type="module" src="./www/module.js"></script>
      </head>
      <body>
      ${body}
      </body>
    </html>`);
  }

  if (ctx.accepts('js')) {
    ctx.type = 'application/javascript';
  }

  ctx.body = fs.createReadStream(path.resolve(ctx.path.slice(1)));
});

app.listen(process.env.PORT || 8000);
