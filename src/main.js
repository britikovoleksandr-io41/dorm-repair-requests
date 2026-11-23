import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);

createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
}).listen(port, process.env.HOST ?? '127.0.0.1', function () {
  console.log(JSON.stringify({ port: this.address().port }));
});
