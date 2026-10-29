import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read-night.js';

export function createDigestApi(config: RigConfig) {
  const app = new Hono();

  app.get('/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (!digest) return c.notFound();

    return c.json(digest);
  });

  return app;
}
