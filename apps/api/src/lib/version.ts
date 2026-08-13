import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 从 monorepo 根目录的 package.json 读取服务版本号
 * 避免依赖 process.cwd() 导致读到 apps/api/package.json
 * 读取失败时返回 '0.0.0'，避免影响启动
 */
export function getPackageVersion(): string {
  try {
    // 当前文件编译后位于 apps/api/dist/lib/version.js，向上三级到达仓库根
    const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {
      version?: string
    }
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}
