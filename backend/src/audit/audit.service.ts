import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from './actor';

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Deliberately no update or delete: audit records are append-only
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Pass `tx` to write the record in the same transaction as the mutation it describes
  async record(
    organizationId: string,
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    details?: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).auditRecord.create({
      data: {
        organizationId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        action,
        entityType,
        entityId,
        details,
      },
    });
  }

  async findAll(organizationId: string, query: AuditQuery) {
    const limit = this.parseInteger(query.limit, 'limit', DEFAULT_LIMIT, 1);
    const offset = this.parseInteger(query.offset, 'offset', 0, 0);
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');

    const where: Prisma.AuditRecordWhereInput = {
      organizationId,
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.action && { action: query.action }),
      ...((from || to) && {
        timestamp: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditRecord.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: Math.min(limit, MAX_LIMIT),
        skip: offset,
      }),
      this.prisma.auditRecord.count({ where }),
    ]);

    return { items, total, limit: Math.min(limit, MAX_LIMIT), offset };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.auditRecord.findFirst({
      where: { id, organizationId },
    });

    if (!record) {
      throw new NotFoundException('Audit record not found');
    }

    return record;
  }

  private parseInteger(
    value: string | undefined,
    name: string,
    fallback: number,
    min: number,
  ) {
    if (value === undefined || value === '') {
      return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
      throw new BadRequestException(`${name} must be an integer >= ${min}`);
    }

    return parsed;
  }

  private parseDate(value: string | undefined, name: string) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${name} must be a valid date`);
    }

    return date;
  }
}
