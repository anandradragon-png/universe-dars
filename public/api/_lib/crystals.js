/**
 * Экономика кристаллов мудрости
 * Все начисления и траты проходят через этот модуль
 */

// Начисления (по плану docs/CRYSTALS-ECONOMY.md v2)
const CRYSTAL_REWARDS = {
  signup: 50,                  // Первый расчёт дара
  daily_login: 5,              // Ежедневный вход
  profile_completed: 20,       // Заполнен профиль (имя/фамилия/дата/время/место)
  ai_description: 5,           // Запрос AI-описания
  read_section: 1,             // Прочитать секцию
  answer_question: 3,          // Ответить на вопрос
  complete_practice: 5,        // Выполнить практику
  write_report: 7,             // Написать отчёт-рефлексию
  referral: 30,                // Друг пришёл по реф-ссылке, но его дар уже открыт у меня
  referral_buyer: 200,         // Бонус если приглашённый купил Книгу
  daily_dar_read: 3,           // Прочитать дар дня
  hero_awakening: 5,           // Пройти Шаг 1 Путешествия Героя
  hero_shadow_battle: 10,      // Победить Тень в Шаге 2
  hero_step_complete: 7,       // Пройти любой шаг (3-7)
  hero_journey_complete: 25,   // Завершить всё путешествие
  intuition_streak_3: 0,       // +20% к награде победы (применяется множителем)
  // Соревнования
  weekly_top1: 200, weekly_top2: 100, weekly_top3: 50,
  monthly_top1: 500, monthly_top2: 250, monthly_top3: 100,
};

// Траты (новая экономика)
const CRYSTAL_COSTS = {
  unlock_section: 15,          // Открыть один раздел дара
  unlock_section_pack: 65,     // Открыть все 5 разделов одного дара (со скидкой)
  unlock_dar: 40,              // Открыть новый дар в Сокровищнице
  unlock_quest: 20,            // Открыть Квест к дару
  reroll_oracle: 30,           // Перевыпустить дневное послание Оракула
  gift_dar: 80,                // Подарить дар другу
  premium_avatar: 300,         // Премиум-аватар
  epic_avatar: 800,            // Эпический аватар
  custom_title: 200,           // Кастомный титул в рейтинге
  theme: 150,                  // Тема оформления Книги
  hint_intuition: 5,           // Подсказка в Интуиции
  remove_shadow: 20,           // Убрать Карту Тени из раскладки
  extra_attempt: 10,           // Доп. попытка после лимита (только basic)
  compatibility: 50,           // AI-расчёт совместимости с близким
  ai_assistant_pack: 100,      // Пакет 10 вопросов AI-наставнику
  child_book_unlock: 200,      // Расширенная AI-расшифровка дара ребёнка (для basic)
};

// Streak бонусы (по плану — разовые)
const STREAK_BONUSES = {
  1: 0,       // День 1 — daily_login отдельно даёт 5
  3: 0,       // День 3 — нет
  7: 30,      // День 7 — единоразовый бонус
  14: 0,      // День 14 — нет
  30: 150,    // День 30 — единоразовый бонус
  100: 500,   // День 100 — единоразовый бонус
};

// Дневной кэп кристаллов из побед в Интуиции (для всех тарифов)
const INTUITION_DAILY_CAP = 40;

// Лимиты бесплатного тарифа
const FREE_TIER_LIMITS = {
  oracle_per_day: 1,
  intuition_wins_per_day: 5,    // больше — за extra_attempt 10⭐
  relative_slots: 0,
  book_chapters: 10,            // превью первых 10 глав из 94
};

// Лимиты реферальной программы (защита от абуза)
const REFERRAL_LIMITS = {
  per_day: 5,         // макс рефералов в день с одного аккаунта
  lifetime: 64,       // всего за жизнь (по числу даров — больше нет смысла)
  discount_days: 7,   // сколько дней действует скидка для приглашённого
  discount_percent: 15,
};

// Множители по уровню доступа
const ACCESS_MULTIPLIERS = {
  basic: 1,
  extended: 1.5,
  premium: 2,
};

function getReward(action, accessLevel = 'basic') {
  const base = CRYSTAL_REWARDS[action] || 0;
  const multiplier = ACCESS_MULTIPLIERS[accessLevel] || 1;
  return Math.floor(base * multiplier);
}

function getCost(action) {
  return CRYSTAL_COSTS[action] || 0;
}

function getStreakBonus(streakDay) {
  return STREAK_BONUSES[streakDay] || 0;
}

module.exports = {
  CRYSTAL_REWARDS, CRYSTAL_COSTS, STREAK_BONUSES, ACCESS_MULTIPLIERS,
  INTUITION_DAILY_CAP, FREE_TIER_LIMITS, REFERRAL_LIMITS,
  getReward, getCost, getStreakBonus
};
