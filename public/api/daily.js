module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Замер кликов по утренней рассылке: клиент дёргает ?ev=open&src=dailydar,
  // когда Mini App открыт из поста (start_param=dailydar). Пишем в app_events.
  if (req.query && req.query.ev === 'open') {
    try {
      const { logEvent } = require('./_lib/notify');
      await logEvent('dailydar_open', { src: String(req.query.src || '') });
    } catch (e) {}
    return res.json({ ok: true });
  }

  function reduce(n) {
    while (n > 9) n = n.toString().split('').reduce((s,d) => s + parseInt(d), 0);
    return n;
  }

  // Расчёт общего Дара Дня по формуле даты
  const today = new Date();
  const day = today.getUTCDate();
  const month = today.getUTCMonth() + 1;
  const year = today.getUTCFullYear();

  // МА = reduce(сумма цифр дня + сумма цифр месяца)
  const dayDigits = day.toString().split('').reduce((s,c) => s + parseInt(c), 0);
  const monthDigits = month.toString().split('').reduce((s,c) => s + parseInt(c), 0);
  const ma = reduce(dayDigits + monthDigits);

  // ЖИ = reduce(сумма цифр года)
  const yearDigits = year.toString().split('').reduce((s,c) => s + parseInt(c), 0);
  const zhi = reduce(yearDigits);

  // КУН = reduce(МА + ЖИ)
  const kun = reduce(ma + zhi);

  const dar_code = `${ma}-${zhi}-${kun}`;

  return res.json({
    date: today.toISOString().slice(0, 10),
    dar_code,
    ma,
    zhi,
    kun
  });
};
