import fastify from 'fastify';
import nodeFetch from 'node-fetch';

const fetch = globalThis.fetch ?? nodeFetch;
const server = fastify();

server.get('/', async (req, reply) => {
  const res = await fetch('https://www.someapi.com/v1/9012');
  const { user } = await res.json();

  reply.type('text/html').send(`<!doctype html>
    <html lang="en-gb">
      <head>
        <meta charset="utf-8">
        <script type="module" src="www/module.js"></script>
      </head>
      <body>
      ${user.name}
      </body>
    </html>`);
});

server.listen({ port: 8100 }, (err, address) => {
  err && console.error(err);
});
