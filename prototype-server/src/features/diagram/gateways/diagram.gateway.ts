import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DiagramService } from '../services/diagram.service';
import { Model } from 'json-joy/es2020/json-crdt';

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

  // Store in-memory CRDT models for each diagram
  private documents: Map<string, Model> = new Map();

  /**
   * Handles a new client joining a diagram room.
   */
  @SubscribeMessage('joinDiagram')
  async handleJoin(
    @MessageBody() payload: { diagramId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, userId } = payload;
    console.log('User joined:', { diagramId, userId });

    await client.join(diagramId);

    // Register user as a collaborator
    await this.diagramService.joinCollaborators(diagramId, userId);

    // Initialize the document if it hasn't been created yet
    if (!this.documents.has(diagramId)) {
      await this.initDocument(diagramId);
    }
  }

  /**
   * Handles updates to the diagram from a client.
   */
  @SubscribeMessage('updateDiagram')
  async handleUpdate(
    @MessageBody()
    payload: {
      diagramId: string;
      patch: { type: string; data: { nodes: any[]; edges: any[] } };
      json: string | null;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, patch, json } = payload;
    console.log('Update received:', payload);

    if (!this.documents.has(diagramId)) {
      await this.initDocument(diagramId);
    }

    try {
      const model = this.documents.get(diagramId)!;

      // Directly update the model with new node/edge data
      if (patch.type === 'update' && patch.data) {
        model.api.root({
          nodes: patch.data.nodes,
          edges: patch.data.edges,
        });
      }

      // Broadcast the update to all other clients in the room
      client.to(diagramId).emit('diagramUpdated', {
        diagramId,
        patch,
      });

      // Persist the current state of the diagram
      await this.diagramService.update(diagramId, json!);
    } catch (error) {
      console.error('Error updating the diagram:', error);
    }
  }

  /**
   * Initializes the CRDT model for a diagram from database or creates an empty one.
   */
  private async initDocument(diagramId: string) {
    try {
      const diagram = await this.diagramService.findById(diagramId);
      const model = Model.withLogicalClock();

      if (diagram.json) {
        const data = JSON.parse(diagram.json);
        model.api.root(data);
      } else {
        model.api.root({ nodes: [], edges: [] });
      }

      this.documents.set(diagramId, model);
    } catch (error) {
      console.error('Error initializing diagram model:', error);
    }
  }
}
