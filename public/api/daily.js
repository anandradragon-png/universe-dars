module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
