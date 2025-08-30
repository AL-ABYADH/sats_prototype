"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

type DiagramSocket = Socket & {
  emitJoin: (diagramId: string, userId: string, username?: string) => void;
};

const SocketContext = createContext<DiagramSocket | null>(null);

export const SocketProvider: React.FC<{
  url: string;
  children: React.ReactNode;
}> = ({ url, children }) => {
  const socketRef = useRef<DiagramSocket>(
      io(url, { autoConnect: true, reconnection: true }) as DiagramSocket
  );

  useEffect(() => {
    socketRef.current.emitJoin = (diagramId, userId, username) => {
      socketRef.current.emit("joinDiagram", { diagramId, userId, username });
    };

    // إعادة الاتصال عند فقدان الاتصال
    socketRef.current.on("disconnect", () => {
      console.log("Socket disconnected, trying to reconnect...");
    });

    socketRef.current.on("connect", () => {
      console.log("Socket connected!");
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [url]);

  return (
      <SocketContext.Provider value={socketRef.current}>
        {children}
      </SocketContext.Provider>
  );
};

export const useDiagramSocket = () => {
  const socket = useContext(SocketContext);
  return socket;
};