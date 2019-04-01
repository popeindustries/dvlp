'use strict';

const { createServer } = require('http');

const server = createServer();

server.on('request', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('ok');
});

server.listen(3000);
