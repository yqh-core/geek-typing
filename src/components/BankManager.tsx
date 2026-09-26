import { useEffect, useRef, useState } from 'react'
import { FileDown, FileUp, Plus, Trash2, X } from 'lucide-react'
import type { ThemeConfig } from '../lib/theme'
import type { WordBank } from '../data/wordBanks'
import {
  deleteCustomBank,
  exportBanksAsJson,
  loadCustomBanks,
  parseWords,
  saveCustomBank,
  type CustomBank,
} from '../lib/customBanks'
import { useT } from '../i18n'

interface BankManagerProps {
  theme: ThemeConfig
  onBankChange: (id: string) => void
  /** 受控打开（由顶栏「导入词库…」触发）；不传则渲染自带触发按钮 */
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export default function BankManager({ theme, onBankChange, open: openProp, onOpenChange }: BankManagerProps) {
  const t = useT()
  // 未受控时使用内部状态
  const [innerOpen, setInnerOpen] = useState(false)
  const open = openProp ?? innerOpen
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInnerOpen(v))

  const [banks, setBanks] = useState<CustomBank[]>(() => loadCustomBanks())
  const [name, setName] = useState('')
  const [raw, setRaw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setBanks(loadCustomBanks())
  }, [open])

  const panelClass = `${theme.card} border ${theme.border}`

  const doImport = () => {
    const words = parseWords(raw)
    if (words.length === 0) {
      setMsg(t('bank.parseFail'))
      return
    }
    const next = saveCustomBank(name || `${t('bank.mine')} ${banks.length + 1}`, words)
    setBanks(next)
    setMsg(`${t('bank.imported')} ${words.length} ${t('bank.importedUnit')}`)
    setRaw('')
    setName('')
    if (next[0]) onBankChange(next[0].id)
  }

  const doFile = (file: File) => {
    file
      .text()
      .then((txt) => {
        setRaw(txt)
        const words = parseWords(txt)
        if (words.length) {
          const next = saveCustomBank(file.name.replace(/\.[^.]+$/, '') || t('bank.open'), words)
          setBanks(next)
          setMsg(`${t('bank.fileImported')} ${words.length} ${t('bank.importedUnit')}`)
        } else {
          setMsg(t('bank.fileFail'))
        }
      })
      .catch(() => setMsg(t('bank.readFail')))
  }

  return (
    <>
      {/* 受控模式下不渲染自带触发按钮（入口在顶栏词库下拉底部） */}
      {openProp === undefined && (
        <button
          data-testid="open-bank-manager"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${theme.border} text-xs ${theme.accent} transition-all hover:opacity-80`}
          onClick={() => setOpen(true)}
        >
          <Plus size={13} />
          {t('bank.open')}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={`w-full max-w-2xl ${panelClass} rounded-2xl p-6 shadow-2xl animate-popIn`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-base font-bold ${theme.accent}`}>{t('bank.title')}</h3>
              <button onClick={() => setOpen(false)} className={theme.sub} aria-label={t('panel.close')}>
                <X size={18} />
              </button>
            </div>

            <p className={`text-xs mb-3 ${theme.sub}`}>{t('bank.help')}</p>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('bank.namePlaceholder')}
              className={`w-full mb-2 px-3 py-2 rounded-lg border ${theme.border} bg-transparent text-sm outline-none`}
            />
            <textarea
              data-testid="bank-textarea"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={6}
              placeholder={'quantization = 量化\nfine-tuning = 微调\nlatency = 延迟'}
              className={`w-full px-3 py-2 rounded-lg border ${theme.border} bg-transparent text-sm font-mono outline-none resize-y`}
            />

            {msg && <div className={`mt-2 text-xs ${theme.accent}`}>{msg}</div>}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button
                data-testid="import-bank"
                onClick={doImport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/50 text-emerald-400 text-xs font-semibold active:scale-95"
              >
                <Plus size={13} />
                {t('bank.importRun')}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${theme.border} text-xs`}
              >
                <FileUp size={13} />
                {t('bank.importFile')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.json,.csv,.md"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && doFile(e.target.files[0])}
              />
              {banks.length > 0 && (
                <button
                  onClick={() => {
                    const blob = new Blob([exportBanksAsJson(banks)], { type: 'application/json' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = 'geek-typing-wordbanks.json'
                    a.click()
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${theme.border} text-xs`}
                >
                  <FileDown size={13} />
                  {t('bank.export')}
                </button>
              )}
            </div>

            {banks.length > 0 && (
              <div className={`mt-5 pt-4 border-t ${theme.border}`}>
                <div className={`text-[11px] mb-2 ${theme.sub}`}>
                  {t('bank.mineList')}（{banks.length}）
                </div>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {banks.map((b) => (
                    <div key={b.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${theme.border}`}>
                      <div className="min-w-0">
                        <div className="text-sm truncate">{b.name}</div>
                        <div className={`text-[11px] ${theme.sub}`}>
                          {b.words.length} {t('bank.wordsUnit')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            onBankChange(b.id)
                            setOpen(false)
                          }}
                          className="text-xs text-emerald-400"
                        >
                          {t('bank.practice')}
                        </button>
                        <button
                          aria-label={`${t('bank.delete')} ${b.name}`}
                          onClick={() => setBanks(deleteCustomBank(b.id))}
                          className="text-xs text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** 把自定义词库包装成标准 WordBank 结构 */
export function toWordBank(custom: CustomBank): WordBank {
  return {
    id: custom.id,
    name: custom.name,
    description: '我的自定义词库',
    icon: 'FileText',
    words: custom.words,
  }
}
