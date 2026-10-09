import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, SYSTEM_ACTOR } from '../audit/actor';

export interface CreateNoticeInput {
  language?: string;
  content: string;
  effectiveFrom?: Date;
}

@Injectable()
export class NoticesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    data: CreateNoticeInput,
    actor: Actor = SYSTEM_ACTOR,
  ) {
    const language = data.language ?? 'en';

    const latest = await this.prisma.noticeVersion.findFirst({
      where: { organizationId, language },
      orderBy: { version: 'desc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.noticeVersion.create({
        data: {
          organizationId,
          language,
          version: (latest?.version ?? 0) + 1,
          content: data.content,
          effectiveFrom: data.effectiveFrom,
        },
      });

      await this.auditService.record(
        organizationId,
        actor,
        'created',
        'NoticeVersion',
        notice.id,
        JSON.stringify({ language, version: notice.version }),
        tx,
      );

      return notice;
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.noticeVersion.findMany({
      where: { organizationId },
      orderBy: [{ language: 'asc' }, { version: 'asc' }],
    });
  }

  async findCurrent(organizationId: string, language: string) {
    const notice = await this.prisma.noticeVersion.findFirst({
      where: { organizationId, language, effectiveFrom: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });

    if (!notice) {
      throw new NotFoundException(
        `No current notice for language "${language}"`,
      );
    }

    return notice;
  }

  async findOne(organizationId: string, id: string) {
    const notice = await this.prisma.noticeVersion.findFirst({
      where: { id, organizationId },
    });

    if (!notice) {
      throw new NotFoundException('Notice version not found');
    }

    return notice;
  }
}
