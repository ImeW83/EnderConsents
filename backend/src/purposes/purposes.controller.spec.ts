import { Test, TestingModule } from '@nestjs/testing';
import { PurposesController } from './purposes.controller';
import { PurposesService } from './purposes.service';

describe('PurposesController', () => {
  let controller: PurposesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurposesController],
      providers: [
        {
          provide: PurposesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PurposesController>(PurposesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
