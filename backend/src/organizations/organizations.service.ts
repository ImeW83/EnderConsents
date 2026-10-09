import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, SYSTEM_ACTOR } from '../audit/actor';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findById(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async update(
    organizationId: string,
    data: { name?: string },
    actor: Actor = SYSTEM_ACTOR,
  ) {
    await this.findById(organizationId);

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.update({
        where: { id: organizationId },
        data: { name: data.name },
      });

      await this.auditService.record(
        organizationId,
        actor,
        'updated',
        'Organization',
        organizationId,
        JSON.stringify({ name: data.name }),
        tx,
      );

      return organization;
    });
  }
}
