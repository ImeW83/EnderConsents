import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateNoticeInput {
  language?: string;
  content: string;
  effectiveFrom?: Date;
}

@Injectable()
export class NoticesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: CreateNoticeInput) {
    const language = data.language ?? 'en';

    const latest = await this.prisma.noticeVersion.findFirst({
      where: { organizationId, language },
      orderBy: { version: 'desc' },
    });

    return this.prisma.noticeVersion.create({
      data: {
        organizationId,
        language,
        version: (latest?.version ?? 0) + 1,
        content: data.content,
        effectiveFrom: data.effectiveFrom,
      },
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
      throw new NotFoundException(`No current notice for language "${language}"`);
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
