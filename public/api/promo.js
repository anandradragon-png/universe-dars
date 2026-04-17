const { getUser } = require('./lib/auth');
const { getOrCreateUser, updateUser, addCrystals, getSupabase } = require('./lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Мягкая авторизация (как в payment.js) — initData может быть expired
    let tgUser = getUser(req);
    let user = null;

    if (tgUser && tgUser.id) {
      try {
        user = await getOrCreateUser(tgUser);
      } catch (e) {
        console.warn('[promo] getOrCreateUser failed:', e.message);
      }
    }

    // Fallback: парсим user из initData без валидации hash
    if (!user) {
      try {
        const initData = req.headers['x-telegram-init-data'] || '';
        if (initData) {
          const params = new URLSearchParams(initData);
          const userJson = params.get('user');
          if (userJson) {
            const parsed = JSON.parse(userJson);
            if (parsed.id) {
              tgUser = parsed;
              user = await getOrCreateUser(parsed);
              console.log('[promo] Using unvalidated user fallback:', parsed.id);
            }
          }
        }
      } catch (e) {
        console.warn('[promo] fallback auth failed:', e.message);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Не удалось авторизоваться. Закрой и открой приложение заново.' });
    }
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: 'code required' });

    // Коды из env: PROMO_CODES_EXTENDED (дают extended доступ), PROMO_CODES_PREMIUM
    // Хардкод-коды всегда активны, env-коды дополняют
    const hardcodedExtended = ['DARBOOK2024', 'UNIVERSE777', 'СЕМЬЯ2026'];
    const envExtended = (process.env.PROMO_CODES_EXTENDED || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    const extendedCodes = [...new Set([...hardcodedExtended, ...envExtended])];
    const premiumCodes = (process.env.PROMO_CODES_PREMIUM || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

    const inputCode = code.trim().toUpperCase();

    // Проверка: промокод уже был активирован этим пользователем?
    // Тестеры жаловались: при повторном вводе UNIVERSE777 снова давали +20 кристаллов.
    // Ищем в crystal_log запись с reason='promo_*' и metadata.code=inputCode
    const db = getSupabase();
    const { data: existingClaim } = await db
      .from('crystal_log')
      .select('id, amount, reason, metadata')
      .eq('user_id', user.id)
      .in('reason', ['promo_extended', 'promo_premium'])
      .eq('metadata->>code', inputCode)
      .limit(1);

    if (existingClaim && existingClaim.length > 0) {
      // Уже активирован — кристаллы не даём, но сообщаем что уровень есть
      return res.json({
        success: true,
        access_level: user.access_level,
        crystals_bonus: 0,
        message: 'Промо-код уже активирован ранее',
        already_claimed: true
      });
    }

    if (premiumCodes.includes(inputCode)) {
      await updateUser(user.id, { access_level: 'premium' });
      await addCrystals(user.id, 50, 'promo_premium', { code: inputCode });
      return res.json({ success: true, access_level: 'premium', crystals_bonus: 50 });
    }

    if (extendedCodes.includes(inputCode)) {
      if (user.access_level === 'premium') {
        // Уровень уже выше — просто фиксируем что код активирован (без повторного начисления)
        await addCrystals(user.id, 0, 'promo_extended', { code: inputCode });
        return res.json({ success: true, message: 'Already premium', access_level: 'premium', crystals_bonus: 0 });
      }
      await updateUser(user.id, { access_level: 'extended' });
      await addCrystals(user.id, 20, 'promo_extended', { code: inputCode });
      return res.json({ success: true, access_level: 'extended', crystals_bonus: 20 });
    }

    return res.json({ success: false, message: 'Invalid code' });
  } catch (e) {
    console.error('promo.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
