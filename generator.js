const { calculateGift } = require('./calculator');
const fieldsData = require('./fields.json');

// Преобразуем массив в объект { 1: {...}, 2: {...}, ... } для быстрого доступа
const FIELDS = {};
fieldsData.fields.forEach(field => {
    FIELDS[field.id] = field;
});

/**
 * Генерирует полные данные о Даре по дате рождения
 * @param {string} dateString - дата в формате "ДД.ММ.ГГГГ"
 * @returns {{ giftCode: string, structure: object }}
 */
function generateRawData(dateString) {
    const parts = dateString.split('.');
    const day   = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year  = parseInt(parts[2], 10);

    const gift = calculateGift(day, month, year);
    const giftCode = gift.code;

    const maData  = FIELDS[gift.ma];
    const zhiData = FIELDS[gift.zhi];
    const kunData = FIELDS[gift.kun];

    if (!maData || !zhiData || !kunData) {
        throw new Error(`Не найдено поле для кода: ${giftCode}`);
    }

    const structure = {
        MA: {
            number:         gift.ma,
            name:           maData.name,
            essence:        maData.essence,
            body_sensation: maData.body_sensation,
            shadow_ma:      maData.shadow_ma
        },
        ZHI: {
            number:         gift.zhi,
            name:           zhiData.name,
            essence:        zhiData.essence,
            body_sensation: zhiData.body_sensation,
            shadow_zhi:     zhiData.shadow_zhi
        },
        KUN: {
            number:         gift.kun,
            name:           kunData.name,
            essence:        kunData.essence,
            body_sensation: kunData.body_sensation,
            shadow_kun:     kunData.shadow_kun
        }
    };

    return { giftCode, structure };
}

// Тест: node generator.js
if (require.main === module) {
    const result = generateRawData('23.08.1995');
    console.log('✅ Тест пройден!');
    console.log('Код Дара:', result.giftCode);
    console.log('МА:', result.structure.MA.name);
    console.log('ЖИ:', result.structure.ZHI.name);
    console.log('КУН:', result.structure.KUN.name);
}

module.exports = { generateRawData };