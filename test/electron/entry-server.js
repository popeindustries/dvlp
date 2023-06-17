import { app, BrowserWindow } from 'electron';
import fastify from 'fastify';
import template from './template.js';

await app.whenReady();

const server = fastify();

server.get('/', async (req, reply) => {
  reply.type('text/html').send(template);
});

await server.listen({ port: 8100 });

new BrowserWindow({ width: 800, height: 600 }).loadURL('http://localhost:8100');
