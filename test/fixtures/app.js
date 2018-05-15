'use strict';

const Koa = require('koa');
const body = require('./body');

const app = new Koa();

app.use(async (ctx) => {
  ctx.body = `<!doctype html>
<html lang="en-gb">
  <head>
    <meta charset="utf-8">
  </head>
  <body>
  ${body}
  </body>
</html>`;
});

app.listen(process.env.PORT || 8000);
