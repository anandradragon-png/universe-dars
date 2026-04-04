const { Telegraf } = require('telegraf');

const bot = new Telegraf('7963579322:AAEOgD-XFE5mJ1KS_DX-7t_AFFJBcb_YerU');

console.log('🚀 Запускаю бота...');

bot.telegram.getMe().then((me) => {
    console.log('✅ УСПЕХ! Бот видит Telegram.');
    console.log('🤖 Имя бота:', me.username);

    bot.start((ctx) => {
        ctx.reply('Привет! Я бот вселенной Дар 🌌\nЯ помогу тебе узнать себя лучше.');
    });

    bot.help((ctx) => {
        ctx.reply('Доступные команды:\n/start - Начать общение\n/help - Помощь');
    });

    bot.launch();
    console.log('📡 Бот слушает сообщения...');

}).catch((err) => {
    console.error('❌ ОШИБКА! Не удалось соединиться с Telegram.');
    console.error('Ошибка:', err.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));