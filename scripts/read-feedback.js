#!/usr/bin/env node
/**
 * CLI-скрипт для чтения фидбэка тестеров из Supabase.
 * Использование: node scripts/read-feedback.js [категория]
 *
 * Требует в .env (в корне проекта):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_KEY=...
 *
 * Примеры:
 *   node scripts/read-feedback.js              # все сообщения
 *   node scripts/read-feedback.js bug          # только баги
 *   node scripts/read-feedback.js idea         # только идеи
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Не хватает переменных в .env:');
  console.error('   SUPABASE_URL и SUPABASE_SERVICE_KEY');
  console.error('');
  console.error('Скопируй значения из Vercel → Settings → Environment Variables');
  process.exit(1);
}

const filterCategory = process.argv[2];

(async () => {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  let query = db.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
  if (filterCategory) query = query.eq('category', filterCategory);

  const { data, error } = await query;
  if (error) {
    console.error('❌ Ошибка запроса:', error.message);
    process.exit(1);
  }

  if (!data || !data.length) {
    console.log('📭 Сообщений нет' + (filterCategory ? ` (фильтр: ${filterCategory})` : ''));
    return;
  }

  const catIcons = { bug: '🐛', idea: '💡', question: '❓', other: '📝' };
  const catNames = { bug: 'БАГ', idea: 'ИДЕЯ', question: 'ВОПРОС', other: 'ДРУГОЕ' };

  console.log(`\n📋 Фидбэк тестеров${filterCategory ? ` (${filterCategory})` : ''} — всего: ${data.length}\n`);
  console.log('─'.repeat(70));

  for (const f of data) {
    const date = new Date(f.created_at).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const icon = catIcons[f.category] || '📝';
    const cat = catNames[f.category] || 'ДРУГОЕ';
    console.log(`\n${icon} [${cat}] ${date}`);
    if (f.page) console.log(`   📄 ${f.page}`);
    console.log(`   ${String(f.message || '').split('\n').join('\n   ')}`);
    console.log('─'.repeat(70));
  }

  console.log(`\n✅ Готово. Показано: ${data.length}\n`);
})();
