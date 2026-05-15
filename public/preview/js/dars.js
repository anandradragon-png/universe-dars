/**
 * Библиотека 64 Даров и таблица букв (для расчётов ОДА/ТУНА/ТРИА/ЧИА).
 * Источник истины: ТЗ_РАСЧЕТЫ.md + dar-content.json основного приложения.
 * НЕ переводить контент через AI — это эталонные имена и архетипы автора.
 */
(function (global) {
  'use strict';

  // Поля (9 секторов вселенной Даров). KUN = 3-я цифра кода = индекс поля.
  const FIELDS = {
    1: { name_ru: 'ЛОГОС',   name_en: 'LOGOS',   name_es: 'LOGOS',   color: '#e74c3c' },
    2: { name_ru: 'НИМА',    name_en: 'NIMA',    name_es: 'NIMA',    color: '#87ceeb' },
    3: { name_ru: 'АНДРА',   name_en: 'ANDRA',   name_es: 'ANDRA',   color: '#2ecc71' },
    4: { name_ru: 'ЗИНГРА',  name_en: 'ZINGRA',  name_es: 'ZINGRA',  color: '#f39c12' },
    5: { name_ru: 'ЛУБА',    name_en: 'LUBA',    name_es: 'LUBA',    color: '#ffffff' },
    6: { name_ru: 'ТУМА',    name_en: 'TUMA',    name_es: 'TUMA',    color: '#1a1a4e' },
    7: { name_ru: 'АСТРА',   name_en: 'ASTRA',   name_es: 'ASTRA',   color: '#9b59b6' },
    8: { name_ru: 'БИТРА',   name_en: 'BITRA',   name_es: 'BITRA',   color: '#5dade2' },
    9: { name_ru: 'ОМА',     name_en: 'OMA',     name_es: 'OMA',     color: '#e8d5ff' }
  };

  // 64 Дара: код → имя
  const DARS = {
    "4-6-1":"ЖАР","3-7-1":"И-СТОК","2-8-1":"ЛА-ДА","8-2-1":"ЛЕ-ЛИ",
    "7-3-1":"ПРИ-ТОК","6-4-1":"СВЕ-ТО","5-5-1":"ТЕ-ЛО",
    "1-1-2":"БРА-МА","3-8-2":"ГО-РА","4-7-2":"ГУ-НА","8-3-2":"МЕ-РУ",
    "7-4-2":"РО-ДА","5-6-2":"СО-НА","6-5-2":"У-МА",
    "8-4-3":"АНАН-Д-РА","2-1-3":"ВИ-РА","1-2-3":"ЛИ-РА","7-5-3":"МА-ТА",
    "5-7-3":"МАТ-КА","6-6-3":"ПА-РА","4-8-3":"СИ-ЛА",
    "1-3-4":"АР-КА","6-7-4":"ВОС-ХА","2-2-4":"ЗИ-МА","3-1-4":"ЛА-НА",
    "7-6-4":"МА-АТ","5-8-4":"РО-СА","8-5-4":"СЕ-МА",
    "8-6-5":"А-МА","2-3-5":"АР-МА","7-7-5":"ЖИ-ВА","1-4-5":"ЖИ-МА",
    "3-2-5":"РА-МА","4-1-5":"РИ-МА","6-8-5":"ТРО-НА",
    "1-5-6":"КУ-НА","5-1-6":"ЛУ-НА","8-7-6":"СО-ХА","7-8-6":"ТА-РА",
    "2-4-6":"ТО-ТА","3-3-6":"ТУ-РА","4-2-6":"Э-МА",
    "4-3-7":"АР-ХЕЙ","2-5-7":"БРА-Х-МА","3-4-7":"ГРАД","1-6-7":"З-МАН",
    "6-1-7":"МА-НА","5-2-7":"НИ-РА","8-8-7":"ПРА-НА",
    "6-2-8":"БИ-МА","1-7-8":"BI-РА","5-3-8":"ЗЛА-ТО","3-5-8":"КО-ДА",
    "4-4-8":"ЛИ-КО","7-1-8":"МИ-ДА","2-6-8":"СО-ЛАР",
    "3-6-9":"ИРИЙ","5-4-9":"МИ-РА","1-8-9":"РАЙ","8-1-9":"РОЙ",
    "7-2-9":"ТО-РА","6-3-9":"ТОТ","2-7-9":"ФА-НА","4-5-9":"ШИ-ВА"
  };

  // Имена 64 Даров на английском (из book-chapters.en.json — транслитерация автора)
  const DARS_EN = {
    "4-6-1":"ZHAR","3-7-1":"IS-TOK","2-8-1":"LA-DA","8-2-1":"LE-LI",
    "7-3-1":"PRI-TOK","6-4-1":"SVE-TO","5-5-1":"TE-LO",
    "1-1-2":"BRA-MA","3-8-2":"GO-RA","4-7-2":"GU-NA","8-3-2":"ME-RU",
    "7-4-2":"RO-DA","5-6-2":"SO-NA","6-5-2":"U-MA",
    "8-4-3":"ANAN-D-RA","2-1-3":"VI-RA","1-2-3":"LI-RA","7-5-3":"MA-TA",
    "5-7-3":"MAT-KA","6-6-3":"PARA","4-8-3":"SI-LA",
    "1-3-4":"AR-KA","6-7-4":"VOS-KHA","2-2-4":"ZI-MA","3-1-4":"LA-NA",
    "7-6-4":"MA-AT","5-8-4":"RO-SA","8-5-4":"SE-MA",
    "8-6-5":"A-MA","2-3-5":"AR-MA","7-7-5":"ZHI-VA","1-4-5":"ZHIMA",
    "3-2-5":"RA-MA","4-1-5":"RIMA","6-8-5":"TRO-NA",
    "1-5-6":"KU-NA","5-1-6":"LU-NA","8-7-6":"SO-KHA","7-8-6":"TA-RA",
    "2-4-6":"TOTA","3-3-6":"TURA","4-2-6":"E-MA",
    "4-3-7":"AR-KHEI","2-5-7":"BRA-KH-MA","3-4-7":"G-RAD","1-6-7":"Z-MAN",
    "6-1-7":"MANA","5-2-7":"NI-RA","8-8-7":"PRANA",
    "6-2-8":"BI-MA","1-7-8":"BI-RA","5-3-8":"ZLA-TO","3-5-8":"KODA",
    "4-4-8":"LI-KO","7-1-8":"MI-DA","2-6-8":"SO-LAR",
    "3-6-9":"I-RIY","5-4-9":"MI-RA","1-8-9":"RAY","8-1-9":"ROY",
    "7-2-9":"TO-RA","6-3-9":"TOT","2-7-9":"FA-NA","4-5-9":"SHI-VA"
  };

  // Имена 64 Даров на испанском
  const DARS_ES = {
    "4-6-1":"ZHAR","3-7-1":"IS-TOK","2-8-1":"LA-DA","8-2-1":"LE-LI",
    "7-3-1":"PRI-TOK","6-4-1":"SVE-TO","5-5-1":"TE-LO",
    "1-1-2":"BRA-MA","3-8-2":"GO-RA","4-7-2":"GU-NA","8-3-2":"ME-RU",
    "7-4-2":"RO-DA","5-6-2":"SO-NA","6-5-2":"U-MA",
    "8-4-3":"ANAN-D-RA","2-1-3":"VI-RA","1-2-3":"LI-RA","7-5-3":"MA-TA",
    "5-7-3":"MAT-KA","6-6-3":"PA-RA","4-8-3":"SI-LA",
    "1-3-4":"AR-KA","6-7-4":"VOS-KHA","2-2-4":"ZI-MA","3-1-4":"LA-NA",
    "7-6-4":"MA-AT","5-8-4":"RO-SA","8-5-4":"SE-MA",
    "8-6-5":"A-MA","2-3-5":"AR-MA","7-7-5":"ZHI-VA","1-4-5":"ZHI-MA",
    "3-2-5":"RA-MA","4-1-5":"RI-MA","6-8-5":"TRO-NA",
    "1-5-6":"KU-NA","5-1-6":"LU-NA","8-7-6":"SO-KHA","7-8-6":"TA-RA",
    "2-4-6":"TO-TA","3-3-6":"TU-RA","4-2-6":"E-MA",
    "4-3-7":"AR-KHEY","2-5-7":"BRA-KH-MA","3-4-7":"G-RAD","1-6-7":"Z-MAN",
    "6-1-7":"MA-NA","5-2-7":"NI-RA","8-8-7":"PRA-NA",
    "6-2-8":"BI-MA","1-7-8":"BI-RA","5-3-8":"ZLA-TO","3-5-8":"KO-DA",
    "4-4-8":"LI-KO","7-1-8":"MI-DA","2-6-8":"SO-LAR",
    "3-6-9":"IRIY","5-4-9":"MI-RA","1-8-9":"RAY","8-1-9":"ROY",
    "7-2-9":"TO-RA","6-3-9":"TOT","2-7-9":"FA-NA","4-5-9":"SHI-VA"
  };

  // Универсалы-интеграторы (когда 1-я, 2-я или 3-я = 9)
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

  // Архетипы (короткое имя из 2 слов под кодом Дара)
  const ARCHETYPES = {
    "4-6-1":"Внутренний вулкан","3-7-1":"Родник силы","2-8-1":"Гармонизатор границ",
    "8-2-1":"Голос природы","7-3-1":"Место силы","6-4-1":"Внутреннее солнце","5-5-1":"Храм души",
    "1-1-2":"Абсолютное внимание","3-8-2":"Вершина власти","4-7-2":"Нить времени",
    "8-3-2":"Вершина мира","7-4-2":"Живая нить рода","5-6-2":"Шут","6-5-2":"Дракон порядка",
    "8-4-3":"Купол любви","2-1-3":"Внутренняя вера","1-2-3":"Ось мира","7-5-3":"Хирург реальности",
    "5-7-3":"Инкубатор реальностей","6-6-3":"Портал любви","4-8-3":"Атланты",
    "1-3-4":"Портал между мирами","6-7-4":"Крылья ангела","2-2-4":"Белый огонь",
    "3-1-4":"Огненный щит","7-6-4":"Цунами вдохновения","5-8-4":"Духовное рождение","8-5-4":"Семя",
    "8-6-5":"Первородное солнце","2-3-5":"Усилитель реальности","7-7-5":"Квинтэссенция жизни",
    "1-4-5":"Алхимическая лаборатория","3-2-5":"Ядерная радость","4-1-5":"Целительный удар",
    "6-8-5":"Трон воли",
    "1-5-6":"Рог изобилия","5-1-6":"Магнит событий","8-7-6":"Сфера покоя",
    "7-8-6":"Конструктор аватара","2-4-6":"Первооткрыватель","3-3-6":"Колесо сансары","4-2-6":"Фантазия",
    "4-3-7":"Архитектор реальности","2-5-7":"Дыхание жизни","3-4-7":"Архитектор единства",
    "1-6-7":"Змей времени","6-1-7":"Манна небесная","5-2-7":"Картограф сновидений","8-8-7":"Выдох вселенной",
    "6-2-8":"Танец красоты","1-7-8":"Путеводная звезда","5-3-8":"Золотая спираль",
    "3-5-8":"Программист реальности","4-4-8":"Театральная маска","7-1-8":"Туннель реальности",
    "2-6-8":"Расширенное сознание",
    "3-6-9":"Река жизни","5-4-9":"Древо миров","1-8-9":"Осознанный выбор","8-1-9":"Живой алгоритм",
    "7-2-9":"Ветер перемен","6-3-9":"Фрактальное зеркало","2-7-9":"Священный момент","4-5-9":"Танец жизни"
  };

  // Кабалистическая таблица: буква → число (из ТЗ_РАСЧЕТЫ.md)
  const LETTER_VALUES = {
    'а':1,'и':1,'с':1,'ъ':1,
    'б':2,'й':2,'т':2,'ы':2,
    'в':3,'к':3,'у':3,'ь':3,
    'г':4,'л':4,'ф':4,'э':4,
    'д':5,'м':5,'х':5,'ю':5,
    'е':6,'н':6,'ц':6,'я':6,
    'ё':7,'о':7,'ч':7,
    'ж':8,'п':8,'ш':8,
    'з':9,'р':9,'щ':9
  };

  // === МАТЕМАТИКА ===

  function currentLang() {
    try {
      if (global.previewI18n && typeof global.previewI18n.getLang === 'function') {
        return global.previewI18n.getLang();
      }
    } catch (e) {}
    return 'ru';
  }

  function reduce(n) {
    n = Math.abs(parseInt(n) || 0);
    while (n > 9) {
      n = String(n).split('').reduce((s, d) => s + parseInt(d, 10), 0);
    }
    return n > 0 ? n : 1;
  }

  function sumDigits(s) {
    return String(s).replace(/\D/g, '').split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
  }

  function getDarName(code, lang) {
    lang = lang || 'ru';
    if (lang === 'en' && DARS_EN[code]) return DARS_EN[code];
    if (lang === 'es' && DARS_ES[code]) return DARS_ES[code];
    return DARS[code] || INTEGRATORS[code] || code;
  }

  function getDarArchetype(code, lang) {
    // Архетипы пока только на RU. Для en/es возвращаем имя дара
    // (это лучше пустой строки, и при наполнении контента архетипов
    //  через AI добавим переводы. Пока показываем сам Дар.)
    lang = lang || 'ru';
    if (lang === 'ru') return ARCHETYPES[code] || (INTEGRATORS[code] || '');
    return ''; // На EN/ES архетип скроется (см. CSS dar-archetype:empty)
  }

  // Путь к SVG-иконке Дара (как в основном приложении).
  // /images/dars/{ru-имя-в-нижнем-без-дефисов}.svg
  function getDarSvgPath(code) {
    const ruName = DARS[code] || INTEGRATORS[code];
    if (!ruName) return '';
    const filename = ruName.toLowerCase().replace(/-/g, '');
    return '/images/dars/' + filename + '.svg';
  }

  // Поле Дара (по 3-й цифре кода = KUN)
  function getField(code) {
    const kun = parseInt(String(code).split('-')[2], 10);
    return FIELDS[kun] || null;
  }

  function getFieldId(code) {
    return parseInt(String(code).split('-')[2], 10) || 0;
  }

  // === ОДА (дата · 100%) ===
  // Вход: { day, month, year }
  function calcOda(date) {
    const ma = reduce(sumDigits(date.day) + sumDigits(date.month));
    const ji = reduce(sumDigits(date.year));
    const kun = reduce(ma + ji);
    const code = `${ma}-${ji}-${kun}`;
    return { ma, ji, kun, code, name: getDarName(code, currentLang()), archetype: getDarArchetype(code, currentLang()), influence: 100 };
  }

  // === ТУНА (время + Кун ОДА · 70%) ===
  // Вход: { hour, minute, kunOda }
  function calcTuna(time, kunOda) {
    const timeSum = sumDigits(time.hour) + sumDigits(time.minute);
    const ma = kunOda;
    const ji = reduce(timeSum);
    // Важно: сначала Кун ОДА, потом сумма времени (порядок имеет значение)
    const kun = reduce(kunOda + timeSum);
    const code = `${ma}-${ji}-${kun}`;
    return { ma, ji, kun, code, name: getDarName(code, currentLang()), archetype: getDarArchetype(code, currentLang()), influence: 70 };
  }

  // === ТРИА (координаты · 40%) ===
  // Вход: { lat, lon } (float, могут быть отрицательные)
  function calcTria(coords) {
    const latInt = Math.abs(Math.trunc(parseFloat(coords.lat) || 0));
    const lonInt = Math.abs(Math.trunc(parseFloat(coords.lon) || 0));
    const ma = reduce(sumDigits(latInt));
    const ji = reduce(sumDigits(lonInt));
    const kun = reduce(ma + ji);
    const code = `${ma}-${ji}-${kun}`;
    return { ma, ji, kun, code, name: getDarName(code, currentLang()), archetype: getDarArchetype(code, currentLang()), influence: 40 };
  }

  // === ЧИА (имя+фамилия · 20%) ===
  // Вход: { firstName, lastName }
  function calcChia(person) {
    function nameSum(str) {
      let total = 0;
      for (const ch of String(str || '').toLowerCase()) {
        if (LETTER_VALUES[ch]) total += LETTER_VALUES[ch];
      }
      return total;
    }
    const ma = reduce(nameSum(person.firstName));
    const ji = reduce(nameSum(person.lastName));
    const kun = reduce(ma + ji);
    const code = `${ma}-${ji}-${kun}`;
    return { ma, ji, kun, code, name: getDarName(code, currentLang()), archetype: getDarArchetype(code, currentLang()), influence: 20 };
  }

  // === ПОЛНЫЙ ПРОФИЛЬ ===
  // Вход: { date, time?, coords?, person? }
  // Возвращает { oda, tuna?, tria?, chia?, synthesis }
  function calcProfile(input) {
    if (!input || !input.date) return null;
    const oda = calcOda(input.date);
    const result = { oda };
    if (input.time && input.time.hour !== undefined) {
      result.tuna = calcTuna(input.time, oda.kun);
    }
    if (input.coords && input.coords.lat !== undefined && input.coords.lon !== undefined) {
      result.tria = calcTria(input.coords);
    }
    if (input.person && input.person.firstName) {
      result.chia = calcChia(input.person);
    }
    // Синтезированный Дар = пока ОДА (заглушка под будущий промт автора).
    // Когда автор пришлёт промт синтеза — заменим эту строку на правильный расчёт.
    result.synthesis = {
      code: oda.code,
      name: getDarName(oda.code, currentLang()),
      archetype: getDarArchetype(oda.code, currentLang()),
      note: 'Синтез пока показывает ОДА. Промт синтеза 4 уровней — в работе.'
    };
    return result;
  }

  global.DarsLib = {
    DARS, DARS_EN, DARS_ES, INTEGRATORS, ARCHETYPES, FIELDS, LETTER_VALUES,
    reduce, sumDigits, getDarName, getDarArchetype, getField, getFieldId, getDarSvgPath,
    calcOda, calcTuna, calcTria, calcChia, calcProfile
  };
})(window);
