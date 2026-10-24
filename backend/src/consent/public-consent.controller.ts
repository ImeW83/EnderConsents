import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConsentService } from './consent.service';
import { PublicConsentService } from './public-consent.service';
import type {
  PublicGrantInput,
  PublicWithdrawInput,
} from './public-consent.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireScopes } from '../auth/decorators/scopes.decorator';

@Controller('api/v1/public/consent')
@UseGuards(ApiKeyGuard)
export class PublicConsentController {
  constructor(
    private publicConsentService: PublicConsentService,
    private consentService: ConsentService,
  ) {}

  @Post('grant')
  @RequireScopes('consent:write')
  async grant(@Request() req: any, @Body() body: PublicGrantInput) {
    return this.publicConsentService.grant(
      req.apiKey.organizationId,
      req,
      body,
    );
  }

  @Post('withdraw')
  @RequireScopes('consent:write')
  async withdraw(@Request() req: any, @Body() body: PublicWithdrawInput) {
    return this.publicConsentService.withdraw(
      req.apiKey.organizationId,
      req,
      body,
    );
  }

  @Get('status')
  @RequireScopes('consent:read')
  async status(
    @Request() req: any,
    @Query('subjectId') subjectId?: string,
    @Query('externalRef') externalRef?: string,
  ) {
    return this.publicConsentService.status(req.apiKey.organizationId, {
      subjectId,
      externalRef,
    });
  }

  @Get('events/:eventId/receipt')
  @RequireScopes('consent:read')
  async receipt(@Request() req: any, @Param('eventId') eventId: string) {
    return this.consentService.findReceipt(req.apiKey.organizationId, eventId);
  }
}
