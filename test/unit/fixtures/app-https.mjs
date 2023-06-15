import body from './body.mjs';
import fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = fastify({
  http2: true,
  https: {
    key: fs.readFileSync(
      path.join(__dirname, 'certificates/dvlp.key'),
      'utf-8',
    ),
    cert: fs.readFileSync(
      path.join(__dirname, 'certificates/dvlp.crt'),
      'utf-8',
    ),
  },
});

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

server.listen({ port: 443 }, (err, address) => {
  err && console.error(err);
});
