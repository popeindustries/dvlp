'use strict';

const Koa = require('koa');
const body = require('./body');

const app = new Koa();

app.use(async (ctx) => {
  ctx.body = body;
});

app.listen(process.env.PORT || 8000);
