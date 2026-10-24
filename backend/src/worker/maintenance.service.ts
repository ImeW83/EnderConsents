import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from '../consent/consent.service';
import { redisConnection } from './redis';

export const MAINTENANCE_QUEUE = 'maintenance';

const EXPIRE_EVERY_MS = 60_000;
const CLEANUP_EVERY_MS = 3_600_000;
const REASSERT_EVERY_MS = 60_000;
const EXPIRE_BATCH = 100;
const MAX_BATCHES_PER_RUN = 50;
const IDEMPOTENCY_KEY_TTL_MS = 24 * 3_600_000;

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private queue!: Queue;
  private worker!: Worker;
  private reassertTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private consentService: ConsentService,
  ) {}

  async onModuleInit() {
    const connection = redisConnection();
    this.queue = new Queue(MAINTENANCE_QUEUE, { connection });
    this.queue.on('error', (error) => this.logger.error(`Queue error: ${error.message}`));

    await this.ensureSchedules();
    // Redis can lose its data (flush, failover): without this, expiry would
    // silently stop until the next restart. Cheap and idempotent.
    this.reassertTimer = setInterval(() => void this.ensureSchedules(), REASSERT_EVERY_MS);

    this.worker = new Worker(
      MAINTENANCE_QUEUE,
      async (job) => {
        if (job.name === 'expire-consents') await this.expireDueConsents();
        if (job.name === 'cleanup') await this.cleanup();
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Maintenance job ${job?.name} failed: ${error.message}`),
    );
    this.logger.log('Maintenance scheduler started');
  }

  // Schedulers are stored in Redis by id, so restarts and several workers
  // all converge on one schedule instead of duplicating it
  private async ensureSchedules() {
    try {
      await this.queue.upsertJobScheduler('expire-consents', { every: EXPIRE_EVERY_MS });
      await this.queue.upsertJobScheduler('cleanup', { every: CLEANUP_EVERY_MS });
    } catch (error) {
      this.logger.error(`Could not register schedules: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.reassertTimer) clearInterval(this.reassertTimer);
    await this.worker?.close();
    await this.queue?.close();
  }

  async expireDueConsents() {
    let expired = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const due = await this.prisma.consentState.findMany({
        where: { status: 'granted', expiresAt: { lte: new Date() } },
        select: { id: true, organizationId: true },
        take: EXPIRE_BATCH,
      });
      if (due.length === 0) break;

      let progressed = 0;
      for (const { id, organizationId } of due) {
        try {
          // null means it was renewed or withdrawn since we looked: fine
          if (await this.consentService.expire(organizationId, id)) {
            expired++;
            progressed++;
          }
        } catch (error) {
          this.logger.error(`Could not expire consent ${id}: ${(error as Error).message}`);
        }
      }
      // Nothing moved this batch (all failing or all raced): stop, retry next run
      if (progressed === 0) break;
    }

    if (expired > 0) this.logger.log(`Expired ${expired} consent(s)`);
    return expired;
  }

  async cleanup() {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_KEY_TTL_MS) } },
    });
    if (count > 0) this.logger.log(`Removed ${count} expired idempotency key(s)`);
  }
}
