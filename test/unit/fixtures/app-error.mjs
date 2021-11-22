import body from './body.mjs';
import fastify from 'fastify';

const server = fastify();

oops;

server.get('/', async (req, reply) => {
  reply.type('text/html').send(`<!doctype html>
    <html lang="en-gb">
      <head>
        <meta charset="utf-8">
        <script type="module" src="www/module.js"></script>
      </head>
      <body>
      ${body}
      </body>
    </html>`);
});

server.listen(process.env.PORT || 8100, (err, address) => {
  err && console.error(err);
});
