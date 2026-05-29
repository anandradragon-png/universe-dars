#!/usr/bin/env node
/**
 * Добавить недостающие ключи в i18n/{ru,en,es}.json.
 * Запуск: node scripts/add-i18n-missing.js
 *
 * Покрывает критические дыры найденные тестером 29.05.2026 на скриншотах:
 * аккордеоны Я (essence, superpowers, wealth, ...), msg_style, family,
 * treasury subtabs, message/humor overlays, diary, science.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'i18n');

const additions = {
  me: {
    acc_essence: { ru:'Твоя Суть', en:'Your Essence', es:'Tu Esencia' },
    acc_essence_text: { ru:'Носитель своего Дара. Нажми «Получить полное послание» под карточкой Дара — здесь появится твоя личная расшифровка.', en:'Bearer of your DAR. Tap «Get full message» under the DAR card — your personal interpretation will appear here.', es:'Portador de tu DAR. Toca «Recibir mensaje completo» bajo la tarjeta del DAR — aquí aparecerá tu interpretación personal.' },
    acc_superpowers: { ru:'Твои Суперсилы', en:'Your Superpowers', es:'Tus Superpoderes' },
    acc_superpowers_text: { ru:'Уникальные способности твоего архетипа. Появится после получения полного послания.', en:'Unique abilities of your archetype. Will appear after you get the full message.', es:'Habilidades únicas de tu arquetipo. Aparecerán después de recibir el mensaje completo.' },
    acc_wealth: { ru:'Твой Поток Изобилия', en:'Your Abundance Flow', es:'Tu Flujo de Abundancia' },
    acc_wealth_text: { ru:'Через что приходят ресурсы. Появится после получения полного послания.', en:'How resources flow to you. Will appear after the full message.', es:'Cómo te llegan los recursos. Aparecerá tras el mensaje completo.' },
    acc_relationships: { ru:'Ты в Отношениях', en:'You in Relationships', es:'Tú en las Relaciones' },
    acc_relationships_text: { ru:'Как ты любишь и что тебе нужно от близости. Появится после получения полного послания.', en:'How you love and what you need from intimacy. Will appear after the full message.', es:'Cómo amas y qué necesitas de la intimidad. Aparecerá tras el mensaje completo.' },
    acc_traps: { ru:'Твои Ловушки', en:'Your Traps', es:'Tus Trampas' },
    acc_traps_text: { ru:'Типичные тени твоего архетипа. Появится после получения полного послания.', en:'Typical shadows of your archetype. Will appear after the full message.', es:'Sombras típicas de tu arquetipo. Aparecerán tras el mensaje completo.' },
    acc_key: { ru:'Ключ к Себе', en:'Key to Yourself', es:'La Llave a Ti Mismo' },
    acc_key_text: { ru:'Главный ресурс твоего Дара. Появится после получения полного послания.', en:'The main resource of your DAR. Will appear after the full message.', es:'El recurso principal de tu DAR. Aparecerá tras el mensaje completo.' },
    acc_mission: { ru:'Твоё Предназначение', en:'Your Mission', es:'Tu Misión' },
    acc_mission_text: { ru:'Что ты несёшь миру через свой Дар. Появится после получения полного послания.', en:'What you bring to the world through your DAR. Will appear after the full message.', es:'Lo que llevas al mundo a través de tu DAR. Aparecerá tras el mensaje completo.' },
    acc_resonance: { ru:'Резонанс с фазой жизни', en:'Resonance with Life Phase', es:'Resonancia con la Fase de Vida' },
    acc_resonance_teaser: { ru:'Доступно в тарифе Хранитель', en:'Available in Guardian tier', es:'Disponible en el plan Guardián' },
    acc_connections: { ru:'Карта связей', en:'Connection Map', es:'Mapa de Conexiones' },
    acc_connections_teaser: { ru:'Доступно в тарифе Хранитель', en:'Available in Guardian tier', es:'Disponible en el plan Guardián' },
    acc_open_in_arka: { ru:'🛡 Открыть в АРКА', en:'🛡 Open in ARKA', es:'🛡 Abrir en ARKA' },
    diary_title: { ru:'Дневник Дара', en:'DAR Diary', es:'Diario del DAR' },
    diary_sub: { ru:'Одна строка в день — и АРКА начнёт замечать твои паттерны. Бесплатно.', en:'One line a day — and ARKA will start noticing your patterns. Free.', es:'Una línea al día — y ARKA comenzará a notar tus patrones. Gratis.' },
    science_title: { ru:'Внеси вклад в науку о Дарах', en:'Contribute to the Science of DARs', es:'Contribuye a la Ciencia de los DARs' },
    science_sub: { ru:'Пройди опросники и стань частью первого исследования о Дарах', en:'Take the surveys and become part of the first DAR research', es:'Completa las encuestas y sé parte de la primera investigación sobre los DARs' }
  },
  msg_style: {
    label: { ru:'Стиль послания', en:'Message style', es:'Estilo del mensaje' },
    full: { ru:'Полное послание', en:'Full message', es:'Mensaje completo' },
    full_sub: { ru:'Тёплое, глубокое', en:'Warm, deep', es:'Cálido, profundo' },
    humor: { ru:'Стендап-зеркало', en:'Stand-up Mirror', es:'Espejo de Stand-up' },
    humor_sub: { ru:'Ироничный портрет', en:'Ironic portrait', es:'Retrato irónico' }
  },
  dar: {
    get_humor: { ru:'🎭 Читать свой стендап', en:'🎭 Read your stand-up', es:'🎭 Lee tu stand-up' },
    read_humor: { ru:'🎭 Читать стендап', en:'🎭 Read stand-up', es:'🎭 Leer stand-up' },
    read_message: { ru:'📖 Читать о своём Даре', en:'📖 Read about your DAR', es:'📖 Leer sobre tu DAR' }
  },
  message: {
    overlay_title: { ru:'Послание о Даре', en:'Message about your DAR', es:'Mensaje sobre tu DAR' },
    back: { ru:'← Вернуться', en:'← Back', es:'← Volver' }
  },
  humor: {
    overlay_title: { ru:'Стендап-зеркало', en:'Stand-up Mirror', es:'Espejo de Stand-up' },
    regen_btn: { ru:'🔄 Сгенерировать заново', en:'🔄 Regenerate', es:'🔄 Regenerar' },
    share_card_btn: { ru:'📤 Поделиться', en:'📤 Share', es:'📤 Compartir' }
  },
  family: {
    title_full: { ru:'Семья и близкие', en:'Family and loved ones', es:'Familia y seres queridos' },
    subtitle_full: { ru:'Открой Дары близких в своей Сокровищнице', en:'Unlock the DARs of loved ones in your Treasury', es:'Desbloquea los DARs de tus seres queridos en tu Tesorería' },
    invite_title: { ru:'Пригласи друга', en:'Invite a friend', es:'Invita a un amigo' },
    invite_sub: { ru:'Друг рассчитает свой Дар. Откроется в твоей Сокровищнице.', en:'Your friend will calculate their DAR. It will open in your Treasury.', es:'Tu amigo calculará su DAR. Se abrirá en tu Tesorería.' },
    invite_btn: { ru:'Поделиться', en:'Share', es:'Compartir' }
  },
  treasury: {
    subtab_collection: { ru:'Коллекция', en:'Collection', es:'Colección' },
    subtab_books: { ru:'Книги', en:'Books', es:'Libros' },
    subtab_encyclopedia: { ru:'Энциклопедия', en:'Encyclopedia', es:'Enciclopedia' },
    subtab_games: { ru:'Игры', en:'Games', es:'Juegos' }
  }
};

function applyAdditions(target, langKey) {
  for (const sectionName in additions) {
    if (!target[sectionName]) target[sectionName] = {};
    for (const subKey in additions[sectionName]) {
      const val = additions[sectionName][subKey][langKey];
      if (val !== undefined && target[sectionName][subKey] === undefined) {
        target[sectionName][subKey] = val;
      }
    }
  }
}

function countKeys(o) {
  let n = 0;
  for (const k in o) {
    if (typeof o[k] === 'object' && o[k] !== null) n += countKeys(o[k]);
    else n++;
  }
  return n;
}

const langs = ['ru', 'en', 'es'];
for (const lang of langs) {
  const file = path.join(ROOT, lang + '.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = countKeys(data);
  applyAdditions(data, lang);
  const after = countKeys(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(lang + ': ' + before + ' -> ' + after + ' keys (+' + (after - before) + ')');
}
console.log('Done.');
