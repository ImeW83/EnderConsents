import http from 'http';
import https from 'https';
import { safeLookup } from './url-safety';

export interface PostResult {
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

const MAX_RESPONSE_BYTES = 1024;

// Deliberately minimal: no redirects followed (a redirect could bounce us to an
// internal address), a hard timeout, and the response body is never trusted or
// stored beyond the status code. DNS goes through safeLookup.
export function postJson(
  rawUrl: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<PostResult> {
  const started = Date.now();
  const url = new URL(rawUrl);
  const transport = url.protocol === 'http:' ? http : https;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (statusCode: number | null, error: string | null) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, error, durationMs: Date.now() - started });
    };

    const request = transport.request(
      url,
      {
        method: 'POST',
        lookup: safeLookup,
        timeout: timeoutMs,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (response) => {
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) response.destroy();
        });
        const done = () => {
          const code = response.statusCode ?? null;
          const ok = code !== null && code >= 200 && code < 300;
          finish(code, ok ? null : `Endpoint responded with HTTP ${code}`);
        };
        response.on('end', done);
        response.on('close', done);
        response.on('error', done);
      },
    );

    request.on('timeout', () => {
      request.destroy();
      finish(null, `Timed out after ${timeoutMs}ms`);
    });
    request.on('error', (error) => finish(null, error.message));
    request.end(body);
  });
}
