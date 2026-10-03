export type RelayServer = {
  rooms: Map<string, unknown>;
  listen(port: number, host?: string): Promise<{ port: number }>;
  close(): Promise<void>;
};

export function createRelayServer(options?: {
  staticDir?: string | null;
  rateMaxMessages?: number;
}): RelayServer;
