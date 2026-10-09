import { Test, TestingModule } from '@nestjs/testing';
import { PurposeVersionsService } from './purpose-versions.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurposesService } from '../purposes/purposes.service';

describe('PurposeVersionsService', () => {
  let service: PurposeVersionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurposeVersionsService,
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: PrismaService,
          useValue: {
            purposeVersion: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
        { provide: PurposesService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get<PurposeVersionsService>(PurposeVersionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
