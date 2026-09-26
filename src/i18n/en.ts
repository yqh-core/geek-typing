/**
 * 英文词典：key 与 zh.ts 一一对齐。
 */
export const en: Record<string, string> = {
  /* Header / nav */
  'app.subtitle': 'Type words like code',
  'nav.practice': 'Practice',
  'nav.banks': 'Banks',
  'nav.settings': 'Settings',
  'nav.restart': 'Restart this round',
  'nav.importBank': 'Import banks…',

  /* Tabs */
  'tab.typing': 'Typing',
  'tab.memorize': 'Vocabulary',

  /* Practice modes */
  'mode.classic': 'Classic',
  'mode.spell': 'Spelling',
  'mode.timed': 'Timed 60s',
  'mode.classicHint': 'Type the shown word — typos are blocked',
  'mode.spellHint': 'Only the meaning is shown, spell it yourself',
  'mode.timedHint': 'Type as many words as you can in one minute',
  'mode.code': 'Code',
  'mode.codeHint': 'Type real code lines case-sensitively to build symbol-key muscle memory',

  /* Auto speak */
  'toggle.autospeak': 'Auto speak',
  'toggle.autospeakTitle': 'Read each new word aloud automatically',

  /* Banks */
  'bank.mine': 'My custom banks',
  'bank.wordsUnit': 'words',
  'bank.open': 'Custom banks',
  'bank.title': 'Custom banks',
  'bank.help': 'One word per line like `quantization = 量化`, or paste a JSON array. Data stays in your browser only.',
  'bank.namePlaceholder': 'Bank name (e.g. work terms)',
  'bank.importRun': 'Import & practice',
  'bank.importFile': 'Import .txt/.json',
  'bank.export': 'Export backup',
  'bank.mineList': 'My banks',
  'bank.practice': 'Practice',
  'bank.delete': 'Delete',
  'bank.parseFail': 'No words parsed: one per line like `word = meaning`, or paste JSON',
  'bank.imported': 'Imported',
  'bank.importedUnit': 'words',
  'bank.fileImported': 'Imported from file',
  'bank.fileFail': 'No words found in the file, check the format',
  'bank.readFail': 'Failed to read file',

  /* Settings */
  'settings.theme': 'Theme',
  'settings.sound': 'Key sound',
  'settings.shuffle': 'Shuffle',
  'settings.order': 'In order',
  'sound.mech': 'Clicky',
  'sound.thock': 'Thock',
  'sound.8bit': '8-bit',
  'theme.matrix': 'Matrix',
  'theme.ide': 'Sneaky IDE',
  'theme.ink': 'E-ink',
  'theme.ideTitle': 'Disguised as a code editor — perfect for slacking off',

  /* Stats bar */
  'stats.progress': 'Progress',
  'stats.accuracy': 'Accuracy',
  'stats.wpm': 'WPM',
  'stats.combo': 'Combo',

  /* Stats panel */
  'panel.open': 'Stats',
  'panel.title': 'Learning Analytics',
  'panel.totalKeys': 'Total keys',
  'panel.accuracyAll': 'Accuracy',
  'panel.totalWords': 'Words done',
  'panel.bestWpm': 'Best WPM',
  'panel.weakKeys': 'Most missed keys',
  'panel.noData': 'No data yet — type a few rounds first',
  'panel.miss': 'miss',
  'panel.times': 'times',
  'panel.weakPractice': 'Drill these weak keys in one round',
  'panel.wrongWords': 'Wrong words',
  'panel.noWrong': 'No wrong words — spotless 👏',
  'panel.localOnly': 'Data is stored in your browser only',
  'panel.confirmClear': 'Confirm clear',
  'panel.cancel': 'Cancel',
  'panel.clear': 'Reset stats',
  'panel.close': 'Close',

  /* Practice panel */
  'practice.typeError': 'Wrong key',
  'practice.typeErrorHint': ' — type the next correct letter',
  'practice.spellFix': 'Mistake? Press Backspace to fix it',
  'practice.spellIntro': 'Spelling mode: build the word from its meaning',
  'practice.speakTitle': 'Read this word aloud',
  'practice.ideIdle': "Type on your keyboard — looks like you're coding",
  'practice.codeHint': 'Case-sensitive · spaces shown as ·',

  /* Virtual keyboard */
  'keymap.hint': 'Use standard touch typing',
  'keymap.escHint': 'Esc — command palette',

  /* Command palette */
  'cmd.placeholder': 'Type a command — :help for all',
  'cmd.unknown': "Unknown command — :help, obviously",
  'cmd.bankNotFound': 'No such bank',
  'cmd.desc.review': 'Review due mistakes (Ebbinghaus)',
  'cmd.desc.bank': 'Switch bank: :bank n|id',
  'cmd.desc.mode': 'Set mode: :mode classic|spell|timed|code',
  'cmd.desc.voice': 'Accent: :voice en-US|en-GB',
  'cmd.desc.theme': 'Theme: :theme matrix|ide|ink',
  'cmd.desc.sound': 'Key sound: :sound on|off',
  'cmd.desc.soundtheme': 'Sound pack: :soundtheme mech|thock|8bit',
  'cmd.desc.shuffle': 'Shuffle: :shuffle on|off',
  'cmd.desc.memorize': 'Go to vocabulary tab',
  'cmd.desc.typing': 'Go to typing tab',
  'cmd.desc.q': 'Restart round',
  'cmd.desc.help': 'List all commands',

  /* Mistake review (Ebbinghaus) */
  'review.label': 'Review due',
  'review.dueUnit': 'due',
  'review.noDue': 'No due mistakes — keep it up!',
  'review.statsTotal': 'Total mistakes',
  'review.statsDue': 'Due today',
  'review.start': 'Start review round',

  /* Combo milestone */
  'milestone.combo': 'combo streak! You are on fire',

  /* Result overlay */
  'result.complete': 'Round Complete',
  'result.timeUp': 'Time Up',
  'result.words': 'Words',
  'result.accuracy': 'Accuracy',
  'result.speed': 'Speed',
  'result.bestCombo': 'Best combo',
  'result.seconds': 'Time',
  'result.today': 'Today',
  'result.wordsUnit': 'words',
  'result.goalDone': 'Daily goal reached 🎉',
  'result.goalLeft': 'words to go',
  'result.goalLeftUnit': '',
  'result.restart': 'New round',
  'result.review': 'Review wrong',
  'result.perfect': 'No wrong words — perfect',
  'result.enterHint': 'Press Enter to start the next round',

  /* Streak */
  'streak.title': 'Streak',
  'streak.dayUnit': 'days',
  'streak.today': 'Today',
  'streak.wordsUnit': 'words',
  'streak.localOnly': 'Saved in your browser',

  /* Footer */
  'footer.hint1': 'No input box — just type on your keyboard',
  'footer.hintSpell': 'Spelling mode: mistakes turn red, Backspace to fix',
  'footer.hintClassic': 'Wrong keys are blocked until corrected',
  'footer.hint3': 'Enter to restart after the round',
  'footer.loading': 'Loading bank…',

  /* Memorize */
  'memorize.plan': "Today's new words",
  'memorize.progress': 'Batch progress',
  'memorize.show': 'Show meaning',
  'memorize.known': 'Know',
  'memorize.fuzzy': 'Fuzzy',
  'memorize.unknown': 'Nope',
  'memorize.done': 'Batch complete!',
  'memorize.newToday': 'New today',
  'memorize.reviewed': 'Reviewed',
  'memorize.mastered': 'Mastered in bank',
  'memorize.again': 'Another batch',
  'memorize.emptyBank': 'This bank is empty',
  'memorize.allDone': 'All new words in this bank are learned',
  'memorize.definition': 'Definition',
  'memorize.keyFlip': 'Space to flip',
  'memorize.keyGrade': '1 Know · 2 Fuzzy · 3 Nope',
  'memorize.keyReread': 'K re-read',
  'memorize.medal': 'Daily quest complete',
}
