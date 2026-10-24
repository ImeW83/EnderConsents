import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EVENT_PAYLOAD_INCLUDE, toEventPayload } from './event-payload';
import { actionForEventType } from './event-types';

export interface EventsQuery {
  after?: string;
  limit?: string;
  type?: string;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

// Sequence numbers are handed out at insert time but become visible at commit
// time, so a slow transaction could commit a lower number after a higher one
// was already served. Holding back very recent events closes that gap: the
// feed trails real time by this long, which is far longer than any of our
// transactions run.
const SETTLE_WINDOW_MS = 5_000;

// Pull counterpart to webhooks: lets a receiver that was down, or doubts it
// received everything, replay from a cursor and be certain nothing was missed
@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string, query: EventsQuery) {
    const after = this.parseCursor(query.after);
    const limit = this.parseLimit(query.limit);

    const action = query.type ? actionForEventType(query.type) : undefined;
    if (query.type && !action) {
      throw new BadRequestException(`Unknown event type: ${query.type}`);
    }

    const where: Prisma.ConsentEventWhereInput = {
      seq: { gt: after },
      timestamp: { lte: new Date(Date.now() - SETTLE_WINDOW_MS) },
      consentState: { organizationId },
      ...(action && { action }),
    };

    // One extra row tells us whether more exist without a second count query
    const rows = await this.prisma.consentEvent.findMany({
      where,
      include: EVENT_PAYLOAD_INCLUDE,
      orderBy: { seq: 'asc' },
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return {
      data: page.map((event) => ({
        ...toEventPayload(event),
        cursor: event.seq.toString(),
      })),
      // Unchanged when the page is empty, so a poller can keep reusing it
      nextCursor: last ? last.seq.toString() : after.toString(),
      hasMore: rows.length > limit,
    };
  }

  private parseCursor(value?: string): bigint {
    if (value === undefined || value === '') {
      return 0n;
    }
    if (!/^\d{1,18}$/.test(value)) {
      throw new BadRequestException('after must be a cursor returned by this API');
    }
    return BigInt(value);
  }

  private parseLimit(value?: string): number {
    if (value === undefined || value === '') {
      return DEFAULT_LIMIT;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      throw new BadRequestException(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
    return parsed;
  }
}
