import { Test, TestingModule } from '@nestjs/testing';
import { PurposeVersionsController } from './purpose-versions.controller';
import { PurposeVersionsService } from './purpose-versions.service';

describe('PurposeVersionsController', () => {
  let controller: PurposeVersionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurposeVersionsController],
      providers: [
        {
          provide: PurposeVersionsService,
          useValue: { create: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PurposeVersionsController>(PurposeVersionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
