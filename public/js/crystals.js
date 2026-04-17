/**
 * UI модуль кристаллов мудрости
 * Отвечает за отображение баланса, анимации начисления
 */

const CrystalsUI = (function() {
  let currentBalance = 0;
  let lastLocalChange = 0; // timestamp последней локальной модификации (animateEarn/Spend)

  function init(balance) {
    currentBalance = balance || 0;
    updateDisplay();
  }

  function updateDisplay() {
    const el = document.getElementById('crystal-count');
    if (el) el.textContent = currentBalance;
  }

  // Синк с сервером: если пришло значение меньше текущего И был локальный
  // инкремент в последние 5 секунд — игнорируем (сервер ещё не успел обновиться).
  // Это защита от "прыжков" 83→62→69: сервер возвращает старое значение,
  // пока addCrystals там только-только записался.
  function setBalance(newBalance) {
    const n = Number(newBalance);
    if (!isFinite(n)) return;
    const sinceChange = Date.now() - lastLocalChange;
    if (n < currentBalance && sinceChange < 5000) {
      console.log('[CrystalsUI] Ignoring stale server value', n, 'local is', currentBalance, 'sinceChange', sinceChange);
      return;
    }
    currentBalance = n;
    updateDisplay();
  }

  /**
   * Анимация начисления кристаллов
   * Показывает "+N" возле счётчика с анимацией
   */
  function animateEarn(amount) {
    if (amount <= 0) return;
    currentBalance += amount;
    lastLocalChange = Date.now();
    updateDisplay();

    const counter = document.getElementById('crystal-counter');
    if (!counter) return;

    const popup = document.createElement('div');
    popup.className = 'crystal-popup';
    popup.textContent = `+${amount}`;
    counter.appendChild(popup);

    // Анимация вверх и исчезновение
    requestAnimationFrame(() => {
      popup.style.transform = 'translateY(-30px)';
      popup.style.opacity = '0';
    });
    setTimeout(() => popup.remove(), 800);
  }

  /**
   * Анимация траты кристаллов
   */
  function animateSpend(amount) {
    if (amount <= 0) return;
    currentBalance -= amount;
    if (currentBalance < 0) currentBalance = 0;
    lastLocalChange = Date.now();
    updateDisplay();

    const counter = document.getElementById('crystal-counter');
    if (!counter) return;

    const popup = document.createElement('div');
    popup.className = 'crystal-popup crystal-popup-spend';
    popup.textContent = `-${amount}`;
    counter.appendChild(popup);

    requestAnimationFrame(() => {
      popup.style.transform = 'translateY(-30px)';
      popup.style.opacity = '0';
    });
    setTimeout(() => popup.remove(), 800);
  }

  function getBalance() { return currentBalance; }

  return { init, updateDisplay, setBalance, animateEarn, animateSpend, getBalance };
})();
