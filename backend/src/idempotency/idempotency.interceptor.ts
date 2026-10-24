import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 255;
// A request still "in progress" after this long is presumed to have crashed
const STALE_AFTER_MS = 120_000;

// Stable across key order so semantically identical bodies hash the same
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
};

// Behaviour (modelled on how payment APIs do it): the first request with a key
// runs normally and its response is stored; a repeat with the same key and the
// same request replays that response instead of acting twice; a repeat with a
// different request is rejected. Failed requests release the key so the
// client can retry. Requires ApiKeyGuard to have run (uses request.apiKey).
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    // GETs are naturally repeatable; replaying a stored one would serve stale data
    if (req.method !== 'POST') {
      return next.handle();
    }

    const header = req.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(header) ? header[0] : header;
    if (key === undefined) {
      return next.handle();
    }
    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be 1-${MAX_KEY_LENGTH} characters`,
      );
    }

    const organizationId = req.apiKey.organizationId as string;
    const path = String(req.originalUrl).split('?')[0];
    const requestHash = createHash('sha256')
      .update(JSON.stringify([req.method, path, canonicalize(req.body ?? {})]))
      .digest('hex');

    return from(this.claim(organizationId, key, requestHash)).pipe(
      mergeMap((replay) => {
        if (replay) {
          res.status(replay.status);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(replay.body);
        }

        return next.handle().pipe(
          mergeMap(async (body) => {
            // Stored as the exact serialised text: a JSON column would reorder
            // keys, and a replay should read identically to the original
            await this.prisma.idempotencyKey.update({
              where: { organizationId_key: { organizationId, key } },
              data: {
                status: 'completed',
                responseStatus: res.statusCode,
                responseBody: JSON.stringify(body ?? null),
              },
            });
            return body;
          }),
          catchError((error) =>
            from(
              this.prisma.idempotencyKey
                .deleteMany({ where: { organizationId, key } })
                .catch(() => undefined),
            ).pipe(mergeMap(() => throwError(() => error))),
          ),
        );
      }),
    );
  }

  // Returns a stored response to replay, or null when this request owns the key
  private async claim(organizationId: string, key: string, requestHash: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.prisma.idempotencyKey.create({
          data: { organizationId, key, requestHash },
        });
        return null;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }

      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { organizationId_key: { organizationId, key } },
      });
      if (!existing) continue; // released between our create and read: try again

      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key was already used with a different request',
        );
      }
      if (existing.status === 'completed') {
        return {
          status: existing.responseStatus ?? 200,
          body: JSON.parse(existing.responseBody as string),
        };
      }
      if (Date.now() - existing.createdAt.getTime() > STALE_AFTER_MS) {
        await this.prisma.idempotencyKey.deleteMany({
          where: { id: existing.id, status: 'in_progress' },
        });
        continue;
      }
      throw new ConflictException(
        'A request with this Idempotency-Key is still being processed',
      );
    }

    throw new ConflictException('Could not claim Idempotency-Key, please retry');
  }
}
