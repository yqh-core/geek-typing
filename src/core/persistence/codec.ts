/* P1.7 Wave 2-A · Persistence Boundary —— Codec（v2.3.2 §1 A-1 / §6）
 *
 * 读写值编解码。默认 JSON codec 保持现有线上格式（存量键继续可读）；
 * canonical codec（JCS + NFC，§7）供新版本键 opt-in —— 不做静默全局切换，
 * 格式切换只能随键版本迁移走（migration 编排器统一执行）。
 */

import { canonicalize, CanonicalizationError } from './canonical'

export class CodecError extends Error {
  constructor(message: string) {
    super(`codec: ${message}`)
    this.name = 'CodecError'
  }
}

export interface Codec<T = unknown> {
  encode(value: T): string
  decode(raw: string): T
}

/** 默认 codec：JSON.stringify / JSON.parse（与存量 localStorage 格式逐字节兼容） */
export class JsonCodec implements Codec {
  encode(value: unknown): string {
    try {
      return JSON.stringify(value)
    } catch (e) {
      throw new CodecError(`encode 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  decode(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch (e) {
      throw new CodecError(`decode 失败（数据损坏?）: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/** canonical codec：写入 = JCS + NFC canonical 序列化（§7）；读取 = JSON.parse（向后兼容） */
export class CanonicalJsonCodec implements Codec {
  private readonly json = new JsonCodec()
  encode(value: unknown): string {
    try {
      return canonicalize(value)
    } catch (e) {
      if (e instanceof CanonicalizationError) throw new CodecError(e.message)
      throw e
    }
  }
  decode(raw: string): unknown {
    return this.json.decode(raw)
  }
}

export const jsonCodec = new JsonCodec()
export const canonicalJsonCodec = new CanonicalJsonCodec()
