import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { setUnauthorizedListener } from "./client";
import { revokeOwnToken } from "./connect";
import {
  clearConnection,
  loadConnection,
  saveConnection,
  type Connection,
} from "./connection-store";

interface ConnectionState {
  ready: boolean;
  connection: Connection | null;
  notice: string | null;
  connect: (connection: Connection) => Promise<void>;
  disconnect: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadConnection().then((stored) => {
      setConnection(stored);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    setUnauthorizedListener(() => {
      void clearConnection().then(() => {
        queryClient.clear();
        setNotice("Your sign-in ended. Connect again to keep going.");
        setConnection(null);
      });
    });
    return () => setUnauthorizedListener(null);
  }, [queryClient]);

  const connect = async (next: Connection) => {
    await saveConnection(next);
    queryClient.clear();
    setNotice(null);
    setConnection(next);
  };

  const disconnect = async () => {
    if (connection?.method === "password" && connection.token) {
      await revokeOwnToken(connection.serverUrl, connection.token).catch(() => undefined);
    }
    await clearConnection();
    queryClient.clear();
    setNotice(null);
    setConnection(null);
  };

  return (
    <ConnectionContext value={{ ready, connection, notice, connect, disconnect }}>
      {children}
    </ConnectionContext>
  );
}

export function useConnection() {
  const value = use(ConnectionContext);
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider");
  return value;
}
