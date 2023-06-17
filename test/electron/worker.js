import fastify from 'fastify';
import template from './template.js';
import { workerData } from 'worker_threads';

const server = fastify();

server.get('/', async (req, reply) => {
  reply.type('text/html').send(template);
});

await server.listen({ port: 8100 });

workerData.messagePort.postMessage('listening');
