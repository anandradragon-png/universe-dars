/**
 * UI модуль кристаллов мудрости
 * Отвечает за отображение баланса, анимации начисления
 */

const CrystalsUI = (function() {
  let currentBalance = 0;

  function init(balance) {
    currentBalance = balance || 0;
    updateDisplay();
  }

  function updateDisplay() {
    const el = document.getElementById('crystal-count');
    if (el) el.textContent = currentBalance;
  }

  function setBalance(newBalance) {
    currentBalance = newBalance;
    updateDisplay();
  }

  /**
   * Анимация начисления кристаллов
   * Показывает "+N" возле счётчика с анимацией
   */
  function animateEarn(amount) {
    if (amount <= 0) return;
    currentBalance += amount;
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
