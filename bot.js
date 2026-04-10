require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const { generateRawData } = require('./generator');
const Groq = require('groq-sdk');
const http = require('http');

// ================= НАСТРОЙКИ =================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const PORT           = process.env.API_PORT || 3001;

// ================= ЗАГРУЗКА БАЗЫ ДАННЫХ =================
const fieldsData = require('./fields.json');
const FIELDS_DB  = {};
fieldsData.fields.forEach(f => { FIELDS_DB[f.id] = f; });
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

const INTEGRATORS = {
    "1-9-1":"Архитектор Реальности","2-9-2":"Хранитель Бесконечного Пространства",
    "3-9-3":"Сердце Вселенной","4-9-4":"Феникс Вечного Обновления",
    "5-9-5":"Император Света","6-9-6":"Повелитель Времени",
    "7-9-7":"Проводник Мирового Разума","8-9-8":"Творец Совершенной Формы",
    "9-1-1":"Архитектор Вечного Порядка","9-2-2":"Творец Пространства Возможностей",
    "9-3-3":"Сердце Мирового Единства","9-4-4":"Феникс Глобальной Эволюции",
    "9-5-5":"Император Внутреннего Солнца","9-6-6":"Повелитель Судьбоносного Потока",
    "9-7-7":"Голос Космического Разума","9-8-8":"Создатель Живых Границ",
    "9-9-9":"Живое Зеркало Вселенной"
};

if (!TELEGRAM_TOKEN || !GROQ_API_KEY) {
    console.error("❌ ОШИБКА: Переменные окружения не найдены!");
    process.exit(1);
}

const bot  = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_API_KEY });
const app  = express();
app.use(cors());
app.use(express.json());

console.log("✅ БОТ ЗАПУЩЕН!");

// ================= ГЕНЕРАЦИЯ ОПИСАНИЯ =================
async function getAIInterpretationJSON(giftCode) {
    const parts = giftCode.split('-').map(Number);
    const [codeMA, codeZHI, codeKUN] = parts;
    const maField  = FIELDS_DB[codeMA];
    const zhiField = FIELDS_DB[codeZHI];
    const kunField = FIELDS_DB[codeKUN];
    if (!maField || !zhiField || !kunField) throw new Error("Ошибка расшифровки кода полей.");

    const isIntegrator = !!INTEGRATORS[giftCode];
    const darName  = isIntegrator ? INTEGRATORS[giftCode] : (DARS_DB[giftCode] || 'Дар');
    const darExt   = fieldsData.dars_extended?.[giftCode];
    const darMeta  = darExt?.metaphor || darName;
    const darEss   = darExt?.essence_short || maField.essence;
    const darFlow  = darExt?.energy_flow || '';
    const darWarn  = darExt?.warning || '';

    let intPhrase = '';
    if (isIntegrator) {
        if (giftCode === '9-9-9') intPhrase = 'Твоё существование становится актом целостного творения.';
        else if (codeZHI === 9)   intPhrase = 'Твоё действие становится актом целостного творения.';
        else                      intPhrase = 'Твоё состояние становится актом целостного творения.';
    }

    const systemPrompt = `Ты — Великий Духовный Наставник и Мудрый Психолог. Создай глубокое, душевное и узнаваемое описание дара человека на основе синтеза трёх полей: ${maField.name}, ${zhiField.name}, ${kunField.name}.

СТРОГИЕ ПРАВИЛА:
1. ЯЗЫК: Только чистый литературный русский язык. Без ошибок, без иностранных слов.
2. ЗАПРЕТ НА ТЕРМИНЫ: Никогда не упоминай "МА", "ЖИ", "КУН", "Поле", "позиция", "цифра", "код". Используй живые понятия.
3. СТИЛЬ: Образно, эмпатично, возвышенно. Тень описывай мягко — как "искажение вектора" или "временное состояние".
4. КОНКРЕТИКА: Приводи примеры фраз в кавычках, описывай язык тела и поведение.
5. ФОРМАТ: Верни ТОЛЬКО валидный JSON без markdown и без текста вне JSON.

Данные полей:
МА (${maField.element}): ${maField.essence} | Тень: ${maField.shadow_ma} | Ключ: ${maField.harmony_key}
ЖИ (${zhiField.element}): ${zhiField.essence} | Тень: ${zhiField.shadow_zhi}
КУН: ${kunField.essence} | Тень: ${kunField.shadow_kun} | Ключ: ${kunField.harmony_key}
${darMeta !== darName ? `Метафора дара: ${darMeta}` : ''}
${darEss ? `Суть: ${darEss}` : ''}
${darFlow ? `Течение энергии: ${darFlow}` : ''}
${darWarn ? `Предостережение: ${darWarn}` : ''}
${intPhrase ? `Особая фраза интегратора: "${intPhrase}"` : ''}

JSON структура:
{
  "sacred_energy": "2-3 предложения. Синтез трёх начал. Одна яркая метафора. Уникальное начало.",
  "light_part": {
    "ma_resource": "Внутренний ресурс. Как человек чувствует силу внутри. Примеры фраз в кавычках.",
    "zhi_action": "Внешнее действие. Как проявляется в поступках. Язык тела.${intPhrase ? ` Вплети: "${intPhrase}"` : ''}",
    "kun_effect": "Итоговый эффект. Что рождается благодаря этому дару."
  },
  "growth_points": {
    "ma_shadow": "Архетип тени + описание пассивного состояния + страх + пример фразы.",
    "zhi_shadow": "Архетип тени + описание активного хаоса + страх + пример фразы.",
    "kun_shadow": "Архетип тени + описание разрыва связи + ощущение бессмысленности."
  },
  "transition_keys": "3 конкретных совета для возврата в гармонию. Мягко, с опорой на стихии.",
  "ecology": {
    "bloom_zones": ["5-6 конкретных профессий или сфер"],
    "risk_zones": ["3-4 среды, где сила угасает"]
  },
  "mission": "Вдохновляющее резюме о предназначении. 1-2 предложения."
}`;

    const completion = await groq.chat.completions.create({
        messages: [
            { role: "system", content: "Возвращай ТОЛЬКО валидный JSON на русском языке. Никакого markdown, никакого текста вне JSON." },
            { role: "user", content: systemPrompt }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.85,
        max_tokens: 2500
    });

    const raw = completion.choices[0]?.message?.content || '';
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON не найден в ответе");
    return JSON.parse(jsonMatch[0]);
}

// ================= API ЭНДПОИНТ =================
app.post('/api/message', async (req, res) => {
    const { giftCode } = req.body;
    if (!giftCode) return res.status(400).json({ error: "Код дара не передан" });
    try {
        console.log(`🔮 Генерация для: ${giftCode}`);
        const data = await getAIInterpretationJSON(giftCode);
        res.json({ data });
    } catch (error) {
        console.error("Ошибка API:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// ================= БОТ =================
const WEB_APP_URL = process.env.WEB_APP_URL || '';
// ID администратора для пересылки обратной связи (узнать через @userinfobot)
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

const mainKeyboard = WEB_APP_URL
    ? { reply_markup: { keyboard: [[{ text: "🚀 Запустить приложение", web_app: { url: WEB_APP_URL } }]], resize_keyboard: true } }
    : { reply_markup: { keyboard: [[{ text: "🚀 Запустить приложение" }]], resize_keyboard: true } };

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
        "🌌 Добро пожаловать в YupDar!\n\nНажми кнопку ниже, чтобы открыть приложение и узнать свой уникальный дар.\n\n💬 Вопрос или баг? Просто напиши мне — я передам автору.",
        mainKeyboard
    );
});

// ================= ОБРАТНАЯ СВЯЗЬ ЧЕРЕЗ БОТА =================
// Пользователь пишет боту → бот пересылает админу
// Админ отвечает командой: /reply <user_id> <текст ответа>

bot.onText(/^\/reply\s+(\d+)\s+([\s\S]+)$/, async (msg, match) => {
    if (!ADMIN_CHAT_ID || msg.chat.id !== ADMIN_CHAT_ID) return;
    const targetId = Number(match[1]);
    const replyText = match[2];
    try {
        await bot.sendMessage(targetId, `💬 Ответ от автора YupDar:\n\n${replyText}`);
        await bot.sendMessage(msg.chat.id, `✅ Ответ доставлен пользователю ${targetId}`);
    } catch (e) {
        await bot.sendMessage(msg.chat.id, `❌ Не удалось отправить: ${e.message}`);
    }
});

bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/start') || msg.text.startsWith('/reply')) return;

    // Если пишет сам админ (не команда /reply) — игнорируем
    if (ADMIN_CHAT_ID && msg.chat.id === ADMIN_CHAT_ID) {
        bot.sendMessage(msg.chat.id,
            "ℹ️ Чтобы ответить пользователю, используй:\n/reply <user_id> <текст>",
            mainKeyboard);
        return;
    }

    // Пересылаем сообщение админу
    if (ADMIN_CHAT_ID) {
        const from = msg.from || {};
        const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Без имени';
        const username = from.username ? `@${from.username}` : 'без username';
        const header = `💬 Обратная связь от ${name} (${username})\n🆔 ID: ${msg.chat.id}\n\n`;
        try {
            await bot.sendMessage(ADMIN_CHAT_ID, header + msg.text);
            await bot.sendMessage(msg.chat.id,
                "✅ Сообщение передано автору. Мы ответим здесь же в чате.\n\nА пока можешь продолжить пользоваться приложением 👇",
                mainKeyboard);
        } catch (e) {
            console.error("Forward error:", e.message);
            await bot.sendMessage(msg.chat.id, "Нажми кнопку ниже 👇", mainKeyboard);
        }
    } else {
        // ADMIN_CHAT_ID не задан — старое поведение
        bot.sendMessage(msg.chat.id, "Нажми кнопку ниже 👇", mainKeyboard);
    }
});

bot.on('polling_error', (e) => console.error("Polling error:", e.message));

// ================= ЗАПУСК СЕРВЕРА =================
app.listen(PORT, () => console.log(`🌐 API сервер на порту ${PORT}`));
