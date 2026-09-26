/**
 * 中文词典：所有 i18n key 的唯一来源，en.ts 必须与之对齐。
 * 扁平点分命名：<模块>.<条目>。
 */
export const zh: Record<string, string> = {
  /* 顶栏 / 导航 */
  'app.subtitle': '敲代码一样背单词',
  'app.tagline': '练英语，敲更快，记得牢。',
  'nav.practice': '练习',
  'nav.banks': '词库',
  'nav.settings': '设置',
  'nav.restart': '重新开始本轮',
  'nav.importBank': '导入词库…',

  /* Tab 切换 */
  'tab.home': '今日',
  'tab.typing': '打字练习',
  'tab.memorize': '背单词',
  'tab.review': '复习',
  'tab.progress': '进度',

  /* 练习模式 */
  'mode.classic': '经典模式',
  'mode.spell': '拼写模式',
  'mode.timed': '限时 60s',
  'mode.classicHint': '看词打字，敲对变绿、敲错被拦住',
  'mode.spellHint': '只给中文释义，考你自己拼出来',
  'mode.timedHint': '一分钟内尽量多打，练速度',
  'mode.code': '代码模式',
  'mode.codeHint': '大小写敏感练真实代码行，强化符号键肌肉记忆',

  /* 自动发音 */
  'toggle.autospeak': '自动发音',
  'toggle.autospeakTitle': '换词时自动朗读单词',

  /* 词库 */
  'bank.mine': '我的自定义词库',
  'bank.wordsUnit': '词',
  'bank.open': '自定义词库',
  'bank.title': '自定义词库',
  'bank.help': '每行一个单词，格式 quantization = 量化，也可以直接粘 JSON 数组。数据只存在你自己的浏览器里，不上传。',
  'bank.namePlaceholder': '词库名称（如：我司产品术语）',
  'bank.importRun': '导入并开始练习',
  'bank.importFile': '从 .txt/.json 导入',
  'bank.export': '导出备份',
  'bank.mineList': '我的词库',
  'bank.practice': '练习',
  'bank.delete': '删除',
  'bank.parseFail': '没解析出单词：请每行一个，如 quantization = 量化，或直接粘 JSON',
  'bank.imported': '已导入',
  'bank.importedUnit': '个单词',
  'bank.fileImported': '从文件导入',
  'bank.fileFail': '文件里没解析出单词，检查一下格式',
  'bank.readFail': '读取文件失败',

  /* 设置 */
  'settings.theme': '主题',
  'settings.sound': '键盘音',
  'settings.shuffle': '乱序',
  'settings.order': '顺序',
  'sound.mech': '青轴',
  'sound.thock': '麻将音',
  'sound.8bit': '8-bit',
  'theme.matrix': '黑客荧光',
  'theme.ide': '专注 IDE',
  'theme.ink': '墨水屏',
  'theme.ideTitle': '代码编辑器风格皮肤，办公室也能安静背单词',

  /* 统计栏 */
  'stats.progress': '进度',
  'stats.accuracy': '正确率',
  'stats.wpm': '速度',
  'stats.combo': '连击',

  /* 数据面板 */
  'panel.open': '数据',
  'panel.title': '学习数据分析',
  'panel.totalKeys': '累计击键',
  'panel.accuracyAll': '总正确率',
  'panel.totalWords': '完成词数',
  'panel.bestWpm': '最高 WPM',
  'panel.weakKeys': '最常敲错的键',
  'panel.noData': '还没有数据，先敲几轮再来',
  'panel.miss': '错',
  'panel.times': '次',
  'panel.weakPractice': '针对这些弱字母专攻一轮',
  'panel.wrongWords': '错词榜',
  'panel.noWrong': '暂无错词，干净得离谱 👏',
  'panel.localOnly': '数据只保存在本机 localStorage',
  'panel.confirmClear': '确认清空',
  'panel.cancel': '取消',
  'panel.clear': '清空统计数据',
  'panel.close': '关闭',

  /* 练习面板 */
  'practice.typeError': '敲错了',
  'practice.typeErrorHint': '，请敲下一个正确的字母',
  'practice.spellFix': '拼错了可以用 Backspace 删除重来',
  'practice.spellIntro': '默写模式：只看中文把单词拼出来',
  'practice.speakTitle': '朗读这个单词',
  'practice.ideIdle': '在键盘上敲出来，别人以为你在疯狂写代码',
  'practice.codeHint': '大小写敏感 · 空格以 · 标示',

  /* 虚拟键盘 */
  'keymap.hint': '请用标准指法敲击',
  'keymap.escHint': 'Esc 命令面板',

  /* 命令面板 */
  'cmd.placeholder': '输入命令，:help 查看全部',
  'cmd.unknown': '未知命令，:help 查看全部',
  'cmd.bankNotFound': '词库不存在',
  'cmd.desc.review': '错题复习：开艾宾浩斯到期轮，或前往 Review 页签',
  'cmd.desc.bank': '切换词库：:bank 序号|id',
  'cmd.desc.mode': '练习模式：:mode classic|spell|timed|code',
  'cmd.desc.voice': '口音切换：:voice en-US|en-GB',
  'cmd.desc.theme': '主题：:theme matrix|ide|ink',
  'cmd.desc.sound': '键盘音开关：:sound on|off',
  'cmd.desc.soundtheme': '音效包：:soundtheme mech|thock|8bit',
  'cmd.desc.shuffle': '乱序开关：:shuffle on|off',
  'cmd.desc.memorize': '切到背单词页签',
  'cmd.desc.typing': '切到打字练习页签',
  'cmd.desc.home': '回到今日练习首页',
  'cmd.desc.progress': '查看学习进度页',
  'cmd.desc.q': '重开本轮',
  'cmd.desc.help': '列出全部命令',

  /* 错题复习（艾宾浩斯） */
  'review.label': '错题复习',
  'review.dueUnit': '个到期',
  'review.noDue': '没有到期的错题，先去练',
  'review.statsTotal': '错题总数',
  'review.statsDue': '今日到期',
  'review.start': '开始错题复习',

  /* 复习中心（V3-P0a） */
  'review.panelTitle': '复习中心',
  'review.masteryDist': '掌握分布',
  'review.upcomingTitle': '待复习（按下次时间）',
  'review.nextReview': '下次复习',
  'review.statDone': '练过',
  'review.statWrong': '敲错',
  'review.wrongCountLabel': '累计敲错',
  'review.correctStreakLabel': '连续答对',
  'review.practiceWord': '练习这个词',
  'review.drill': '单挑',
  'review.detail': '详情',
  'review.empty': '错题本还是空的，敲错的单词会自动进入复习计划',

  /* 掌握度四级（V3-P0a） */
  'mastery.struggling': '挣扎中',
  'mastery.learning': '入门',
  'mastery.familiar': '熟悉',
  'mastery.strong': '巩固',

  /* 今日推荐首页（V3-P0a） */
  'home.title': '今日练习',
  'home.goal': '今日目标',
  'home.goalDone': '已达标 🎉',
  'home.reviewTitle': '到期复习',
  'home.dueCount': '个单词到期',
  'home.startReview': '开始复习',
  'home.reviewEmpty': '暂无到期错题，保持住！',
  'home.weakTitle': '弱项专攻',
  'home.startWeak': '弱项专攻',
  'home.weakEmpty': '暂无弱项数据，先敲几轮',
  'home.newTitle': '新词练习',
  'home.startNew': '开始练习',

  /* 进度页（V3-P0a） */
  'progress.title': '学习进度',
  'progress.heatmap': '近 14 天',
  'progress.stats': '累计统计',
  'progress.weakLetters': '弱字母 Top 5',
  'progress.wrongWordsTop': '错词 Top 5',

  /* 连击里程碑 */
  'milestone.combo': '连击！手感来了',

  /* 结果页 */
  'result.complete': '本轮完成',
  'result.timeUp': '时间到',
  'result.words': '完成词数',
  'result.accuracy': '正确率',
  'result.speed': '速度',
  'result.bestCombo': '最高连击',
  'result.seconds': '用时',
  'result.today': '今日累计',
  'result.wordsUnit': '词',
  'result.goalDone': '今日目标已达成 🎉',
  'result.goalLeft': '还差',
  'result.goalLeftUnit': '词达标',
  'result.restart': '再来一轮',
  'result.review': '复习错词',
  'result.perfect': '没有错词，完美',
  'result.enterHint': '按 Enter 直接开始下一轮',

  /* 连续打卡 */
  'streak.title': '连续打卡',
  'streak.dayUnit': '天',
  'streak.today': '今日',
  'streak.wordsUnit': '词',
  'streak.localOnly': '数据保存在本机 localStorage',

  /* 页脚 */
  'footer.hint1': '别找输入框，直接在键盘上敲字母即可',
  'footer.hintSpell': '默写模式：拼错标红可退格',
  'footer.hintClassic': '敲错会被拦住，必须敲对当前字母',
  'footer.hint3': 'Enter 结算后重来',
  'footer.loading': '加载词库中…',

  /* 背单词 */
  'memorize.plan': '今日新词',
  'memorize.progress': '本组进度',
  'memorize.show': '显示释义',
  'memorize.known': '认识',
  'memorize.fuzzy': '模糊',
  'memorize.unknown': '不认识',
  'memorize.done': '本组完成！',
  'memorize.newToday': '今日新学',
  'memorize.reviewed': '复习',
  'memorize.mastered': '本库已掌握',
  'memorize.again': '再来一组',
  'memorize.emptyBank': '当前词库为空',
  'memorize.allDone': '本库新词已全部学完',
  'memorize.definition': '释义',
  'memorize.keyFlip': 'Space 翻面',
  'memorize.keyGrade': '1 认识 · 2 模糊 · 3 不认识',
  'memorize.keyReread': 'K 重读',
  'memorize.swipeFlip': '点击卡片或上滑翻面',
  'memorize.swipeGrade': '← 不认识 · 上滑模糊 · 认识 →',
  'memorize.medal': '今日修行完成',
}
