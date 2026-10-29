import { serve, type ServerType } from '@hono/node-server';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

async function main(): Promise<void> {
  const host = process.env.PREVIEW_HOST;
  const output = process.argv[2];
  if (!host || !output) throw new Error('Set PREVIEW_HOST and supply an output HTML path.');

  const config = loadConfig();
  if (config.runsDir !== 'runs') throw new Error('Only the template sample runs may be published.');

  let server: ServerType | undefined;
  try {
    const address = await new Promise<AddressInfo>((resolve, reject) => {
      server = serve({ fetch: createApp(config).fetch, hostname: host, port: 0 }, resolve);
      server.once('error', reject);
    });
    const response = await fetch(`http://${host}:${address.port}/digest/2026-10-28`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('text/html')) {
      throw new Error('The digest did not return a successful HTML response.');
    }

    const html = await response.text();
    if (!html.startsWith('<!doctype html>') || /<script\b|<link\b|<img\b|@import\b/i.test(html)) {
      throw new Error('The preview must be a self-contained HTML page without client scripts.');
    }
    if ((html.match(/<th scope="row">/g) ?? []).length !== 5) {
      throw new Error('The preview must contain the five template sample jobs.');
    }

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, html, 'utf8');
    console.log('Saved the self-contained sample digest preview.');
  } finally {
    const current = server;
    if (current?.listening) {
      await new Promise<void>((resolve, reject) => {
        current.close((error) => error ? reject(error) : resolve());
      });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
