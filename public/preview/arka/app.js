// АРКА — прототип. Полная логика: табы, задачи, стратегия, ИИ-помощник в архетипе З-МАН.

const STORAGE_KEY = 'iram_prototype_v2';
const TODAY = new Date().toISOString().slice(0, 10);
const DOTERRA_REF_URL = 'https://doterra.me/vhZWLb';

// ── Состояние ────────────────────────────────────────
function defaultState() {
  return {
    days: {},
    gratitude: {},
    streakStart: TODAY,
    tasks: [
      // Дефолтное имя первой задачи переведётся в renderTasks через dt('task.default_t1')
      { id: 't1', text: '', type: 'resource', done: false, _default: 'task.default_t1' },
      { id: 't2', text: '', type: 'neutral', done: false },
      { id: 't3', text: '', type: 'neutral', done: false }
    ],
    goal: { title: '', deadline: '', why: '' },
    steps: [
      { id: 's1', text: '', done: false },
      { id: 's2', text: '', done: false },
      { id: 's3', text: '', done: false }
    ],
    finance: [
      { id: 'f1', name: 'YupDar — тарифы', actual: 0, target: 50000 },
      { id: 'f2', name: 'Книга Даров RU', actual: 0, target: 30000 },
      { id: 'f3', name: 'Книга EN/ES (KDP)', actual: 0, target: 20000 },
      { id: 'f4', name: 'doTERRA рефералы', actual: 0, target: 10000 }
    ],
    content: [
      { id: 'c1', date: '', text: '', channel: 'Telegram', done: false },
      { id: 'c2', date: '', text: '', channel: 'Instagram', done: false }
    ],
    // ── Квест Открытие тени ──
    // shadows.active — массив теней которые сейчас активны (юзер их замечает)
    // shadows.passed — массив теней которые юзер прошёл (3+ записи)
    // shadows.counts — счётчик упоминаний каждой тени { 'fall_out': 2, 'stuck_future': 0 }
    // shadows.unlocked — id практик которые открылись (связь shadow_id → practice_id)
    shadows: {
      active: ['shadow_fall_out', 'shadow_stuck_future'],
      passed: ['shadow_rush', 'shadow_procrastination'],
      counts: { shadow_fall_out: 0, shadow_stuck_future: 0 },
      unlocked: ['practice_slowdown']  // p1 уже открыта по умолчанию (демо)
    },
    // Журнал записей дневника (для истории + анализа недели)
    journal: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return Object.assign(defaultState(), s);
  } catch (e) { return defaultState(); }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();
if (!state.days[TODAY]) state.days[TODAY] = {};

// ── i18n: словарь динамических строк (тексты, генерируемые в JS) ──────
// Статичные строки HTML переводятся через ARKA_I18N в index.html.
// Здесь — только то, что собирается из кода: бриф наставника, советы, и т.п.
const ARKA_DYN_I18N = {
  ru: {
    'greet.dawn': 'Рассвет — окно силы',
    'greet.morning': 'Утренний бриф',
    'greet.day': 'Дневной якорь',
    'greet.sunset': 'Закатное окно силы',
    'greet.evening': 'Вечернее скольжение',
    'hint.dawn': 'Ты в открытом окне силы. Самое важное — сейчас.',
    'hint.morning': 'Закатное окно ещё впереди — оставь силы.',
    'hint.day': 'Время заземлиться. Balance на запястья.',
    'hint.sunset': 'Это твоё время. Сделай главное действие сейчас.',
    'hint.evening': 'Замедли темп. Cypress на стопы. Прислушайся.',
    'brief.fallback_title': 'Бриф наставника',
    'good.morning': 'Доброе утро',
    'good.day': 'Добрый день',
    'good.sunset': 'Тёплый закат',
    'good.night': 'Тихой ночи',
    'word.day': 'день',
    'word.days_few': 'дня',
    'word.days_many': 'дней',
    'btn.delete': 'Удалить',
    'task.neutral': '⚖️ обычная',
    'task.resource': '🌟 ресурсная',
    'task.shadow': '🌑 теневая',
    'task.default_t1': 'Главная задача в окне силы',
    'task.placeholder': 'Опиши задачу…',
    'water.remind_me': '⏰ Напомнить мне',
    'water.reminders_on': '✓ Напоминания включены',
    'water.permission_needed': 'Разреши уведомления в браузере, чтобы получать напоминания',
    'water.notif_title': '💧 АРКА',
    'water.notif_body': 'Напоминания о воде включены: в 12:00, 14:00, 16:00',
    'finance.actual': 'Факт ₽',
    'finance.target': 'Цель ₽',
    'finance.name_placeholder': 'Название канала',
    // === ЗЕРКАЛО МОМЕНТА (Hero AI) ===
    // Понятный голос: имя — период дня — Дар дня — приглашение
    'mirror.enter': 'Войди',
    'mirror.return': '← Зеркало',
    'mirror.dar_of_day_label': 'Твой Дар сегодня —',
    // Период дня — короткая понятная фраза
    'mirror.period_dawn': 'Рассвет. Самое сильное окно дня.',
    'mirror.period_morning': 'Утро. Время для главного.',
    'mirror.period_day': 'Полдень. Время для спокойных дел.',
    'mirror.period_sunset': 'Закатное окно силы.',
    'mirror.period_evening': 'Вечер. Время замедлиться.',
    'mirror.period_night': 'Ночь. Время для тишины.',
    // Тизер — что юзер получит, нажав «Войди»
    'mirror.teaser_d1': 'Войди — и АРКА начнёт узнавать тебя через ритм твоего Дара.',
    'mirror.teaser_d2': 'Войди — я уже чувствую, как ты входишь в ритм.',
    'mirror.teaser_d3': 'Войди — сегодня я покажу тебе первый паттерн, который заметила.',
    'mirror.teaser_dN': 'Войди — твой день ждёт.',
    // === ШЕРИНГ-КАРТОЧКА ===
    'share.download': 'Скачать',
    'share.send': 'Отправить',
    'share.default_quote': 'Мой день в АРКА',
    'share.day_prefix': 'День ',
    'share.day_suffix': 'в АРКА',
    'share.tg_message': 'Мой день в АРКА',
    'share.mirror_quote_tpl': 'Сегодня {dar} ведёт меня',
    'tasks.no_tasks': '🌑 <b>Задач на день пока нет.</b> Открой таб «Сегодня» и напиши 1-3 главных дела. Без направления змей кружит без смысла.',
    'tasks.all_done': '🌟 <b>Задачи дня сделаны.</b> Поток ТУМА течёт ровно. Не добавляй больше — поток силы важнее списка побед.',
    'tasks.partial': '⚖️ Задачи дня: <em>{done} из {total}</em>. Главное — сделать ресурсную 🌟 в окно силы.',
    'goal.progress': '🎯 Цель «<em>{title}</em>» — готовность <em>{pct}%</em>. ',
    'goal.slow': 'Темп пока медленный — выбери <b>один шаг</b> на сегодня.',
    'goal.fast': 'Ты в потоке. Не торопись.',
    'goal.steady': 'Волна ровная. Один шаг — и ритм удержан.',
    'goal.none': '🎯 <b>Цели в стратегии нет.</b> Открой «Стратегию» и назови — змей не может скользить без направления.',
    'fin.progress': '💧 Потоки дохода: <em>{pct}%</em> от месячной цели. ',
    'fin.low': 'ТУМА течёт слабо — посмотри, какой канал просел, и направь туда внимание сегодня.',
    'fin.high': 'Поток сильный. Не ускоряй искусственно — удержи ритм.',
    'fin.mid': 'Поток идёт. Сегодня — главное действие для самого медленного канала.',
    // === ЕЖЕНЕДЕЛЬНЫЙ РАЗБОР ===
    'weekly.header': '🐉 <b>Разбор недели — голос З-МАН</b>',
    'weekly.streak_line': 'Ты прошла {streak} {days} по змею времени. Это не мало — это путь.',
    'weekly.flow_title': 'Что было в потоке:',
    'weekly.tasks_done': '• {n} задач дня закрыто — каждая отметка делает змея сильнее',
    'weekly.tasks_progress': '• Задачи в работе — продолжаем',
    'weekly.steps_done': '• {done} стратегических шагов из {total} — ТУМА не стоит',
    'weekly.content_done': '• {n} публикаций ушли в мир — твой голос звучит',
    'weekly.finance': '• Финансы: {pct}% от месячной цели',
    'weekly.notice_title': 'Что заметил наставник:',
    'weekly.no_steps': '• <em>Нет шагов в стратегии</em> — назови 3-5 на следующую неделю',
    'weekly.slow_pace': '• Темп медленнее ожидаемого — это <em>не проблема</em>, а сигнал. Замедление = накопление силы. Спроси себя: какой шаг сейчас самый важный?',
    'weekly.good_pace': '• Темп хороший. Удержи ритм, не ускоряйся искусственно',
    'weekly.advice_title': 'Совет на следующую неделю:',
    'weekly.advice_text': 'Выбери <em>одно главное действие</em> — то, что двинет цель сильнее всего. Сделай его в закатное окно силы (17:30–19:30). Остальное — питай ритм.',
    'weekly.remember': 'Помни: вечная молодость З-МАН — побочный эффект присутствия в моменте, а не результат гонки.',
    // === ОПИСАНИЯ МАСЕЛ (попап) ===
    'oil.frankincense_desc': 'Присутствие в моменте, замедление времени, активация ЛОГОСа. Главное масло для Дара З-МАН.',
    'oil.frankincense_meta': '1 капля на ладонь · 3 медленных вдоха · возвращает в «сейчас»',
    'oil.vetiver_desc': 'Глубокое заземление, опора у основания позвоночника. Используется только вечером — может усыплять.',
    'oil.vetiver_meta': '1–2 капли на стопы · вечером · разводить с базой при чувствительной коже',
    'oil.cypress_desc': 'Поток ТУМА, движение времени, текучесть. Снимает застревание в прошлом и страх перемен.',
    'oil.cypress_meta': '1 капля на запястья · днём · сочетается с Vetiver',
    'oil.balance_desc': 'Якорь ЛОГОС-треугольника, возвращение в «сейчас». Состав: Spruce, Ho Wood, Frankincense, Blue Tansy, Blue Chamomile.',
    'oil.balance_meta': '1 капля на внутреннюю сторону запястий · растереть · поднести к носу',
    'oil.lavender_desc': 'Мягкий переход в восстановление, ночное скольжение. ⚠ Строго 1–2 капли — больше даёт обратный эффект.',
    'oil.lavender_meta': '1–2 капли на подушку · перед сном · больше = перевозбуждение',
    'oil.serenity_desc': 'Восстановление после плотного дня, мягкая опора в момент перехода в сон.',
    'oil.serenity_meta': '1–2 капли в диффузор · вечером · хорошо в паре с Lavender',
    // === БРИФ НАСТАВНИКА (динамические части) ===
    'brief.content_planned': '📢 В контент-плане ждёт {n} публикаций. Сегодня — закрой одну, не больше.',
    'brief.sunday': '📜 <b>Воскресный вечер.</b> Запусти разбор недели — змей подведёт итог семи дней.',
    'brief.day_under_arka': 'Сегодня — день {n} под АРКОЙ.',
    // === ИИ-ПОМОЩНИК ===
    'ai.loading': '🐉 змей скользит во времени…',
    'ai.not_understood': 'Не понял команду. Попробуй ещё раз.',
    'ai.your_goal': 'твоя цель',
    'ai.word_finance': 'Финансы',
    'ai.word_promo': 'Продвижение',
    'ai.advice_stuck': '🐉 <b>Змей времени говорит:</b><br><br>Когда поток ТУМА встречает камень, он не ломает его — он <em>обтекает</em>. Замедлись. Сядь у воды или открой кран — пусть журчит. Поставь Frankincense на ладонь. Не двигайся к шагу — позволь ему прийти к тебе.<br><br><b>Конкретно сейчас:</b><br>{now}<br><br><em>Аспект Дара:</em> застревание лечится присутствием, не толканием.',
    'ai.advice_stuck_goal': 'Возьми «{goal}» и спроси не «как сделать?», а «что в этой задаче само хочет проявиться?». Запиши первое, что придёт.',
    'ai.advice_stuck_nogoal': 'Назови цель в первом поле — змей не может скользить без направления.',
    'ai.advice_overload': '🐉 <b>З-МАН напоминает:</b><br><br>Время — не враг, который убегает. Время — змей, которого ты <em>замедляешь</em>. Перегрузка = ты потеряла свой ритм и подстроилась под чужой.<br><br><b>Опора:</b><br>1. Босиком на пол на 2 минуты. Активируй ЛОГОС.<br>2. Сократи задачи дня до <b>одной</b> ресурсной 🌟. Остальные пометь шадоу 🌑 или удали.<br>3. Капля Balance на запястья.<br><br><em>В архетипе:</em> вечная молодость не у тех, кто всё успел — а у тех, кто живёт сейчас.',
    'ai.advice_fear': '🐉 <b>Прислушайся:</b><br><br>Страх — это будущее, которое заглянуло в твоё настоящее. Змей умеет скользить туда. Спроси: <em>что именно я там вижу?</em> Назови вслух.<br><br><b>Практика:</b><br>Vetiver на ступни. Ладони — на основание позвоночника. 7 медленных выдохов длиннее вдохов. Возврат в «сейчас».<br><br><em>Тень З-МАН:</em> застревание в будущем. <em>Опора:</em> ЛОГОС-треугольник.',
    'ai.advice_money': '🐉 <b>Для движения и денег:</b><br><br>З-МАН ускоряет рутину и замедляет важное. {what} идут к тебе, когда ты <b>в моменте</b>, а не в гонке.<br><br><b>Что делать:</b><br>{action}<br>Делай его в <em>закатное окно силы</em> (17:30–19:30). Перед — Cypress + Vetiver.<br><br><em>В архетипе:</em> деньги — это поток ТУМА. Не лови — направляй.',
    'ai.advice_money_goal': 'Для «{goal}» — выбери 1 главное действие на этой неделе. Не 10. Одно.',
    'ai.advice_money_nogoal': 'Сначала назови цель — без неё дракон не знает, куда плыть.',
    'ai.advice_generic': '🐉 <b>Совет дня в архетипе З-МАН:</b><br><br>{body}<br><br><b>Сегодня:</b> сделай одно действие в окне силы (5:30–7:30 или 17:30–19:30). Перед — масло дня (Frankincense утром, Cypress вечером).<br><br><em>Принцип Дара:</em> вечная молодость — побочный эффект присутствия. Не торопись.',
    'ai.advice_generic_goal': 'Твоя цель «{goal}» — это не точка вдалеке. Это <em>пункт назначения, который уже существует</em>. Змей времени умеет скользить туда, и ты можешь идти быстро или медленно — главное, не терять направление.',
    'ai.advice_generic_nogoal': 'Назови цель в первом поле. Без направления змей вечности кружит без смысла.',
    'ai.forecast_nogoal': '🐉 <b>Прогноз невозможен без направления.</b><br><br>Змей времени умеет скользить в будущее, но только если есть точка прибытия. Назови цель в первом поле — и я просчитаю темп.',
    'ai.forecast_dateinfo': 'До «{deadline}» осталось <b>{days}</b> {daysWord}.<br>Готовность плана: <b>{speed}%</b> ({done} из {total} шагов).<br><br>{tempo}',
    'ai.forecast_tempo_fast': '🌟 <b>Темп З-МАН:</b> ты в потоке. Не ускоряйся искусственно.',
    'ai.forecast_tempo_mid': '⚖️ <b>Темп ТУМА:</b> волна идёт ровно. Один шаг в окно силы — и удержишь ритм.',
    'ai.forecast_tempo_slow': '🌑 <b>Сигнал ЛОГОС:</b> темп ниже волны. Не паникуй — выбери <em>один шаг</em> и сделай в закатное окно.',
    'ai.forecast_no_deadline': 'Поставь дедлайн — змей скользит быстрее, когда есть берег.<br><br>',
    'ai.forecast_result': '🐉 <b>Прогноз по «{goal}»:</b><br><br>{dateInfo}<br><em>Что важно для З-МАН:</em> ты способна замедлять и ускорять. Если устанешь — замедлись на день, побудь в практике. Скорость вернётся сама.',
    'ai.correct_nogoal': '🐉 <b>Нет цели — нечего корректировать.</b><br><br>Сначала направление, потом курс. Назови цель в первом поле.',
    'ai.correct_result': '🐉 <b>Корректировка курса:</b><br><br>{step}<br><br><b>Темп З-МАН:</b><br>• <em>Ускорять</em> — рутинные задачи, маркетинговые рассылки, мелочи<br>• <em>Замедлять</em> — важные решения, тексты, ключевые встречи<br><br><em>Принцип:</em> змей не ломает план — он его пересобирает, пока ты дышишь.',
    'ai.correct_step': 'Ближайший несделанный шаг — <b>«{step}»</b>.<br><br>Раздели его на <em>самое маленькое возможное действие</em>: то, что ты можешь сделать прямо сейчас за 10 минут. Не глобально — мельчайше.',
    'ai.correct_nostep': 'Все шаги либо сделаны, либо пусты. Если цель не достигнута — значит, в плане не хватает шагов. Добавь 2-3 конкретных действия.',
    // === ПРЕДЛОЖЕНИЯ ШАГОВ ===
    'suggest.title': '🐉 Шаги в архетипе З-МАН',
    'suggest.take': '＋ Взять',
    'suggest.added': '✓ Добавлено',
    'suggest.note': 'Это предложения — подстрой под себя или добавь свои.',
    'suggest.no_goal': '⚠ Сначала назови цель в первом поле — без направления змей кружит без смысла',
    'suggest.book_1': 'Записать на диктофон главную мысль книги — что хочешь донести, одной фразой',
    'suggest.book_2': 'Составить структуру: 5–7 ключевых блоков, без деталей',
    'suggest.book_3': 'Написать 1 пилотную главу в закатное окно (17:30–19:30)',
    'suggest.book_4': 'Найти 3 человека своей аудитории — задать им 1 вопрос про боль/желание',
    'suggest.book_5': 'Запустить мини-анонс в Telegram до того, как готово (поток ТУМА требует движения)',
    'suggest.book_6': 'Назначить конкретную дату пилотной публикации — змею нужен берег',
    'suggest.yupdar_1': 'Определить главный сегмент: кто платит первым — назвать имя одного реального человека',
    'suggest.yupdar_2': 'Описать в одном абзаце «что человек получает за тариф» — без терминов',
    'suggest.yupdar_3': 'Подготовить 3 онбординг-сообщения для нового подписчика (день 1 / 3 / 7)',
    'suggest.yupdar_4': 'Запустить закрытый бета-тест на 5–10 человек из круга',
    'suggest.yupdar_5': 'Собрать обратную связь через 7 дней — 3 вопроса, не больше',
    'suggest.yupdar_6': 'Доработать одну ключевую функцию по фидбэку',
    'suggest.promo_1': 'Сформулировать главное обещание: «после взаимодействия со мной человек получает...»',
    'suggest.promo_2': 'Записать 5 коротких видео-историй — по одной важной мысли в каждом',
    'suggest.promo_3': 'Опубликовать историю №1 в закатное окно и не подсматривать в статистику 24 часа',
    'suggest.promo_4': 'Договориться о коллаборации с 2 близкими по духу проектами',
    'suggest.promo_5': 'Создать простую страницу-приглашение с одной кнопкой',
    'suggest.promo_6': 'Назначить день старта потока — конкретная дата',
    'suggest.iram_1': 'Прожить с прототипом АРКА 5–7 дней — записать что отозвалось, что нет',
    'suggest.iram_2': 'Заполнить шаблон полей для своего Дара З-МАН в dar-content.json',
    'suggest.iram_3': 'Согласовать с командой архитектуру 3 БД: oils, practices, stones',
    'suggest.iram_4': 'Встроить вкладку «Путь» внутрь YupDar после стабилизации тарифов и языков',
    'suggest.iram_5': 'Запустить закрытую бету для 5 активных пользователей YupDar',
    'suggest.iram_6': 'Запустить публичный тариф «Путь Дара» с базовой ценой',
    'suggest.income_1': 'Назвать сумму, которую хочешь — не «больше», а конкретную цифру',
    'suggest.income_2': 'Разложить её по 4 потокам: какие каналы → сколько даёт каждый',
    'suggest.income_3': 'Найти самый слабый канал → одна задача на укрепление в неделю',
    'suggest.income_4': 'Создать «лестницу цен»: от бесплатного входа до главного предложения',
    'suggest.income_5': 'Сделать одно публичное предложение / приглашение в окно силы',
    'suggest.income_6': 'Через 30 дней — сверка факт/план, корректировка',
    'suggest.generic_1': 'Описать желаемый результат одной фразой: «когда цель достигнута, я буду...»',
    'suggest.generic_2': 'Найти главное препятствие — то, что больше всего держит',
    'suggest.generic_3': 'Сформулировать первое действие, которое можно сделать за 30 минут',
    'suggest.generic_4': 'Спросить одного человека, который уже в этой точке: что важно знать?',
    'suggest.generic_5': 'Сделать одно видимое действие в закатное окно — публикация / звонок / письмо',
    'suggest.generic_6': 'Зафиксировать дату следующей проверки прогресса',
    // === КАНАЛЫ КОНТЕНТ-ПЛАНА ===
    'channel.article': 'Статья',
    'channel.book': 'Книга'
  },
  en: {
    'greet.dawn': 'Dawn — Power Window',
    'greet.morning': 'Morning Brief',
    'greet.day': 'Midday Anchor',
    'greet.sunset': 'Sunset Power Window',
    'greet.evening': 'Evening Glide',
    'hint.dawn': 'You are in an open power window. What matters most — is now.',
    'hint.morning': 'Sunset window is still ahead — save your strength.',
    'hint.day': 'Time to ground. Balance on the wrists.',
    'hint.sunset': 'This is your time. Take the main action now.',
    'hint.evening': 'Slow down. Cypress on the feet. Listen.',
    'brief.fallback_title': "Mentor's Brief",
    'good.morning': 'Good morning',
    'good.day': 'Good day',
    'good.sunset': 'Warm sunset',
    'good.night': 'Quiet night',
    'word.day': 'day',
    'word.days_few': 'days',
    'word.days_many': 'days',
    'btn.delete': 'Delete',
    'task.neutral': '⚖️ ordinary',
    'task.resource': '🌟 resource',
    'task.shadow': '🌑 shadow',
    'task.default_t1': 'Main task in the power window',
    'task.placeholder': 'Describe the task…',
    'water.remind_me': '⏰ Remind me',
    'water.reminders_on': '✓ Reminders on',
    'water.permission_needed': 'Allow notifications in your browser to receive reminders',
    'water.notif_title': '💧 ARKA',
    'water.notif_body': 'Water reminders on: at 12:00, 14:00, 16:00',
    'finance.actual': 'Actual $',
    'finance.target': 'Target $',
    'finance.name_placeholder': 'Channel name',
    // === MIRROR OF THE MOMENT (Hero AI) ===
    'mirror.enter': 'Enter',
    'mirror.return': '← Mirror',
    'mirror.dar_of_day_label': 'Your DAR today —',
    'mirror.period_dawn': 'Dawn. The strongest window of the day.',
    'mirror.period_morning': 'Morning. Time for the main thing.',
    'mirror.period_day': 'Noon. Time for calm tasks.',
    'mirror.period_sunset': 'Sunset power window.',
    'mirror.period_evening': 'Evening. Time to slow down.',
    'mirror.period_night': 'Night. Time for silence.',
    'mirror.teaser_d1': 'Enter — and ARKA will start to know you through the rhythm of your DAR.',
    'mirror.teaser_d2': "Enter — I already feel you entering the rhythm.",
    'mirror.teaser_d3': "Enter — today I'll show you the first pattern I've noticed.",
    'mirror.teaser_dN': 'Enter — your day is waiting.',
    // === SHARE CARD ===
    'share.download': 'Download',
    'share.send': 'Send',
    'share.default_quote': 'My day in ARKA',
    'share.day_prefix': 'Day ',
    'share.day_suffix': 'in ARKA',
    'share.tg_message': 'My day in ARKA',
    'share.mirror_quote_tpl': 'Today {dar} leads me',
    'tasks.no_tasks': "🌑 <b>No tasks for today.</b> Open the «Today» tab and write 1-3 main things. Without direction, the serpent circles without meaning.",
    'tasks.all_done': '🌟 <b>Today\'s tasks are done.</b> The TUMA flow runs smoothly. Don\'t add more — the flow of power matters more than the list of victories.',
    'tasks.partial': "⚖️ Today's tasks: <em>{done} of {total}</em>. The main thing — do the resourceful 🌟 in the power window.",
    'goal.progress': '🎯 Goal «<em>{title}</em>» — readiness <em>{pct}%</em>. ',
    'goal.slow': 'The pace is slow — choose <b>one step</b> for today.',
    'goal.fast': "You're in the flow. Don't rush.",
    'goal.steady': 'The wave is steady. One step — and the rhythm is held.',
    'goal.none': '🎯 <b>No goal in the strategy.</b> Open «Strategy» and name it — the serpent cannot glide without direction.',
    'fin.progress': '💧 Income flows: <em>{pct}%</em> of monthly goal. ',
    'fin.low': 'TUMA flows weakly — see which channel has dipped, and direct attention there today.',
    'fin.high': "The flow is strong. Don't accelerate artificially — hold the rhythm.",
    'fin.mid': 'The flow is moving. Today — the main action for the slowest channel.',
    // === WEEKLY REVIEW ===
    'weekly.header': '🐉 <b>Week Review — voice of Z-MAN</b>',
    'weekly.streak_line': "You've gone {streak} {days} along the serpent of time. That's not little — it's the path.",
    'weekly.flow_title': 'What was in the flow:',
    'weekly.tasks_done': '• {n} daily tasks closed — each mark makes the serpent stronger',
    'weekly.tasks_progress': '• Tasks in progress — keep going',
    'weekly.steps_done': '• {done} of {total} strategy steps — TUMA keeps moving',
    'weekly.content_done': '• {n} publications went out into the world — your voice is heard',
    'weekly.finance': '• Finances: {pct}% of the monthly goal',
    'weekly.notice_title': 'What the mentor noticed:',
    'weekly.no_steps': '• <em>No steps in the strategy</em> — name 3-5 for next week',
    'weekly.slow_pace': '• The pace is slower than expected — this is <em>not a problem</em>, but a signal. Slowing = gathering power. Ask yourself: which step matters most right now?',
    'weekly.good_pace': "• Good pace. Hold the rhythm, don't accelerate artificially",
    'weekly.advice_title': 'Advice for next week:',
    'weekly.advice_text': 'Choose <em>one main action</em> — the one that moves the goal most. Do it in the sunset power window (17:30–19:30). The rest — feed the rhythm.',
    'weekly.remember': "Remember: Z-MAN's eternal youth is a side effect of presence in the moment, not the result of a race.",
    // === OIL DESCRIPTIONS (popup) ===
    'oil.frankincense_desc': 'Presence in the moment, slowing of time, activation of LOGOS. The main oil for the Z-MAN DAR.',
    'oil.frankincense_meta': '1 drop on the palm · 3 slow inhales · returns you to «now»',
    'oil.vetiver_desc': 'Deep grounding, support at the base of the spine. Used only in the evening — can be sleep-inducing.',
    'oil.vetiver_meta': '1–2 drops on the feet · in the evening · dilute with a carrier on sensitive skin',
    'oil.cypress_desc': 'TUMA flow, movement of time, fluidity. Releases being stuck in the past and the fear of change.',
    'oil.cypress_meta': '1 drop on the wrists · during the day · pairs with Vetiver',
    'oil.balance_desc': 'Anchor of the LOGOS triangle, return to «now». Composition: Spruce, Ho Wood, Frankincense, Blue Tansy, Blue Chamomile.',
    'oil.balance_meta': '1 drop on the inside of the wrists · rub · bring to the nose',
    'oil.lavender_desc': 'A soft transition into restoration, the night glide. ⚠ Strictly 1–2 drops — more gives the opposite effect.',
    'oil.lavender_meta': '1–2 drops on the pillow · before sleep · more = overstimulation',
    'oil.serenity_desc': 'Restoration after a dense day, gentle support at the moment of falling asleep.',
    'oil.serenity_meta': '1–2 drops in the diffuser · in the evening · good paired with Lavender',
    // === MENTOR BRIEF (dynamic parts) ===
    'brief.content_planned': '📢 {n} publications are waiting in the content plan. Today — close one, no more.',
    'brief.sunday': '📜 <b>Sunday evening.</b> Run the week review — the serpent will sum up the seven days.',
    'brief.day_under_arka': 'Today — day {n} under ARKA.',
    // === AI HELPER ===
    'ai.loading': '🐉 the serpent glides through time…',
    'ai.not_understood': "Didn't get the command. Try again.",
    'ai.your_goal': 'your goal',
    'ai.word_finance': 'Finances',
    'ai.word_promo': 'Promotion',
    'ai.advice_stuck': '🐉 <b>The serpent of time says:</b><br><br>When the TUMA flow meets a stone, it does not break it — it <em>flows around</em>. Slow down. Sit by water or turn on the tap — let it babble. Put Frankincense on your palm. Don\'t push toward the step — let it come to you.<br><br><b>Right now:</b><br>{now}<br><br><em>DAR aspect:</em> being stuck is healed by presence, not pushing.',
    'ai.advice_stuck_goal': 'Take «{goal}» and ask not «how to do it?», but «what in this task itself wants to emerge?». Write down the first thing that comes.',
    'ai.advice_stuck_nogoal': 'Name the goal in the first field — the serpent cannot glide without direction.',
    'ai.advice_overload': '🐉 <b>Z-MAN reminds you:</b><br><br>Time is not an enemy that runs away. Time is a serpent you <em>slow down</em>. Overload = you lost your rhythm and adjusted to someone else\'s.<br><br><b>Support:</b><br>1. Barefoot on the floor for 2 minutes. Activate LOGOS.<br>2. Reduce the day\'s tasks to <b>one</b> resourceful 🌟. Mark the rest as shadow 🌑 or delete them.<br>3. A drop of Balance on the wrists.<br><br><em>In the archetype:</em> eternal youth belongs not to those who did everything — but to those who live now.',
    'ai.advice_fear': '🐉 <b>Listen:</b><br><br>Fear is the future that peeked into your present. The serpent can glide there. Ask: <em>what exactly do I see there?</em> Say it aloud.<br><br><b>Practice:</b><br>Vetiver on the feet. Palms — on the base of the spine. 7 slow exhales longer than the inhales. Return to «now».<br><br><em>Z-MAN shadow:</em> being stuck in the future. <em>Support:</em> the LOGOS triangle.',
    'ai.advice_money': '🐉 <b>For movement and money:</b><br><br>Z-MAN speeds up routine and slows down the important. {what} come to you when you are <b>in the moment</b>, not in a race.<br><br><b>What to do:</b><br>{action}<br>Do it in the <em>sunset power window</em> (17:30–19:30). Before — Cypress + Vetiver.<br><br><em>In the archetype:</em> money is the TUMA flow. Don\'t catch it — direct it.',
    'ai.advice_money_goal': 'For «{goal}» — choose 1 main action this week. Not 10. One.',
    'ai.advice_money_nogoal': "First name the goal — without it the dragon doesn't know where to swim.",
    'ai.advice_generic': '🐉 <b>Advice of the day in the Z-MAN archetype:</b><br><br>{body}<br><br><b>Today:</b> take one action in the power window (5:30–7:30 or 17:30–19:30). Before — the oil of the day (Frankincense in the morning, Cypress in the evening).<br><br><em>DAR principle:</em> eternal youth is a side effect of presence. Don\'t rush.',
    'ai.advice_generic_goal': 'Your goal «{goal}» is not a point far away. It is a <em>destination that already exists</em>. The serpent of time can glide there, and you can move fast or slow — the main thing is not to lose direction.',
    'ai.advice_generic_nogoal': 'Name the goal in the first field. Without direction the serpent of eternity circles without meaning.',
    'ai.forecast_nogoal': '🐉 <b>A forecast is impossible without direction.</b><br><br>The serpent of time can glide into the future, but only if there is a point of arrival. Name the goal in the first field — and I will calculate the pace.',
    'ai.forecast_dateinfo': '<b>{days}</b> {daysWord} left until «{deadline}».<br>Plan readiness: <b>{speed}%</b> ({done} of {total} steps).<br><br>{tempo}',
    'ai.forecast_tempo_fast': "🌟 <b>Z-MAN pace:</b> you're in the flow. Don't accelerate artificially.",
    'ai.forecast_tempo_mid': '⚖️ <b>TUMA pace:</b> the wave moves steadily. One step in the power window — and you hold the rhythm.',
    'ai.forecast_tempo_slow': "🌑 <b>LOGOS signal:</b> the pace is below the wave. Don't panic — choose <em>one step</em> and do it in the sunset window.",
    'ai.forecast_no_deadline': 'Set a deadline — the serpent glides faster when there is a shore.<br><br>',
    'ai.forecast_result': '🐉 <b>Forecast for «{goal}»:</b><br><br>{dateInfo}<br><em>What matters for Z-MAN:</em> you can slow down and speed up. If you get tired — slow down for a day, stay in practice. Speed will return on its own.',
    'ai.correct_nogoal': '🐉 <b>No goal — nothing to correct.</b><br><br>First the direction, then the course. Name the goal in the first field.',
    'ai.correct_result': '🐉 <b>Course correction:</b><br><br>{step}<br><br><b>Z-MAN pace:</b><br>• <em>Speed up</em> — routine tasks, marketing mailings, small things<br>• <em>Slow down</em> — important decisions, texts, key meetings<br><br><em>Principle:</em> the serpent does not break the plan — it reassembles it while you breathe.',
    'ai.correct_step': 'The nearest undone step — <b>«{step}»</b>.<br><br>Break it into the <em>smallest possible action</em>: what you can do right now in 10 minutes. Not globally — minutely.',
    'ai.correct_nostep': "All steps are either done or empty. If the goal isn't reached — the plan lacks steps. Add 2-3 concrete actions.",
    // === STEP SUGGESTIONS ===
    'suggest.title': '🐉 Steps in the Z-MAN archetype',
    'suggest.take': '＋ Take',
    'suggest.added': '✓ Added',
    'suggest.note': 'These are suggestions — adjust them to yourself or add your own.',
    'suggest.no_goal': '⚠ First name the goal in the first field — without direction the serpent circles without meaning',
    'suggest.book_1': 'Record on a voice recorder the main idea of the book — what you want to convey, in one phrase',
    'suggest.book_2': 'Build the structure: 5–7 key blocks, no details',
    'suggest.book_3': 'Write 1 pilot chapter in the sunset window (17:30–19:30)',
    'suggest.book_4': 'Find 3 people from your audience — ask them 1 question about a pain/desire',
    'suggest.book_5': 'Launch a mini-announcement on Telegram before it\'s ready (the TUMA flow needs movement)',
    'suggest.book_6': 'Set a concrete date for the pilot publication — the serpent needs a shore',
    'suggest.yupdar_1': 'Define the main segment: who pays first — name one real person',
    'suggest.yupdar_2': 'Describe in one paragraph «what a person gets for the plan» — without jargon',
    'suggest.yupdar_3': 'Prepare 3 onboarding messages for a new subscriber (day 1 / 3 / 7)',
    'suggest.yupdar_4': 'Run a closed beta test with 5–10 people from your circle',
    'suggest.yupdar_5': 'Collect feedback after 7 days — 3 questions, no more',
    'suggest.yupdar_6': 'Refine one key feature based on feedback',
    'suggest.promo_1': 'Formulate the main promise: «after interacting with me, a person gets...»',
    'suggest.promo_2': 'Record 5 short video stories — one important thought in each',
    'suggest.promo_3': 'Publish story #1 in the sunset window and don\'t peek at stats for 24 hours',
    'suggest.promo_4': 'Arrange a collaboration with 2 kindred-spirit projects',
    'suggest.promo_5': 'Create a simple invitation page with one button',
    'suggest.promo_6': 'Set a launch day for the flow — a concrete date',
    'suggest.iram_1': 'Live with the ARKA prototype for 5–7 days — note what resonated and what didn\'t',
    'suggest.iram_2': 'Fill in the field template for your Z-MAN DAR in dar-content.json',
    'suggest.iram_3': 'Agree with the team on the architecture of 3 DBs: oils, practices, stones',
    'suggest.iram_4': 'Embed the «Path» tab inside YupDar after stabilizing plans and languages',
    'suggest.iram_5': 'Launch a closed beta for 5 active YupDar users',
    'suggest.iram_6': 'Launch a public «Path of the DAR» plan at a base price',
    'suggest.income_1': 'Name the amount you want — not «more», but a concrete figure',
    'suggest.income_2': 'Break it across 4 flows: which channels → how much each gives',
    'suggest.income_3': 'Find the weakest channel → one strengthening task per week',
    'suggest.income_4': 'Create a «price ladder»: from a free entry to the main offer',
    'suggest.income_5': 'Make one public offer / invitation in the power window',
    'suggest.income_6': 'After 30 days — check actual vs. plan, adjust',
    'suggest.generic_1': 'Describe the desired result in one phrase: «when the goal is reached, I will be...»',
    'suggest.generic_2': 'Find the main obstacle — what holds you back the most',
    'suggest.generic_3': 'Formulate the first action you can do in 30 minutes',
    'suggest.generic_4': 'Ask one person who is already at this point: what is important to know?',
    'suggest.generic_5': 'Take one visible action in the sunset window — a post / call / letter',
    'suggest.generic_6': 'Set a date for the next progress check',
    // === CONTENT PLAN CHANNELS ===
    'channel.article': 'Article',
    'channel.book': 'Book'
  },
  es: {
    'greet.dawn': 'Amanecer — Ventana de Poder',
    'greet.morning': 'Informe Matutino',
    'greet.day': 'Ancla del Día',
    'greet.sunset': 'Ventana de Poder del Atardecer',
    'greet.evening': 'Deslizamiento Vespertino',
    'hint.dawn': 'Estás en una ventana de poder abierta. Lo más importante — es ahora.',
    'hint.morning': 'La ventana del atardecer aún está por delante — reserva tus fuerzas.',
    'hint.day': 'Hora de aterrizar. Balance en las muñecas.',
    'hint.sunset': 'Este es tu tiempo. Realiza la acción principal ahora.',
    'hint.evening': 'Reduce el ritmo. Cypress en los pies. Escucha.',
    'brief.fallback_title': 'Informe del Mentor',
    'good.morning': 'Buenos días',
    'good.day': 'Buen día',
    'good.sunset': 'Cálido atardecer',
    'good.night': 'Tranquila noche',
    'word.day': 'día',
    'word.days_few': 'días',
    'word.days_many': 'días',
    'btn.delete': 'Eliminar',
    'task.neutral': '⚖️ ordinaria',
    'task.resource': '🌟 de recurso',
    'task.shadow': '🌑 de sombra',
    'task.default_t1': 'Tarea principal en la ventana de poder',
    'task.placeholder': 'Describe la tarea…',
    'water.remind_me': '⏰ Recordarme',
    'water.reminders_on': '✓ Recordatorios activados',
    'water.permission_needed': 'Permite las notificaciones en tu navegador para recibir recordatorios',
    'water.notif_title': '💧 ARKA',
    'water.notif_body': 'Recordatorios de agua activados: a las 12:00, 14:00, 16:00',
    'finance.actual': 'Real $',
    'finance.target': 'Meta $',
    'finance.name_placeholder': 'Nombre del canal',
    // === ESPEJO DEL MOMENTO (Hero IA) ===
    'mirror.enter': 'Entra',
    'mirror.return': '← Espejo',
    'mirror.dar_of_day_label': 'Tu DAR hoy —',
    'mirror.period_dawn': 'Amanecer. La ventana más fuerte del día.',
    'mirror.period_morning': 'Mañana. Hora para lo principal.',
    'mirror.period_day': 'Mediodía. Hora para tareas tranquilas.',
    'mirror.period_sunset': 'Ventana de poder del atardecer.',
    'mirror.period_evening': 'Tarde. Hora de bajar el ritmo.',
    'mirror.period_night': 'Noche. Hora del silencio.',
    'mirror.teaser_d1': 'Entra — y ARKA empezará a conocerte a través del ritmo de tu DAR.',
    'mirror.teaser_d2': 'Entra — ya siento cómo entras en el ritmo.',
    'mirror.teaser_d3': 'Entra — hoy te mostraré el primer patrón que he notado.',
    'mirror.teaser_dN': 'Entra — tu día te espera.',
    // === TARJETA PARA COMPARTIR ===
    'share.download': 'Descargar',
    'share.send': 'Enviar',
    'share.default_quote': 'Mi día en ARKA',
    'share.day_prefix': 'Día ',
    'share.day_suffix': 'en ARKA',
    'share.tg_message': 'Mi día en ARKA',
    'share.mirror_quote_tpl': 'Hoy {dar} me guía',
    'tasks.no_tasks': '🌑 <b>No hay tareas para hoy.</b> Abre la pestaña «Hoy» y escribe 1-3 tareas principales. Sin dirección, la serpiente gira sin sentido.',
    'tasks.all_done': '🌟 <b>Las tareas del día están hechas.</b> El flujo TUMA corre suave. No añadas más — el flujo de poder importa más que la lista de victorias.',
    'tasks.partial': '⚖️ Tareas del día: <em>{done} de {total}</em>. Lo principal — hacer la tarea de recurso 🌟 en la ventana de poder.',
    'goal.progress': '🎯 Meta «<em>{title}</em>» — preparación <em>{pct}%</em>. ',
    'goal.slow': 'El ritmo es lento — elige <b>un paso</b> para hoy.',
    'goal.fast': 'Estás en el flujo. No te apresures.',
    'goal.steady': 'La ola es estable. Un paso — y el ritmo se mantiene.',
    'goal.none': '🎯 <b>No hay meta en la estrategia.</b> Abre «Estrategia» y nómbrala — la serpiente no puede deslizarse sin dirección.',
    'fin.progress': '💧 Flujos de ingresos: <em>{pct}%</em> de la meta mensual. ',
    'fin.low': 'TUMA fluye débilmente — mira qué canal se ha hundido y dirige tu atención allí hoy.',
    'fin.high': 'El flujo es fuerte. No aceleres artificialmente — mantén el ritmo.',
    'fin.mid': 'El flujo se mueve. Hoy — la acción principal para el canal más lento.',
    // === REVISIÓN SEMANAL ===
    'weekly.header': '🐉 <b>Revisión semanal — voz de Z-MAN</b>',
    'weekly.streak_line': 'Has recorrido {streak} {days} por la serpiente del tiempo. No es poco — es el camino.',
    'weekly.flow_title': 'Lo que estuvo en el flujo:',
    'weekly.tasks_done': '• {n} tareas del día cerradas — cada marca hace más fuerte a la serpiente',
    'weekly.tasks_progress': '• Tareas en proceso — seguimos',
    'weekly.steps_done': '• {done} de {total} pasos de estrategia — TUMA sigue avanzando',
    'weekly.content_done': '• {n} publicaciones salieron al mundo — tu voz se escucha',
    'weekly.finance': '• Finanzas: {pct}% de la meta mensual',
    'weekly.notice_title': 'Lo que notó el mentor:',
    'weekly.no_steps': '• <em>No hay pasos en la estrategia</em> — nombra 3-5 para la próxima semana',
    'weekly.slow_pace': '• El ritmo es más lento de lo esperado — esto <em>no es un problema</em>, sino una señal. Desacelerar = acumular fuerza. Pregúntate: ¿qué paso importa más ahora?',
    'weekly.good_pace': '• Buen ritmo. Mantén el ritmo, no aceleres artificialmente',
    'weekly.advice_title': 'Consejo para la próxima semana:',
    'weekly.advice_text': 'Elige <em>una acción principal</em> — la que mueva más la meta. Hazla en la ventana de poder del atardecer (17:30–19:30). Lo demás — alimenta el ritmo.',
    'weekly.remember': 'Recuerda: la eterna juventud de Z-MAN es un efecto secundario de la presencia en el momento, no el resultado de una carrera.',
    // === DESCRIPCIONES DE ACEITES (popup) ===
    'oil.frankincense_desc': 'Presencia en el momento, desaceleración del tiempo, activación de LOGOS. El aceite principal para el DAR Z-MAN.',
    'oil.frankincense_meta': '1 gota en la palma · 3 inhalaciones lentas · te devuelve al «ahora»',
    'oil.vetiver_desc': 'Enraizamiento profundo, apoyo en la base de la columna. Se usa solo de noche — puede inducir sueño.',
    'oil.vetiver_meta': '1–2 gotas en los pies · de noche · diluir con portador en piel sensible',
    'oil.cypress_desc': 'Flujo TUMA, movimiento del tiempo, fluidez. Libera el atascamiento en el pasado y el miedo al cambio.',
    'oil.cypress_meta': '1 gota en las muñecas · durante el día · combina con Vetiver',
    'oil.balance_desc': 'Ancla del triángulo LOGOS, regreso al «ahora». Composición: Spruce, Ho Wood, Frankincense, Blue Tansy, Blue Chamomile.',
    'oil.balance_meta': '1 gota en la parte interna de las muñecas · frotar · acercar a la nariz',
    'oil.lavender_desc': 'Una transición suave hacia la restauración, el deslizamiento nocturno. ⚠ Estrictamente 1–2 gotas — más da el efecto contrario.',
    'oil.lavender_meta': '1–2 gotas en la almohada · antes de dormir · más = sobreexcitación',
    'oil.serenity_desc': 'Restauración tras un día denso, apoyo suave en el momento de conciliar el sueño.',
    'oil.serenity_meta': '1–2 gotas en el difusor · de noche · bien en pareja con Lavender',
    // === INFORME DEL MENTOR (partes dinámicas) ===
    'brief.content_planned': '📢 {n} publicaciones esperan en el plan de contenido. Hoy — cierra una, no más.',
    'brief.sunday': '📜 <b>Domingo por la noche.</b> Lanza la revisión semanal — la serpiente resumirá los siete días.',
    'brief.day_under_arka': 'Hoy — día {n} bajo ARKA.',
    // === ASISTENTE IA ===
    'ai.loading': '🐉 la serpiente se desliza por el tiempo…',
    'ai.not_understood': 'No entendí el comando. Inténtalo de nuevo.',
    'ai.your_goal': 'tu meta',
    'ai.word_finance': 'Las finanzas',
    'ai.word_promo': 'La promoción',
    'ai.advice_stuck': '🐉 <b>La serpiente del tiempo dice:</b><br><br>Cuando el flujo TUMA encuentra una piedra, no la rompe — la <em>rodea</em>. Desacelera. Siéntate junto al agua o abre el grifo — deja que murmure. Pon Frankincense en tu palma. No te lances al paso — deja que llegue a ti.<br><br><b>Ahora mismo:</b><br>{now}<br><br><em>Aspecto del DAR:</em> el atascamiento se cura con presencia, no empujando.',
    'ai.advice_stuck_goal': 'Toma «{goal}» y pregunta no «¿cómo hacerlo?», sino «¿qué quiere emerger por sí mismo en esta tarea?». Anota lo primero que venga.',
    'ai.advice_stuck_nogoal': 'Nombra la meta en el primer campo — la serpiente no puede deslizarse sin dirección.',
    'ai.advice_overload': '🐉 <b>Z-MAN te recuerda:</b><br><br>El tiempo no es un enemigo que huye. El tiempo es una serpiente que tú <em>desaceleras</em>. La sobrecarga = perdiste tu ritmo y te ajustaste al ajeno.<br><br><b>Apoyo:</b><br>1. Descalza en el suelo 2 minutos. Activa LOGOS.<br>2. Reduce las tareas del día a <b>una</b> de recurso 🌟. Marca el resto como sombra 🌑 o elimínalas.<br>3. Una gota de Balance en las muñecas.<br><br><em>En el arquetipo:</em> la eterna juventud no es de quienes lo hicieron todo — sino de quienes viven ahora.',
    'ai.advice_fear': '🐉 <b>Escucha:</b><br><br>El miedo es el futuro que se asomó a tu presente. La serpiente puede deslizarse allí. Pregunta: <em>¿qué veo exactamente allí?</em> Dilo en voz alta.<br><br><b>Práctica:</b><br>Vetiver en los pies. Palmas — en la base de la columna. 7 exhalaciones lentas más largas que las inhalaciones. Regreso al «ahora».<br><br><em>Sombra de Z-MAN:</em> atascarse en el futuro. <em>Apoyo:</em> el triángulo LOGOS.',
    'ai.advice_money': '🐉 <b>Para el movimiento y el dinero:</b><br><br>Z-MAN acelera la rutina y desacelera lo importante. {what} llegan a ti cuando estás <b>en el momento</b>, no en una carrera.<br><br><b>Qué hacer:</b><br>{action}<br>Hazlo en la <em>ventana de poder del atardecer</em> (17:30–19:30). Antes — Cypress + Vetiver.<br><br><em>En el arquetipo:</em> el dinero es el flujo TUMA. No lo atrapes — diríjelo.',
    'ai.advice_money_goal': 'Para «{goal}» — elige 1 acción principal esta semana. No 10. Una.',
    'ai.advice_money_nogoal': 'Primero nombra la meta — sin ella el dragón no sabe hacia dónde nadar.',
    'ai.advice_generic': '🐉 <b>Consejo del día en el arquetipo Z-MAN:</b><br><br>{body}<br><br><b>Hoy:</b> realiza una acción en la ventana de poder (5:30–7:30 o 17:30–19:30). Antes — el aceite del día (Frankincense por la mañana, Cypress por la tarde).<br><br><em>Principio del DAR:</em> la eterna juventud es un efecto secundario de la presencia. No te apresures.',
    'ai.advice_generic_goal': 'Tu meta «{goal}» no es un punto lejano. Es un <em>destino que ya existe</em>. La serpiente del tiempo puede deslizarse allí, y puedes ir rápido o lento — lo importante es no perder la dirección.',
    'ai.advice_generic_nogoal': 'Nombra la meta en el primer campo. Sin dirección la serpiente de la eternidad gira sin sentido.',
    'ai.forecast_nogoal': '🐉 <b>Un pronóstico es imposible sin dirección.</b><br><br>La serpiente del tiempo puede deslizarse al futuro, pero solo si hay un punto de llegada. Nombra la meta en el primer campo — y calcularé el ritmo.',
    'ai.forecast_dateinfo': 'Quedan <b>{days}</b> {daysWord} hasta «{deadline}».<br>Preparación del plan: <b>{speed}%</b> ({done} de {total} pasos).<br><br>{tempo}',
    'ai.forecast_tempo_fast': '🌟 <b>Ritmo Z-MAN:</b> estás en el flujo. No aceleres artificialmente.',
    'ai.forecast_tempo_mid': '⚖️ <b>Ritmo TUMA:</b> la ola avanza estable. Un paso en la ventana de poder — y mantienes el ritmo.',
    'ai.forecast_tempo_slow': '🌑 <b>Señal LOGOS:</b> el ritmo está por debajo de la ola. No entres en pánico — elige <em>un paso</em> y hazlo en la ventana del atardecer.',
    'ai.forecast_no_deadline': 'Pon un plazo — la serpiente se desliza más rápido cuando hay una orilla.<br><br>',
    'ai.forecast_result': '🐉 <b>Pronóstico para «{goal}»:</b><br><br>{dateInfo}<br><em>Lo que importa para Z-MAN:</em> puedes desacelerar y acelerar. Si te cansas — desacelera un día, quédate en la práctica. La velocidad volverá sola.',
    'ai.correct_nogoal': '🐉 <b>Sin meta — nada que corregir.</b><br><br>Primero la dirección, luego el rumbo. Nombra la meta en el primer campo.',
    'ai.correct_result': '🐉 <b>Corrección de rumbo:</b><br><br>{step}<br><br><b>Ritmo Z-MAN:</b><br>• <em>Acelerar</em> — tareas rutinarias, envíos de marketing, pequeñeces<br>• <em>Desacelerar</em> — decisiones importantes, textos, reuniones clave<br><br><em>Principio:</em> la serpiente no rompe el plan — lo recompone mientras respiras.',
    'ai.correct_step': 'El paso más cercano sin hacer — <b>«{step}»</b>.<br><br>Divídelo en la <em>acción más pequeña posible</em>: lo que puedas hacer ahora mismo en 10 minutos. No a lo grande — al detalle.',
    'ai.correct_nostep': 'Todos los pasos están hechos o vacíos. Si la meta no se alcanza — al plan le faltan pasos. Añade 2-3 acciones concretas.',
    // === SUGERENCIAS DE PASOS ===
    'suggest.title': '🐉 Pasos en el arquetipo Z-MAN',
    'suggest.take': '＋ Tomar',
    'suggest.added': '✓ Añadido',
    'suggest.note': 'Son sugerencias — ajústalas a ti o añade las tuyas.',
    'suggest.no_goal': '⚠ Primero nombra la meta en el primer campo — sin dirección la serpiente gira sin sentido',
    'suggest.book_1': 'Graba en una grabadora la idea principal del libro — qué quieres transmitir, en una frase',
    'suggest.book_2': 'Construye la estructura: 5–7 bloques clave, sin detalles',
    'suggest.book_3': 'Escribe 1 capítulo piloto en la ventana del atardecer (17:30–19:30)',
    'suggest.book_4': 'Encuentra a 3 personas de tu audiencia — hazles 1 pregunta sobre un dolor/deseo',
    'suggest.book_5': 'Lanza un mini-anuncio en Telegram antes de que esté listo (el flujo TUMA necesita movimiento)',
    'suggest.book_6': 'Fija una fecha concreta para la publicación piloto — la serpiente necesita una orilla',
    'suggest.yupdar_1': 'Define el segmento principal: quién paga primero — nombra a una persona real',
    'suggest.yupdar_2': 'Describe en un párrafo «qué obtiene una persona por el plan» — sin tecnicismos',
    'suggest.yupdar_3': 'Prepara 3 mensajes de onboarding para un nuevo suscriptor (día 1 / 3 / 7)',
    'suggest.yupdar_4': 'Lanza una prueba beta cerrada con 5–10 personas de tu círculo',
    'suggest.yupdar_5': 'Recoge feedback tras 7 días — 3 preguntas, no más',
    'suggest.yupdar_6': 'Mejora una función clave según el feedback',
    'suggest.promo_1': 'Formula la promesa principal: «tras interactuar conmigo, una persona obtiene...»',
    'suggest.promo_2': 'Graba 5 videos cortos de historias — un pensamiento importante en cada uno',
    'suggest.promo_3': 'Publica la historia n.º1 en la ventana del atardecer y no mires las estadísticas durante 24 horas',
    'suggest.promo_4': 'Acuerda una colaboración con 2 proyectos afines de espíritu',
    'suggest.promo_5': 'Crea una página de invitación sencilla con un solo botón',
    'suggest.promo_6': 'Fija un día de inicio del flujo — una fecha concreta',
    'suggest.iram_1': 'Vive con el prototipo de ARKA 5–7 días — anota qué resonó y qué no',
    'suggest.iram_2': 'Rellena la plantilla de campos para tu DAR Z-MAN en dar-content.json',
    'suggest.iram_3': 'Acuerda con el equipo la arquitectura de 3 BD: oils, practices, stones',
    'suggest.iram_4': 'Integra la pestaña «Camino» dentro de YupDar tras estabilizar planes e idiomas',
    'suggest.iram_5': 'Lanza una beta cerrada para 5 usuarios activos de YupDar',
    'suggest.iram_6': 'Lanza un plan público «Camino del DAR» a un precio base',
    'suggest.income_1': 'Nombra la cantidad que quieres — no «más», sino una cifra concreta',
    'suggest.income_2': 'Distribúyela en 4 flujos: qué canales → cuánto da cada uno',
    'suggest.income_3': 'Encuentra el canal más débil → una tarea de refuerzo por semana',
    'suggest.income_4': 'Crea una «escalera de precios»: desde la entrada gratuita hasta la oferta principal',
    'suggest.income_5': 'Haz una oferta / invitación pública en la ventana de poder',
    'suggest.income_6': 'Tras 30 días — cotejo real/plan, ajuste',
    'suggest.generic_1': 'Describe el resultado deseado en una frase: «cuando la meta esté lograda, yo seré...»',
    'suggest.generic_2': 'Encuentra el obstáculo principal — lo que más te retiene',
    'suggest.generic_3': 'Formula la primera acción que puedas hacer en 30 minutos',
    'suggest.generic_4': 'Pregunta a una persona que ya esté en este punto: ¿qué es importante saber?',
    'suggest.generic_5': 'Haz una acción visible en la ventana del atardecer — publicación / llamada / carta',
    'suggest.generic_6': 'Fija una fecha para la próxima revisión del progreso',
    // === CANALES DEL PLAN DE CONTENIDO ===
    'channel.article': 'Artículo',
    'channel.book': 'Libro'
  }
};
function dynLang() {
  // Главный YupDar пишет язык в '_yupdar_lang', preview-версия — в '_yupdar_preview_lang'.
  // Читаем ОБА, как getArkaLang() в index.html. Раньше тут был только preview-ключ —
  // в проде язык лежит в '_yupdar_lang', поэтому ВСЕ динамические строки (типы задач,
  // дефолтная задача, советы наставника) падали на ru при EN/ES интерфейсе.
  const KEYS = ['_yupdar_lang', '_yupdar_preview_lang'];
  for (const KEY of KEYS) {
    try { const v = window.parent.localStorage.getItem(KEY); if (v && ARKA_DYN_I18N[v]) return v; } catch (e) {}
    try { const v = localStorage.getItem(KEY); if (v && ARKA_DYN_I18N[v]) return v; } catch (e) {}
  }
  return 'ru';
}
function dt(key, params) {
  const lang = dynLang();
  // Ищем сначала в ARKA_DYN_I18N (для динамических строк из JS),
  // затем в ARKA_I18N (для статичных HTML-ключей)
  let str = (ARKA_DYN_I18N[lang] && ARKA_DYN_I18N[lang][key])
         || (ARKA_DYN_I18N.ru && ARKA_DYN_I18N.ru[key]);
  if (str === undefined) {
    // ARKA_I18N определён в HTML script-блоке — может быть недоступен в момент загрузки app.js
    try {
      if (typeof ARKA_I18N !== 'undefined') {
        str = (ARKA_I18N[lang] && ARKA_I18N[lang][key])
           || (ARKA_I18N.ru && ARKA_I18N.ru[key]);
      }
    } catch (e) {}
  }
  if (str === undefined) str = key;
  if (params) {
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
    });
  }
  return str;
}

// ── Иконка ЛИЧНОГО Дара пользователя (заменяет 🐉) ────────────────
// Берём профиль из localStorage основного приложения, ищем код Дара,
// возвращаем <img> с PNG-глифом из /dar-png-map.json.
// Если профиль не рассчитан — fallback на нейтральный сакральный символ ✦
let _userDarIconCache = null;
let _darPngMap = null;
function loadDarPngMap() {
  if (_darPngMap !== null) return _darPngMap;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/dar-png-map.json', false);
    xhr.send();
    if (xhr.status === 200) _darPngMap = JSON.parse(xhr.responseText);
    else _darPngMap = {};
  } catch (e) { _darPngMap = {}; }
  return _darPngMap;
}
function getUserDarIconHtml(size, extraStyle) {
  size = size || 24;
  extraStyle = extraStyle || '';
  // Попытка взять из window.parent
  let profile = null;
  try { profile = JSON.parse(window.parent.localStorage.getItem('_yupdar_preview_profile') || 'null'); } catch (e) {}
  if (!profile) {
    try { profile = JSON.parse(localStorage.getItem('_yupdar_preview_profile') || 'null'); } catch (e) {}
  }
  // Код Дара (синтез) — формат 'X-Y-Z'
  let code = null;
  if (profile) {
    if (profile.synthesis && profile.synthesis.code) code = profile.synthesis.code;
    else if (profile.code) code = profile.code;
    else if (profile.oda && profile.tuna && profile.tria) {
      code = profile.oda.digit + '-' + profile.tuna.digit + '-' + profile.tria.digit;
    }
  }
  const map = loadDarPngMap();
  const file = code && map[code] ? map[code] : null;
  if (file) {
    const src = '/dar-png/' + encodeURIComponent(file);
    return '<img class="user-dar-ic" src="' + src + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle;' + extraStyle + '" onerror="this.outerHTML=\'<span style=&quot;font-size:' + Math.round(size*0.8) + 'px&quot;>✦</span>\'">';
  }
  // Fallback: нейтральный сакральный символ
  return '<span class="user-dar-fallback" style="font-size:' + Math.round(size*0.85) + 'px;vertical-align:middle;' + extraStyle + '">✦</span>';
}

// Заменить все статичные 🐉 в DOM на иконку личного Дара
function replaceArkaDragons() {
  try {
    // Атрибуты с эмодзи (textContent)
    const all = document.querySelectorAll('[data-i18n], .tab-emoji, .streak-icon, .mirror-icon, .ts-icon, .card-icon, .mentor-badge, .dr-dragon, .cm-dragon-btn, .suggest-btn, .evo-ai-title, .mentor-btn, .demo-banner');
    all.forEach(el => {
      if (el.innerHTML && el.innerHTML.indexOf('🐉') !== -1) {
        // Сохраняем структуру — заменяем 🐉 на placeholder
        el.innerHTML = el.innerHTML.replace(/🐉/g, getUserDarIconHtml(20, 'margin-right:4px;'));
      }
    });
    // Иконка зеркала — крупнее
    const mIcon = document.querySelector('#arkaMirror .mirror-icon');
    if (mIcon && mIcon.textContent.trim() === '🐉') {
      mIcon.innerHTML = getUserDarIconHtml(72, 'filter:drop-shadow(0 0 18px rgba(212,175,55,0.5));');
    }
    // Бэйдж стрика
    const streak = document.querySelector('.streak-icon');
    if (streak && streak.textContent.trim() === '🐉') {
      streak.innerHTML = getUserDarIconHtml(22);
    }
  } catch (e) {}
}

// ── Приветствие ──────────────────────────────────────
// Шапка с приветствием убрана как дубль главного приложения (16.05.2026).
// Функция оставлена для совместимости, но безопасно проверяет наличие элемента.
function setGreeting() {
  const el = document.getElementById('timeOfDay');
  if (!el) return;
  const h = new Date().getHours();
  let txt = dt('good.morning');
  if (h >= 12 && h < 17) txt = dt('good.day');
  else if (h >= 17 && h < 22) txt = dt('good.sunset');
  else if (h >= 22 || h < 5) txt = dt('good.night');
  el.textContent = txt;
}

// ── Табы ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach(c =>
        c.classList.toggle('active', c.dataset.tabContent === tab)
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ── Чек-листы ритуалов ───────────────────────────────
// ── Фокус по времени дня: показываем только актуальный ритуал ───────
// Снимает перегруз во вкладке «Сегодня» — глаза не разбегаются.
function getCurrentPeriod() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return 'dawn';   // утро
  if (h >= 12 && h < 17) return 'day';    // дневной якорь
  if (h >= 17 && h < 20) return 'dusk';   // главное окно силы
  return 'night';                          // вечер/ночь
}

function focusTodayByTime() {
  const current = getCurrentPeriod();
  const today = document.querySelector('[data-tab-content="today"]');
  if (!today) return;
  // Собираем ВСЕ карточки «Сегодня» в один аккордеон
  const groups = [];
  // 1) Окна силы — закрыто по умолчанию (информация о биоритме)
  const pw = today.querySelector('.power-window');
  if (pw) groups.push({ el: pw, headerSel: null, defaultOpen: false, type: 'pw' });
  // 2) Важные дела
  const tasks = today.querySelector('.tasks-card');
  if (tasks) groups.push({ el: tasks, headerSel: '.card-header', defaultOpen: false, type: 'tasks' });
  // 3) Ритуалы по периодам
  today.querySelectorAll('.ritual[data-ritual]').forEach(r => {
    groups.push({ el: r, headerSel: '.ritual-header', defaultOpen: r.dataset.ritual === current, type: 'ritual' });
  });
  // Прогресс не делаем сворачиваемым (он мелкий, всегда внизу)

  // Применяем классы и навешиваем клики
  groups.forEach((g, idx) => {
    g.el.classList.add('today-foldable');
    if (g.defaultOpen) g.el.classList.remove('today-folded');
    else g.el.classList.add('today-folded');

    // Для ритуалов поддерживаем старые классы
    if (g.type === 'ritual') {
      g.el.classList.toggle('ritual-active', g.defaultOpen);
      g.el.classList.toggle('ritual-folded', !g.defaultOpen);
    }

    const header = g.headerSel ? g.el.querySelector(g.headerSel) : g.el;
    if (!header) return;
    if (header.dataset.fold) return;
    header.dataset.fold = '1';
    header.style.cursor = 'pointer';
    header.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a, select, textarea, label, details, summary, .ritual-time')) return;
      const isOpen = !g.el.classList.contains('today-folded');
      if (isOpen) {
        g.el.classList.add('today-folded');
        if (g.type === 'ritual') {
          g.el.classList.remove('ritual-active');
          g.el.classList.add('ritual-folded');
        }
      } else {
        // Сворачиваем все остальные карточки в «Сегодня»
        groups.forEach(o => {
          if (o === g) return;
          o.el.classList.add('today-folded');
          if (o.type === 'ritual') {
            o.el.classList.remove('ritual-active');
            o.el.classList.add('ritual-folded');
          }
        });
        g.el.classList.remove('today-folded');
        if (g.type === 'ritual') {
          g.el.classList.remove('ritual-folded');
          g.el.classList.add('ritual-active');
        }
      }
    });
  });

  // Легенда — свёрнута по умолчанию
  const legend = document.querySelector('.task-legend');
  if (legend && legend.open) legend.open = false;
}

// Внедряем CSS для свёрнутых ритуалов и секций один раз
function injectTodayFocusStyles() {
  if (document.getElementById('today-focus-css')) return;
  const s = document.createElement('style');
  s.id = 'today-focus-css';
  s.textContent = `
    .ritual[data-ritual] { position: relative; transition: opacity .2s; }
    .ritual[data-ritual] .ritual-header { cursor: pointer; user-select: none; }
    .ritual[data-ritual]::after {
      position: absolute;
      right: 18px; top: 22px;
      color: var(--accent-soft, #d4af37);
      font-size: 14px;
      pointer-events: none;
      opacity: 0.7;
    }
    .ritual-folded { opacity: 0.7; }
    .ritual-folded:hover { opacity: 1; }
    .ritual-folded .ritual-header { margin-bottom: 0; }
    .ritual-folded::after { content: '▾'; }
    .ritual-folded .checklist,
    .ritual-folded .journal { display: none; }
    .ritual-active { opacity: 1; }
    .ritual-active::after { content: '▴'; }

    /* Универсальный фолдинг для секций в Дар/Стратегия/Путь */
    .arka-foldable { position: relative; transition: opacity .2s; }
    .arka-foldable .card-header { cursor: pointer; user-select: none; }
    .arka-foldable::after {
      position: absolute;
      right: 18px; top: 18px;
      color: var(--accent-soft, #d4af37);
      font-size: 14px;
      pointer-events: none;
      opacity: 0.7;
    }
    .arka-foldable.folded { opacity: 0.7; }
    .arka-foldable.folded:hover { opacity: 1; }
    .arka-foldable.folded::after { content: '▾'; }
    .arka-foldable.folded > *:not(.card-header):not(.section-header) { display: none !important; }
    .arka-foldable:not(.folded)::after { content: '▴'; }

    /* Аккордеон в «Сегодня»: и для карточек, и для ритуалов */
    .today-foldable { position: relative; transition: opacity .2s; }
    .today-foldable::after {
      position: absolute;
      right: 18px; top: 18px;
      color: var(--accent-soft, #d4af37);
      font-size: 14px;
      pointer-events: none;
      opacity: 0.7;
      content: '▴';
    }
    .today-foldable.today-folded { opacity: 0.7; }
    .today-foldable.today-folded:hover { opacity: 1; }
    .today-foldable.today-folded::after { content: '▾'; }
    /* Сворачиваем всё, кроме шапок */
    .today-foldable.today-folded > *:not(.card-header):not(.ritual-header):not(.pw-icon):not(.pw-text) { display: none !important; }
    /* Окно силы — у него своя структура без card-header */
    .power-window.today-folded .pw-text > *:not(.pw-title) { display: none !important; }
  `;
  document.head.appendChild(s);
}

// Универсальный аккордеон секций в Дар / Стратегия / Путь
// Логика: первая секция в табе раскрыта, остальные свёрнуты.
// Клик по шапке раскрывает её и сворачивает все остальные в табе.
function initSectionFolding() {
  const tabs = ['dar', 'strategy', 'path'];
  tabs.forEach(tabName => {
    const tabContent = document.querySelector('[data-tab-content="' + tabName + '"]');
    if (!tabContent) return;
    const allSections = tabContent.querySelectorAll(':scope > section');
    // Только те, у которых есть шапка (card-header / section-header / mentor-title)
    const foldable = [];
    allSections.forEach(sec => {
      let header = sec.querySelector('.card-header, .section-header');
      // Fallback: первая «титульная» строка секции
      if (!header) header = sec.querySelector('.mentor-title, h2, h3');
      if (header) foldable.push({sec, header});
    });
    foldable.forEach((item, idx) => {
      item.sec.classList.add('arka-foldable');
      if (idx === 0) item.sec.classList.remove('folded');
      else item.sec.classList.add('folded');
      if (item.header.dataset.fold) return;
      item.header.dataset.fold = '1';
      item.header.style.cursor = 'pointer';
      item.header.addEventListener('click', (e) => {
        if (e.target.closest('button, input, a, select, textarea, label')) return;
        const isOpen = !item.sec.classList.contains('folded');
        if (isOpen) {
          // свернуть текущий
          item.sec.classList.add('folded');
        } else {
          // свернуть всех остальных в этом табе, раскрыть этот
          foldable.forEach(o => { if (o !== item) o.sec.classList.add('folded'); });
          item.sec.classList.remove('folded');
        }
      });
    });
  });
}

function initChecklist() {
  injectTodayFocusStyles();
  focusTodayByTime();
  document.querySelectorAll('.check-item input[type=checkbox]').forEach(input => {
    const id = input.closest('.check-item').dataset.id;
    if (state.days[TODAY][id]) input.checked = true;
    input.addEventListener('change', () => {
      state.days[TODAY][id] = input.checked;
      saveState();
      updateProgress();
      if (input.checked) celebrate(input.nextElementSibling);
    });
  });
  updateProgress();
}

function updateProgress() {
  const all = document.querySelectorAll('.check-item input[type=checkbox]');
  const done = Array.from(all).filter(i => i.checked).length;
  document.getElementById('doneCount').textContent = done;
  document.getElementById('totalCount').textContent = all.length;
  document.getElementById('progressFill').style.width = (done / all.length * 100) + '%';
}

function celebrate(el) {
  if (!el) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    { duration: 280, easing: 'ease-out' }
  );
}

// ── Стрик ────────────────────────────────────────────
function updateStreak() {
  const d = document.getElementById('streakDays');
  const w = document.getElementById('streakWord');
  if (!d || !w) return;  // блок стрика убран из «Сегодня»
  const start = new Date(state.streakStart);
  const today = new Date(TODAY);
  const days = Math.floor((today - start) / 86400000) + 1;
  d.textContent = days;
  w.textContent =
    days === 1 ? 'день' :
    (days % 10 >= 2 && days % 10 <= 4 && (days < 10 || days > 20)) ? 'дня' :
    'дней';
}

// ── Дневник благодарности ────────────────────────────
function initJournal() {
  const ta = document.getElementById('gratitude');
  if (!ta) return;
  if (state.gratitude[TODAY]) ta.value = state.gratitude[TODAY];
  ta.addEventListener('input', () => {
    state.gratitude[TODAY] = ta.value;
    saveState();
  });
}

// ── Задачи дня ───────────────────────────────────────
const TASK_TYPES = ['neutral', 'resource', 'shadow'];
function getTaskTypeLabels() {
  return {
    neutral: dt('task.neutral'),
    resource: dt('task.resource'),
    shadow: dt('task.shadow')
  };
}
// Старая константа оставлена для совместимости (на случай если где-то ещё используется)
const TASK_TYPE_LABELS = {
  neutral: '⚖️ обычная',
  resource: '🌟 ресурсная',
  shadow: '🌑 теневая'
};

function renderTasks() {
  const list = document.getElementById('tasksList');
  list.innerHTML = '';
  state.tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.innerHTML = `
      <div class="task-checkbox${task.done ? ' done' : ''}" data-id="${task.id}"></div>
      <div class="task-text" contenteditable="true" data-id="${task.id}" data-ph="${escapeHtml(dt('task.placeholder'))}">${escapeHtml(task.text || (task._default ? dt(task._default) : ''))}</div>
      <span class="task-type" data-id="${task.id}" data-type="${task.type}">${getTaskTypeLabels()[task.type]}</span>
      <button class="task-remove" data-id="${task.id}" title="${dt('btn.delete')}">✕</button>
    `;
    list.appendChild(li);
  });
  bindTaskEvents();
}

function bindTaskEvents() {
  document.querySelectorAll('.task-checkbox[data-id]').forEach(box => {
    box.addEventListener('click', () => {
      const id = box.dataset.id;
      const t = state.tasks.find(x => x.id === id);
      if (t) { t.done = !t.done; saveState(); renderTasks(); }
    });
  });
  document.querySelectorAll('.task-text[data-id]').forEach(el => {
    el.addEventListener('blur', () => {
      const id = el.dataset.id;
      const t = state.tasks.find(x => x.id === id);
      if (t) { t.text = el.textContent.trim(); saveState(); }
    });
  });
  document.querySelectorAll('.task-type[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const t = state.tasks.find(x => x.id === id);
      if (!t) return;
      const i = TASK_TYPES.indexOf(t.type);
      t.type = TASK_TYPES[(i + 1) % TASK_TYPES.length];
      saveState();
      renderTasks();
    });
  });
  document.querySelectorAll('.task-remove[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      state.tasks = state.tasks.filter(x => x.id !== id);
      saveState();
      renderTasks();
    });
  });
}

function initTasksAdd() {
  document.getElementById('taskAddBtn').addEventListener('click', () => {
    const id = 't' + Date.now();
    state.tasks.push({ id, text: '', type: 'neutral', done: false });
    saveState();
    renderTasks();
  });
}

// ── Стратегия: цель ──────────────────────────────────
function initGoal() {
  ['goalTitle', 'goalDeadline', 'goalWhy'].forEach(idAttr => {
    const el = document.getElementById(idAttr);
    if (!el) return;
    const key = idAttr.replace('goal', '').toLowerCase();
    if (state.goal[key]) el.value = state.goal[key];
    el.addEventListener('input', () => {
      state.goal[key] = el.value;
      saveState();
    });
  });
}

// ── Стратегия: шаги ──────────────────────────────────
function renderSteps() {
  const list = document.getElementById('stepsList');
  list.innerHTML = '';
  state.steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'step-item' + (step.done ? ' done' : '');
    li.innerHTML = `
      <div class="step-num">${i + 1}</div>
      <div class="step-text" contenteditable="true" data-id="${step.id}">${escapeHtml(step.text)}</div>
      <div class="step-toggle" data-id="${step.id}"></div>
    `;
    list.appendChild(li);
  });
  bindStepEvents();
}

function bindStepEvents() {
  document.querySelectorAll('.step-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const s = state.steps.find(x => x.id === id);
      if (s) { s.done = !s.done; saveState(); renderSteps(); }
    });
  });
  document.querySelectorAll('.step-text').forEach(el => {
    el.addEventListener('blur', () => {
      const id = el.dataset.id;
      const s = state.steps.find(x => x.id === id);
      if (s) { s.text = el.textContent.trim(); saveState(); }
    });
  });
}

function initStepsAdd() {
  document.getElementById('stepAddBtn').addEventListener('click', () => {
    state.steps.push({ id: 's' + Date.now(), text: '', done: false });
    saveState();
    renderSteps();
  });
}

// ── ИИ-предложения шагов в архетипе З-МАН ────────────
function generateStepSuggestions(goalText) {
  const t = (goalText || '').toLowerCase();

  // Шаблоны по типу цели
  if (/книг|публик|издат|kdp/.test(t)) {
    return [
      dt('suggest.book_1'), dt('suggest.book_2'), dt('suggest.book_3'),
      dt('suggest.book_4'), dt('suggest.book_5'), dt('suggest.book_6')
    ];
  }
  if (/yupdar|тариф|подпис|приложен/.test(t)) {
    return [
      dt('suggest.yupdar_1'), dt('suggest.yupdar_2'), dt('suggest.yupdar_3'),
      dt('suggest.yupdar_4'), dt('suggest.yupdar_5'), dt('suggest.yupdar_6')
    ];
  }
  if (/продвиж|реклам|маркет|продаж|пиар/.test(t)) {
    return [
      dt('suggest.promo_1'), dt('suggest.promo_2'), dt('suggest.promo_3'),
      dt('suggest.promo_4'), dt('suggest.promo_5'), dt('suggest.promo_6')
    ];
  }
  if (/ирам|маяк|планир/.test(t)) {
    return [
      dt('suggest.iram_1'), dt('suggest.iram_2'), dt('suggest.iram_3'),
      dt('suggest.iram_4'), dt('suggest.iram_5'), dt('suggest.iram_6')
    ];
  }
  if (/доход|деньги|финанс|выруч/.test(t)) {
    return [
      dt('suggest.income_1'), dt('suggest.income_2'), dt('suggest.income_3'),
      dt('suggest.income_4'), dt('suggest.income_5'), dt('suggest.income_6')
    ];
  }
  if (!t) {
    return [ dt('suggest.no_goal') ];
  }
  // Универсальные шаги
  return [
    dt('suggest.generic_1'), dt('suggest.generic_2'), dt('suggest.generic_3'),
    dt('suggest.generic_4'), dt('suggest.generic_5'), dt('suggest.generic_6')
  ];
}

function initStepSuggestions() {
  const btn = document.getElementById('stepSuggestBtn');
  const panel = document.getElementById('suggestionsPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    const suggestions = generateStepSuggestions(state.goal.title);
    const html = `
      <div class="suggestions-title">${dt('suggest.title')}</div>
      ${suggestions.map((s, i) => `
        <div class="suggestion-item">
          <span class="suggestion-text">${i + 1}. ${escapeHtml(s)}</span>
          <button class="suggestion-add" data-idx="${i}">${dt('suggest.take')}</button>
        </div>
      `).join('')}
      <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:8px;">
        ${dt('suggest.note')}
      </div>
    `;
    panel.innerHTML = html;
    panel.classList.add('visible');

    panel.querySelectorAll('.suggestion-add').forEach(addBtn => {
      addBtn.addEventListener('click', () => {
        if (addBtn.classList.contains('added')) return;
        const idx = +addBtn.dataset.idx;
        const text = suggestions[idx];
        state.steps.push({ id: 's' + Date.now() + idx, text, done: false });
        saveState();
        renderSteps();
        addBtn.classList.add('added');
        addBtn.textContent = dt('suggest.added');
      });
    });
  });
}

// ── ИИ-помощник в архетипе З-МАН ─────────────────────
function aiRespond(action, input, goal, steps) {
  const text = (input || '').toLowerCase();
  const doneCount = steps.filter(s => s.done && s.text).length;
  const totalSteps = steps.filter(s => s.text).length;
  const hasGoal = !!goal.title;
  const hasDeadline = !!goal.deadline;
  const goalName = goal.title || dt('ai.your_goal');

  // Определение состояния через ключевые слова
  const stuck = /застр|тупик|не понимаю|не получ|не могу|устала/.test(text);
  const overload = /перегруз|много|устал|выгораю|не успеваю|нет сил/.test(text);
  const fear = /страх|боюсь|тревога|сомнев/.test(text);
  const money = /деньги|доход|финанс|тариф|оплат|выруч/.test(text);
  const promo = /продвиж|реклам|маркет|книг|продаж|пиар/.test(text);

  if (action === 'advice') {
    if (stuck) return dt('ai.advice_stuck', {
      now: hasGoal ? dt('ai.advice_stuck_goal', { goal: goalName }) : dt('ai.advice_stuck_nogoal')
    });
    if (overload) return dt('ai.advice_overload');
    if (fear) return dt('ai.advice_fear');
    if (money || promo) return dt('ai.advice_money', {
      what: money ? dt('ai.word_finance') : dt('ai.word_promo'),
      action: hasGoal ? dt('ai.advice_money_goal', { goal: goalName }) : dt('ai.advice_money_nogoal')
    });
    // Универсальный совет
    return dt('ai.advice_generic', {
      body: hasGoal ? dt('ai.advice_generic_goal', { goal: goalName }) : dt('ai.advice_generic_nogoal')
    });
  }

  if (action === 'forecast') {
    if (!hasGoal) {
      return dt('ai.forecast_nogoal');
    }
    let dateInfo = '';
    if (hasDeadline) {
      const days = Math.ceil((new Date(goal.deadline) - new Date()) / 86400000);
      const speed = totalSteps > 0 ? Math.round(doneCount / totalSteps * 100) : 0;
      const tempo = speed >= 70 ? dt('ai.forecast_tempo_fast')
        : speed >= 30 ? dt('ai.forecast_tempo_mid')
        : dt('ai.forecast_tempo_slow');
      dateInfo = dt('ai.forecast_dateinfo', {
        deadline: goal.deadline, days, daysWord: daysWord(days),
        speed, done: doneCount, total: totalSteps, tempo
      });
    } else {
      dateInfo = dt('ai.forecast_no_deadline');
    }
    return dt('ai.forecast_result', { goal: goalName, dateInfo });
  }

  if (action === 'correct') {
    if (!hasGoal) {
      return dt('ai.correct_nogoal');
    }
    const undoneStep = steps.find(s => !s.done && s.text);
    return dt('ai.correct_result', {
      step: undoneStep ? dt('ai.correct_step', { step: escapeHtml(undoneStep.text) }) : dt('ai.correct_nostep')
    });
  }

  return dt('ai.not_understood');
}

function initAI() {
  const responseEl = document.getElementById('aiResponse');
  document.querySelectorAll('.ai-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const input = document.getElementById('aiInput').value;
      responseEl.innerHTML = '<div class="ai-empty">' + dt('ai.loading') + '</div>';
      setTimeout(() => {
        responseEl.innerHTML = aiRespond(action, input, state.goal, state.steps);
      }, 600);
    });
  });
}

// ── ФИНАНСЫ ──────────────────────────────────────────
function renderFinance() {
  const list = document.getElementById('financeList');
  if (!list) return;
  list.innerHTML = '';
  let totalActual = 0, totalTarget = 0;
  state.finance.forEach(ch => {
    totalActual += +ch.actual || 0;
    totalTarget += +ch.target || 0;
    const pct = ch.target > 0 ? Math.min(100, (ch.actual / ch.target) * 100) : 0;
    const li = document.createElement('li');
    li.className = 'finance-item';
    li.innerHTML = `
      <div class="finance-row1">
        <input class="finance-name" data-id="${ch.id}" data-field="name" value="${escapeAttr(ch.name)}" placeholder="${dt('finance.name_placeholder')}">
        <button class="finance-remove" data-id="${ch.id}" title="${dt('btn.delete')}">✕</button>
      </div>
      <div class="finance-row2">
        <span class="finance-amount-label">${dt('finance.actual')}</span>
        <input class="finance-amount" data-id="${ch.id}" data-field="actual" type="number" min="0" value="${ch.actual || 0}">
        <span class="finance-amount-label">${dt('finance.target')}</span>
        <input class="finance-amount" data-id="${ch.id}" data-field="target" type="number" min="0" value="${ch.target || 0}">
      </div>
      <div class="finance-progress"><div class="finance-progress-fill" style="width:${pct}%"></div></div>
    `;
    list.appendChild(li);
  });
  document.getElementById('financeTotal').textContent = totalActual.toLocaleString('ru-RU');
  document.getElementById('financeTotalTarget').textContent = totalTarget.toLocaleString('ru-RU');
  bindFinanceEvents();
}

function bindFinanceEvents() {
  document.querySelectorAll('.finance-name, .finance-amount').forEach(el => {
    el.addEventListener('input', () => {
      const id = el.dataset.id, field = el.dataset.field;
      const ch = state.finance.find(x => x.id === id);
      if (!ch) return;
      if (field === 'name') ch.name = el.value;
      else ch[field] = +el.value || 0;
      saveState();
      // Только пересчёт чисел и прогресса, без перерисовки полей
      if (field !== 'name') {
        let totalA = 0, totalT = 0;
        state.finance.forEach(c => { totalA += +c.actual || 0; totalT += +c.target || 0; });
        document.getElementById('financeTotal').textContent = totalA.toLocaleString('ru-RU');
        document.getElementById('financeTotalTarget').textContent = totalT.toLocaleString('ru-RU');
        const pct = ch.target > 0 ? Math.min(100, (ch.actual / ch.target) * 100) : 0;
        const fill = el.closest('.finance-item').querySelector('.finance-progress-fill');
        if (fill) fill.style.width = pct + '%';
      }
    });
  });
  document.querySelectorAll('.finance-remove').forEach(el => {
    el.addEventListener('click', () => {
      state.finance = state.finance.filter(x => x.id !== el.dataset.id);
      saveState();
      renderFinance();
    });
  });
}

function initFinanceAdd() {
  const btn = document.getElementById('financeAddBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.finance.push({ id: 'f' + Date.now(), name: '', actual: 0, target: 0 });
    saveState();
    renderFinance();
  });
}

// ── КОНТЕНТ-ПЛАН ─────────────────────────────────────
const CONTENT_CHANNELS = ['Telegram', 'Instagram', 'Статья', 'YouTube', 'Книга'];
// Перевод отображаемого имени канала (хранится канонично, переводится только показ).
// Бренды Telegram/Instagram/YouTube остаются как есть.
function channelLabel(ch) {
  if (ch === 'Статья') return dt('channel.article');
  if (ch === 'Книга') return dt('channel.book');
  return ch;
}

function renderContent() {
  const list = document.getElementById('contentList');
  if (!list) return;
  list.innerHTML = '';
  state.content.forEach(c => {
    const li = document.createElement('li');
    li.className = 'content-item' + (c.done ? ' done' : '');
    li.innerHTML = `
      <div class="content-toggle" data-id="${c.id}"></div>
      <input class="content-date" type="date" data-id="${c.id}" value="${c.date || ''}">
      <div class="content-text" contenteditable="true" data-id="${c.id}">${escapeHtml(c.text)}</div>
      <span class="content-channel" data-id="${c.id}">${escapeHtml(channelLabel(c.channel))}</span>
      <button class="content-remove" data-id="${c.id}">✕</button>
    `;
    list.appendChild(li);
  });
  bindContentEvents();
}

function bindContentEvents() {
  document.querySelectorAll('.content-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (c) { c.done = !c.done; saveState(); renderContent(); }
    });
  });
  document.querySelectorAll('.content-date').forEach(el => {
    el.addEventListener('change', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (c) { c.date = el.value; saveState(); }
    });
  });
  document.querySelectorAll('.content-text').forEach(el => {
    el.addEventListener('blur', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (c) { c.text = el.textContent.trim(); saveState(); }
    });
  });
  document.querySelectorAll('.content-channel').forEach(el => {
    el.addEventListener('click', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (!c) return;
      const i = CONTENT_CHANNELS.indexOf(c.channel);
      c.channel = CONTENT_CHANNELS[(i + 1) % CONTENT_CHANNELS.length];
      saveState();
      renderContent();
    });
  });
  document.querySelectorAll('.content-remove').forEach(el => {
    el.addEventListener('click', () => {
      state.content = state.content.filter(x => x.id !== el.dataset.id);
      saveState();
      renderContent();
    });
  });
}

function initContentAdd() {
  const btn = document.getElementById('contentAddBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.content.push({ id: 'c' + Date.now(), date: '', text: '', channel: 'Telegram', done: false });
    saveState();
    renderContent();
  });
}

// ── НАСТАВНИК: УТРЕННИЙ БРИФ ─────────────────────────
function generateMentorBrief() {
  const h = new Date().getHours();
  const dow = new Date().getDay(); // 0 = Sun
  const tasksDone = state.tasks.filter(t => t.done && t.text).length;
  const tasksTotal = state.tasks.filter(t => t.text).length;
  const stepsDone = state.steps.filter(s => s.done && s.text).length;
  const stepsTotal = state.steps.filter(s => s.text).length;
  const financeActual = state.finance.reduce((s, c) => s + (+c.actual || 0), 0);
  const financeTarget = state.finance.reduce((s, c) => s + (+c.target || 0), 0);
  const finPct = financeTarget > 0 ? Math.round(financeActual / financeTarget * 100) : 0;
  const contentDone = state.content.filter(c => c.done && c.text).length;
  const contentPlanned = state.content.filter(c => !c.done && c.text).length;
  const hasGoal = !!state.goal.title;

  let greeting = dt('brief.fallback_title');
  let timeOfDayHint = '';
  if (h < 7) { greeting = dt('greet.dawn'); timeOfDayHint = dt('hint.dawn'); }
  else if (h < 12) { greeting = dt('greet.morning'); timeOfDayHint = dt('hint.morning'); }
  else if (h < 17) { greeting = dt('greet.day'); timeOfDayHint = dt('hint.day'); }
  else if (h < 20) { greeting = dt('greet.sunset'); timeOfDayHint = dt('hint.sunset'); }
  else { greeting = dt('greet.evening'); timeOfDayHint = dt('hint.evening'); }

  let body = `<b>${timeOfDayHint}</b>\n\n`;

  // Анализ задач
  if (tasksTotal === 0) {
    body += dt('tasks.no_tasks') + `\n\n`;
  } else if (tasksDone === tasksTotal) {
    body += dt('tasks.all_done') + `\n\n`;
  } else {
    body += dt('tasks.partial', { done: tasksDone, total: tasksTotal }) + `\n\n`;
  }

  // Анализ стратегии
  if (hasGoal && stepsTotal > 0) {
    const pct = Math.round(stepsDone / stepsTotal * 100);
    body += dt('goal.progress', { title: escapeHtml(state.goal.title), pct });
    if (pct < 30) body += dt('goal.slow') + `\n\n`;
    else if (pct >= 70) body += dt('goal.fast') + `\n\n`;
    else body += dt('goal.steady') + `\n\n`;
  } else if (!hasGoal) {
    body += dt('goal.none') + `\n\n`;
  }

  // Финансы
  if (financeTarget > 0) {
    body += dt('fin.progress', { pct: finPct });
    if (finPct < 25) body += dt('fin.low') + `\n\n`;
    else if (finPct > 80) body += dt('fin.high') + `\n\n`;
    else body += dt('fin.mid') + `\n\n`;
  }

  // Контент
  if (contentPlanned > 0) {
    body += dt('brief.content_planned', { n: '<em>' + contentPlanned + '</em>' }) + `\n\n`;
  }

  // Воскресенье — намёк на разбор
  if (dow === 0 && h >= 18) {
    body += dt('brief.sunday') + `\n\n`;
  }

  body += `<em>` + dt('brief.day_under_arka', { n: getStreakDays() }) + `</em>`;

  return { greeting, text: body };
}

function getStreakDays() {
  const start = new Date(state.streakStart);
  const today = new Date(TODAY);
  return Math.floor((today - start) / 86400000) + 1;
}

function daysWord(n) {
  return n === 1 ? dt('word.day') :
    (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20)) ? dt('word.days_few') :
    dt('word.days_many');
}

function refreshMentor() {
  const brief = generateMentorBrief();
  document.getElementById('mentorGreeting').textContent = brief.greeting;
  document.getElementById('mentorText').innerHTML = brief.text;
}

function initMentor() {
  if (!document.getElementById('mentorRefresh')) return;
  document.getElementById('mentorRefresh').addEventListener('click', refreshMentor);
  document.getElementById('mentorCallBtn').addEventListener('click', () => {
    document.querySelector('.tab[data-tab=strategy]').click();
    setTimeout(() => {
      const inp = document.getElementById('aiInput');
      inp.focus();
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
  document.getElementById('weeklyBtn').addEventListener('click', generateWeeklyReview);
  refreshMentor();
}

// ── ЕЖЕНЕДЕЛЬНЫЙ РАЗБОР ──────────────────────────────
function generateWeeklyReview() {
  const tasksDone = state.tasks.filter(t => t.done).length;
  const stepsDone = state.steps.filter(s => s.done && s.text).length;
  const stepsTotal = state.steps.filter(s => s.text).length;
  const finPct = state.finance.reduce((s, c) => s + (+c.actual || 0), 0);
  const finTarget = state.finance.reduce((s, c) => s + (+c.target || 0), 0);
  const contentDone = state.content.filter(c => c.done && c.text).length;
  const streak = getStreakDays();

  const flowLines = [
    tasksDone > 0 ? dt('weekly.tasks_done', { n: tasksDone }) : dt('weekly.tasks_progress'),
    stepsDone > 0 ? '\n' + dt('weekly.steps_done', { done: stepsDone, total: stepsTotal }) : '',
    contentDone > 0 ? '\n' + dt('weekly.content_done', { n: contentDone }) : '',
    finTarget > 0 ? '\n' + dt('weekly.finance', { pct: Math.round(finPct / finTarget * 100) }) : ''
  ].join('');

  const noticeLine = stepsTotal === 0 ? dt('weekly.no_steps')
    : stepsDone < stepsTotal / 2 ? dt('weekly.slow_pace')
    : dt('weekly.good_pace');

  const text = `${dt('weekly.header')}

${dt('weekly.streak_line', { streak: '<em>' + streak + '</em>', days: daysWord(streak) })}

<b>${dt('weekly.flow_title')}</b>
${flowLines}

<b>${dt('weekly.notice_title')}</b>
${noticeLine}

<b>${dt('weekly.advice_title')}</b>
${dt('weekly.advice_text')}

<em>${dt('weekly.remember')}</em>`;

  const el = document.getElementById('weeklyText');
  el.innerHTML = text;
  el.classList.add('visible');
}

// ── Раскрытие деталей практик ────────────────────────
function initPracticeDetails() {
  document.querySelectorAll('.info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.info;
      const panel = document.getElementById('info-' + id);
      if (!panel) return;
      panel.classList.toggle('visible');
      btn.classList.toggle('active');
    });
  });
}

// ── Напоминание про воду ─────────────────────────────
function initWaterReminder() {
  const btn = document.getElementById('waterRemindBtn');
  if (!btn) return;
  let reminderActive = localStorage.getItem('iram_water_reminder') === 'on';
  if (reminderActive) {
    btn.classList.add('active');
    btn.textContent = dt('water.reminders_on');
  } else {
    btn.textContent = dt('water.remind_me');
  }
  btn.addEventListener('click', async () => {
    if (reminderActive) {
      reminderActive = false;
      localStorage.removeItem('iram_water_reminder');
      btn.classList.remove('active');
      btn.textContent = dt('water.remind_me');
      return;
    }
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert(dt('water.permission_needed'));
        return;
      }
    }
    reminderActive = true;
    localStorage.setItem('iram_water_reminder', 'on');
    btn.classList.add('active');
    btn.textContent = dt('water.reminders_on');
    new Notification(dt('water.notif_title'), { body: dt('water.notif_body') });
  });
}

// ── doTERRA ──────────────────────────────────────────
function initDoterra() {
  const link = document.getElementById('doterraLink');
  if (link) link.href = DOTERRA_REF_URL;
}

// ── База эфирных масел ────────────────────────────────
// Краткое описание + аспект применения. Полные дозировки/предупреждения остаются
// в practice-details рядом с конкретным ритуалом (на случай чтения без попапа).
const OILS_DB = {
  frankincense: { name: 'Frankincense', desc: 'oil.frankincense_desc', meta: 'oil.frankincense_meta' },
  vetiver:      { name: 'Vetiver',      desc: 'oil.vetiver_desc',      meta: 'oil.vetiver_meta' },
  cypress:      { name: 'Cypress',      desc: 'oil.cypress_desc',      meta: 'oil.cypress_meta' },
  balance:      { name: 'Balance',      desc: 'oil.balance_desc',      meta: 'oil.balance_meta' },
  lavender:     { name: 'Lavender',     desc: 'oil.lavender_desc',     meta: 'oil.lavender_meta' },
  serenity:     { name: 'Serenity',     desc: 'oil.serenity_desc',     meta: 'oil.serenity_meta' }
};

// Открыть всплывающее окно с информацией о масле
function openOilPopup(oilKey) {
  const oil = OILS_DB[oilKey];
  if (!oil) return;
  const backdrop = document.getElementById('oilPopupBackdrop');
  const popup = document.getElementById('oilPopup');
  document.getElementById('oilPopupName').textContent = oil.name;
  document.getElementById('oilPopupDesc').textContent = dt(oil.desc);
  document.getElementById('oilPopupMeta').textContent = oil.meta ? dt(oil.meta) : '';
  document.getElementById('oilPopupLink').href = DOTERRA_REF_URL;
  if (backdrop) backdrop.hidden = false;
  if (popup) popup.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeOilPopup() {
  document.getElementById('oilPopupBackdrop').hidden = true;
  document.getElementById('oilPopup').hidden = true;
  document.body.style.overflow = '';
}
window.openOilPopup = openOilPopup;
window.closeOilPopup = closeOilPopup;

// При загрузке — привязываем клик к каждому .oil-hint.
// Определяем масло по тексту (data-oil или fallback на содержимое).
function initOilHints() {
  document.querySelectorAll('.oil-hint').forEach(el => {
    // Уже привязан — пропускаем
    if (el.dataset.oilInit) return;
    el.dataset.oilInit = '1';
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    // Определяем ключ масла
    let key = el.dataset.oil || '';
    if (!key) {
      const txt = (el.textContent || '').toLowerCase();
      key = Object.keys(OILS_DB).find(k => txt.includes(k)) || '';
    }
    if (!key) return;
    el.addEventListener('click', () => openOilPopup(key));
    el.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOilPopup(key); }
    });
  });
}

// ── Утилиты ──────────────────────────────────────────
function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ── Зеркало момента (Hero AI при открытии АРКА) ─────────
// Закон no_overload: 1 экран, 1 послание, 1 кнопка. Никаких других элементов.
// Послание собирается из 4 параметров: время суток × Дар × день в АРКА × контекст.
//
// Логика показа:
// - Первое открытие АРКА в этот день → Зеркало (полный экран).
// - После «Войти в день» → обычные табы + маленькая кнопка возврата вверху.
// - Через 4+ часов после последнего просмотра → Зеркало снова (по желанию юзера).

// Рассчитать «Дар дня» по той же системе ОДА/ТУНА/ТРИА/ЧИА,
// но с подстановкой СЕГОДНЯШНЕЙ даты и ТЕКУЩЕГО времени.
// Это даёт уникальный архетип, ведущий юзера именно сегодня.
function calcDarOfDay(userProfile) {
  let DarsLib = null;
  try { DarsLib = window.parent.DarsLib || null; } catch (e) {}
  if (!DarsLib || !DarsLib.calcProfile) return null;

  const now = new Date();
  const input = {
    date: { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() },
    time: { hour: now.getHours(), minute: now.getMinutes() }
  };
  // Координаты места рождения юзера (стабильный персональный фактор)
  if (userProfile && userProfile.tria && userProfile.tria.coords) {
    input.coords = userProfile.tria.coords;
  } else if (userProfile && userProfile.coords) {
    input.coords = userProfile.coords;
  }
  // Имя и фамилия юзера (стабильный персональный фактор)
  if (userProfile && userProfile.chia) {
    input.person = { firstName: userProfile.chia.firstName, lastName: userProfile.chia.lastName };
  } else if (userProfile && userProfile.person) {
    input.person = userProfile.person;
  }

  const profile = DarsLib.calcProfile(input);
  if (!profile) return null;

  // Дар дня = синтез (пока = ОДА текущего дня)
  const code = profile.synthesis.code;
  const name = profile.synthesis.name;
  const archetype = profile.synthesis.archetype || DarsLib.getDarArchetype(code, 'ru') || '';
  // SVG-путь для иконки
  let svgPath = '';
  try { svgPath = DarsLib.getDarSvgPath(code); } catch (e) {}

  return { code, name, archetype, svgPath };
}

function getMirrorState() {
  // Какой период дня сейчас
  const h = new Date().getHours();
  let period = 'morning';
  if (h < 5) period = 'night';
  else if (h < 9) period = 'dawn';
  else if (h < 12) period = 'morning';
  else if (h < 17) period = 'day';
  else if (h < 20) period = 'sunset';
  else if (h < 23) period = 'evening';
  else period = 'night';

  // Какой день в АРКА (по streak)
  let arkaDay = 1;
  try {
    const sStart = state.streakStart || TODAY;
    const startD = new Date(sStart);
    const todayD = new Date(TODAY);
    arkaDay = Math.max(1, Math.round((todayD - startD) / 86400000) + 1);
  } catch (e) {}

  // Имя юзера и его профиль (для расчёта Дара дня)
  let userName = '';
  let userProfile = null;
  try {
    userProfile = JSON.parse(window.parent.localStorage.getItem('_yupdar_preview_profile') || 'null');
    if (userProfile && userProfile.chia && userProfile.chia.firstName) userName = userProfile.chia.firstName;
  } catch (e) {}

  // Дар дня
  const darOfDay = calcDarOfDay(userProfile);

  return { period, arkaDay, userName, darOfDay };
}

// Безопасный dt — возвращает '' если ключа нет или значение пустое (вместо самого ключа)
function dtOrEmpty(key) {
  const lang = dynLang();
  // Сначала ARKA_DYN_I18N
  let dict = ARKA_DYN_I18N[lang] || ARKA_DYN_I18N.ru;
  let v = (dict[key] !== undefined) ? dict[key] : (ARKA_DYN_I18N.ru[key] !== undefined ? ARKA_DYN_I18N.ru[key] : undefined);
  // Потом ARKA_I18N
  if (v === undefined) {
    try {
      if (typeof ARKA_I18N !== 'undefined') {
        const dict2 = ARKA_I18N[lang] || ARKA_I18N.ru;
        v = (dict2[key] !== undefined) ? dict2[key] : (ARKA_I18N.ru[key] !== undefined ? ARKA_I18N.ru[key] : undefined);
      }
    } catch (e) {}
  }
  return (v == null || v === undefined) ? '' : v;
}

function generateMirror() {
  const { period, arkaDay, userName, darOfDay } = getMirrorState();

  // Понятная фраза о текущем моменте — короткая, конкретная.
  // Только период дня — без эзотерики, чтобы любой понял.
  const periodLabel = dtOrEmpty('mirror.period_' + period);

  // Послание Дара дня — короткий вопрос/приглашение в архетипе ЭТОГО Дара
  let darInvite = '';
  if (darOfDay && darOfDay.archetype) {
    darInvite = darOfDay.archetype;  // например: "Гармонизатор границ"
  }

  // Что юзер увидит/получит, нажав «Войди» — конкретно, по-человечески
  const teaser = arkaDay === 1 ? dtOrEmpty('mirror.teaser_d1')
                  : arkaDay === 2 ? dtOrEmpty('mirror.teaser_d2')
                  : arkaDay === 3 ? dtOrEmpty('mirror.teaser_d3')
                  : dtOrEmpty('mirror.teaser_dN');

  return {
    name: userName || dtOrEmpty('banner.friend'),
    periodLabel,
    darOfDay,
    darInvite,
    teaser
  };
}

function renderMirror() {
  const el = document.getElementById('mirrorMessage');
  if (!el) return;
  const m = generateMirror();

  // Иконка Дара дня — PNG-глиф из /dar-png/ по коду Дара дня.
  // Если код не определён — fallback на PNG личного Дара пользователя.
  const iconEl = document.querySelector('#arkaMirror .mirror-icon');
  if (iconEl) {
    const map = (typeof loadDarPngMap === 'function') ? loadDarPngMap() : {};
    const code = m.darOfDay && m.darOfDay.code;
    const file = code && map[code] ? map[code] : null;
    if (file) {
      const src = '/dar-png/' + encodeURIComponent(file);
      iconEl.innerHTML = '<img src="' + src + '" alt="" style="width:72px;height:72px;object-fit:contain;filter:drop-shadow(0 0 18px rgba(212,175,55,0.5))">';
    } else {
      iconEl.innerHTML = getUserDarIconHtml(72, 'filter:drop-shadow(0 0 18px rgba(212,175,55,0.5));');
    }
  }

  // Текст послания — простой и понятный
  let html = '';
  if (m.name) html += '<span class="mirror-name">' + escapeHtml(m.name) + '</span>';
  // Период дня (одна короткая фраза)
  if (m.periodLabel) html += '<span class="mirror-line">' + m.periodLabel + '</span>';
  // Дар дня — отдельной строкой, выделенный
  if (m.darOfDay && m.darOfDay.name) {
    const label = dtOrEmpty('mirror.dar_of_day_label');  // "Дар дня:" / "DAR of the day:" / "DAR del día:"
    html += '<span class="mirror-line mirror-dar-of-day">' + label + ' <b>' + escapeHtml(m.darOfDay.name) + '</b></span>';
    if (m.darInvite) {
      html += '<span class="mirror-line mirror-archetype"><em>' + escapeHtml(m.darInvite) + '</em></span>';
    }
  }
  // Что внутри (тизер)
  if (m.teaser) html += '<span class="mirror-line mirror-teaser">' + m.teaser + '</span>';

  el.innerHTML = html;
}

function enterDay() {
  const mirror = document.getElementById('arkaMirror');
  const main = document.getElementById('arkaMain');
  if (mirror) mirror.hidden = true;
  if (main) main.hidden = false;
  // Кнопка «← Зеркало» больше не показывается — Зеркало момента отключено,
  // АРКА открывается сразу на табах (см. initMirror).
  try { localStorage.setItem('arka_mirror_seen_at', Date.now().toString()); } catch (e) {}
}

function returnToMirror() {
  const mirror = document.getElementById('arkaMirror');
  const main = document.getElementById('arkaMain');
  const returnBtn = document.getElementById('mirrorReturnBtn');
  if (mirror) { renderMirror(); mirror.hidden = false; }
  if (main) main.hidden = true;
  if (returnBtn) returnBtn.hidden = true;
}
window.returnToMirror = returnToMirror;

// Возврат в главное меню YupDar (родительский iframe)
function backToYupDar() {
  const inIframe = (function(){ try { return window.parent && window.parent !== window; } catch (e) { return false; } })();
  try {
    if (inIframe) {
      const p = window.parent;
      // Боевой YupDar использует switchNav, превью-приложение — switchTab.
      if (typeof p.switchNav === 'function') { p.switchNav('me'); return; }
      if (typeof p.switchTab === 'function') { p.switchTab('me'); return; }
      // Внутри iframe, но у родителя нет нав-функции — НЕ грузим /preview/
      // в окно АРКА (иначе полное превью-приложение откроется внутри iframe).
      return;
    }
  } catch (e) {}
  // Standalone (не в iframe) — переход на главное превью
  try { window.location.href = '/preview/'; } catch (e) {}
}
window.backToYupDar = backToYupDar;

// Синхронизация по времени: при возврате во вкладку обновить
// зеркало (период дня) и фокус Сегодня (актуальный ритуал)
function syncByCurrentTime() {
  try { renderMirror(); } catch (e) {}
  try { focusTodayByTime(); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncByCurrentTime();
});
window.addEventListener('focus', syncByCurrentTime);
// Каждую минуту тоже проверяем — если юзер сидит долго и наступил новый период
setInterval(syncByCurrentTime, 60000);

function initMirror() {
  // Зеркало момента отключено по решению автора 2026-05-25:
  // Дар уже рассчитан до входа в АРКА — промежуточный экран только перегружает.
  // АРКА открывается сразу на табах «Сегодня / Дар / Стратегия / Путь».
  // Кнопка-обработчик «Войди» сохранена на случай возврата фичи.
  const btn = document.getElementById('mirrorEnterBtn');
  if (btn) btn.addEventListener('click', enterDay);
  enterDay();
}

// ── Шеринг-карточка инсайтов ─────────────────────────────────
// Генерирует красивую PNG-карточку с Даром, инсайтом и брендингом.
// Используется для виральности — юзер делится в Stories/чатах.
//
// Размер 540×960 = соотношение 9:16 (Instagram Stories / Telegram Stories).

let _lastShareDataUrl = null;

function drawShareCard(opts) {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Фон — глубокий бирюзово-синий с золотыми пятнами (тема З-МАН)
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0a1929');
  bgGrad.addColorStop(0.5, '#0F1F33');
  bgGrad.addColorStop(1, '#0a1929');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  // Радиальные свечения
  const glow1 = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.6);
  glow1.addColorStop(0, 'rgba(125, 211, 252, 0.18)');
  glow1.addColorStop(1, 'rgba(125, 211, 252, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(W * 0.85, H * 0.85, 0, W * 0.85, H * 0.85, W * 0.6);
  glow2.addColorStop(0, 'rgba(212, 175, 55, 0.15)');
  glow2.addColorStop(1, 'rgba(212, 175, 55, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Золотая рамка-обводка
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Лого YupDar сверху
  ctx.fillStyle = '#D4AF37';
  ctx.font = 'bold 32px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✦ АРКА', W / 2, 100);
  ctx.font = '14px Manrope, sans-serif';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.65)';
  ctx.fillText('Y U P D A R', W / 2, 130);

  // Имя юзера
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Manrope, sans-serif';
  ctx.fillText(opts.userName || 'Друг', W / 2, 220);

  // Дар (в большом размере)
  ctx.fillStyle = '#D4AF37';
  ctx.font = 'bold 64px Manrope, sans-serif';
  ctx.fillText(opts.darName || '—', W / 2, 320);

  // Архетип
  ctx.fillStyle = '#7DD3FC';
  ctx.font = 'italic 22px Manrope, sans-serif';
  ctx.fillText(opts.archetype || '', W / 2, 360);

  // Цитата / инсайт — центральная часть
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '24px Manrope, sans-serif';
  const quote = opts.quote || '';
  const lines = wrapText(ctx, '«' + quote + '»', W - 100);
  let y = 480;
  lines.forEach(line => {
    ctx.fillText(line, W / 2, y);
    y += 36;
  });

  // День в АРКА — внизу
  ctx.fillStyle = 'rgba(212, 175, 55, 0.65)';
  ctx.font = '16px Manrope, sans-serif';
  ctx.fillText((opts.dayLabel || '') , W / 2, H - 100);

  // Подпись «public-yup-land1.vercel.app/preview/»
  ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
  ctx.font = '13px Manrope, sans-serif';
  ctx.fillText('public-yup-land1.vercel.app/preview', W / 2, H - 60);

  // Сохраняем dataURL для скачивания
  _lastShareDataUrl = canvas.toDataURL('image/png');
  return _lastShareDataUrl;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4); // максимум 4 строки цитаты
}

// Открыть шеринг — generates карточка по контексту
function openShareCard(context, customQuote) {
  const overlay = document.getElementById('shareOverlay');
  if (!overlay) return;

  // Подтягиваем данные юзера + Дара дня
  const { userName, darOfDay } = getMirrorState();

  // Цитата — либо передана, либо генерируется из контекста
  let quote = customQuote;
  if (!quote) {
    if (context === 'mirror' && darOfDay) {
      // «Сегодня <Дар> ведёт меня» — поэтичная универсальная цитата
      const tpl = dtOrEmpty('share.mirror_quote_tpl') || 'Сегодня {dar} ведёт меня';
      quote = tpl.replace('{dar}', darOfDay.name || '');
    } else {
      quote = dtOrEmpty('share.default_quote');
    }
  }

  // День в АРКА
  const { arkaDay } = getMirrorState();
  const dayLabel = (dtOrEmpty('share.day_prefix') || 'День ') + arkaDay + ' ' + (dtOrEmpty('share.day_suffix') || 'в АРКА');

  drawShareCard({
    userName: userName || dtOrEmpty('banner.friend'),
    darName: darOfDay ? darOfDay.name : '',
    archetype: darOfDay ? darOfDay.archetype : '',
    quote: quote || '',
    dayLabel
  });

  overlay.hidden = false;
}
window.openShareCard = openShareCard;

function closeShareCard() {
  const overlay = document.getElementById('shareOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeShareCard = closeShareCard;

function downloadShareCard() {
  if (!_lastShareDataUrl) return;
  const a = document.createElement('a');
  a.href = _lastShareDataUrl;
  a.download = 'arka-' + Date.now() + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.downloadShareCard = downloadShareCard;

// Шеринг через Telegram WebApp API (если доступно) или копирование ссылки
// ═══════════════════════════════════════════════════
// КВЕСТ: ОТКРЫТИЕ ТЕНИ
// ═══════════════════════════════════════════════════
// Логика:
// 1. В Дневнике эволюции при выборе «Тень» появляется селект «Какая?»
// 2. При сохранении записи — счётчик этой тени +1
// 3. Когда счётчик >= 3 → анимация открытия → тень в «Пройденные» + разблокировка практики

// Каталог теней: каждая тень = id → имя + связанная практика которая открывается
const SHADOWS_CATALOG = {
  shadow_fall_out:      { i18n: 'arka.shadow_fall_out',       unlocks: 'practice_breath_sync' },
  shadow_stuck_future:  { i18n: 'arka.shadow_stuck_future',   unlocks: 'practice_slide_past' },
  shadow_rush:          { i18n: 'arka.shadow_rush',           unlocks: 'practice_logos_anchor' },
  shadow_procrastination: { i18n: 'arka.shadow_procrastination', unlocks: 'practice_slowdown' }
};

// Каталог практик: id → ключ имени + время + ключ имени связанной тени
const PRACTICES_CATALOG = {
  practice_slowdown:     { i18n: 'arka.trainer_p1', time: '5 мин', requires: null },
  practice_breath_sync:  { i18n: 'arka.trainer_p2', time: '3 мин', requires: 'shadow_fall_out' },
  practice_slide_past:   { i18n: 'arka.trainer_p3', time: '7 мин', requires: 'shadow_stuck_future' },
  practice_logos_anchor: { i18n: 'arka.trainer_p4', time: '2 мин', requires: 'shadow_rush' }
};

// Рендер Карты роста — пройденные + активные тени из state.shadows
function renderGrowthMap() {
  const doneEl = document.getElementById('growthShadowsDone');
  const activeEl = document.getElementById('growthShadowsActive');
  if (!doneEl || !activeEl) return;
  const sh = state.shadows || { passed: [], active: [] };

  doneEl.innerHTML = sh.passed.map(id => {
    const sh = SHADOWS_CATALOG[id];
    if (!sh) return '';
    return '<span class="gs-tag">' + escapeHtml(dt(sh.i18n) || dtOrEmpty(sh.i18n) || id) + '</span>';
  }).join('');

  activeEl.innerHTML = sh.active.map(id => {
    const sh = SHADOWS_CATALOG[id];
    if (!sh) return '';
    const cnt = (state.shadows.counts && state.shadows.counts[id]) || 0;
    const progress = cnt > 0 ? ' (' + cnt + '/3)' : '';
    return '<span class="gs-tag gs-tag-active">' + escapeHtml(dt(sh.i18n) || id) + progress + '</span>';
  }).join('');
}

// Рендер списка практик в Тренажёре с учётом блокировок
function renderTrainerPractices() {
  // Тренажёр рендерится статично в HTML. Применяем классы lock/unlock по state.shadows.unlocked.
  document.querySelectorAll('.trainer-practice').forEach((el, idx) => {
    const practiceIds = ['practice_slowdown', 'practice_breath_sync', 'practice_slide_past', 'practice_logos_anchor'];
    const pid = practiceIds[idx];
    if (!pid) return;
    const isUnlocked = state.shadows.unlocked.indexOf(pid) >= 0;
    el.classList.toggle('trainer-practice-locked', !isUnlocked);
    // Заменяем mark на замок если закрыто
    const mark = el.querySelector('.tp-mark');
    if (mark && !isUnlocked) mark.textContent = '🔒';
  });
}

// Заполнить селект активных теней в Дневнике
function renderShadowSelect() {
  const sel = document.getElementById('evoShadowSelect');
  if (!sel) return;
  const placeholderText = dtOrEmpty('arka.journal_which_shadow') || 'Какая тень?';
  let html = '<option value="">' + escapeHtml(placeholderText) + '</option>';
  state.shadows.active.forEach(id => {
    const sh = SHADOWS_CATALOG[id];
    if (!sh) return;
    html += '<option value="' + id + '">' + escapeHtml(dt(sh.i18n) || id) + '</option>';
  });
  sel.innerHTML = html;
}

// Сохранение записи в Дневник + квест-логика
function saveJournalEntry() {
  const textarea = document.getElementById('evoTextarea');
  const select = document.getElementById('evoShadowSelect');
  const activeTab = document.querySelector('.evo-tab.evo-tab-active');
  const evoType = activeTab ? activeTab.dataset.evo : 'light';
  const text = (textarea && textarea.value || '').trim();
  if (!text) return;

  // Сохраняем запись
  if (!Array.isArray(state.journal)) state.journal = [];
  const entry = { date: TODAY, type: evoType, text, shadowId: null };
  if (evoType === 'shadow' && select && select.value) {
    entry.shadowId = select.value;
  }
  state.journal.push(entry);

  // Если тип «тень» и выбран shadowId — инкремент счётчика
  if (entry.shadowId) {
    if (!state.shadows.counts) state.shadows.counts = {};
    state.shadows.counts[entry.shadowId] = (state.shadows.counts[entry.shadowId] || 0) + 1;
    // Проверяем: достигнут порог?
    if (state.shadows.counts[entry.shadowId] >= 3 && state.shadows.passed.indexOf(entry.shadowId) === -1) {
      passShadow(entry.shadowId);
      saveState();
      return;
    }
  }

  saveState();
  // Очистка
  if (textarea) textarea.value = '';
  renderGrowthMap();
}

// Тень прошла → перевести в пройденные, разблокировать практику, показать анимацию
function passShadow(shadowId) {
  const sh = SHADOWS_CATALOG[shadowId];
  if (!sh) return;

  // Перевод тени
  state.shadows.active = state.shadows.active.filter(x => x !== shadowId);
  if (state.shadows.passed.indexOf(shadowId) === -1) state.shadows.passed.push(shadowId);

  // Разблокировка практики
  let unlockedPracticeId = null;
  if (sh.unlocks && state.shadows.unlocked.indexOf(sh.unlocks) === -1) {
    state.shadows.unlocked.push(sh.unlocks);
    unlockedPracticeId = sh.unlocks;
  }

  // Показать анимацию
  showShadowUnlock(shadowId, unlockedPracticeId);

  // Обновить UI
  renderGrowthMap();
  renderTrainerPractices();

  // Очистка ввода
  const textarea = document.getElementById('evoTextarea');
  if (textarea) textarea.value = '';
}

// Полноэкранная анимация открытия тени
function showShadowUnlock(shadowId, practiceId) {
  const sh = SHADOWS_CATALOG[shadowId];
  const pr = practiceId ? PRACTICES_CATALOG[practiceId] : null;
  const overlay = document.getElementById('shadowUnlockOverlay');
  if (!overlay) return;
  const shadowName = dt(sh.i18n) || shadowId;
  const practiceName = pr ? (dt(pr.i18n) || practiceId) : '';
  document.getElementById('shadowUnlockShadow').textContent = shadowName;
  const prEl = document.getElementById('shadowUnlockPractice');
  if (prEl) {
    if (practiceName) {
      prEl.innerHTML = '<span class="su-label" data-i18n="arka.unlock_new_practice">Открылась новая практика</span><span class="su-practice-name">' + escapeHtml(practiceName) + '</span>';
      prEl.hidden = false;
    } else {
      prEl.hidden = true;
    }
  }
  applyArkaI18n();
  overlay.hidden = false;
}
function closeShadowUnlock() {
  const overlay = document.getElementById('shadowUnlockOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeShadowUnlock = closeShadowUnlock;

// ═══════════════════════════════════════════════════
// ПИСЬМО СЕБЕ НА 30 ДНЕЙ
// ═══════════════════════════════════════════════════
// 3 состояния:
// 1. NOT_YET — день < 3 (карточка скрыта)
// 2. PROMPT — день >= 3, письмо не запечатано (карточка-приглашение)
// 3. SEALED — письмо запечатано (карточка с обратным отсчётом)
// 4. READY — прошло 30 дней или открыта первая тень после запечатывания
//
// Состояние в localStorage:
// - arka_letter_text — текст письма
// - arka_letter_sealed_at — timestamp запечатывания
// - arka_letter_opened — true когда уже открыто

const LETTER_DAYS = 30;

function getLetterState() {
  let text = '';
  let sealedAt = 0;
  let opened = false;
  try {
    text = localStorage.getItem('arka_letter_text') || '';
    sealedAt = parseInt(localStorage.getItem('arka_letter_sealed_at') || '0', 10);
    opened = localStorage.getItem('arka_letter_opened') === '1';
  } catch (e) {}

  // День в АРКА
  let arkaDay = 1;
  try {
    const sStart = state.streakStart || TODAY;
    arkaDay = Math.max(1, Math.round((new Date(TODAY) - new Date(sStart)) / 86400000) + 1);
  } catch (e) {}

  // Дней с запечатывания
  let daysSealed = 0;
  if (sealedAt) {
    daysSealed = Math.floor((Date.now() - sealedAt) / 86400000);
  }
  const daysLeft = Math.max(0, LETTER_DAYS - daysSealed);

  let phase = 'NOT_YET';
  if (arkaDay >= 3 && !sealedAt) phase = 'PROMPT';
  else if (sealedAt && !opened && daysLeft > 0) phase = 'SEALED';
  else if (sealedAt && !opened && daysLeft === 0) phase = 'READY';
  else if (opened) phase = 'OPENED';

  return { text, sealedAt, opened, arkaDay, daysSealed, daysLeft, phase };
}

function renderLetterCard() {
  const card = document.getElementById('letterCard');
  if (!card) return;
  const st = getLetterState();

  if (st.phase === 'NOT_YET' || st.phase === 'OPENED') {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  if (st.phase === 'PROMPT') {
    card.innerHTML =
      '<div class="lc-seal">📜</div>' +
      '<div class="lc-title">' + escapeHtml(dt('arka.letter_card_title')) + '</div>' +
      '<div class="lc-hint">' + escapeHtml(dt('arka.letter_card_hint')) + '</div>' +
      '<button class="lc-btn" onclick="openLetterInput()">' + escapeHtml(dt('arka.letter_card_btn')) + '</button>';
  } else if (st.phase === 'SEALED') {
    card.innerHTML =
      '<div class="lc-seal">📜</div>' +
      '<div class="lc-title">' + escapeHtml(dt('arka.letter_sealed_title')) + '</div>' +
      '<div class="lc-status">' +
        escapeHtml(dt('arka.letter_sealed_status_pre')) +
        ' <span class="lc-countdown">' + st.daysLeft + '</span> ' +
        escapeHtml(dt('arka.letter_sealed_status_post')) +
      '</div>';
  } else if (st.phase === 'READY') {
    card.innerHTML =
      '<div class="lc-seal">📜</div>' +
      '<div class="lc-title">' + escapeHtml(dt('arka.letter_ready_title')) + '</div>' +
      '<div class="lc-hint">' + escapeHtml(dt('arka.letter_ready_hint')) + '</div>' +
      '<button class="lc-btn" onclick="openLetterReveal()">' + escapeHtml(dt('arka.letter_ready_btn')) + '</button>';
  }
}

function openLetterInput() {
  const overlay = document.getElementById('letterInputOverlay');
  if (overlay) overlay.hidden = false;
}
window.openLetterInput = openLetterInput;

function closeLetterInput() {
  const overlay = document.getElementById('letterInputOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeLetterInput = closeLetterInput;

function sealLetter() {
  const ta = document.getElementById('letterTextarea');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  try {
    localStorage.setItem('arka_letter_text', text);
    localStorage.setItem('arka_letter_sealed_at', Date.now().toString());
    localStorage.removeItem('arka_letter_opened');
  } catch (e) {}
  closeLetterInput();
  renderLetterCard();
}

function openLetterReveal() {
  const st = getLetterState();
  if (!st.text) return;
  document.getElementById('letterOpenText').textContent = st.text;
  const sealedDate = new Date(st.sealedAt);
  const dateStr = sealedDate.getDate() + '.' + String(sealedDate.getMonth() + 1).padStart(2, '0') + '.' + sealedDate.getFullYear();
  document.getElementById('letterOpenDate').textContent = dt('arka.letter_open_from') + ' ' + dateStr;
  const overlay = document.getElementById('letterOpenOverlay');
  if (overlay) overlay.hidden = false;
}
window.openLetterReveal = openLetterReveal;

function closeLetterOpen() {
  const overlay = document.getElementById('letterOpenOverlay');
  if (overlay) overlay.hidden = true;
  try { localStorage.setItem('arka_letter_opened', '1'); } catch (e) {}
  renderLetterCard();
}
window.closeLetterOpen = closeLetterOpen;

function initLetter() {
  renderLetterCard();
  const btn = document.getElementById('letterSealBtn');
  if (btn) btn.addEventListener('click', sealLetter);
}

// ═══════════════════════════════════════════════════
// КОЛЬЦО СИЛЫ — социальная фича
// ═══════════════════════════════════════════════════
// Демо-список близких: имя, эмодзи-состояние, может ли получить «🐉»
// В реальном проде эти данные будут приходить с сервера через приглашения.

function getCircleMembers() {
  // Демо-данные. В проде — fetch с сервера.
  let circle = [];
  try {
    const raw = localStorage.getItem('arka_circle');
    if (raw) circle = JSON.parse(raw);
  } catch (e) {}
  // Если пусто — даём демо-данные при первом запуске
  if (!circle.length) {
    circle = [
      { id: 'm1', name: 'Маша', state: 'light', sent: false },
      { id: 'm2', name: 'Лена', state: 'neutral', sent: false }
    ];
    try { localStorage.setItem('arka_circle', JSON.stringify(circle)); } catch (e) {}
  }
  return circle;
}

function saveCircleMembers(list) {
  try { localStorage.setItem('arka_circle', JSON.stringify(list)); } catch (e) {}
}

function getStateEmoji(state) {
  switch (state) {
    case 'light': return '🌟';
    case 'shadow': return '🌑';
    case 'neutral': default: return '⚖️';
  }
}
function getStateLabel(state) {
  switch (state) {
    case 'light': return dt('arka.circle_state_light');
    case 'shadow': return dt('arka.circle_state_shadow');
    case 'neutral': default: return dt('arka.circle_state_neutral');
  }
}

function renderCircle() {
  const container = document.getElementById('circleMembers');
  if (!container) return;
  const members = getCircleMembers();
  if (!members.length) {
    container.innerHTML = '<div class="circle-empty">' + escapeHtml(dt('arka.circle_empty')) + '</div>';
    return;
  }
  container.innerHTML = members.map(m => {
    const initial = (m.name || '?').charAt(0);
    return '<div class="circle-member">' +
      '<div class="cm-avatar">' + escapeHtml(initial) + '</div>' +
      '<div class="cm-info">' +
        '<div class="cm-name">' + escapeHtml(m.name) + '</div>' +
        '<div class="cm-status"><span class="cm-status-emoji">' + getStateEmoji(m.state) + '</span> ' + escapeHtml(getStateLabel(m.state)) + '</div>' +
      '</div>' +
      '<button class="cm-dragon-btn' + (m.sent ? ' sent' : '') + '" onclick="sendDragon(\'' + m.id + '\')" title="' + escapeAttr(dt('arka.circle_send_dragon')) + '">' + getUserDarIconHtml(26) + '</button>' +
    '</div>';
  }).join('');
}

function sendDragon(memberId) {
  const members = getCircleMembers();
  const m = members.find(x => x.id === memberId);
  if (!m || m.sent) return;
  m.sent = true;
  saveCircleMembers(members);
  renderCircle();
  // Простая «вспышка» — короткое сообщение или ничего, не перегружаем UI
}
window.sendDragon = sendDragon;

function inviteToCircle() {
  // В реальном проде — открывает Telegram share с приглашением
  const inviteUrl = 'https://public-yup-land1.vercel.app/preview/';
  const text = dt('arka.circle_invite_text');
  try {
    if (window.parent && window.parent.Telegram && window.parent.Telegram.WebApp && window.parent.Telegram.WebApp.openTelegramLink) {
      window.parent.Telegram.WebApp.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(inviteUrl) + '&text=' + encodeURIComponent(text));
      return;
    }
  } catch (e) {}
  window.open('https://t.me/share/url?url=' + encodeURIComponent(inviteUrl) + '&text=' + encodeURIComponent(text), '_blank');
}
window.inviteToCircle = inviteToCircle;

// Симуляция: при первом открытии АРКА в течение дня — иногда «приходит» дракон от близкого
function maybeReceiveDragon() {
  // Демо-логика: 30% шанс если есть кто-то в Кольце и сегодня ещё не получали
  try {
    const lastReceived = localStorage.getItem('arka_last_dragon_received') || '';
    if (lastReceived === TODAY) return;  // уже получили сегодня
    const members = getCircleMembers();
    if (!members.length) return;
    if (Math.random() > 0.3) return;
    const sender = members[Math.floor(Math.random() * members.length)];
    setTimeout(() => showDragonReceived(sender.name), 4000);  // через 4 сек после загрузки
    localStorage.setItem('arka_last_dragon_received', TODAY);
  } catch (e) {}
}

function showDragonReceived(senderName) {
  const overlay = document.getElementById('dragonReceivedOverlay');
  const label = document.getElementById('dragonReceivedFrom');
  if (!overlay || !label) return;
  label.textContent = senderName;
  overlay.hidden = false;
}
function closeDragonReceived() {
  const overlay = document.getElementById('dragonReceivedOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeDragonReceived = closeDragonReceived;

function initCircle() {
  renderCircle();
  // Демо-оверлей «X почувствовал тебя и послал Дар поддержки. Прими.»
  // отключён по решению автора 2026-05-25: симуляция перегружает и раздражает.
  // Функция maybeReceiveDragon оставлена ниже на случай возврата фичи.
  // maybeReceiveDragon();
}

// Инициализация квеста теней
function initShadowQuest() {
  renderGrowthMap();
  renderTrainerPractices();
  renderShadowSelect();

  // Переключение вкладок дневника: показываем/скрываем селект тени
  document.querySelectorAll('.evo-tab[data-evo]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.evo-tab').forEach(t => t.classList.toggle('evo-tab-active', t === tab));
      const sel = document.getElementById('evoShadowSelect');
      if (sel) sel.hidden = tab.dataset.evo !== 'shadow';
    });
  });

  // Сохранение записи
  const btn = document.getElementById('evoSaveBtn');
  if (btn) btn.addEventListener('click', saveJournalEntry);
}

function shareViaTelegram() {
  const shareUrl = 'https://public-yup-land1.vercel.app/preview/';
  const shareText = dtOrEmpty('share.tg_message') || 'Мой день в АРКА';
  // Если открыто в Telegram WebApp — используем нативный API
  try {
    if (window.parent && window.parent.Telegram && window.parent.Telegram.WebApp) {
      const tg = window.parent.Telegram.WebApp;
      if (tg.openTelegramLink) {
        const url = 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText);
        tg.openTelegramLink(url);
        return;
      }
    }
  } catch (e) {}
  // Фоллбэк — обычная ссылка t.me/share
  window.open('https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText), '_blank');
}
window.shareViaTelegram = shareViaTelegram;

// ── Запуск ───────────────────────────────────────────
setGreeting();
initTabs();
initMirror();
initChecklist();
updateStreak();
initJournal();
renderTasks();
initTasksAdd();
initGoal();
renderSteps();
initStepsAdd();
initStepSuggestions();
initAI();
renderFinance();
initFinanceAdd();
renderContent();
initContentAdd();
initMentor();
initPracticeDetails();
initWaterReminder();
initDoterra();
initOilHints();
initShadowQuest();
initLetter();
initCircle();
initSectionFolding();

// ── Пересборка динамических строк при смене языка ──────────────────
// Статичный HTML перерисовывает applyArkaI18n (index.html). Строки, собранные
// в JS (типы задач, дефолтная задача, приветствие, советы), перерисовываем тут.
function _arkaReRenderLang() {
  try { setGreeting(); } catch (e) {}
  try { renderTasks(); } catch (e) {}
  try { renderSteps(); } catch (e) {}
  try { renderFinance(); } catch (e) {}
  try { renderContent(); } catch (e) {}
}
window.addEventListener('storage', (e) => {
  if (e.key === '_yupdar_lang' || e.key === '_yupdar_preview_lang') _arkaReRenderLang();
});
try { window.parent.document.addEventListener('i18n:changed', _arkaReRenderLang); } catch (e) {}

// ── Авто-замена 🐉 на иконку личного Дара пользователя ─────────────
// Запускается после рендера и затем на каждое изменение DOM
// (с защитой от бесконечного цикла самоизменений).
let __dragonReplaceLock = false;
let __dragonReplaceTimer = null;
function replaceAllDragonNodes() {
  if (__dragonReplaceLock) return;
  __dragonReplaceLock = true;
  try {
    const root = document.body;
    if (!root) { __dragonReplaceLock = false; return; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue && n.nodeValue.indexOf('🐉') !== -1) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    if (!nodes.length) { __dragonReplaceLock = false; return; }
    nodes.forEach(node => {
      const parent = node.parentNode;
      if (!parent) return;
      let size = 20;
      const cls = parent.className || '';
      if (cls.indexOf('mirror-icon') !== -1) size = 64;
      else if (cls.indexOf('streak-icon') !== -1) size = 22;
      else if (cls.indexOf('tab-emoji') !== -1) size = 22;
      else if (cls.indexOf('card-icon') !== -1 || cls.indexOf('ts-icon') !== -1) size = 22;
      else if (cls.indexOf('cm-dragon-btn') !== -1) size = 26;
      else if (cls.indexOf('dr-dragon') !== -1) size = 110;
      const html = node.nodeValue.replace(/🐉/g, getUserDarIconHtml(size));
      const span = document.createElement('span');
      span.innerHTML = html;
      parent.replaceChild(span, node);
    });
  } catch (e) {}
  __dragonReplaceLock = false;
}
function scheduleDragonReplace() {
  if (__dragonReplaceLock) return;
  if (__dragonReplaceTimer) return;
  __dragonReplaceTimer = setTimeout(() => {
    __dragonReplaceTimer = null;
    replaceAllDragonNodes();
  }, 250);
}
// Первичный проход (после всех init)
setTimeout(replaceAllDragonNodes, 0);
// Наблюдаем за обновлениями DOM (renderTasks, renderCircle и т.п.) с дебаунсом
try {
  const mo = new MutationObserver(muts => {
    if (__dragonReplaceLock) return;
    let need = false;
    for (const m of muts) {
      // Игнорируем добавления узлов user-dar-ic — это наша же замена
      if (m.addedNodes && m.addedNodes.length) {
        for (const a of m.addedNodes) {
          if (a.nodeType === 3 && a.nodeValue && a.nodeValue.indexOf('🐉') !== -1) { need = true; break; }
          if (a.nodeType === 1 && a.textContent && a.textContent.indexOf('🐉') !== -1) { need = true; break; }
        }
      }
      if (need) break;
    }
    if (need) scheduleDragonReplace();
  });
  mo.observe(document.body, { childList: true, subtree: true });
} catch (e) {}
