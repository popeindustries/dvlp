import fastify from 'fastify';
import { workerData } from 'worker_threads';

const server = fastify();

server.get('/', async (req, reply) => {
  reply.type('text/html').send(`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Electron</title>
        <script type="module" src="renderer.js"></script>
      </head>
      <body>
        <h1>Hi electron!</h1>
      </body>
    </html>
  `);
});

await server.listen({ port: 8100 });

workerData.messagePort.postMessage('listening');
