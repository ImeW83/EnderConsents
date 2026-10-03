import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // Register a new Organization + its first admin User
  async signupOrganization(orgName: string, slug: string, email: string, password: string) {
    const existingOrg = await this.prisma.organization.findUnique({ where: { slug } });
    if (existingOrg) {
      throw new ConflictException('An organization with this slug already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const organization = await this.prisma.organization.create({
      data: {
        name: orgName,
        slug,
        users: {
          create: {
            email,
            passwordHash: hashedPassword,
          },
        },
      },
      include: { users: true },
    });

    const user = organization.users[0];

    const token = this.jwtService.sign({
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
    });

    return { token, organizationId: organization.id, userId: user.id };
  }

  // Log in an existing user
  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.jwtService.sign({
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });

    return { token, organizationId: user.organizationId, userId: user.id };
  }
}