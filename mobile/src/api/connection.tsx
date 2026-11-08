import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { setUnauthorizedListener } from "./client";
import { revokeOwnToken } from "./connect";
import {
  clearConnection,
  loadConnection,
  saveConnection,
  type Connection,
  keepInMemory,
} from "./connection-store";
import {
  hasLocalServer,
  localServerAlive,
  restartLocalServer,
  startLocalServer,
  syncLocalServer,
} from "./local-server";

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

  const latest = useRef<Connection | null>(null);
  useEffect(() => {
    latest.current = connection;
  }, [connection]);

  const adoptLocal = (local: Connection) => {
    keepInMemory(local);
    setConnection(local);
  };

  useEffect(() => {
    if (!hasLocalServer) return;
    const subscription = AppState.addEventListener("change", (status) => {
      const current = latest.current;
      if (current?.method !== "local") return;
      if (status === "background") {
        void syncLocalServer(current);
        return;
      }
      if (status !== "active") return;
      void (async () => {
        let local = current;
        if (!(await localServerAlive(current.serverUrl))) {
          try {
            local = await restartLocalServer();
            adoptLocal(local);
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "The notes server stopped.");
            return;
          }
        }
        await syncLocalServer(local);
        void queryClient.invalidateQueries();
      })();
    });
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    if (hasLocalServer) {
      startLocalServer()
        .then(adoptLocal)
        .catch((error: unknown) =>
          setNotice(error instanceof Error ? error.message : "The notes server didn’t start."),
        )
        .finally(() => setReady(true));
      return;
    }
    loadConnection().then((stored) => {
      setConnection(stored);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    setUnauthorizedListener(() => {
      if (latest.current?.method === "local") {
        void restartLocalServer()
          .then((local) => {
            adoptLocal(local);
            void queryClient.invalidateQueries();
          })
          .catch((error: unknown) =>
            setNotice(error instanceof Error ? error.message : "The notes server stopped."),
          );
        return;
      }
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
