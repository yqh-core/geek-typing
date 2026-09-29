/* P1.7 Wave 2-A · Persistence Boundary —— Repository（v2.32 §1 A-1）
 *
 * 按键族仓库：业务域只认 Repository，不触碰 StorageAdapter / localStorage。
 * 职责：
 *   - 写入：namespace 注册校验（未注册判红）+ owner 域匹配（跨域写判红）；
 *   - 读取：注册校验（任意 owner 可读 —— 迁移批次需要跨键族读）+ codec 解码；
 *   - 删除/枚举：同写入约束。
 */

import type { StorageAdapter } from './adapter'
import type { KeyOwner } from './namespace'
import { assertWritable, resolveKey, NamespaceError } from './namespace'
import { jsonCodec, type Codec } from './codec'

export interface RepositoryOptions {
  codec?: Codec
}

export class KeyFamilyRepository {
  private readonly adapter: StorageAdapter
  readonly domain: KeyOwner
  private readonly codec: Codec

  constructor(adapter: StorageAdapter, domain: KeyOwner, opts: RepositoryOptions = {}) {
    this.adapter = adapter
    this.domain = domain
    this.codec = opts.codec ?? jsonCodec
  }

  /** 读取并解码；键不存在 → null；注册校验通过（任意 owner） */
  get<T = unknown>(key: string, opts?: { codec?: Codec }): T | null {
    const raw = this.adapter.get(key)
    if (raw === null) return null
    const codec = opts?.codec ?? this.codec
    return codec.decode(raw) as T
  }

  /** 原始字符串读取（迁移/审计用，不经 codec） */
  getRaw(key: string): string | null {
    return this.adapter.get(key)
  }

  /** 写入：未注册判红 + owner 域匹配（跨域写判红） */
  set<T = unknown>(key: string, value: T, opts?: { codec?: Codec }): void {
    const reg = assertWritable(key)
    if (reg.owner !== this.domain) {
      throw new NamespaceError(`跨域写入判红: repository(${this.domain}) 不得写 ${reg.owner} 域键 ${key}`)
    }
    const codec = opts?.codec ?? this.codec
    this.adapter.set(key, codec.encode(value))
  }

  /** 原始字符串写入（迁移/审计用；仍过 namespace 校验但不经 codec） */
  setRaw(key: string, raw: string): void {
    const reg = assertWritable(key)
    if (reg.owner !== this.domain) {
      throw new NamespaceError(`跨域写入判红: repository(${this.domain}) 不得写 ${reg.owner} 域键 ${key}`)
    }
    this.adapter.set(key, raw)
  }

  /** 删除：同写入约束（REMOVE OLD 必须经注册表 + owner 校验） */
  remove(key: string): void {
    const reg = assertWritable(key)
    if (reg.owner !== this.domain) {
      throw new NamespaceError(`跨域删除判红: repository(${this.domain}) 不得删 ${reg.owner} 域键 ${key}`)
    }
    this.adapter.remove(key)
  }

  has(key: string): boolean {
    return this.adapter.has(key)
  }

  /** 本仓库域下的全部键（按注册表 owner 过滤） */
  keys(): string[] {
    return this.adapter.keys().filter((k) => {
      const reg = resolveKey(k)
      return reg !== null && reg.owner === this.domain
    })
  }
}

export function createRepository(adapter: StorageAdapter, domain: KeyOwner, opts?: RepositoryOptions): KeyFamilyRepository {
  return new KeyFamilyRepository(adapter, domain, opts)
}
