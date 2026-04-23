/**
 * Экономика кристаллов мудрости
 * Все начисления и траты проходят через этот модуль
 */

// Начисления
const CRYSTAL_REWARDS = {
  signup: 10,            // Первый расчёт дара
  daily_login: 2,        // Ежедневный вход
  ai_description: 5,     // Запрос AI-описания
  read_section: 1,       // Прочитать секцию
  answer_question: 3,    // Ответить на вопрос
  complete_practice: 5,  // Выполнить практику
  write_report: 7,       // Написать отчёт-рефлексию
  referral: 15,          // Друг рассчитал дар по ссылке
  referral_new_dar: 10,  // Бонус: дар друга отличается
  daily_dar_read: 3,     // Прочитать дар дня
  hero_awakening: 5,     // Пройти Шаг 1 Путешествия Героя
  hero_shadow_battle: 10, // Победить Тень в Шаге 2
  hero_step_complete: 7, // Пройти любой шаг (3-7)
  hero_journey_complete: 25, // Завершить всё путешествие
};

// Траты
const CRYSTAL_COSTS = {
  unlock_section: 5,     // Открыть следующую секцию дара
  unlock_random_dar: 20, // Открыть случайный дар
};

// Streak бонусы
const STREAK_BONUSES = {
  1: 2,    // День 1
  3: 5,    // День 3
  7: 15,   // День 7
  14: 30,  // День 14
  30: 100, // День 30
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
  getReward, getCost, getStreakBonus
};
