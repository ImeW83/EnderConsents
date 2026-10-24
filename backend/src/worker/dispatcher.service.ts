import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';
import { redisConnection } from './redis';

export const DELIVERY_QUEUE = 'webhook-delivery';

const POLL_INTERVAL_MS = 2_000;
const CLAIM_BATCH = 50;
const CLAIM_LEASE_SECONDS = 60;
const CONCURRENCY = 10;

// Postgres is the source of truth for what needs delivering (the outbox);
// Redis/BullMQ only supplies concurrency and job handling. If Redis loses its
// data, nothing is lost: the next poll re-claims whatever is still pending.
@Injectable()
export class DispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatcherService.name);
  private queue!: Queue;
  private worker!: Worker;
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private prisma: PrismaService,
    private deliveryService: WebhookDeliveryService,
  ) {}

  onModuleInit() {
    const connection = redisConnection();
    this.queue = new Queue(DELIVERY_QUEUE, { connection });
    this.worker = new Worker(
      DELIVERY_QUEUE,
      (job) => this.deliveryService.deliver(job.data.deliveryId as string),
      { connection, concurrency: CONCURRENCY },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Delivery job ${job?.id} crashed: ${error.message}`),
    );
    this.queue.on('error', (error) => this.logger.error(`Queue error: ${error.message}`));

    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    void this.poll();
    this.logger.log('Webhook dispatcher started');
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }

  private async poll() {
    if (this.polling) return; // never overlap polls
    this.polling = true;
    try {
      const claimed = await this.claimDue();
      for (const { id, attempts } of claimed) {
        // Attempt count in the job id keeps retries distinct from the previous
        // job, while a duplicate add for the same attempt is ignored
        await this.queue.add(
          'deliver',
          { deliveryId: id },
          { jobId: `${id}-${attempts}`, removeOnComplete: true, removeOnFail: 100 },
        );
      }
    } catch (error) {
      this.logger.error(`Dispatcher poll failed: ${(error as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  // Leasing (lockedUntil) rather than deleting: if this process dies after
  // claiming, the lease expires and the delivery is claimed again.
  // SKIP LOCKED lets several workers claim in parallel without overlap.
  private async claimDue() {
    return this.prisma.$queryRaw<{ id: string; attempts: number }[]>`
      UPDATE "WebhookDelivery" SET "lockedUntil" = now() + make_interval(secs => ${CLAIM_LEASE_SECONDS})
      WHERE id IN (
        SELECT d.id FROM "WebhookDelivery" d
        JOIN "Webhook" w ON w.id = d."webhookId"
        WHERE d.status = 'pending'
          AND d."nextAttemptAt" <= now()
          AND (d."lockedUntil" IS NULL OR d."lockedUntil" < now())
          AND w."isActive"
        ORDER BY d."nextAttemptAt"
        LIMIT ${CLAIM_BATCH}
        FOR UPDATE OF d SKIP LOCKED
      )
      RETURNING id, attempts`;
  }
}
