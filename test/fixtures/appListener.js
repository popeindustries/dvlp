'use strict';

const { createServer } = require('http');

const server = createServer();

server.on('request', (req, res) => {
  res.writeHead(200);
  res.end('ok');
});

server.listen(8000);
