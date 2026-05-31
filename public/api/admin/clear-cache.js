/**
 * POST /api/admin/clear-cache
 *
 * Очистка AI-кэша (только админ). Нужна когда Светлана правит промт и
 * хочет чтобы все юзеры сразу увидели новую версию (иначе кэш живёт
 * до конца дня — закон law_session_continuity.md).
 *
 * Тело запроса (всё опционально):
 *   { scope: 'oracle' | 'sections' | 'all', today_only: true|false }
 *
 *   scope: что чистить
 *     - 'oracle'   — только oracle_cache (Оракул)
 *     - 'sections' — только dar_sections_cache (секции Дара в Книге)
 *     - 'all'      — обе таблицы (default)
 *   today_only: true (default) — чистит только записи с date_key = today.
 *               false — чистит всё, но это редко нужно.
 *
 * Ответ:
 *   { ok: true, deleted: { oracle: N, sections: M } }
 */

const { requireAdmin } = require('../_lib/auth');
const { getSupabase } = require('../_lib/db');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return; // requireAdmin сам шлёт 401/403

  const { scope = 'all', today_only = true } = req.body || {};
  const db = getSupabase();
  const deleted = { oracle: 0, sections: 0 };
  const today = todayKey();

  try {
    if (scope === 'oracle' || scope === 'all') {
      let q = db.from('oracle_cache').delete().select('id');
      if (today_only) q = q.eq('date_key', today);
      else q = q.neq('id', -1); // delete all (workaround: supabase требует условие)
      const { data, error } = await q;
      if (error) throw error;
      deleted.oracle = (data || []).length;
    }

    if (scope === 'sections' || scope === 'all') {
      // dar_sections_cache не имеет date_key — там кэш по (user_id, dar_code, section_index).
      // today_only тут означает «только записи созданные сегодня».
      let q = db.from('dar_sections_cache').delete().select('id');
      if (today_only) {
        const startOfDay = new Date(today + 'T00:00:00.000Z').toISOString();
        q = q.gte('created_at', startOfDay);
      } else {
        q = q.neq('id', -1);
      }
      const { data, error } = await q;
      if (error) throw error;
      deleted.sections = (data || []).length;
    }

    console.log('[admin/clear-cache] scope=' + scope + ' today_only=' + today_only + ' deleted=', deleted);

    return res.json({
      ok: true,
      scope,
      today_only,
      deleted,
      message: `Очищено: Оракул ${deleted.oracle}, Секции ${deleted.sections}`
    });
  } catch (e) {
    console.error('[admin/clear-cache] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
