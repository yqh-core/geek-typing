// 探针 P6（**必须放行**）：仅类型引用 —— `import type` 与 inline `type` 绑定。
// 无运行时耦合：编译后被完全擦除，不构成「消费者直连学习模块」。
import type { AnalyticsSnapshot } from './lib/analytics'
import { type MemorizeState } from './lib/memorizeStore'

export type ProbeView = AnalyticsSnapshot & { memorize: MemorizeState }
