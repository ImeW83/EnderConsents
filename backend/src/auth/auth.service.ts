import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private rolesService: RolesService,
  ) {}

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

    // Create the default Owner role with full permissions, then assign it to the first user
    const ownerRole = await this.rolesService.createOwnerRole(organization.id);
    await this.rolesService.assignRoleToUser(user.id, ownerRole.id);

    const token = this.jwtService.sign({
      userId: user.id,
      organizationId: organization.id,
      email: user.email,
      roleId: ownerRole.id,
    });

    return { token, organizationId: organization.id, userId: user.id, role: ownerRole.name };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { role: true },
    });

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
      roleId: user.roleId,
    });

    return {
      token,
      organizationId: user.organizationId,
      userId: user.id,
      role: user.role?.name || null,
    };
  }
}