// Функция для сведения числа к одной цифре (от 1 до 9)
function reduceToSingleDigit(num) {
    while (num > 9) {
        let sum = 0;
        // Превращаем число в строку, чтобы пройтись по каждой цифре
        let digits = num.toString().split('');
        for (let digit of digits) {
            sum += parseInt(digit);
        }
        num = sum;
    }
    return num;
}

// Главная функция расчета Дара
function calculateGift(day, month, year) {
    // Шаг 1: Расчет МА (День + Месяц)
    let maSum = day + month;
    let ma = reduceToSingleDigit(maSum);

    // Шаг 2: Расчет ЖИ (Год)
    // Сначала суммируем цифры года, например 1995 -> 1+9+9+5 = 24 -> 6
    let yearSum = 0;
    let yearDigits = year.toString().split('');
    for (let digit of yearDigits) {
        yearSum += parseInt(digit);
    }
    let zhi = reduceToSingleDigit(yearSum);

    // Шаг 3: Расчет КУН (МА + ЖИ)
    let kunSum = ma + zhi;
    let kun = reduceToSingleDigit(kunSum);

    // Возвращаем объект с результатами
    return {
        ma: ma,
        zhi: zhi,
        kun: kun,
        code: `${ma}-${zhi}-${kun}`
    };
}

// --- ПРОВЕРКА РАБОТЫ (ТЕСТ) ---
// Давайте проверим на примере даты: 23 августа 1995
const testDate = calculateGift(23, 8, 1995);

console.log(' Тестовый расчет для даты 23.08.1995:');
console.log(`Код Дара: ${testDate.code}`);
console.log(`МА (Потенциал): ${testDate.ma}`);
console.log(`ЖИ (Реализация): ${testDate.zhi}`);
console.log(`КУН (Синергия): ${testDate.kun}`);

// Экспортируем функцию, чтобы использовать её в других файлах
module.exports = { calculateGift };