/* P1.7 Wave 2-A · Persistence Boundary —— StorageAdapter（v2.3.2 §1 A-1）
 *
 * 层次：业务域 → Repository → StorageAdapter → LocalStorageAdapter → localStorage
 * 不变量：UI ❌→localStorage；业务域 ❌→StorageAdapter；IndexedDB 唯一使用点 = persistence 域内部。
 * 本模块是 localStorage 的**唯一**触碰点（persistence 域内）。
 */

export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
  /** 全量键清单（调用方自行按前缀过滤） */
  keys(): string[]
  has(key: string): boolean
}

/** 浏览器侧唯一实现：直连 localStorage（本文件是 persistence 域外 localStorage 的唯一入口） */
export class LocalStorageAdapter implements StorageAdapter {
  get(key: string): string | null {
    return localStorage.getItem(key)
  }
  set(key: string, value: string): void {
    localStorage.setItem(key, value)
  }
  remove(key: string): void {
    localStorage.removeItem(key)
  }
  keys(): string[] {
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null) out.push(k)
    }
    return out
  }
  has(key: string): boolean {
    return localStorage.getItem(key) !== null
  }
}

/** Node 测试 / 迁移演练用内存实现（与 localStorage 语义同构） */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>()
  get(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }
  set(key: string, value: string): void {
    this.map.set(key, String(value))
  }
  remove(key: string): void {
    this.map.delete(key)
  }
  keys(): string[] {
    return [...this.map.keys()]
  }
  has(key: string): boolean {
    return this.map.has(key)
  }
}
