'use strict';

const { createServer } = require('http');

const server = createServer();

server.on('request', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    '<!doctype html><html><head><meta charset="utf-8"><title>Demo</title></head><body><h1>Demo</h1></body></html>'
  );
});

server.listen(3000);
