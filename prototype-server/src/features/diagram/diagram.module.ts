import { Module } from '@nestjs/common';
import { DiagramGateway } from './gateways/diagram.gateway';
import { DiagramController } from './controllers/diagram.controller';
import { DiagramService } from './services/diagram.service';
import { DiagramRepository } from './repositories/diagram.repository';

@Module({
  providers: [DiagramGateway, DiagramService, DiagramRepository],
  controllers: [DiagramController],
})
export class DiagramModule {}
