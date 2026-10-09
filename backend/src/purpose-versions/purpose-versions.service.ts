import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurposesService } from '../purposes/purposes.service';
import { AuditService } from '../audit/audit.service';
import { Actor, SYSTEM_ACTOR } from '../audit/actor';

export interface CreatePurposeVersionInput {
  name: string;
  description: string;
  legalBasis?: string;
  effectiveFrom?: Date;
}

@Injectable()
export class PurposeVersionsService {
  constructor(
    private prisma: PrismaService,
    private purposesService: PurposesService,
    private auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    purposeId: string,
    data: CreatePurposeVersionInput,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    await this.purposesService.findOne(organizationId, purposeId);

    const latest = await this.prisma.purposeVersion.findFirst({
      where: { purposeId },
      orderBy: { version: 'desc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.purposeVersion.create({
        data: {
          purposeId,
          version: (latest?.version ?? 0) + 1,
          name: data.name,
          description: data.description,
          legalBasis: data.legalBasis,
          effectiveFrom: data.effectiveFrom,
        },
      });

      await this.auditService.record(
        organizationId,
        actor,
        'created',
        'PurposeVersion',
        version.id,
        JSON.stringify({ purposeId, version: version.version }),
        tx,
      );

      return version;
    });
  }

  async findAll(organizationId: string, purposeId: string) {
    await this.purposesService.findOne(organizationId, purposeId);

    return this.prisma.purposeVersion.findMany({
      where: { purposeId },
      orderBy: { version: 'asc' },
    });
  }

  async findLatest(organizationId: string, purposeId: string) {
    await this.purposesService.findOne(organizationId, purposeId);

    return this.prisma.purposeVersion.findFirst({
      where: { purposeId },
      orderBy: { version: 'desc' },
    });
  }

  async findOne(organizationId: string, purposeId: string, id: string) {
    await this.purposesService.findOne(organizationId, purposeId);

    const version = await this.prisma.purposeVersion.findFirst({
      where: { id, purposeId },
    });

    if (!version) {
      throw new NotFoundException('Purpose version not found');
    }

    return version;
  }
}
