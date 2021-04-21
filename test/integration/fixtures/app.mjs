const { createServer } = require('http');

createServer((req, res) => {
  res.writeHead(200);
  res.end('hi');
}).listen(process.env.PORT || 8080);
