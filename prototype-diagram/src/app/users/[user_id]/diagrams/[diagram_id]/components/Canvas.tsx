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
import { Model } from "json-joy/es2020/json-crdt";
import { debounce } from "lodash";

import { UndoRedoManager } from "./UndoRedoManager";
import Sidebar from "./Sidebar";
import CustomNode from "./CustomNode";
import { useDnD } from "../hooks/useDnD";
import { useDiagramSocket } from "../hooks/useDiagramSocket";

import "@xyflow/react/dist/style.css";
import "../styles/index.css";
import "../styles/xy-theme.css";

// Generate unique node ID
const getId = () => uuid();

// Node types registration
const nodeTypes: { [key: string]: any } = {
  custom: CustomNode,
};

// Diagram data structure
interface DiagramData {
  nodes: Node[];
  edges: Edge[];
}

export default function Canvas({
                                 initialDiagram,
                                 diagramId,
                                 userId,
                               }: {
  initialDiagram: any;
  diagramId: string;
  userId: string;
}) {
  const socket = useDiagramSocket();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition } = useReactFlow();
  const [type] = useDnD();

  const [canEmitUpdate, setCanEmitUpdate] = useState(false);
  const [isRemoteAnimating, setIsRemoteAnimating] = useState(false);

  const [model, setModel] = useState(() => {
    const newModel = Model.withLogicalClock();
    newModel.api.root({ nodes: [], edges: [] });
    return newModel;
  });

  const [undoRedoManager] = useState(() => new UndoRedoManager(model));

  // Join socket room for this diagram
  useEffect(() => {
    if (!socket) return;
    socket.emit("joinDiagram", { diagramId, userId });
  }, [socket, diagramId, userId]);

  // Load initial state into model
  useEffect(() => {
    if (!initialDiagram) return;

    setNodes(initialDiagram.nodes || []);
    setEdges(initialDiagram.edges || []);

    const newModel = Model.withLogicalClock();
    newModel.api.root({
      nodes: initialDiagram.nodes || [],
      edges: initialDiagram.edges || [],
    });

    setModel(newModel);
    setTimeout(() => setCanEmitUpdate(true), 500);
  }, [initialDiagram]);

  // Handle incoming updates from other users
  useEffect(() => {
    if (!socket) return;

    const handleDiagramUpdate = (data: { patch: any; diagramId: string }) => {
      if (data.diagramId !== diagramId) return;

      setCanEmitUpdate(false);
      setIsRemoteAnimating(true);

      try {
        if (data.patch?.type === "update" && data.patch.data) {
          setModel((prevModel) => {
            const newModel = prevModel.fork();
            newModel.api.root(data.patch.data);
            setNodes(data.patch.data.nodes);
            setEdges(data.patch.data.edges);
            return newModel;
          });
        }
      } catch (error) {
        console.error("Failed to apply remote patch:", error);
      }

      setTimeout(() => {
        setCanEmitUpdate(true);
        setIsRemoteAnimating(false);
      }, 500);
    };

    socket.on("diagramUpdated", handleDiagramUpdate);
      return () => {
          socket.off("diagramUpdated", handleDiagramUpdate);
      };
  }, [socket, diagramId]);

  // Emit diagram updates to the server
  useEffect(() => {
    if (!socket || !canEmitUpdate) return;
    emitUpdate(diagramId, { nodes, edges });
  }, [nodes, edges]);

  const emitUpdate = useCallback(
      debounce((diagramId: string, updatedDiagram: DiagramData) => {
        if (!socket) return;

        try {
          setModel((prevModel) => {
            const newModel = prevModel.fork();
            newModel.api.root(updatedDiagram);

            const prevView = prevModel.view() as unknown as DiagramData;

            const patch = {
              type: "update",
              data: updatedDiagram,
              oldData: prevView,
            };

            undoRedoManager.recordChange(patch);

            socket.emit("updateDiagram", {
              diagramId,
              json: JSON.stringify(updatedDiagram),
              patch,
            });

            return newModel;
          });
        } catch (error) {
          console.error("Failed to emit update:", error);
        }
      }, 300),
      [socket, undoRedoManager]
  );

  // Undo logic
  const handleUndo = useCallback(() => {
    const patch = undoRedoManager.undo();
    if (!patch) return;

    setNodes(patch.data.nodes);
    setEdges(patch.data.edges);

    socket?.emit("updateDiagram", {
      diagramId,
      json: JSON.stringify(patch.data),
      patch,
    });
  }, [undoRedoManager, diagramId, socket]);

  // Redo logic
  const handleRedo = useCallback(() => {
    const patch = undoRedoManager.redo();
    if (!patch) return;

    setNodes(patch.data.nodes);
    setEdges(patch.data.edges);

    socket?.emit("updateDiagram", {
      diagramId,
      json: JSON.stringify(patch.data),
      patch,
    });
  }, [undoRedoManager, diagramId, socket]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "z") {
        event.preventDefault();
        handleUndo();
      }

      if (
          (event.ctrlKey && event.key === "y") ||
          (event.ctrlKey && event.shiftKey && event.key === "z")
      ) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

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
        if (!type) return;

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const newNode: Node = {
          id: getId(),
          type,
          position,
          data: { label: `${type} node` },
          style: { background: "#0a0a0a" },
        };

        setNodes((nds: Node[]) => nds.concat(newNode));
      },
      [screenToFlowPosition, type]
  );

  return (
      <div className={`dndflow ${isRemoteAnimating ? "remote-animating" : ""}`}>
        {/* Undo/Redo buttons */}
        <div
            className="undo-redo-controls"
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              zIndex: 5,
            }}
        >
          <button
              onClick={handleUndo}
              disabled={undoRedoManager.getUndoStackSize() === 0}
              style={{
                margin: "0 5px",
                padding: "5px 10px",
                background: "#444",
                color: "white",
                border: "none",
                borderRadius: "3px",
              }}
          >
            Undo
          </button>
          <button
              onClick={handleRedo}
              disabled={undoRedoManager.getRedoStackSize() === 0}
              style={{
                margin: "0 5px",
                padding: "5px 10px",
                background: "#444",
                color: "white",
                border: "none",
                borderRadius: "3px",
              }}
          >
            Redo
          </button>
        </div>

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
              fitView
              style={{ backgroundColor: "#0a0a0a" }}
          >
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        <Sidebar />
      </div>
  );
}
