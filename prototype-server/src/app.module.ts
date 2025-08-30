import { Module } from '@nestjs/common';
import { ConfigModule} from '@nestjs/config';
import { DiagramModule } from './features/diagram/diagram.module';
import { UserModule } from './features/user/user.module';
import {Neo4jGlobalModule} from "./utility/neogma_provider";


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    Neo4jGlobalModule,
    DiagramModule,
    UserModule,
  ],
})
export class AppModule {}