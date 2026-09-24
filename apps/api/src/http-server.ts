import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';

import type { MrrDeclineApi } from './index.js';

export function createMrrDeclineServer(api: MrrDeclineApi): Server {
  return createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    );
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(name, item);
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }
    const body =
      request.method === 'POST'
        ? (Readable.toWeb(request) as unknown as BodyInit)
        : undefined;
    const apiRequest = new Request(requestUrl, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body, duplex: 'half' }),
    } as RequestInit & { duplex?: 'half' });
    try {
      const apiResponse = await api.fetch(apiRequest);
      response.writeHead(apiResponse.status, {
        ...Object.fromEntries(apiResponse.headers),
        'cache-control': 'no-store',
      });
      response.end(Buffer.from(await apiResponse.arrayBuffer()));
    } catch {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 'unavailable',
          error: 'Investigation service unavailable.',
        }),
      );
    }
  });
}
