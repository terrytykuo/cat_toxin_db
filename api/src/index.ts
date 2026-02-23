import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { Env } from './db/client';
import plants   from './routes/plants';
import symptoms from './routes/symptoms';
import toxins   from './routes/toxins';

const app = new OpenAPIHono<{ Bindings: Env }>();

app.use('*', cors());

app.route('/plants',   plants);
app.route('/symptoms', symptoms);
app.route('/toxins',   toxins);

app.get('/', (c) => c.json({ status: 'ok', version: '1.0.0' }));

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Cat Toxin Database API',
    version: '1.0.0',
    description: 'Query plants toxic to cats — includes toxins, symptoms, treatments, and toxic parts.',
  },
  servers: [{ url: 'https://cat-toxin-api.oldiegoodie99.workers.dev' }],
});

app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export default app;
