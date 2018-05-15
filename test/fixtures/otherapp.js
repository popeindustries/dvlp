'use strict';

const Koa = require('koa');
const fs = require('fs');
const path = require('path');

const app = new Koa();

app.use(async (ctx) => {
  ctx.type = 'html';
  ctx.body = fs.createReadStream(path.resolve('./assets/index.html'));
});

app.listen(process.env.PORT || 8000);
