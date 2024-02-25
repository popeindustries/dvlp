import body from './body.mjs';
import fastify from 'fastify';

const server1 = fastify();
const server2 = fastify();

server1.get('*', async (req, reply) => {
  reply.callNotFound();
});

server1.listen({ port: 8101 });

server2.get('/', async (req, reply) => {
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

server2.listen({ port: 8100 });
