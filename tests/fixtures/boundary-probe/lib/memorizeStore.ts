/** 合成夹具：替身 memorizeStore（`/lib/` 豁免区）。 */
export type MemorizeState = { known: boolean }

export function setKnown(known: boolean): MemorizeState {
  return { known }
}
