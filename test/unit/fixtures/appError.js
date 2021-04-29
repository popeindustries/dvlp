'use strict';

const fastify = require('fastify');
const fastifyStatic = require('fastify-static');

const server = fastify();

server.get('/', async (req, reply) => {
  reply.type('text/html').send(`<!doctype html>
    <html lang="en-gb">
      <head>
        <meta charset="utf-8">
        <script type="module" src="www/module.js"></script>
      </head>
      <body>
      ${errrrrrrrrrrrr}
      </body>
    </html>`);
});

server.register(fastifyStatic, {
  root: __dirname,
});

server.listen(process.env.PORT || 8100, (err, address) => {
  err && console.error(err);
});
