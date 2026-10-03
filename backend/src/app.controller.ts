import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { RequirePermissions } from './auth/decorators/permissions.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/v1/me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req: any) {
    return req.user;
  }

  @Get('api/v1/admin-only')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('organization:manage')
  adminOnlyRoute(@Request() req: any) {
    return { message: 'You have organization:manage permission', user: req.user };
  }
}