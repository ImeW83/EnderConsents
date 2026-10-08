import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: CreateSubjectInput) {
    return this.prisma.subject.create({
      data: {
        organizationId,
        externalRef: data.externalRef,
        email: data.email,
        phone: data.phone,
        locale: data.locale ?? 'en',
      },
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

  async update(organizationId: string, id: string, data: UpdateSubjectInput) {
    await this.findOne(organizationId, id);

    return this.prisma.subject.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    return this.prisma.subject.delete({ where: { id } });
  }
}
