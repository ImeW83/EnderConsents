import { Test, TestingModule } from '@nestjs/testing';
import { ConsentService } from './consent.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubjectsService } from '../subjects/subjects.service';
import { PurposesService } from '../purposes/purposes.service';
import { PurposeVersionsService } from '../purpose-versions/purpose-versions.service';
import { NoticesService } from '../notices/notices.service';

describe('ConsentService', () => {
  let service: ConsentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: PrismaService, useValue: { $transaction: jest.fn(), consentState: {} } },
        { provide: SubjectsService, useValue: { findOne: jest.fn() } },
        { provide: PurposesService, useValue: { findOne: jest.fn() } },
        { provide: PurposeVersionsService, useValue: { findOne: jest.fn(), findLatest: jest.fn() } },
        { provide: NoticesService, useValue: { findOne: jest.fn(), findCurrent: jest.fn() } },
      ],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
