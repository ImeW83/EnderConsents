import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'temporary_dev_secret_change_in_production',
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      email: payload.email,
    };
  }
}