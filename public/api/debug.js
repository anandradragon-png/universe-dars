const Groq = require('groq-sdk');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Верни только JSON: {"test": "ok", "lang": "ru"}' },
        { role: 'user', content: 'Верни тестовый JSON' }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 100
    });
    const raw = completion.choices[0]?.message?.content || '';
    res.status(200).json({ raw, keyOk: !!(process.env.GROQ_API_KEY) });
  } catch(e) {
    res.status(200).json({ error: e.message });
  }
};
