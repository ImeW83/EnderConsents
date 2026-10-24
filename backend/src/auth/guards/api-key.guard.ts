import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { hashApiKey } from '../../api-keys/api-keys.service';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

// Authenticates server-to-server calls via the X-API-Key header and sets
// request.apiKey; organizationId always comes from the key, never the request
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-api-key'];
    const key = Array.isArray(header) ? header[0] : header;

    if (!key) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const record = await this.prisma.apiKey.findUnique({
      where: { hashedKey: hashApiKey(key) },
    });

    if (!record || record.revokedAt) {
      throw new UnauthorizedException('Invalid API key');
    }

    const required =
      this.reflector.get<string[]>(SCOPES_KEY, context.getHandler()) ?? [];
    const missing = required.filter((scope) => !record.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `API key is missing required scope(s): ${missing.join(', ')}`,
      );
    }

    request.apiKey = {
      id: record.id,
      organizationId: record.organizationId,
      scopes: record.scopes,
    };

    // Fire-and-forget: a failed timestamp update must not fail the request
    void this.prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return true;
  }
}
