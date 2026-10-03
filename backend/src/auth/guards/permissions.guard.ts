import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    // If a route has no @RequirePermissions decorator, allow it through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user; // populated by JwtAuthGuard, which must run first

    if (!user || !user.roleId) {
      throw new ForbiddenException('No role assigned to this user');
    }

    const role = await this.prisma.role.findUnique({ where: { id: user.roleId } });

    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    const hasPermission = requiredPermissions.every((perm) =>
      role.permissions.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission(s): ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}