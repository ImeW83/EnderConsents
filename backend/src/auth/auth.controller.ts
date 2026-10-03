import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body('organizationName') organizationName: string,
    @Body('slug') slug: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.signupOrganization(organizationName, slug, email, password);
  }

  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    return this.authService.login(email, password);
  }
}