export default {
  onRequest(req, res) {
    if (req.url === '/api') {
      res.writeHead(200);
      res.end('handled');
      return true;
    }
  },
};
