/**
 * Реферальная система
 * Генерация ссылок, отправка в Telegram, обработка deep link
 */

const Referral = (function() {
  const tg = window.Telegram?.WebApp;

  /**
   * Получить реферальный параметр из start_param
   * Формат: ref_TELEGRAM_ID
   */
  function getReferrerFromStartParam() {
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('ref_')) {
      return startParam.replace('ref_', '');
    }
    return null;
  }

  /**
   * Обработать реферал при первом расчёте дара
   */
  async function processReferral(newUserDarCode) {
    const referrerId = getReferrerFromStartParam();
    if (!referrerId) return null;

    // Проверить, не обрабатывали ли уже
    if (localStorage.getItem('_referral_processed')) return null;

    try {
      const result = await DarAPI.submitReferral(referrerId, newUserDarCode);
      localStorage.setItem('_referral_processed', 'true');

      if (result.success) {
        showReferralSuccess(result);
      }
      return result;
    } catch (e) {
      console.error('Referral error:', e);
      return null;
    }
  }

  /**
   * Показать кнопку "Поделиться" после расчёта дара
   */
  function renderShareButton(darCode, darName) {
    const container = document.getElementById('share-section');
    if (!container) return;

    container.innerHTML = `
      <div class="share-block">
        <div class="share-title">&#127873; Поделись с другом!</div>
        <div class="share-text">Если дар друга отличается от твоего, ты откроешь его в своей Сокровищнице и получишь кристаллы</div>
        <button class="btn btn-share" onclick="Referral.shareLink()">
          &#128233; Отправить ссылку другу
        </button>
      </div>
    `;
    container.style.display = 'block';
  }

  /**
   * Получить реферальную ссылку текущего пользователя
   */
  function getMyLink() {
    const botUsername = window.BOT_USERNAME || 'YupDarBot';
    const userId = tg?.initDataUnsafe?.user?.id || localStorage.getItem('_dev_telegram_id') || '';
    return `https://t.me/${botUsername}?startapp=ref_${userId}`;
  }

  /**
   * Отправить реферальную ссылку через Telegram share
   */
  function shareLink() {
    const link = getMyLink();
    const text = 'Открой для себя YupDar - путешествие к своему Дару. Узнай свой дар по дате рождения и начни путь Алхимии.';

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    } else {
      // Fallback для браузера
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      window.open(shareUrl, '_blank');
    }
  }

  /**
   * Скопировать ссылку в буфер обмена
   */
  async function copyLink() {
    const link = getMyLink();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        return true;
      }
    } catch (e) {}
    // Fallback: prompt
    prompt('Скопируй эту ссылку:', link);
    return false;
  }

  function showReferralSuccess(result) {
    // Простое уведомление
    let msg;
    if (result.dar_unlocked) {
      msg = `Добро пожаловать в YupDar!\n\nТвой дар открыт в Сокровищнице того, кто тебя пригласил. Это особая связь, которая начинает ваше общее путешествие.\n\n+${result.new_user_crystals} кристаллов мудрости как приветствие.`;
    } else if (result.success) {
      msg = `Добро пожаловать в YupDar!\n\nТот, кто тебя пригласил, уже имел твой дар в своей Сокровищнице. Зато ты приносишь ему кристаллы мудрости.\n\n+${result.new_user_crystals} кристаллов мудрости как приветствие.`;
    } else {
      return;
    }
    setTimeout(() => alert(msg), 500);
  }

  return {
    getReferrerFromStartParam,
    processReferral,
    renderShareButton,
    shareLink,
    copyLink,
    getMyLink
  };
})();
