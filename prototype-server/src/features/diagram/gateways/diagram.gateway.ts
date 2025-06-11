import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DiagramService } from '../services/diagram.service';
import * as Automerge from '@automerge/automerge';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
})
export class DiagramGateway {
  constructor(private readonly diagramService: DiagramService) {}

  @WebSocketServer()
  server: Server;

  private documents: Map<
    string,
    Automerge.Doc<{ nodes: Array<any>; edges: Array<any> }>
  > = new Map();

  @SubscribeMessage('joinDiagram')
  async handleJoin(
    @MessageBody() payload: { diagramId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log(payload);

    const { diagramId, userId } = payload;
    client.join(diagramId);
    await this.diagramService.joinCollaborators(diagramId, userId);

    if (!this.documents.has(diagramId)) {
      this.initDocument(diagramId);
    }
  }

  @SubscribeMessage('updateDiagram')
  async handleUpdate(
    @MessageBody()
    payload: { diagramId: string; changes: Uint8Array; json: string | null },
    @ConnectedSocket() client: Socket,
  ) {
    console.log(payload);
    const { diagramId, changes } = payload;

    if (!this.documents.has(diagramId)) {
      this.initDocument(diagramId);
    }

    let doc = this.documents.get(diagramId);

    const [newDoc] = Automerge.applyChanges(doc!, [Uint8Array.from(changes)]);
    this.documents.set(diagramId, newDoc);

    client.to(diagramId).emit('diagramUpdated', {
      diagramId,
      changes: Array.from(changes),
    });

    await this.diagramService.update(diagramId, payload.json!);
    // await this.diagramService.update(diagramId, JSON.stringify(newDoc));
  }

  private async initDocument(diagramId: string) {
    const diagram = await this.diagramService.findById(diagramId);
    this.documents.set(diagramId, Automerge.from(JSON.parse(diagram.json)));
  }
}
