// Prévia do servidor estático com compressão e APIs simuladas em memória.
import express from 'express';
import { createDevApp } from '../dev-server.js';
import { createApp } from '../server.js';

const mockApi = await createDevApp({ real: false });
const staticApp = createApp();
const app = express();
app.use((req, res, next) => req.path.startsWith('/api/') ? mockApi(req, res, next) : next());
app.use(staticApp);
const port = Number(process.env.PREVIEW_PORT || 5173);
app.listen(port, '127.0.0.1', () => {
  console.log(`Prévia local: http://127.0.0.1:${port} — APIs simuladas; sem banco ou mensageria reais.`);
});
