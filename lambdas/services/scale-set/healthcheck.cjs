'use strict';

const http = require('node:http');
const port = Number(process.env.SCALE_SET_HEALTH_PORT || '8080');
const request = http.get(
  { host: '127.0.0.1', port, path: '/healthz', timeout: 4000, headers: { Connection: 'close' } },
  (response) => {
    response.resume();
    process.exit(response.statusCode === 200 ? 0 : 1);
  },
);
request.on('timeout', () => request.destroy(new Error('health check timed out')));
request.on('error', () => process.exit(1));
