import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './db/client';
import plants   from './routes/plants';
import symptoms from './routes/symptoms';
import toxins   from './routes/toxins';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.route('/plants',   plants);
app.route('/symptoms', symptoms);
app.route('/toxins',   toxins);

app.get('/', (c) => c.json({ status: 'ok', version: '1.0.0' }));

export default app;
