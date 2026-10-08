import { Test, TestingModule } from '@nestjs/testing';
import { PurposesService } from './purposes.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PurposesService', () => {
  let service: PurposesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurposesService,
        {
          provide: PrismaService,
          useValue: {
            purpose: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PurposesService>(PurposesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
