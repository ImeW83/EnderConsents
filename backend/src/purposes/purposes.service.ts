import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, SYSTEM_ACTOR } from '../audit/actor';

export interface CreatePurposeInput {
  key: string;
  name: string;
  description: string;
  category?: string;
  isActive?: boolean;
}

export interface UpdatePurposeInput {
  key?: string;
  name?: string;
  description?: string;
  category?: string;
  isActive?: boolean;
}

@Injectable()
export class PurposesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    data: CreatePurposeInput,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    await this.assertKeyAvailable(organizationId, data.key);

    return this.prisma.$transaction(async (tx) => {
      const purpose = await tx.purpose.create({
        data: {
          organizationId,
          key: data.key,
          name: data.name,
          description: data.description,
          category: data.category,
          isActive: data.isActive,
        },
      });

      await this.auditService.record(
        organizationId,
        actor,
        'created',
        'Purpose',
        purpose.id,
        JSON.stringify({ key: purpose.key, name: purpose.name }),
        tx,
      );

      return purpose;
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.purpose.findMany({ where: { organizationId } });
  }

  async findOne(organizationId: string, id: string) {
    const purpose = await this.prisma.purpose.findFirst({
      where: { id, organizationId },
    });

    if (!purpose) {
      throw new NotFoundException('Purpose not found');
    }

    return purpose;
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdatePurposeInput,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    const existing = await this.findOne(organizationId, id);

    if (data.key !== undefined && data.key !== existing.key) {
      await this.assertKeyAvailable(organizationId, data.key);
    }

    return this.prisma.$transaction(async (tx) => {
      const purpose = await tx.purpose.update({
        where: { id },
        data,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'updated',
        'Purpose',
        id,
        JSON.stringify(data),
        tx,
      );

      return purpose;
    });
  }

  async remove(
    organizationId: string,
    id: string,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    const existing = await this.findOne(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      const purpose = await tx.purpose.delete({ where: { id } });

      await this.auditService.record(
        organizationId,
        actor,
        'removed',
        'Purpose',
        id,
        JSON.stringify({ key: existing.key, name: existing.name }),
        tx,
      );

      return purpose;
    });
  }

  private async assertKeyAvailable(organizationId: string, key: string) {
    const clash = await this.prisma.purpose.findFirst({
      where: { organizationId, key },
    });

    if (clash) {
      throw new ConflictException('A purpose with this key already exists');
    }
  }
}
