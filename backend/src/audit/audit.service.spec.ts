import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  const create = jest.fn();

  beforeEach(async () => {
    create.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {
            auditRecord: {
              create,
              findMany: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('records an audit row with the actor and entity', async () => {
    await service.record(
      'org-1',
      { actorType: 'admin', actorId: 'u-1' },
      'created',
      'Subject',
      's-1',
    );
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        actorType: 'admin',
        actorId: 'u-1',
        action: 'created',
        entityType: 'Subject',
        entityId: 's-1',
        details: undefined,
      },
    });
  });

  it('rejects an out-of-range limit', async () => {
    await expect(service.findAll('org-1', { limit: '0' })).rejects.toThrow(
      'limit',
    );
  });
});
