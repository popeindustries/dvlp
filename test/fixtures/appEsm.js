import body from './body';
import Koa from 'koa';
import send from 'koa-send';

const app = new Koa();

app.use(async (ctx) => {
  if (ctx.path === '/') {
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
  ctx.set('x-app', 'test');
  await send(ctx, ctx.path, { root: __dirname + '/www' });
});

app.listen(process.env.PORT || 8000);
