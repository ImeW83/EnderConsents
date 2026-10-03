import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const OWNER_PERMISSIONS = [
  'organization:manage',
  'user:manage',
  'role:manage',
  'subject:read',
  'subject:write',
  'purpose:manage',
  'notice:manage',
  'consent:read',
  'consent:write',
  'audit:read',
  'apikey:manage',
  'webhook:manage',
];

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  // Creates the default "Owner" role for a brand new organization, with full permissions
  async createOwnerRole(organizationId: string) {
    return this.prisma.role.create({
      data: {
        organizationId,
        name: 'owner',
        permissions: OWNER_PERMISSIONS,
      },
    });
  }

  async findByOrganization(organizationId: string) {
    return this.prisma.role.findMany({ where: { organizationId } });
  }

  async create(organizationId: string, name: string, permissions: string[]) {
    return this.prisma.role.create({
      data: { organizationId, name, permissions },
    });
  }

  async assignRoleToUser(userId: string, roleId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
    });
  }
}