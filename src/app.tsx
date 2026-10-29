import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { createDigestApi } from './digest/api.js';
import { createDigestPage } from './digest/page.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.route('/digest', createDigestPage(config));
  app.route('/api/digest', createDigestApi(config));

  return app;
}
