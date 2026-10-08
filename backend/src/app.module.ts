import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SubjectsModule } from './subjects/subjects.module';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [AuthModule, PrismaModule, RolesModule, OrganizationsModule, SubjectsModule],
  controllers: [AppController],
  providers: [AppService, PermissionsGuard],
})
export class AppModule {}