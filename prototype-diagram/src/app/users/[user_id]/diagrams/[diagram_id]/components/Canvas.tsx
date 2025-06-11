"use client";

import React, {useRef, useCallback, useState, useEffect} from "react";
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
import {v4 as uuid} from "uuid";
import * as Automerge from "@automerge/automerge";

import "@xyflow/react/dist/style.css";

import Sidebar from "./Sidebar";
import {useDnD} from "../hooks/useDnD";

import "../styles/index.css";
import "../styles/xy-theme.css";
import {useDiagramSocket} from "../hooks/useDiagramSocket";
import {debounce} from "lodash";
import CustomNode from "./CustomNode";

const getId = () => uuid();
const nodeTypes: {[key: string]: any} = {
  custom: CustomNode,
};

export default function Canvas({
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
  const {screenToFlowPosition} = useReactFlow();
  const [type] = useDnD();
  const [doc, setDoc] = useState(Automerge.from({nodes: [], edges: []}));

  // Join diagram room
  useEffect(() => {
    if (!socket) return;
    socket.emit("joinDiagram", {
      diagramId,
      userId,
    });
  }, [socket, diagramId, userId]);

  // Load initial diagram
  useEffect(() => {
    if (!initialDiagram) return;
    setNodes(initialDiagram.nodes || []);
    setEdges(initialDiagram.edges || []);
    setDoc(
      Automerge.from({
        nodes: initialDiagram.nodes || [],
        edges: initialDiagram.edges || [],
      })
    );
    console.log(doc);
    setTimeout(() => setCanEmitUpdate(true), 500);
  }, []);

  // Subscribe to diagram updates
  useEffect(() => {
    if (!socket) return;
    const handler = (data: {changes: Uint8Array; diagramId: string}) => {
      setCanEmitUpdate(false);
      setIsRemoteAnimating(true);

      if (data.diagramId !== diagramId) return;

      setDoc((prevDoc) => {
        const [newDoc] = Automerge.applyChanges(prevDoc, [
          Uint8Array.from(data.changes),
        ]);

        if (newDoc.nodes && newDoc.edges) {
          setNodes(newDoc.nodes);
          setEdges(newDoc.edges);
        }

        return newDoc;
      });

      setTimeout(() => setCanEmitUpdate(true), 500);
      setTimeout(() => setIsRemoteAnimating(false), 500);
    };

    socket.on("diagramUpdated", handler);
    return () => {
      socket.off("diagramUpdated", handler);
    };
  }, []);

  // Emit diagram updates
  useEffect(() => {
    if (!socket || !canEmitUpdate) return;
    emitUpdate(diagramId, {
      nodes,
      edges,
    });
  }, [nodes, edges]);

  const emitUpdate = useCallback(
    debounce((diagramId: string, updatedDiagram: any) => {
      if (!socket) return;

      const updatedDoc = Automerge.change(Automerge.clone(doc), (d) => {
        d.nodes = updatedDiagram.nodes;
        d.edges = updatedDiagram.edges;
      });

      const changes = Automerge.getChanges(doc, updatedDoc);
      if (!changes.length) return;

      setDoc(updatedDoc);
      console.log(updatedDoc);
      console.log(doc);

      changes.forEach((change) => {
        socket.emit("updateDiagram", {
          diagramId,
          json: JSON.stringify(updatedDoc),
          changes: Array.from(change),
        });
      });
    }, 300),
    []
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
    [screenToFlowPosition, type]
  );

  return (
    <div className={`dndflow ${isRemoteAnimating ? "remote-animating" : ""}`}>
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
          style={{backgroundColor: "#0a0a0a"}}>
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <Sidebar />
    </div>
  );
}
