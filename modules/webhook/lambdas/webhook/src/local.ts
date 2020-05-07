import express from 'express';
import bodyParser from 'body-parser';
import { handle } from './webhook/handler';

const app = express();

app.use(bodyParser.json());

app.post('/event_handler', (req, res) => {
  handle(req.headers, JSON.stringify(req.body))
    .then((c) => res.status(c).end())
    .catch((e) => {
      console.log(e);
      res.status(404);
    });
});

app.listen(3000, (): void => {
  console.log('webhook app listening on port 3000!');
});
