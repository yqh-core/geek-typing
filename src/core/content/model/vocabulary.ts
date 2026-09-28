/* V4.1 · Vocabulary 内容模型 —— Vocabulary 只是 Content 的一种，不是系统核心。
 * 后续 Listening(Audio/Transcript/Question)、Reading(Passage/Question)、Topic、
 * Document、Collection 按同一模式扩展本目录。
 *
 * P1.6-E：曾声明的 `partOfSpeech?: string[]` 已移除 —— 全库 9346 条词条该键零出现、
 * 无任何代码读取、下游 WordItem / WordHit 也从未声明。留着会让人误以为「有词性数据」。
 * 真要上词性，先补真实数据源，再加字段（不得为让卡片显示而补假数据，见 CONTENT_CONTRACT.md）。
 */
import type { ContentItem } from './content'

/** 词条内容（Content 层：不可变数据，不含任何学习状态） */
export interface WordContent extends ContentItem {
  type: 'word'
  /** 词形原文（code 词库为整行代码，大小写敏感） */
  word: string
  translation: string
  phonetic?: string
  /** 英文释义（ECDICT 提供；code 词库无） */
  definition?: string
}

/** 短语/搭配（模型占位：Phrase/Example 属同一类型族，数据源到位后再落数据） */
export interface PhraseContent extends ContentItem {
  type: 'word'
  phrase: string
  translation: string
}

/** 词条在包内的原始载荷（words.json 条目）——尚未赋 ContentId 的形态。
 *  ContentId 由查询层按包 namespace 在检索时计算（lazy 大库不预先展开，省内存）。 */
export type WordPayload = Omit<WordContent, 'id' | 'type'>
