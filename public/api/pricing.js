/**
 * GET /api/pricing
 *
 * Возвращает все тарифы, цены add-ons и текущий статус подписки пользователя.
 * UI читает отсюда — никаких прайсов в html.
 *
 * Параметр ?lang=ru|en|es — определяет валюту по умолчанию.
 * Также пытается угадать по Telegram language_code.
 */

const { getUser, requireUser } = require('./_lib/auth');
const { getOrCreateUser } = require('./_lib/db');
const pricing = require('./_lib/pricing');

// Какие тарифы показываем на странице (порядок имеет значение)
const PLAN_GROUPS = {
  guardian: {
    tier: 'extended',
    name: 'Хранитель',
    emoji: '🛡',
    color: '#88aadd',
    description: 'Полный доступ к Книге и Сокровищнице, расширенные лимиты, семья из 3 близких.',
    features: [
      'Полная Книга Даров + дизайнерская PDF',
      'Сокровищница всех 64 даров',
      'Оракул: 3 раза в день',
      'Семья: 3 близких',
      'Книга для Родителей: 1 ребёнок',
      '5 проверок совместимости в месяц',
      'Hero Journey по дарам близких',
      'AI-инсайт в Дневнике раз в неделю'
    ],
    periods: ['guardian_1m', 'guardian_3m', 'guardian_6m', 'guardian_12m']
  },
  master: {
    tier: 'premium',
    name: 'Мастер',
    emoji: '👑',
    color: '#D4AF37',
    description: 'Безлимит по всему. Глубокая работа с Дарами для тебя и всей семьи.',
    features: [
      'Всё из Хранителя',
      'Оракул: безлимит',
      'Семья: безлимит близких',
      'Книга для Родителей: безлимит детей',
      'Совместимость: безлимит (включая команды 3-7 человек)',
      'Hero Journey по всем 64 дарам',
      'AI-инсайт в Дневнике каждый день',
      'Личный чат поддержки'
    ],
    periods: ['master_1m', 'master_3m', 'master_6m', 'master_12m']
  }
};

const ADDON_GROUPS = [
  {
    key: 'oracle_unlimited_7d',
    emoji: '🔮',
    name: 'Безлимит Оракула',
    description: 'Сколько угодно предсказаний в течение 7 дней',
    duration: '7 дней'
  },
  {
    key: 'compatibility_pdf',
    emoji: '💑',
    name: 'Глубокая совместимость',
    description: 'Подробный AI-разбор пары в формате PDF',
    duration: 'разово'
  },
  {
    key: 'child_book_chapter',
    emoji: '📖',
    name: 'Глава Книги для Родителей',
    description: 'Персональная глава по дару ребёнка',
    duration: 'разово'
  }
];

const PERIOD_LABELS = {
  '1m': '1 месяц',
  '3m': '3 месяца',
  '6m': '6 месяцев',
  '12m': '12 месяцев'
};

// Какие валюты показываем юзеру по умолчанию (на основе языка)
function pickCurrency(lang) {
  const l = (lang || '').toLowerCase();
  if (l === 'ru' || l === 'be' || l === 'uk' || l === 'kk') return 'rub';
  if (l === 'es' || l === 'pt') return 'usd';
  return 'usd';
}

function buildPlanCards() {
  const cards = {};
  for (const [groupKey, group] of Object.entries(PLAN_GROUPS)) {
    const monthly = pricing.PLANS[group.periods[0]]; // 1-месячная цена для подсчёта экономии
    const periods = group.periods.map(planKey => {
      const plan = pricing.PLANS[planKey];
      const months = Math.round(plan.days / 30);
      const periodLabel = PERIOD_LABELS[planKey.split('_')[1]] || `${months} мес`;

      // Экономия в % относительно 1-месячной цены × число месяцев
      const monthlyEquivalent = monthly.rub * months;
      const discountPct = months > 1
        ? Math.round(100 * (1 - plan.rub / monthlyEquivalent))
        : 0;

      // Цена за месяц (для подзаголовка карточки)
      const perMonthRub = Math.round(plan.rub / months);
      const perMonthStars = Math.round(plan.stars / months);
      const perMonthUsd = Math.round((plan.usd / months) * 100) / 100;

      return {
        plan_key: planKey,
        period_label: periodLabel,
        months,
        days: plan.days,
        rub: plan.rub,
        stars: plan.stars,
        usd: plan.usd,
        darai: plan.darai,
        per_month_rub: perMonthRub,
        per_month_stars: perMonthStars,
        per_month_usd: perMonthUsd,
        discount_pct: discountPct,
        is_default: planKey.endsWith('_12m') // годовая по умолчанию
      };
    });

    cards[groupKey] = {
      group_key: groupKey,
      tier: group.tier,
      name: group.name,
      emoji: group.emoji,
      color: group.color,
      description: group.description,
      features: group.features,
      periods
    };
  }
  return cards;
}

function buildAddons() {
  return ADDON_GROUPS.map(group => {
    const addon = pricing.ADDONS[group.key];
    if (!addon) return null;
    return {
      addon_key: group.key,
      emoji: group.emoji,
      name: group.name,
      description: group.description,
      duration: group.duration,
      rub: addon.rub,
      stars: addon.stars,
      usd: addon.usd,
      darai: addon.darai
    };
  }).filter(Boolean);
}

function buildBook() {
  return {
    name: 'Книга Даров',
    emoji: '📚',
    description: 'Полная Книга Даров на 94 главы + дизайнерская PDF. Навсегда, без подписки.',
    note: 'Открывает только сам контент Книги. Тариф и его лимиты не задействует.',
    rub: pricing.BOOK_PRODUCT.rub,
    stars: pricing.BOOK_PRODUCT.stars,
    usd: pricing.BOOK_PRODUCT.usd,
    darai: pricing.BOOK_PRODUCT.darai
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Язык: из ?lang, иначе из Telegram language_code, иначе ru
  let lang = (req.query.lang || '').toString().toLowerCase();
  if (!lang) {
    try {
      const initData = req.headers['x-telegram-init-data'] || '';
      if (initData) {
        const params = new URLSearchParams(initData);
        const userJson = params.get('user');
        if (userJson) {
          const u = JSON.parse(userJson);
          if (u.language_code) lang = u.language_code.toLowerCase();
        }
      }
    } catch (e) {}
  }
  if (!lang) lang = 'ru';

  const currency = pickCurrency(lang);

  // Текущий статус юзера (если авторизован)
  let userStatus = null;
  try {
    const tgUser = getUser(req);
    if (tgUser && tgUser.id) {
      const dbUser = await getOrCreateUser(tgUser);
      const effectiveTier = pricing.getEffectiveTier(dbUser);
      userStatus = {
        access_level: dbUser.access_level || 'basic',
        effective_tier: effectiveTier,
        subscription_plan: dbUser.subscription_plan || null,
        subscription_end: dbUser.subscription_end || null,
        book_purchased: !!dbUser.book_purchased,
        first_purchase_at: dbUser.first_purchase_at || null,
        eligible_for_first_purchase_promo: !dbUser.first_purchase_at,
        crystals: dbUser.crystals || 0
      };
    }
  } catch (e) {
    console.warn('[pricing] user status fetch failed:', e.message);
  }

  return res.json({
    lang,
    currency,
    plans: buildPlanCards(),
    addons: buildAddons(),
    book: buildBook(),
    first_purchase_discount_pct: 50, // -50% на первый месяц
    user: userStatus
  });
};
