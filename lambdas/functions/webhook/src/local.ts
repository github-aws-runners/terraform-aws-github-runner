import bodyParser from 'body-parser';
import express from 'express';

import { handle } from './webhook';
import { ConfigWebhook } from './ConfigLoader';

const app = express();

app.use(bodyParser.json());

app.post('/event_handler', async (req, res) => {
  const config: ConfigWebhook = await ConfigWebhook.load();
  handle(req.headers, JSON.stringify(req.body), config)
    .then((c) => res.status(c.statusCode).end())
    .catch((e) => {
      console.log(e);
      res.status(404);
    });
});

app.listen(3000, (): void => {
  console.log('webhook app listening on port 3000!');
});
