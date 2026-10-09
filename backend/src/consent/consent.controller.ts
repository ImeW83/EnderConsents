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
import type {
  GrantConsentInput,
  RenewConsentInput,
  WithdrawConsentInput,
} from './consent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { actorFrom } from '../audit/actor';

@Controller('api/v1/consent')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConsentController {
  constructor(private consentService: ConsentService) {}

  @Post('grant')
  @RequirePermissions('consent:write')
  async grant(@Request() req: any, @Body() body: GrantConsentInput) {
    return this.consentService.grant(req.user.organizationId, actorFrom(req), {
      subjectId: body.subjectId,
      purposeId: body.purposeId,
      channel: body.channel,
      purposeVersionId: body.purposeVersionId,
      noticeVersionId: body.noticeVersionId,
      language: body.language,
      expiresAt: body.expiresAt,
    });
  }

  @Post(':consentStateId/withdraw')
  @RequirePermissions('consent:write')
  async withdraw(
    @Request() req: any,
    @Param('consentStateId') consentStateId: string,
    @Body() body: WithdrawConsentInput,
  ) {
    return this.consentService.withdraw(
      req.user.organizationId,
      actorFrom(req),
      consentStateId,
      {
        channel: body.channel,
      },
    );
  }

  @Post(':consentStateId/renew')
  @RequirePermissions('consent:write')
  async renew(
    @Request() req: any,
    @Param('consentStateId') consentStateId: string,
    @Body() body: RenewConsentInput,
  ) {
    return this.consentService.renew(
      req.user.organizationId,
      actorFrom(req),
      consentStateId,
      {
        channel: body.channel,
        expiresAt: body.expiresAt,
      },
    );
  }

  @Get()
  @RequirePermissions('consent:read')
  async findBySubject(
    @Request() req: any,
    @Query('subjectId') subjectId: string,
  ) {
    return this.consentService.findBySubject(
      req.user.organizationId,
      subjectId,
    );
  }

  @Get(':consentStateId')
  @RequirePermissions('consent:read')
  async findOne(
    @Request() req: any,
    @Param('consentStateId') consentStateId: string,
  ) {
    return this.consentService.findOne(req.user.organizationId, consentStateId);
  }
}
