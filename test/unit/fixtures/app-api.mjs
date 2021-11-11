import fastify from 'fastify';
import fetch from 'node-fetch';

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

server.listen(process.env.PORT || 8100, (err, address) => {
  err && console.error(err);
});
