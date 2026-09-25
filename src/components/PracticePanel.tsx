import type { ThemeConfig } from '../lib/theme'

export type PracticeMode = 'classic' | 'spell' | 'timed'

interface PracticePanelProps {
  theme: ThemeConfig
  word: string
  translation: string
  typed: string
  errorFlash: boolean
  wrongKey: string | null
  upcoming: { word: string; translation: string }[]
  mode: PracticeMode
}

interface LettersProps {
  theme: ThemeConfig
  word: string
  typed: string
  errorFlash: boolean
  mode: PracticeMode
}

/** 逐字母渲染：已敲对变强调色，光标处有呼吸 caret；拼写模式下逐个标红错字母 */
function Letters({ theme, word, typed, errorFlash, mode }: LettersProps) {
  const lower = word.toLowerCase()

  return (
    <span data-testid="word" className="inline-block">
      {word.split('').map((ch, i) => {
        const chLower = lower[i]
        const isTyped = i < typed.length
        const isCursor = i === typed.length
        const hit = typed[i] === chLower
        const wrong = isTyped && !hit

        return (
          <span
            key={`${i}-${ch}`}
            data-letter={chLower}
            data-state={wrong ? 'wrong' : isTyped ? 'correct' : isCursor ? 'cursor' : 'pending'}
            className={[
              'relative inline-block transition-colors duration-100',
              wrong
                ? 'text-red-400'
                : isTyped
                  ? theme.correct
                  : mode === 'spell'
                    ? theme.pending
                    : theme.pending,
              isCursor && errorFlash ? `${theme.wrongBg} rounded-sm animate-shake` : '',
            ].join(' ')}
          >
            {isCursor && (
              <span
                className={`absolute -left-[3px] top-[6%] h-[88%] w-[3px] rounded ${theme.caret} animate-blink`}
              />
            )}
            {wrong && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[11px] text-red-400/90">
                {typed[i]}
              </span>
            )}
            <span className={isTyped && i === typed.length - 1 ? 'inline-block animate-pop' : ''}>
              {mode === 'spell' && !isTyped && ch !== '-' && ch !== ' ' ? '·' : ch}
            </span>
          </span>
        )
      })}
    </span>
  )
}

export default function PracticePanel({
  theme,
  word,
  translation,
  typed,
  errorFlash,
  wrongKey,
  upcoming,
  mode,
}: PracticePanelProps) {
  const lower = word.toLowerCase()

  /* ---------- 摸鱼 IDE 皮肤：伪装成 VS Code ---------- */
  if (theme.ideStyle) {
    const lines = 6
    return (
      <div className="w-full max-w-3xl mx-auto rounded-xl overflow-hidden border border-[#333] shadow-2xl bg-[#1e1e1e] font-mono text-sm">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#323233] border-b border-[#252526]">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="ml-3 flex gap-1 text-[11px]">
            <span className="px-2.5 py-1 bg-[#1e1e1e] text-white rounded-t border-t border-[#569cd6]">
              agent.ts
            </span>
            <span className="px-2.5 py-1 text-[#8b8b8b]">llm-utils.ts</span>
            <span className="px-2.5 py-1 text-[#8b8b8b]">README.md</span>
          </div>
        </div>

        <div className="flex">
          <div className="flex-1 px-0 py-4 overflow-x-auto">
            <div className="flex">
              <div className="select-none px-3 text-right text-[#5a5a5a] text-[13px] leading-7">
                {Array.from({ length: lines }, (_, i) => (
                  <div key={i}>{i + 8}</div>
                ))}
              </div>
              <div className="pr-6 text-[13px] leading-7 whitespace-pre">
                <div className="text-[#6a9955]">{'/**'}</div>
                <div className="text-[#6a9955]">{` * @summary ${translation}`}</div>
                <div className="text-[#6a9955]">{' */'}</div>
                <div>
                  <span className="text-[#569cd6]">export const </span>
                  <span className="text-[#9cdcfe]">vocab</span>
                  <span className="text-[#d4d4d4]"> = </span>
                  <span className="text-[#ce9178]">"</span>
                  <span className="text-[22px] tracking-wider align-middle">
                    <Letters theme={theme} word={word} typed={typed} errorFlash={errorFlash} mode={mode} />
                  </span>
                  <span className="text-[#ce9178]">"</span>
                </div>
                <div className="text-[#6a9955]">
                  {'// '}
                  <span className={errorFlash ? 'text-[#f14c4c]' : 'text-[#4ec9b0]'}>
                    {errorFlash
                      ? `SyntaxError: unexpected token '${wrongKey ?? '?'}'`
                      : '在键盘上敲出来，别人以为你在疯狂写代码'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-1 bg-[#007acc] text-white text-[11px]">
          <span>main*</span>
          <span>{`${lower.slice(typed.length) ? 'typing…' : 'done'}  |  UTF-8  |  TypeScript React`}</span>
        </div>
      </div>
    )
  }

  /* ---------- 标准卡片皮肤 ---------- */
  return (
    <div
      className={`w-full max-w-2xl mx-auto ${theme.card} border ${theme.border} rounded-2xl px-6 py-10 text-center shadow-2xl`}
    >
      <div className={`text-lg mb-8 ${theme.sub}`}>
        <span className="opacity-50">[ </span>
        {translation}
        <span className="opacity-50"> ]</span>
      </div>

      <div className="text-4xl sm:text-5xl font-bold tracking-[0.18em] mb-6 min-h-[3.5rem]">
        <Letters theme={theme} word={word} typed={typed} errorFlash={errorFlash} mode={mode} />
      </div>

      <div className="h-5">
        {errorFlash && wrongKey && mode !== 'spell' && (
          <span className="text-xs text-red-400 animate-popIn">
            敲错了：<span className="line-through">{wrongKey}</span> ，请敲下一个正确的字母
          </span>
        )}
        {mode === 'spell' && (
          <span className="text-xs opacity-60">
            {typed.length > 0 ? '拼错了可以用 Backspace 删除重来' : '默写模式：只看中文把单词拼出来'}
          </span>
        )}
      </div>

      <div className={`mt-8 pt-5 border-t ${theme.border} flex items-center justify-center gap-6 flex-wrap`}>
        {upcoming.map((item, idx) => (
          <div key={`${item.word}-${idx}`} className="flex flex-col items-center gap-1 opacity-40">
            <span className="text-sm tracking-wider">
              {mode === 'spell' ? '•'.repeat(item.word.length) : item.word}
            </span>
            <span className="text-[11px]">{item.translation}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
