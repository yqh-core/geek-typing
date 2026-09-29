// 探针 P3（旧探针 3 · **必须判红**）：消费者文件出现 gt.* 学习键族字面量。
// 键族唯一入口应为 lib/learning/storage.ts，消费者侧出现即为越界。
export const KEY_STORE = 'gt.learning.v2'
export const KEY_BACKUP = 'gt.learning.v2.backup'
export const KEY_STATS = 'gt.letterStats.v1'

export const probeKeys = [KEY_STORE, KEY_BACKUP, KEY_STATS]
