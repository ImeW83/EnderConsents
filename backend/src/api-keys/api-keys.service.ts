import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../audit/actor';

export const API_KEY_SCOPES = ['consent:read', 'consent:write'] as const;

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
}

export const hashApiKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');

const SAFE_FIELDS = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class ApiKeysService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // The plaintext key is returned once and never stored, only its SHA-256 hash.
  // Keys are 256 random bits, so a fast hash is safe (unlike passwords).
  async create(organizationId: string, actor: Actor, input: CreateApiKeyInput) {
    if (!input.name) {
      throw new BadRequestException('Missing required field(s): name');
    }
    const scopes = this.validateScopes(input.scopes);

    const key = `ec_live_${randomBytes(32).toString('hex')}`;

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.apiKey.create({
        data: {
          organizationId,
          name: input.name,
          keyPrefix: key.slice(0, 12),
          hashedKey: hashApiKey(key),
          scopes,
        },
        select: SAFE_FIELDS,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'api_key_created',
        'ApiKey',
        record.id,
        JSON.stringify({ name: input.name, scopes }),
        tx,
      );

      return { ...record, key };
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: SAFE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(organizationId: string, actor: Actor, id: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    if (existing.revokedAt) {
      return this.prisma.apiKey.findUniqueOrThrow({
        where: { id },
        select: SAFE_FIELDS,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
        select: SAFE_FIELDS,
      });

      await this.auditService.record(
        organizationId,
        actor,
        'api_key_revoked',
        'ApiKey',
        id,
        undefined,
        tx,
      );

      return record;
    });
  }

  private validateScopes(scopes: string[]) {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new BadRequestException('scopes must be a non-empty array');
    }
    const invalid = scopes.filter(
      (scope) => !(API_KEY_SCOPES as readonly string[]).includes(scope),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unknown scope(s): ${invalid.join(', ')}. Allowed: ${API_KEY_SCOPES.join(', ')}`,
      );
    }
    return [...new Set(scopes)];
  }
}
