import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

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
    // req.user comes from the JWT payload — this proves the guard + strategy work end-to-end
    return req.user;
  }
}