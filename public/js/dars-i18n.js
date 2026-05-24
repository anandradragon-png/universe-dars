/**
 * Локализация имён даров и архетипов для EN и ES.
 *
 * Источник данных: полные книги Даров на английском и испанском
 * (public/preview/book-chapters.en.json, book-chapters.es.json).
 * Имена даров — авторская транслитерация Светланы (LA-DA, ZHIMA, Z-MAN и т.д.),
 * сохраняется едино во всех языках кроме регистра/диакритики.
 * Архетипы — литературные переводы из соответствующих книг.
 *
 * Хелперы getDarName(code) / getDarArchetype(code) автоматически выбирают язык
 * по текущей настройке i18n (window.i18n.getLang()) и падают на RU при отсутствии.
 *
 * Подключение: <script src="js/dars-i18n.js"></script> ПОСЛЕ inline-объявления
 * window.DARS и window.DAR_ARCHETYPES в index.html.
 */
(function() {
  window.DARS_EN = {"2-8-1":"LA-DA","1-4-5":"ZHIMA","3-7-1":"IS-TOK","4-6-1":"ZHAR","5-5-1":"TE-LO","6-4-1":"SVE-TO","7-3-1":"PRI-TOK","8-2-1":"LE-LI","1-1-2":"BRA-MA","3-8-2":"GO-RA","4-7-2":"GU-NA","5-6-2":"SO-NA","6-5-2":"U-MA","7-4-2":"RO-DA","8-3-2":"ME-RU","1-2-3":"LI-RA","2-1-3":"VI-RA","4-8-3":"SI-LA","5-7-3":"MAT-KA","6-6-3":"PARA","7-5-3":"MA-TA","8-4-3":"ANAN-D-RA","1-3-4":"AR-KA","2-2-4":"ZI-MA","3-1-4":"LA-NA","5-8-4":"RO-SA","6-7-4":"VOS-KHA","7-6-4":"MA-AT","8-5-4":"SE-MA","2-3-5":"AR-MA","3-2-5":"RA-MA","4-1-5":"RIMA","6-8-5":"TRO-NA","7-7-5":"ZHI-VA","8-6-5":"A-MA","1-5-6":"KU-NA","2-4-6":"TOTA","3-3-6":"TURA","4-2-6":"E-MA","5-1-6":"LU-NA","7-8-6":"TA-RA","8-7-6":"SO-KHA","1-6-7":"Z-MAN","2-5-7":"BRA-KH-MA","3-4-7":"G-RAD","4-3-7":"AR-KHEI","5-2-7":"NI-RA","6-1-7":"MANA","8-8-7":"PRANA","1-7-8":"BI-RA","2-6-8":"SO-LAR","3-5-8":"KODA","4-4-8":"LI-KO","5-3-8":"ZLA-TO","6-2-8":"BI-MA","7-1-8":"MI-DA","1-8-9":"RAY","2-7-9":"FA-NA","3-6-9":"I-RIY","4-5-9":"SHI-VA","5-4-9":"MI-RA","6-3-9":"TOT","7-2-9":"TO-RA","8-1-9":"ROY"};

  window.DARS_ES = {"2-8-1":"LA-DA","3-7-1":"IS-TOK","4-6-1":"ZHAR","5-5-1":"TE-LO","6-4-1":"SVE-TO","7-3-1":"PRI-TOK","8-2-1":"LE-LI","1-1-2":"BRA-MA","3-8-2":"GO-RA","4-7-2":"GU-NA","5-6-2":"SO-NA","6-5-2":"U-MA","7-4-2":"RO-DA","8-3-2":"ME-RU","1-2-3":"LI-RA","2-1-3":"VI-RA","4-8-3":"SI-LA","5-7-3":"MAT-KA","6-6-3":"PA-RA","7-5-3":"MA-TA","8-4-3":"ANAN-D-RA","1-3-4":"AR-KA","2-2-4":"ZI-MA","3-1-4":"LA-NA","5-8-4":"RO-SA","6-7-4":"VOS-KHA","7-6-4":"MA-AT","8-5-4":"SE-MA","1-4-5":"ZHI-MA","2-3-5":"AR-MA","3-2-5":"RA-MA","4-1-5":"RI-MA","6-8-5":"TRO-NA","7-7-5":"ZHI-VA","8-6-5":"A-MA","1-5-6":"KU-NA","2-4-6":"TO-TA","3-3-6":"TU-RA","4-2-6":"E-MA","5-1-6":"LU-NA","7-8-6":"TA-RA","8-7-6":"SO-KHA","1-6-7":"Z-MAN","2-5-7":"BRA-KH-MA","3-4-7":"G-RAD","4-3-7":"AR-KHEY","5-2-7":"NI-RA","6-1-7":"MA-NA","8-8-7":"PRA-NA","1-7-8":"BI-RA","2-6-8":"SO-LAR","3-5-8":"KO-DA","4-4-8":"LI-KO","5-3-8":"ZLA-TO","6-2-8":"BI-MA","7-1-8":"MI-DA","1-8-9":"RAY","2-7-9":"FA-NA","3-6-9":"IRIY","4-5-9":"SHI-VA","5-4-9":"MI-RA","6-3-9":"TOT","7-2-9":"TO-RA","8-1-9":"ROY"};

  window.DAR_ARCHETYPES_EN = {"2-8-1":"The Architect of Possibility","1-4-5":"The Fabric of Improvement","3-7-1":"The Igniter and the Navigator","4-6-1":"The Smith of Change","5-5-1":"The Center of Power","6-4-1":"The Driving Force","7-3-1":"The Center of the Force Field","8-2-1":"The Gatekeeper and the Architect of Space","1-1-2":"The Foundation of Possibility","3-8-2":"The Architect of Unity","4-7-2":"The Conduit of Ideas","5-6-2":"The Wellspring of Will","6-5-2":"The Eternal Optimizer","7-4-2":"The Speaker of Fire","8-3-2":"The All-Embracing Strategist","1-2-3":"The Maker of Living Systems","2-1-3":"The Architect of Spirit and Currents","4-8-3":"The Builder of Bonds","5-7-3":"The Maker of New Life","6-6-3":"The Alchemy of Rhythm","7-5-3":"The Sculptor of Reality","8-4-3":"The Peacemaker","1-3-4":"The Builder of Trust","2-2-4":"The Kindler of Transformations","3-1-4":"The Heart of the System","5-8-4":"The Will to Transform","6-7-4":"The Moving Force","7-6-4":"The Conduit of Possibility","8-5-4":"The Guardian of Evolution","2-3-5":"The Architect of Unity","3-2-5":"The Source of Light","4-1-5":"The Structural Transformer","6-8-5":"The Rhythm of Breakthrough","7-7-5":"The Voice of Destiny","8-6-5":"The Guide to the Goal","1-5-6":"The Pillar of Reality","2-4-6":"The Conduit of Inner Infinity","3-3-6":"The Cyclical Alchemist","4-2-6":"The Generator of Worlds","5-1-6":"The Systemic Leader","7-8-6":"The Master of Transformations","8-7-6":"The Keeper of Time","1-6-7":"The Screenwriter of Reality","2-5-7":"The Voice of the Future","3-4-7":"The Soul of the Gathering","4-3-7":"The Fire of Inspiration","5-2-7":"The Peacemaker","6-1-7":"The Conductor of Power","8-8-7":"The Pioneer","1-7-8":"The Lawgiver of Reality","2-6-8":"The Architect of the Future","3-5-8":"The Forger of Reality","4-4-8":"The Alchemist of Form","5-3-8":"The Keeper of Treasures","6-2-8":"The Architect of Beauty","7-1-8":"The Architect of Realities","1-8-9":"The Architect of Worlds","2-7-9":"The Magician of Word and Space","3-6-9":"The Stream of Oneness","4-5-9":"The Source of Transformation","5-4-9":"The Heart of Transformation","6-3-9":"The Mirror of the World","7-2-9":"The Joiner of Meanings","8-1-9":"The Architect of Systems"};

  window.DAR_ARCHETYPES_ES = {"2-8-1":"El Arquitecto de Posibilidades","3-7-1":"El Animador y Navegante","4-6-1":"El Forjador del Cambio","5-5-1":"El Centro de Poder","6-4-1":"El Motor del Cambio","7-3-1":"El Centro del Campo de Fuerza","8-2-1":"El Guardián del Umbral","1-1-2":"El Cimiento de Posibilidades","3-8-2":"El Arquitecto de la Unidad","4-7-2":"El Mensajero de Ideas","5-6-2":"El Manantial de la Voluntad","6-5-2":"El Optimizador Eterno","7-4-2":"El Verbo de Fuego","8-3-2":"El Estratega Universal","1-2-3":"El Creador de Sistemas Vivos","2-1-3":"El Arquitecto del Cambio","4-8-3":"El Constructor de Vínculos","5-7-3":"El Creador de Nueva Vida","6-6-3":"El Alquimista del Ritmo","7-5-3":"El Escultor de la Realidad","8-4-3":"El Pacificador","1-3-4":"El Constructor de Confianza","2-2-4":"El Inspirador de Transformaciones","3-1-4":"El Corazón del Sistema","5-8-4":"El Impulso de la Transformación","6-7-4":"El Motor del Cambio","7-6-4":"El Mensajero de Posibilidades","8-5-4":"El Defensor de la Evolución","1-4-5":"El Maestro Práctico - Tejedor de la Realidad","2-3-5":"El Arquitecto de la Alianza","3-2-5":"El Manantial de Luz","4-1-5":"El Transformador Estructural","6-8-5":"El Pulso del Despegue","7-7-5":"El Verbo del Destino","8-6-5":"El Mensajero hacia la Meta","1-5-6":"El Eje de la Realidad","2-4-6":"El Mensajero del Infinito Interior","3-3-6":"El Alquimista del Ciclo","4-2-6":"El Generador de Mundos","5-1-6":"El Líder Sistémico","7-8-6":"El Maestro de las Metamorfosis","8-7-6":"El Guardián del Tiempo","1-6-7":"El Guionista de la Realidad","2-5-7":"El Verbo del Porvenir","3-4-7":"El Alma del Equipo","4-3-7":"El Fuego de la Inspiración","5-2-7":"El Pacificador","6-1-7":"El Mensajero de la Fuerza","8-8-7":"El Pionero","1-7-8":"El Legislador de la Realidad","2-6-8":"El Arquitecto del Porvenir","3-5-8":"El Herrero de la Realidad","4-4-8":"El Alquimista de la Forma","5-3-8":"El Guardián de los Valores","6-2-8":"El Arquitecto de la Belleza","7-1-8":"El Arquitecto de Realidades","1-8-9":"El Arquitecto de Mundos","2-7-9":"El Mago de la Palabra y el Espacio","3-6-9":"El Río de la Unidad Total","4-5-9":"El Manantial de la Transfiguración","5-4-9":"El Corazón de la Transfiguración","6-3-9":"El Espejo del Mundo","7-2-9":"El Tejedor de Sentidos","8-1-9":"El Arquitecto de Sistemas"};

  function currentLang() {
    try {
      if (window.i18n && typeof window.i18n.getLang === 'function') {
        const l = window.i18n.getLang();
        if (l) return l;
      }
    } catch (e) {}
    try {
      const stored = localStorage.getItem('_yupdar_lang');
      if (stored) return stored;
    } catch (e) {}
    return 'ru';
  }

  /**
   * Имя дара по коду в текущем языке. Fallback: RU.
   */
  window.getDarName = function(code) {
    if (!code) return '';
    const lang = currentLang();
    if (lang === 'en' && window.DARS_EN[code]) return window.DARS_EN[code];
    if (lang === 'es' && window.DARS_ES[code]) return window.DARS_ES[code];
    return (window.DARS && window.DARS[code]) || code;
  };

  /**
   * Архетип дара по коду в текущем языке. Fallback: RU.
   */
  window.getDarArchetype = function(code) {
    if (!code) return '';
    const lang = currentLang();
    if (lang === 'en' && window.DAR_ARCHETYPES_EN[code]) return window.DAR_ARCHETYPES_EN[code];
    if (lang === 'es' && window.DAR_ARCHETYPES_ES[code]) return window.DAR_ARCHETYPES_ES[code];
    return (window.DAR_ARCHETYPES && window.DAR_ARCHETYPES[code]) || '';
  };
})();
