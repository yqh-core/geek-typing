// 探针 P1（旧探针 1 · **必须判红**）：消费者静态值导入禁忌模块 `lib/analytics`。
import { recordAttempt } from './lib/analytics'

export const p1 = recordAttempt
