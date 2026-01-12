export interface PollingLogEntry {
  id: number;
  createdAt: string;
  sessionId: number;
  playerId: number | null;
  gamertag: string | null;
  lastMatchId: string | null;
  lastMatchAt: string | null;
  latestMatchId: string | null;
  latestMatchAt: string | null;
  newMatches: number;
  totalMatches: number;
  error: string | null;
}

const MAX_LOGS = 500;
let nextId = 1;
const logs: PollingLogEntry[] = [];

export function addPollingLog(entry: Omit<PollingLogEntry, "id">): void {
  logs.push({ id: nextId++, ...entry });
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
}

export function listPollingLogs(limit = 200): PollingLogEntry[] {
  if (limit <= 0) return [];
  return logs.slice(-limit).reverse();
}
