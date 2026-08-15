'use strict';

const http = require('node:http');

const port = Number(process.env.SCALE_SET_HEALTH_PORT || '8080');
const request = http.get(
  {
    hostname: '127.0.0.1',
    port,
    path: '/healthz',
    timeout: 3_000,
    headers: { Connection: 'close' },
  },
  (response) => {
    response.once('end', () => process.exit(response.statusCode === 200 ? 0 : 1));
    response.resume();
  },
);

request.once('timeout', () => request.destroy(new Error('health check timed out')));
request.once('error', () => process.exit(1));
