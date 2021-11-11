import { createServer } from 'http';

const server = createServer();

server.on('request', (req, res) => {
  res.writeHead(200);
  res.end('ok');
});

server.listen(8100);
