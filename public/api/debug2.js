const Groq = require('groq-sdk');
const fieldsData = require('../fields.json');
const FIELDS_DB = {};
fieldsData.fields.forEach(f => { FIELDS_DB[f.id] = f; });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const maField = FIELDS_DB[1];
    const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Верни только JSON без markdown.' },
        { role: 'user', content: `Данные: ${maField.essence}. Верни JSON: {"test":"ok","text":"одно предложение на русском"}` }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 200
    });
    const raw = completion.choices[0]?.message?.content || '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const clean = start !== -1 && end !== -1 ? raw.slice(start, end+1) : raw;
    let parsed = null;
    try { parsed = JSON.parse(clean); } catch(e) { parsed = {parseError: e.message}; }
    res.status(200).json({ raw: raw.substring(0,300), clean: clean.substring(0,300), parsed });
  } catch(e) {
    res.status(200).json({ error: e.message, stack: e.stack?.substring(0,300) });
  }
};
