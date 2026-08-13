/**
 * LLM 调用并发控制器
 *
 * 两层限流：
 * 1. 全局并发：防止整个服务同时向 provider 发送过多请求
 * 2. 单用户并发：防止单个用户占用过多资源
 */
export interface ConcurrencyLimiterOptions {
  globalMax: number
  perUserMax: number
}

interface QueuedTask {
  userId: string
  execute: () => Promise<unknown>
}

export class ConcurrencyLimiter {
  private globalRunning = 0
  private userRunning = new Map<string, number>()
  private queue: QueuedTask[] = []

  constructor(private options: ConcurrencyLimiterOptions) {}

  async run<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        userId,
        execute: async () => {
          try {
            const result = await fn()
            resolve(result)
            return result
          } catch (err) {
            reject(err)
            return
          }
        },
      })
      this.process()
    })
  }

  private process() {
    while (this.queue.length > 0 && this.globalRunning < this.options.globalMax) {
      const index = this.queue.findIndex((item) => {
        const userCount = this.userRunning.get(item.userId) || 0
        return userCount < this.options.perUserMax
      })
      if (index === -1) break

      const item = this.queue.splice(index, 1)[0]
      this.globalRunning++
      this.userRunning.set(item.userId, (this.userRunning.get(item.userId) || 0) + 1)

      item.execute().finally(() => {
        this.globalRunning--
        this.userRunning.set(item.userId, (this.userRunning.get(item.userId) || 1) - 1)
        this.process()
      })
    }
  }
}

export const llmConcurrencyLimiter = new ConcurrencyLimiter({
  globalMax: Number(process.env.LLM_GLOBAL_CONCURRENCY) || 20,
  perUserMax: Number(process.env.LLM_PER_USER_CONCURRENCY) || 3,
})
