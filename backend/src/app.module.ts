import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SubjectsModule } from './subjects/subjects.module';
import { PurposesModule } from './purposes/purposes.module';
import { PurposeVersionsModule } from './purpose-versions/purpose-versions.module';
import { NoticesModule } from './notices/notices.module';
import { ConsentModule } from './consent/consent.module';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    RolesModule,
    OrganizationsModule,
    SubjectsModule,
    PurposesModule,
    PurposeVersionsModule,
    NoticesModule,
    ConsentModule,
  ],
  controllers: [AppController],
  providers: [AppService, PermissionsGuard],
})
export class AppModule {}