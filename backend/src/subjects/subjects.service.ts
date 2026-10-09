import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, SYSTEM_ACTOR } from '../audit/actor';

export interface CreateSubjectInput {
  externalRef?: string;
  email?: string;
  phone?: string;
  locale?: string;
}

export interface UpdateSubjectInput {
  externalRef?: string;
  email?: string;
  phone?: string;
  locale?: string;
}

@Injectable()
export class SubjectsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    data: CreateSubjectInput,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.create({
        data: {
          organizationId,
          externalRef: data.externalRef,
          email: data.email,
          phone: data.phone,
          locale: data.locale ?? 'en',
        },
      });

      await this.auditService.record(
        organizationId,
        actor,
        'created',
        'Subject',
        subject.id,
        this.describeFields(data),
        tx,
      );

      return subject;
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.subject.findMany({ where: { organizationId } });
  }

  async findOne(organizationId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, organizationId },
    });

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    return subject;
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateSubjectInput,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    await this.findOne(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.update({
        where: { id },
        data,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'updated',
        'Subject',
        id,
        this.describeFields(data),
        tx,
      );

      return subject;
    });
  }

  async remove(
    organizationId: string,
    id: string,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    await this.findOne(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.delete({ where: { id } });

      await this.auditService.record(
        organizationId,
        actor,
        'removed',
        'Subject',
        id,
        undefined,
        tx,
      );

      return subject;
    });
  }

  // Field names only: audit rows must not hold a subject's personal data, which could outlive an erasure request
  private describeFields(data: object) {
    const fields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    return JSON.stringify({ fields });
  }
}
