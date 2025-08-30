// prototype-server/src/features/diagram/gateways/diagram.gateway.ts

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DiagramService } from '../services/diagram.service';

// مجموعة ألوان متناسقة
const COLORS = [
  "#3B82F6", // أزرق
  "#F59E0B", // برتقالي
  "#10B981", // أخضر
  "#8B5CF6", // بنفسجي
  "#EC4899", // وردي
  "#06B6D4", // أزرق فاتح
  "#F43F5E", // أحمر
  "#84CC16", // أخضر ليموني
  "#6366F1", // أرجواني
];

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
})
export class DiagramGateway implements OnGatewayDisconnect {
  constructor(private readonly diagramService: DiagramService) {}

  private activeUsers: Map<string, Map<string, any>> = new Map(); // diagramId -> { userId -> userInfo }

  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinDiagram')
  async handleJoin(
      @MessageBody() payload: { diagramId: string; userId: string; username?: string },
      @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, userId, username } = payload;

    // حفظ معلومات المستخدم
    client.data = { diagramId, userId, username };

    // إضافة المستخدم إلى قائمة المستخدمين النشطين للمخطط
    if (!this.activeUsers.has(diagramId)) {
      this.activeUsers.set(diagramId, new Map());
    }

    const diagramUsers = this.activeUsers.get(diagramId);
    // تخصيص لون ثابت للمستخدم بناءً على موقعه في القائمة
    if(!diagramUsers){
      return;
    }
    const userColor = COLORS[diagramUsers.size % COLORS.length];

    diagramUsers.set(userId, {
      id: userId,
      name: username || 'Unknown User',
      color: userColor
    });

    // الانضمام إلى غرفة المخطط
    await client.join(diagramId);

    // إضافة المستخدم كمشارك في المخطط
    await this.diagramService.joinCollaborators(diagramId, userId);

    // إرسال قائمة المستخدمين النشطين إلى الجميع
    this.broadcastActiveUsers(diagramId);

    // إعلام المستخدمين الآخرين بانضمام المستخدم الجديد
    this.server.to(diagramId).except(client.id).emit('user_joined', {
      userId,
      username,
      color: userColor
    });

    // جلب أحدث نسخة من المخطط وإرسالها إلى المستخدم الجديد
    try {
      const currentDiagram = await this.diagramService.findById(diagramId);
      if (currentDiagram && currentDiagram.json) {
        // إرسال النسخة الحالية إلى المستخدم الجديد فقط
        client.emit('current_diagram', currentDiagram);
      }
    } catch (error) {
      console.error("Error fetching current diagram:", error);
    }
  }

  @SubscribeMessage('updateDiagram')
  async handleUpdate(
      @MessageBody() payload: { diagramId: string; json: string },
      @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, json } = payload;

    try {
      // تحليل JSON لفحص محتواه
      const diagramData = JSON.parse(json);

      // التحقق من أن المخطط ليس فارغًا
      const hasNodes = diagramData.nodes && diagramData.nodes.length > 0;
      const hasEdges = diagramData.edges && diagramData.edges.length > 0;

      if (!hasNodes && !hasEdges) {
        console.log("Received empty diagram update - ignoring");
        return;
      }

      console.log(`Updating diagram ${diagramId} with ${diagramData.nodes.length} nodes and ${diagramData.edges.length} edges`);

      // جلب المخطط الحالي للمقارنة
      const currentDiagram = await this.diagramService.findById(diagramId);
      if (currentDiagram && currentDiagram.json) {
        const currentData = JSON.parse(currentDiagram.json);

        // إذا كان المخطط الحالي يحتوي على عناصر أكثر من التحديث، تحقق قبل التحديث
        if (
            currentData.nodes &&
            currentData.nodes.length > diagramData.nodes.length &&
            currentData.nodes.length > 0
        ) {
          console.log("Warning: New update has fewer nodes than current diagram. Confirming update...");

          // يمكن إضافة منطق إضافي هنا للتأكد من أن الحذف مقصود
          // مثلاً السماح فقط للمالك أو التحقق من وجود عملية حذف صريحة
        }
      }

      // تحديث المخطط في قاعدة البيانات
      const diagram = await this.diagramService.update(diagramId, json);

      // إرسال التحديث إلى جميع المستخدمين الآخرين
      this.server.to(diagramId).except(client.id).emit('diagramUpdated', diagram);

    } catch (error) {
      console.error("Error updating diagram:", error);
    }
  }

  @SubscribeMessage('cursor_move')
  handleCursorMove(
      @MessageBody() payload: { diagramId: string; userId: string; cursor: any },
      @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, userId, cursor } = payload;
    const diagramUsers = this.activeUsers.get(diagramId);
    const userInfo = diagramUsers?.get(userId);
    const username = userInfo?.name || 'Unknown User';

    // إرسال تحديث الموقع إلى باقي المستخدمين
    this.server.to(diagramId).except(client.id).emit('cursor_update', {
      userId,
      cursor,
      username,
    });
  }

  @SubscribeMessage('node_drag')
  handleNodeDrag(
      @MessageBody() payload: { diagramId: string; userId: string; nodeId: string; position: any },
      @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, nodeId, position } = payload;

    // إرسال تحديث السحب إلى جميع المستخدمين الآخرين
    this.server.to(diagramId).except(client.id).emit('node_drag_update', {
      nodeId,
      position,
    });
  }

// prototype-server/src/features/diagram/gateways/diagram.gateway.ts
// Only showing the send_reaction handler which needs to be fixed

  @SubscribeMessage('send_reaction')
  handleReaction(
      @MessageBody() payload: { diagramId: string; userId: string; reaction: any },
      @ConnectedSocket() client: Socket,
  ) {
    const { diagramId, userId, reaction } = payload;

    // Validate the reaction data
    if (!reaction || !reaction.point || !reaction.value) {
      console.warn('Received invalid reaction data:', reaction);
      return;
    }

    // Add user information to the reaction
    const diagramUsers = this.activeUsers.get(diagramId);
    const userInfo = diagramUsers?.get(userId);

    // Enhance the reaction with user information
    const enhancedReaction = {
      ...reaction,
      userId,
      username: userInfo?.name || 'Unknown User',
      color: userInfo?.color || '#3B82F6'
    };

    // Broadcast the reaction to all clients including the sender
    // (sender already has local reaction, but this confirms server received it)
    this.server.to(diagramId).emit('reaction_received', {
      userId,
      reaction: enhancedReaction
    });

    // Log for debugging
    console.log(`User ${userId} sent reaction ${reaction.value} in diagram ${diagramId}`);
  }

  @SubscribeMessage('get_active_users')
  handleGetActiveUsers(
      @ConnectedSocket() client: Socket,
  ) {
    const { diagramId } = client.data || {};
    if (!diagramId) return;

    // إرسال قائمة المستخدمين النشطين إلى المستخدم الطالب
    const diagramUsers = this.activeUsers.get(diagramId);
    const users = diagramUsers ? Array.from(diagramUsers.values()) : [];

    client.emit('active_users', { users });
  }

  handleDisconnect(client: Socket) {
    const { diagramId, userId } = client.data || {};
    if (!diagramId || !userId) return;

    // إزالة المستخدم من قائمة المستخدمين النشطين
    const diagramUsers = this.activeUsers.get(diagramId);
    if (diagramUsers) {
      diagramUsers.delete(userId);

      // إذا لم يعد هناك مستخدمين نشطين، إزالة المخطط من القائمة
      if (diagramUsers.size === 0) {
        this.activeUsers.delete(diagramId);
      } else {
        // إعلام باقي المستخدمين بانفصال المستخدم
        this.server.to(diagramId).emit('user_disconnected', { userId });

        // تحديث قائمة المستخدمين النشطين
        this.broadcastActiveUsers(diagramId);
      }
    }
  }

  private broadcastActiveUsers(diagramId: string) {
    const diagramUsers = this.activeUsers.get(diagramId);
    if (!diagramUsers) return;

    const users = Array.from(diagramUsers.values());
    this.server.to(diagramId).emit('active_users', { users });
  }
}