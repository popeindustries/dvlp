import { createServer } from 'http';

createServer((req, res) => {
  res.writeHead(200);
  res.end('ok');
}).listen('http://localhost:8100');
