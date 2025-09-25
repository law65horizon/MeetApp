import * as mediasoup from 'mediasoup';
import type { Worker, Router } from 'mediasoup/node/lib/types';
import { config } from '../config';
import { workerSettings, routerOptions } from '../config/mediasoup';
import { logger } from '../lib/logger';

class WorkerPool {
  private workers: Worker[] = [];
  private workerIndex = 0;
  /** roomId → Router */
  private routers = new Map<string, Router>();

  async init(): Promise<void> {
    const count = config.MEDIASOUP_WORKER_COUNT;
    logger.info({ count }, 'Spawning mediasoup workers');

    for (let i = 0; i < count; i++) {
      const worker = await mediasoup.createWorker(workerSettings);

      worker.on('died', (err) => {
        logger.error({ pid: worker.pid, err }, 'mediasoup worker died — restarting');
        this.workers = this.workers.filter((w) => w !== worker);
        this.restartWorker();
      });

      this.workers.push(worker);
      logger.debug({ pid: worker.pid, i }, 'Worker spawned');
    }
  }

  private async restartWorker(): Promise<void> {
    try {
      const worker = await mediasoup.createWorker(workerSettings);
      worker.on('died', (err) => {
        logger.error({ pid: worker.pid, err }, 'mediasoup worker died — restarting');
        this.workers = this.workers.filter((w) => w !== worker);
        this.restartWorker();
      });
      this.workers.push(worker);
    } catch (err) {
      logger.error({ err }, 'Failed to restart worker');
    }
  }

  private getNextWorker(): Worker {
    if (this.workers.length === 0) throw new Error('No workers available');
    const worker = this.workers[this.workerIndex % this.workers.length];
    this.workerIndex++;
    return worker;
  }

  async getOrCreateRouter(roomId: string): Promise<Router> {
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId)!;
    }
    const worker = this.getNextWorker();
    const router = await worker.createRouter(routerOptions);
    this.routers.set(roomId, router);
    logger.debug({ roomId, pid: worker.pid }, 'Router created');
    return router;
  }

  getRouter(roomId: string): Router | undefined {
    return this.routers.get(roomId);
  }

  closeRouter(roomId: string): void {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      logger.debug({ roomId }, 'Router closed');
    }
  }

  async getWorkerStats(): Promise<{ pid: number; usage: Awaited<ReturnType<Worker['getResourceUsage']>> }[]> {
    return Promise.all(
      this.workers.map(async (w) => ({ pid: w.pid ?? -1, usage: await w.getResourceUsage() })),
    );
  }

  get workerCount(): number {
    return this.workers.length;
  }
}

export const workerPool = new WorkerPool();