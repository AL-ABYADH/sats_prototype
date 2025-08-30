// src/app/users/[user_id]/diagrams/[diagram_id]/components/Canvas.tsx

"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  useReactFlow,
  Background,
  Edge,
  Node,
} from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { debounce } from "lodash";

import "@xyflow/react/dist/style.css";

import Sidebar from "./Sidebar";
import { useDnD } from "../hooks/useDnD";
import { useDiagramSocket } from "../hooks/useDiagramSocket";
import CustomNode from "./CustomNode";
import LiveCursors from "./LiveCursors";
import { CursorMode, ReactionProvider, useReaction, Point, Reaction } from "../hooks/useReaction";
import useInterval from "../hooks/useInterval";
import FlyingReaction from "./FlyingReaction";
import ReactionSelector from "./ReactionSelector";
import ActiveUsers from "./ActiveUsers";
import { useUserColors } from "../hooks/useUserColors";

import "../styles/index.css";
import "../styles/xy-theme.css";
import "../styles/reactions.css";

const getId = () => uuid();
const nodeTypes: {[key: string]: any} = {
  custom: CustomNode,
};

const CanvasWithProviders = ({
                               initialDiagram,
                               diagramId,
                               userId,
                             }: {
  initialDiagram: any;
  diagramId: string;
  userId: string;
}) => {
  return (
      <ReactionProvider>
        <CanvasContent
            initialDiagram={initialDiagram}
            diagramId={diagramId}
            userId={userId}
        />
      </ReactionProvider>
  );
};

function CanvasContent({
                         initialDiagram,
                         diagramId,
                         userId,
                       }: {
  initialDiagram: any;
  diagramId: string;
  userId: string;
}) {
  const [canEmitUpdate, setCanEmitUpdate] = useState(false);
  const [isRemoteAnimating, setIsRemoteAnimating] = useState(false);
  const socket = useDiagramSocket();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowInstance = useReactFlow();
  const { screenToFlowPosition } = useReactFlow();
  const [type] = useDnD();
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const { getUserColor } = useUserColors();
  // Reference to track the last sent diagram state
  const lastSentRef = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });

  // استخدام سياق التفاعلات
  const { cursorState, setCursorState, reactions, setReactions } = useReaction();

  // الانضمام إلى غرفة المخطط
  useEffect(() => {
    if (!socket) return;

    // الحصول على اسم المستخدم (في تطبيق حقيقي، يمكن جلبه من API)
    const username = `User ${Math.floor(Math.random() * 1000)}`;

    socket.emit("joinDiagram", {
      diagramId,
      userId,
      username,
    });
  }, [socket, diagramId, userId]);

  // تحميل بيانات المخطط الأولية
  useEffect(() => {
    if (!initialDiagram) return;

    // منع إرسال تحديثات مباشرة بعد تحميل البيانات الأولية
    setCanEmitUpdate(false);

    // تحميل البيانات الأولية
    if (initialDiagram.nodes && initialDiagram.nodes.length > 0) {
      setNodes(initialDiagram.nodes);
    }

    if (initialDiagram.edges && initialDiagram.edges.length > 0) {
      setEdges(initialDiagram.edges);
    }

    // السماح بإرسال التحديثات فقط بعد فترة كافية من تحميل البيانات الأولية
    setTimeout(() => setCanEmitUpdate(true), 1000);
  }, [initialDiagram, setNodes, setEdges]);

  // استقبال أحدث نسخة من المخطط عند الانضمام
  useEffect(() => {
    if (!socket) return;

    const handleCurrentDiagram = (updatedDiagram: any) => {
      if (!updatedDiagram || !updatedDiagram.json) return;

      try {
        const diagramData = JSON.parse(updatedDiagram.json);

        // تحميل بيانات المخطط فقط إذا كانت موجودة وليست فارغة
        if (diagramData.nodes && diagramData.nodes.length > 0) {
          console.log("Received current diagram with", diagramData.nodes.length, "nodes");
          setCanEmitUpdate(false);
          setNodes(diagramData.nodes);
        }

        if (diagramData.edges && diagramData.edges.length > 0) {
          console.log("Received current diagram with", diagramData.edges.length, "edges");
          setCanEmitUpdate(false);
          setEdges(diagramData.edges);
        }

        // السماح بإرسال التحديثات بعد فترة كافية
        setTimeout(() => setCanEmitUpdate(true), 1000);
      } catch (error) {
        console.error("Error parsing current diagram:", error);
      }
    };

    socket.on("current_diagram", handleCurrentDiagram);

    return () => {
      socket.off("current_diagram", handleCurrentDiagram);
    };
  }, [socket, setNodes, setEdges]);

  // استقبال تحديثات سحب العناصر في الوقت الفعلي
  useEffect(() => {
    if (!socket) return;

    const handleNodeDrag = (data: any) => {
      const { nodeId, position } = data;

      // تحديث موقع العقدة بشكل مباشر دون تحديث التخزين
      setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              // نسخة جديدة من العقدة مع الموقع المحدث
              return {
                ...node,
                position,
                positionAbsolute: position
              };
            }
            return node;
          })
      );
    };

    socket.on("node_drag_update", handleNodeDrag);

    return () => {
      socket.off("node_drag_update", handleNodeDrag);
    };
  }, [socket, setNodes]);

  // الاشتراك في تحديثات المخطط
  useEffect(() => {
    if (!socket) return;

    const handleDiagramUpdate = (updatedDiagram: any) => {
      if (!updatedDiagram || !updatedDiagram.json) return;

      try {
        const diagramData = JSON.parse(updatedDiagram.json);

        // التحقق من وجود محتوى قبل تحديث اللوحة
        if (!(diagramData.nodes && diagramData.nodes.length > 0) &&
            !(diagramData.edges && diagramData.edges.length > 0)) {
          console.log("Received empty diagram update - ignoring");
          return;
        }

        setCanEmitUpdate(false);
        setIsRemoteAnimating(true);

        if (diagramData.nodes) {
          setNodes(diagramData.nodes);
        }

        if (diagramData.edges) {
          setEdges(diagramData.edges);
        }

        setTimeout(() => setCanEmitUpdate(true), 500);
        setTimeout(() => setIsRemoteAnimating(false), 500);
      } catch (error) {
        console.error("Error parsing diagram update:", error);
      }
    };

    socket.on("diagramUpdated", handleDiagramUpdate);

    return () => {
      socket.off("diagramUpdated", handleDiagramUpdate);
    };
  }, [socket, setNodes, setEdges]);

  // إرسال تحديثات المخطط
  useEffect(() => {
    if (!socket || !canEmitUpdate) return;

    // التحقق من وجود تغييرات حقيقية قبل الإرسال
    const nodesChanged = JSON.stringify(nodes) !== JSON.stringify(lastSentRef.current.nodes);
    const edgesChanged = JSON.stringify(edges) !== JSON.stringify(lastSentRef.current.edges);

    if (nodesChanged || edgesChanged) {
      // تحديث المرجع بالقيم الجديدة
      lastSentRef.current = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges))
      };

      // إرسال التحديث فقط إذا كان هناك تغييرات
      emitUpdate(diagramId, { nodes, edges });
    }
  }, [socket, canEmitUpdate, diagramId, nodes, edges]);

  // استقبال التفاعلات من المستخدمين الآخرين
  useEffect(() => {
    if (!socket) return;

    const handleReactionReceived = (payload: any) => {
      const { reaction } = payload;

      // التحقق من صحة بيانات التفاعل قبل إضافته
      if (reaction && reaction.point && reaction.value && reaction.timestamp) {
        // إضافة قيمة عشوائية صغيرة للطابع الزمني لضمان تفرد المفاتيح
        const uniqueTimestamp = reaction.timestamp + (Math.random() * 0.001);

        // إنشاء كائن تفاعل جديد
        const newReaction: Reaction = {
          point: reaction.point,
          value: reaction.value,
          timestamp: uniqueTimestamp, // استخدام الطابع الزمني الفريد
          userId: payload.userId
        };

        // إضافة إلى الحالة المحلية
        setReactions((prevReactions) => [...prevReactions, newReaction]);
      }
    };

    socket.on("reaction_received", handleReactionReceived);

    return () => {
      socket.off("reaction_received", handleReactionReceived);
    };
  }, [socket, setReactions]);

  // معالجة أحداث لوحة المفاتيح
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "e" || e.key === "E") {
        setCursorState({
          mode: CursorMode.ReactionSelector,
        });
      } else if (e.key === "Escape") {
        setCursorState({
          mode: CursorMode.Hidden,
        });
      }
    };

    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setCursorState]);

  // حذف التفاعلات القديمة
  useInterval(() => {
    const now = Date.now();
    setReactions((prevReactions) =>
        // الاحتفاظ بالتفاعلات التي عمرها أقل من 4 ثوانٍ
        prevReactions.filter((r) => now - r.timestamp < 4000)
    );
  }, 1000);

  useInterval(() => {
    if (
        cursorState.mode === CursorMode.Reaction &&
        cursorState.isPressed &&
        cursor
    ) {
      // إنشاء نقطة تفاعل مع إحداثيات الشاشة والتدفق
      const point: Point = {
        screen: cursor,
        flow: screenToFlowPosition(cursor)
      };

      // إضافة قيمة عشوائية صغيرة للطابع الزمني لضمان التفرد
      const uniqueTimestamp = Date.now() + Math.random();

      // إنشاء بيانات التفاعل
      const reaction: Reaction = {
        point,
        value: cursorState.reaction,
        timestamp: uniqueTimestamp,
        userId
      };

      // إضافة إلى الحالة المحلية
      setReactions((prevReactions) => [...prevReactions, reaction]);

      // إرسال إلى الخادم إذا كان Socket متاحًا
      if (socket) {
        socket.emit("send_reaction", {
          diagramId,
          userId,
          reaction
        });
      }
    }
  }, 100);


  const emitUpdate = useCallback(
      debounce((diagramId: string, updatedDiagram: any) => {
        if (!socket || !canEmitUpdate) return;

        // تحقق من أن المخطط ليس فارغًا قبل إرساله
        const hasNodes = updatedDiagram.nodes && updatedDiagram.nodes.length > 0;
        const hasEdges = updatedDiagram.edges && updatedDiagram.edges.length > 0;

        if (!hasNodes && !hasEdges) {
          console.log("Avoiding sending empty diagram update");
          return;
        }

        console.log("Sending diagram update", {
          nodes: updatedDiagram.nodes.length,
          edges: updatedDiagram.edges.length
        });

        // إرسال التحديث فقط إذا كان هناك محتوى
        socket.emit("updateDiagram", {
          diagramId,
          json: JSON.stringify(updatedDiagram),
        });
      }, 300),
      [socket, canEmitUpdate]
  );

  const onConnect = useCallback(
      (params: any) => setEdges((eds: Edge[]) => addEdge(params, eds)),
      [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
      (event: React.DragEvent) => {
        event.preventDefault();

        if (!type) {
          return;
        }

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        const newNode: Node = {
          id: getId(),
          type,
          position,
          data: {label: `${type} node`},
          style: {background: "#0a0a0a"},
        };

        setNodes((nds: Node[]) => nds.concat(newNode));
      },
      [screenToFlowPosition, type, setNodes]
  );

  // معالج حدث سحب العقدة (في الوقت الفعلي)
  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    if (!socket || !canEmitUpdate) return;

    // إرسال تحديث مباشر للعقدة التي يتم سحبها
    socket.emit("node_drag", {
      diagramId,
      userId,
      nodeId: node.id,
      position: node.position,
    });
  }, [socket, diagramId, userId, canEmitUpdate]);

  const handlePointerMove = useCallback(
      (event: React.PointerEvent) => {
        if (!reactFlowWrapper.current) return;

        // حساب إحداثيات المؤشر بالنسبة لمستعرض المستخدم
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;

        // تحديث موقع المؤشر
        setCursor({ x, y });

        // إرسال موقع المؤشر إلى المستخدمين الآخرين
        if (socket) {
          socket.emit("cursor_move", {
            diagramId,
            userId,
            cursor: { screen: { x, y } },
          });
        }
      },
      [socket, diagramId, userId]
  );

  const handlePointerLeave = useCallback(() => {
    if (socket) {
      socket.emit("cursor_move", {
        diagramId,
        userId,
        cursor: null,
      });
    }
  }, [socket, diagramId, userId]);

  // تعيين رمز تفاعل محدد
  const setReaction = useCallback((reaction: string) => {
    setCursorState({
      mode: CursorMode.Reaction,
      reaction,
      isPressed: false,
    });
  }, [setCursorState]);

  // معالجة ضغط المؤشر لإرسال التفاعلات
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (cursorState.mode === CursorMode.Reaction) {
      setCursorState({
        ...cursorState,
        isPressed: true,
      });

      // منع السلوك الافتراضي لتجنب التداخل مع تفاعلات المخطط
      if (cursorState.mode === CursorMode.Reaction) {
        e.stopPropagation();
      }
    }
  }, [cursorState, setCursorState]);

  // معالجة رفع المؤشر لإيقاف إرسال التفاعلات
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (cursorState.mode === CursorMode.Reaction) {
      setCursorState({
        ...cursorState,
        isPressed: false,
      });

      // منع السلوك الافتراضي
      if (cursorState.mode === CursorMode.Reaction) {
        e.stopPropagation();
      }
    }
  }, [cursorState, setCursorState]);

  return (
      <div
          className={`dndflow ${isRemoteAnimating ? "remote-animating" : ""}`}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
      >
        <ActiveUsers />
        <div className="reactflow-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              onNodeDrag={onNodeDrag}
              fitView
              style={{backgroundColor: "#0a0a0a"}}
          >
            <Controls />
            <Background />
            <LiveCursors />

            {reactions.map((reaction, index) => (
                <FlyingReaction
                    key={`reaction-${reaction.timestamp}-${reaction.userId || 'local'}-${index}`}
                    point={reaction.point}
                    timestamp={reaction.timestamp}
                    value={reaction.value}
                />
            ))}

            {cursorState.mode === CursorMode.ReactionSelector && (
                <ReactionSelector setReaction={setReaction} />
            )}
          </ReactFlow>
        </div>
        <Sidebar />
      </div>
  );
}

export default function Canvas(props: {
  initialDiagram: any;
  diagramId: string;
  userId: string;
}) {
  return <CanvasWithProviders {...props} />;
}