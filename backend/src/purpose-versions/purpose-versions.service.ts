import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurposesService } from '../purposes/purposes.service';

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
  ) {}

  async create(organizationId: string, purposeId: string, data: CreatePurposeVersionInput) {
    await this.purposesService.findOne(organizationId, purposeId);

    const latest = await this.prisma.purposeVersion.findFirst({
      where: { purposeId },
      orderBy: { version: 'desc' },
    });

    return this.prisma.purposeVersion.create({
      data: {
        purposeId,
        version: (latest?.version ?? 0) + 1,
        name: data.name,
        description: data.description,
        legalBasis: data.legalBasis,
        effectiveFrom: data.effectiveFrom,
      },
    });
  }

  async findAll(organizationId: string, purposeId: string) {
    await this.purposesService.findOne(organizationId, purposeId);

    return this.prisma.purposeVersion.findMany({
      where: { purposeId },
      orderBy: { version: 'asc' },
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
