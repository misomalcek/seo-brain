import { Response } from 'express';

const MAX_CONNECTIONS_PER_USER = 10;
const HEARTBEAT_INTERVAL = 30_000; // 30s

class SSEManager {
  private clients = new Map<string, Set<Response>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  addClient(userId: string, res: Response): boolean {
    let userSet = this.clients.get(userId);
    if (!userSet) {
      userSet = new Set();
      this.clients.set(userId, userSet);
    }

    if (userSet.size >= MAX_CONNECTIONS_PER_USER) {
      return false; // Reject — too many connections
    }

    userSet.add(res);

    res.on('close', () => {
      this.removeClient(userId, res);
    });

    return true;
  }

  removeClient(userId: string, res: Response) {
    const userSet = this.clients.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  private safeSend(userId: string, res: Response, payload: string): boolean {
    try {
      if (res.writableEnded || res.destroyed) {
        this.removeClient(userId, res);
        return false;
      }
      res.write(payload);
      return true;
    } catch {
      this.removeClient(userId, res);
      return false;
    }
  }

  sendToUser(userId: string, event: string, data: any) {
    const userSet = this.clients.get(userId);
    if (!userSet) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of userSet) {
      this.safeSend(userId, res, payload);
    }
  }

  broadcast(event: string, data: any, excludeUserId?: string) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [userId, userSet] of this.clients) {
      if (excludeUserId && userId === excludeUserId) continue;
      for (const res of userSet) {
        this.safeSend(userId, res, payload);
      }
    }
  }

  broadcastToUsers(userIds: string[], event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const targetId of userIds) {
      const userSet = this.clients.get(targetId);
      if (!userSet) continue;
      for (const res of userSet) {
        this.safeSend(targetId, res, payload);
      }
    }
  }

  getOnlineUserIds(): string[] {
    return [...this.clients.keys()];
  }

  getClientCount(): number {
    let count = 0;
    for (const userSet of this.clients.values()) {
      count += userSet.size;
    }
    return count;
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      for (const [userId, userSet] of this.clients) {
        for (const res of userSet) {
          this.safeSend(userId, res, ':heartbeat\n\n');
        }
      }
    }, HEARTBEAT_INTERVAL);
  }
}

export const sseManager = new SSEManager();
