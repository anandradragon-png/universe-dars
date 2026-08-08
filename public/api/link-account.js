/**
 * Привязка второго входа к текущему аккаунту («две двери — один кабинет»).
 *
 * POST /api/link-account
 *   body: { provider: 'google', access_token }
 *
 * Пользователь уже вошёл (Telegram или веб-сессия) — requireUser даёт его
 * аккаунт. Подтверждаем второй вход (сейчас Google) и привязываем его к этому
 * аккаунту в account_links. После этого вход по второй двери ведёт сюда же.
 *
 * Защита от потери данных: если на эту почту уже есть ОТДЕЛЬНЫЙ веб-аккаунт с
 * покупкой (Книга/подписка) — не привязываем, а просим обратиться в поддержку
 * (иначе оплаченный аккаунт остался бы «осиротевшим»). Пустой веб-аккаунт
 * (только триал/ничего) привязываем спокойно — терять нечего.
 */

const { requireUser } = require('./_lib/auth');
const { getOrCreateUser, linkIdentity, emailToSyntheticTgId, getSupabase } = require('./_lib/db');
const { verifyGoogleAccessToken } = require('./_lib/google');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id, x-web-session');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Кто привязывает — текущий вошедший аккаунт (любая дверь).
  const tgUser = requireUser(req, res);
  if (!tgUser) return; // 401 уже отправлен

  const body = req.body || {};
  const provider = String(body.provider || '').toLowerCase();
  if (provider !== 'google') {
    return res.status(400).json({ error: 'Пока поддерживается только Google' });
  }

  try {
    const v = await verifyGoogleAccessToken(body.access_token);
    if (v.error) return res.status(v.status || 401).json({ error: v.error });
    const email = v.email;

    // Текущий аккаунт (строка users).
    const dbUser = await getOrCreateUser(tgUser);

    // Если эта почта — уже НАШ текущий аккаунт по синтетическому id, привязка не
    // нужна: это тот же кабинет.
    const synthId = emailToSyntheticTgId(email);
    if (dbUser.telegram_id === synthId) {
      return res.status(200).json({ ok: true, already: true, email });
    }

    // Защита: отдельный веб-аккаунт на эту почту с покупкой — не осиротить.
    const db = getSupabase();
    const { data: synthRow } = await db
      .from('users')
      .select('id, book_purchased, subscription_plan, subscription_end')
      .eq('telegram_id', synthId)
      .single();
    if (synthRow && synthRow.id !== dbUser.id) {
      const hasPaid = synthRow.book_purchased
        || (synthRow.subscription_plan && synthRow.subscription_plan !== 'trial_7d'
            && synthRow.subscription_end && new Date(synthRow.subscription_end).getTime() > Date.now());
      if (hasPaid) {
        return res.status(409).json({
          error: 'На эту почту уже есть отдельный аккаунт с покупкой. Напиши в поддержку — перенесём вручную, чтобы ничего не потерять.',
          reason: 'paid_account_exists'
        });
      }
    }

    const r = await linkIdentity(dbUser.id, 'google', email);
    if (r.error) {
      if (r.conflict) {
        return res.status(409).json({
          error: 'Этот Google уже привязан к другому аккаунту.',
          reason: 'linked_to_other'
        });
      }
      return res.status(500).json({ error: 'Не удалось привязать: ' + r.error });
    }

    return res.status(200).json({ ok: true, email });
  } catch (e) {
    console.error('[link-account] error:', e.message);
    return res.status(500).json({ error: 'Ошибка привязки' });
  }
};
