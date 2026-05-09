/**
 * GET /api/admin/me
 *
 * Проверяет, является ли текущий пользователь админом.
 * Используется фронтом /admin/ при загрузке для редиректа,
 * если пользователь зашёл и не имеет прав.
 *
 * Ответ при успехе: { ok: true, admin: { id, telegram_id, first_name } }
 * Ответ при отказе: 401 (не авторизован) или 403 (не админ)
 */

const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return; // 401/403 уже отправлен

  return res.json({
    ok: true,
    admin: {
      id: admin.id,
      telegram_id: admin.telegram_id,
      first_name: admin.first_name
    }
  });
};
