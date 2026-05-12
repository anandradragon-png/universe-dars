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

// =====================================================================
// i18n для UI-текстов тарифов и аддонов.
// Бренд-имена (Странник/Хранитель/Мастер) НЕ переводятся — закон проекта.
// =====================================================================
const PLANS_I18N = {
  ru: {
    wanderer: {
      description: 'Бесплатный доступ навсегда. Достаточно чтобы попробовать всё ключевое.',
      features: [
        'Твой родной Дар и его AI-описание',
        'Сокровищница: твой Дар (9 секций)',
        'Превью Книги Даров (10 глав)',
        'Оракул: 1 предсказание в день',
        'Тренажёр Интуиции (5 раундов/день)',
        'Дневник Дара (без AI-инсайтов)',
        'Карточки для шейринга',
        '1 разовая проверка совместимости'
      ]
    },
    guardian: {
      description: 'Полный доступ к Книге и Сокровищнице, расширенные лимиты, семья из 3 близких.',
      features: [
        'Полная Книга Даров + дизайнерская PDF',
        'Сокровищница всех 64 даров',
        'Оракул: 3 раза в день',
        'Семья: 3 близких',
        'Книга для Родителей: 1 ребёнок',
        '5 проверок совместимости в месяц',
        'Hero Journey по дарам близких',
        'AI-инсайт в Дневнике раз в неделю',
        '🗝 Библиотека Практик (в разработке)'
      ]
    },
    master: {
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
      ]
    }
  },
  en: {
    wanderer: {
      description: 'Free access forever. Enough to try all the essentials.',
      features: [
        'Your native DAR and its AI description',
        'Treasury: your DAR (9 sections)',
        'Preview of the Book of DARs (10 chapters)',
        'Oracle: 1 prediction per day',
        'Intuition Trainer (5 rounds/day)',
        'DAR Diary (without AI insights)',
        'Sharing cards',
        '1 one-time compatibility check'
      ]
    },
    guardian: {
      description: 'Full access to the Book and Treasury, extended limits, family of 3 close ones.',
      features: [
        'Full Book of DARs + designer PDF',
        'Treasury of all 64 DARs',
        'Oracle: 3 times per day',
        'Family: 3 close ones',
        'Book for Parents: 1 child',
        '5 compatibility checks per month',
        'Hero Journey for your family\u2019s DARs',
        'Weekly AI insight in the Diary',
        '🗝 Library of Practices (in development)'
      ]
    },
    master: {
      description: 'Unlimited everything. Deep work with DARs for you and your whole family.',
      features: [
        'Everything from Guardian',
        'Oracle: unlimited',
        'Family: unlimited close ones',
        'Book for Parents: unlimited children',
        'Compatibility: unlimited (including teams of 3-7)',
        'Hero Journey for all 64 DARs',
        'Daily AI insight in the Diary',
        'Personal support chat'
      ]
    }
  },
  es: {
    wanderer: {
      description: 'Acceso gratuito para siempre. Suficiente para probar todo lo esencial.',
      features: [
        'Tu DAR nativo y su descripción con IA',
        'Tesoro: tu DAR (9 secciones)',
        'Vista previa del Libro de los DARs (10 capítulos)',
        'Oráculo: 1 predicción al día',
        'Entrenador de Intuición (5 rondas/día)',
        'Diario del DAR (sin ideas de IA)',
        'Tarjetas para compartir',
        '1 verificación de compatibilidad única'
      ]
    },
    guardian: {
      description: 'Acceso completo al Libro y al Tesoro, límites ampliados, familia de 3 seres queridos.',
      features: [
        'Libro de los DARs completo + PDF de diseño',
        'Tesoro de los 64 DARs',
        'Oráculo: 3 veces al día',
        'Familia: 3 seres queridos',
        'Libro para Padres: 1 hijo',
        '5 verificaciones de compatibilidad al mes',
        'Hero Journey por los DARs de tu familia',
        'Ideas de IA en el Diario una vez por semana',
        '🗝 Biblioteca de Prácticas (en desarrollo)'
      ]
    },
    master: {
      description: 'Todo sin límite. Trabajo profundo con los DARs para ti y toda tu familia.',
      features: [
        'Todo lo de Guardián',
        'Oráculo: sin límite',
        'Familia: seres queridos sin límite',
        'Libro para Padres: hijos sin límite',
        'Compatibilidad: sin límite (incluye equipos de 3-7 personas)',
        'Hero Journey por los 64 DARs',
        'Ideas de IA en el Diario cada día',
        'Chat de soporte personal'
      ]
    }
  }
};

const ADDONS_I18N = {
  ru: {
    oracle_unlimited_7d:  { name: 'Безлимит Оракула',          description: 'Сколько угодно предсказаний в течение 7 дней', duration: '7 дней' },
    compatibility_pdf:    { name: 'Глубокая совместимость',    description: 'Подробный AI-разбор пары в формате PDF',       duration: 'разово' },
    child_book_chapter:   { name: 'Глава Книги для Родителей', description: 'Персональная глава по дару ребёнка',           duration: 'разово' }
  },
  en: {
    oracle_unlimited_7d:  { name: 'Unlimited Oracle',          description: 'As many predictions as you want for 7 days',   duration: '7 days' },
    compatibility_pdf:    { name: 'Deep Compatibility',        description: 'A detailed AI-powered couple report in PDF',   duration: 'one-time' },
    child_book_chapter:   { name: 'Book for Parents chapter',  description: 'A personal chapter on your child\u2019s DAR',  duration: 'one-time' }
  },
  es: {
    oracle_unlimited_7d:  { name: 'Oráculo sin Límite',        description: 'Tantas predicciones como quieras por 7 días',  duration: '7 días' },
    compatibility_pdf:    { name: 'Compatibilidad Profunda',   description: 'Un informe IA detallado de pareja en PDF',     duration: 'única vez' },
    child_book_chapter:   { name: 'Capítulo del Libro para Padres', description: 'Capítulo personal sobre el DAR de tu hijo', duration: 'única vez' }
  }
};

const BOOK_I18N = {
  ru: {
    name: 'Книга Даров',
    description: 'Полная Книга Даров на 94 главы + дизайнерская PDF. Навсегда, без подписки.',
    note: 'Открывает только сам контент Книги. Тариф и его лимиты не задействует.'
  },
  en: {
    name: 'The Book of DARs',
    description: 'Full Book of DARs with all 94 chapters + designer PDF. Forever, no subscription.',
    note: 'Only unlocks the Book content. Plan and its limits are not affected.'
  },
  es: {
    name: 'El Libro de los DARs',
    description: 'Libro completo de los DARs con 94 capítulos + PDF de diseño. Para siempre, sin suscripción.',
    note: 'Solo abre el contenido del Libro. No afecta al plan ni a sus límites.'
  }
};

const PERIOD_LABELS_I18N = {
  ru: { '1m': '1 месяц',  '3m': '3 месяца', '6m': '6 месяцев', '12m': '12 месяцев' },
  en: { '1m': '1 month',  '3m': '3 months', '6m': '6 months',  '12m': '12 months'  },
  es: { '1m': '1 mes',    '3m': '3 meses',  '6m': '6 meses',   '12m': '12 meses'   }
};

const FOREVER_I18N = { ru: 'навсегда', en: 'forever', es: 'para siempre' };

function pickLangPack(lang) {
  const l = (lang || 'ru').toLowerCase().slice(0, 2);
  return ['ru', 'en', 'es'].includes(l) ? l : 'ru';
}

// Какие тарифы показываем на странице (порядок имеет значение).
// Бренд-имена остаются на русском (закон проекта), описания/features — i18n.
const PLAN_GROUPS = {
  wanderer: {
    tier: 'basic',
    name: 'Странник',
    emoji: '🌍',
    color: '#9aa3b2',
    periods: ['wanderer_free']  // фейковый ключ для UI — оплаты нет
  },
  guardian: {
    tier: 'extended',
    name: 'Хранитель',
    emoji: '🛡',
    color: '#88aadd',
    periods: ['guardian_1m', 'guardian_3m', 'guardian_6m', 'guardian_12m']
  },
  master: {
    tier: 'premium',
    name: 'Мастер',
    emoji: '👑',
    color: '#D4AF37',
    periods: ['master_1m', 'master_3m', 'master_6m', 'master_12m']
  }
};

const ADDON_GROUPS = [
  { key: 'oracle_unlimited_7d', emoji: '🔮' },
  { key: 'compatibility_pdf',   emoji: '💑' },
  { key: 'child_book_chapter',  emoji: '📖' }
];

// Какие валюты показываем юзеру по умолчанию (на основе языка)
function pickCurrency(lang) {
  const l = (lang || '').toLowerCase();
  if (l === 'ru' || l === 'be' || l === 'uk' || l === 'kk') return 'rub';
  if (l === 'es' || l === 'pt') return 'usd';
  return 'usd';
}

function buildPlanCards(lang) {
  const lp = pickLangPack(lang);
  const plansT = PLANS_I18N[lp];
  const periodsT = PERIOD_LABELS_I18N[lp];
  const cards = {};
  for (const [groupKey, group] of Object.entries(PLAN_GROUPS)) {
    const txt = plansT[groupKey] || {};
    // Странник — особый случай: бесплатно, без оплаты, без периодов
    if (groupKey === 'wanderer') {
      cards[groupKey] = {
        group_key: groupKey,
        tier: group.tier,
        name: group.name,
        emoji: group.emoji,
        color: group.color,
        description: txt.description,
        features: txt.features,
        is_free: true,
        periods: [{
          plan_key: 'wanderer_free',
          period_label: FOREVER_I18N[lp],
          months: 0,
          days: 0,
          rub: 0, stars: 0, usd: 0, darai: 0,
          per_month_rub: 0, per_month_stars: 0, per_month_usd: 0,
          discount_pct: 0,
          is_default: true
        }]
      };
      continue;
    }

    const monthly = pricing.PLANS[group.periods[0]]; // 1-месячная цена для подсчёта экономии
    const periods = group.periods.map(planKey => {
      const plan = pricing.PLANS[planKey];
      const months = Math.round(plan.days / 30);
      const shortKey = planKey.split('_')[1];
      const periodLabel = (periodsT && periodsT[shortKey]) || `${months}m`;

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
      description: txt.description,
      features: txt.features,
      periods
    };
  }
  return cards;
}

function buildAddons(lang) {
  const lp = pickLangPack(lang);
  const addonsT = ADDONS_I18N[lp];
  return ADDON_GROUPS.map(group => {
    const addon = pricing.ADDONS[group.key];
    const txt = addonsT[group.key];
    if (!addon || !txt) return null;
    return {
      addon_key: group.key,
      emoji: group.emoji,
      name: txt.name,
      description: txt.description,
      duration: txt.duration,
      rub: addon.rub,
      stars: addon.stars,
      usd: addon.usd,
      darai: addon.darai
    };
  }).filter(Boolean);
}

function buildBook(lang) {
  const lp = pickLangPack(lang);
  const txt = BOOK_I18N[lp];
  return {
    name: txt.name,
    emoji: '📚',
    description: txt.description,
    note: txt.note,
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
    plans: buildPlanCards(lang),
    addons: buildAddons(lang),
    book: buildBook(lang),
    first_purchase_discount_pct: 50, // -50% на первый месяц
    user: userStatus
  });
};
