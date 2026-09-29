/** 合成夹具：替身 learning storage 的键族写入面（`/lib/` 豁免区）。 */
export const KEY_LEARNING_V2 = 'gt.learning.v2'

export function readRaw(key: string): string | null {
  return key === KEY_LEARNING_V2 ? '{}' : null
}
