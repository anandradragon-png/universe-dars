module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ valid: false, error: 'Код не передан' });
    return;
  }

  const validCodes = (process.env.PROMO_CODES || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  const isValid = validCodes.includes(code.trim().toLowerCase());

  res.status(200).json({ valid: isValid, error: isValid ? null : 'Неверный промо-код' });
};
