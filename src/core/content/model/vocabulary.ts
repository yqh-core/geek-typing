/* V4.1 · Vocabulary 内容模型 —— Vocabulary 只是 Content 的一种，不是系统核心。
 * 后续 Listening(Audio/Transcript/Question)、Reading(Passage/Question)、Topic、
 * Document、Collection 按同一模式扩展本目录。
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
  /** 词性（V4.1-P1 由 ECDICT 词性列注入；当前未填充） */
  partOfSpeech?: string[]
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
