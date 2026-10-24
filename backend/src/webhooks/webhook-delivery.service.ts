import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SYSTEM_ACTOR } from '../audit/actor';
import { EVENT_API_VERSION } from '../events/event-types';
import { buildSignatureHeader, SIGNATURE_HEADER } from './webhook-signature';
import { postJson } from './http-post';
import { validateWebhookUrl } from './url-safety';
import { AUTO_DISABLE_THRESHOLD, nextRetryDelaySeconds } from './backoff';

const REQUEST_TIMEOUT_MS = 10_000;

// Performs one delivery attempt and records the outcome. The outbox row is the
// source of truth: this never throws for a failed delivery, it reschedules.
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async deliver(deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });

    // Already handled (duplicate job, redelivered meanwhile): nothing to do
    if (!delivery || delivery.status !== 'pending') {
      return;
    }

    const { webhook } = delivery;
    if (!webhook.isActive) {
      // Held, not dropped: resumes if the webhook is re-enabled
      await this.release(deliveryId);
      return;
    }

    const body = JSON.stringify(delivery.payload);
    const secrets = [webhook.secret];
    if (
      webhook.previousSecret &&
      webhook.previousSecretExpiresAt &&
      webhook.previousSecretExpiresAt > new Date()
    ) {
      secrets.push(webhook.previousSecret);
    }

    const urlProblem = validateWebhookUrl(webhook.url);
    const result = urlProblem
      ? { statusCode: null, error: urlProblem, durationMs: 0 }
      : await postJson(
          webhook.url,
          {
            // Signed fresh on every attempt, so a retry hours later is not
            // rejected by the receiver's replay window
            [SIGNATURE_HEADER]: buildSignatureHeader(secrets, body),
            'EnderConsents-Delivery': delivery.id,
            'EnderConsents-Event': delivery.eventType,
            'EnderConsents-Api-Version': EVENT_API_VERSION,
            'User-Agent': 'EnderConsents-Webhooks/1.0',
          },
          body,
          REQUEST_TIMEOUT_MS,
        );

    const succeeded = result.error === null;
    const attemptNumber = delivery.attempts + 1;
    const retryDelay = succeeded ? null : nextRetryDelaySeconds(attemptNumber);

    const disabled = await this.prisma.$transaction(async (tx) => {
      await tx.webhookAttempt.create({
        data: {
          deliveryId,
          attemptNumber,
          statusCode: result.statusCode,
          error: result.error,
          durationMs: result.durationMs,
        },
      });

      await tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts: attemptNumber,
          lastStatusCode: result.statusCode,
          lastError: result.error,
          lockedUntil: null,
          ...(succeeded && { status: 'delivered', deliveredAt: new Date() }),
          ...(!succeeded &&
            (retryDelay === null
              ? { status: 'failed' }
              : { nextAttemptAt: new Date(Date.now() + retryDelay * 1000) })),
        },
      });

      if (succeeded) {
        await tx.webhook.update({
          where: { id: webhook.id },
          data: { consecutiveFailures: 0 },
        });
        return false;
      }

      const updated = await tx.webhook.update({
        where: { id: webhook.id },
        data: { consecutiveFailures: { increment: 1 } },
      });

      if (updated.isActive && updated.consecutiveFailures >= AUTO_DISABLE_THRESHOLD) {
        await tx.webhook.update({
          where: { id: webhook.id },
          data: {
            isActive: false,
            disabledReason: `Disabled automatically after ${AUTO_DISABLE_THRESHOLD} consecutive failed deliveries (last: ${result.error})`,
          },
        });
        await this.auditService.record(
          webhook.organizationId,
          SYSTEM_ACTOR,
          'webhook_auto_disabled',
          'Webhook',
          webhook.id,
          JSON.stringify({ consecutiveFailures: updated.consecutiveFailures }),
          tx,
        );
        return true;
      }
      return false;
    });

    if (disabled) {
      this.logger.warn(
        `Webhook ${webhook.id} disabled after ${AUTO_DISABLE_THRESHOLD} consecutive failures`,
      );
    }
  }

  private async release(deliveryId: string) {
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { lockedUntil: null },
    });
  }
}
