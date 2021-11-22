import { createServer } from 'http';

createServer((req, res) => {
  res.writeHead(200);
  res.end('ok');
}).listen('localhost:8100');
