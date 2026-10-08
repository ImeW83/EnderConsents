import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: CreatePurposeInput) {
    await this.assertKeyAvailable(organizationId, data.key);

    return this.prisma.purpose.create({
      data: {
        organizationId,
        key: data.key,
        name: data.name,
        description: data.description,
        category: data.category,
        isActive: data.isActive,
      },
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

  async update(organizationId: string, id: string, data: UpdatePurposeInput) {
    const existing = await this.findOne(organizationId, id);

    if (data.key !== undefined && data.key !== existing.key) {
      await this.assertKeyAvailable(organizationId, data.key);
    }

    return this.prisma.purpose.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    return this.prisma.purpose.delete({ where: { id } });
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
