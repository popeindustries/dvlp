export default {
  request: {
    url: 'https://www.someapi.com/v1/4567',
  },
  response: (req, res) => {
    const content = JSON.stringify({ user: { name: 'Gus', id: 4567 } });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      Date: new Date().toUTCString(),
      'Content-Length': Buffer.byteLength(content),
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
  },
};
