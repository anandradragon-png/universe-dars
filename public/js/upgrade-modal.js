/**
 * Общий модуль для показа модалки «Лимит исчерпан».
 * Используется когда API вернул 403 с reason типа 'oracle_limit_reached',
 * 'compatibility_limit_reached', и т.д.
 *
 * Юзеру показываются 2 кнопки:
 *   1. Открыть тарифы (главная цель)
 *   2. Купить add-on разово (если applicable)
 *
 * Usage:
 *   UpgradeModal.show({
 *     title: 'Дневной лимит Оракула исчерпан',
 *     message: '...',
 *     addonKey: 'oracle_unlimited_7d',  // опционально
 *     addonLabel: 'Безлимит на 7 дней — 149 ₽'
 *   });
 */

window.UpgradeModal = (function() {
  let modalEl = null;

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'upgrade-modal-root';
    modalEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);display:none;z-index:11000;align-items:center;justify-content:center;padding:20px;font-family:Manrope,-apple-system,sans-serif;';
    modalEl.innerHTML = `
      <div style="background:linear-gradient(160deg,#1a1a14 0%,#0a0a0a 100%);border:1.5px solid rgba(212,175,55,0.4);border-radius:16px;padding:24px 20px;max-width:380px;width:100%;color:#eaeaea;position:relative">
        <button id="upgrade-modal-close" style="position:absolute;top:10px;right:14px;background:none;border:none;color:#888;font-size:22px;cursor:pointer;line-height:1;padding:4px">&times;</button>
        <div style="text-align:center;font-size:36px;margin-bottom:8px" id="upgrade-modal-icon">🔒</div>
        <h2 id="upgrade-modal-title" style="text-align:center;font-size:17px;color:#D4AF37;margin:0 0 8px;font-weight:600;letter-spacing:0.5px"></h2>
        <p id="upgrade-modal-message" style="text-align:center;font-size:13px;color:#bbb;line-height:1.6;margin:0 0 20px"></p>
        <button id="upgrade-modal-open-pricing" style="width:100%;padding:13px;border-radius:10px;border:none;background:linear-gradient(160deg,#E8C84A 0%,#D4AF37 30%,#9A7B1A 70%,#D4AF37 100%);color:#080808;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:0.5px;margin-bottom:8px">🛡 Открыть тарифы</button>
        <button id="upgrade-modal-buy-addon" style="display:none;width:100%;padding:11px;border-radius:10px;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.10);color:#D4AF37;font-size:13px;cursor:pointer;font-family:inherit"></button>
        <div style="text-align:center;font-size:11px;color:#666;margin-top:14px;line-height:1.5" id="upgrade-modal-footer"></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) hide();
    });
    modalEl.querySelector('#upgrade-modal-close').addEventListener('click', hide);
    modalEl.querySelector('#upgrade-modal-open-pricing').addEventListener('click', () => {
      hide();
      window.location.href = '/pricing.html';
    });
    return modalEl;
  }

  function show(opts) {
    const m = ensureModal();
    m.style.display = 'flex';
    m.querySelector('#upgrade-modal-icon').textContent = opts.icon || '🔒';
    m.querySelector('#upgrade-modal-title').textContent = opts.title || 'Доступ ограничен';
    m.querySelector('#upgrade-modal-message').textContent = opts.message || '';
    m.querySelector('#upgrade-modal-footer').textContent = opts.footer || 'Подписку можно отменить в любой момент';

    const addonBtn = m.querySelector('#upgrade-modal-buy-addon');
    if (opts.addonKey && opts.addonLabel) {
      addonBtn.style.display = 'block';
      addonBtn.textContent = '⚡ ' + opts.addonLabel;
      addonBtn.onclick = async () => {
        hide();
        await buyAddon(opts.addonKey);
      };
    } else {
      addonBtn.style.display = 'none';
    }
  }

  function hide() {
    if (modalEl) modalEl.style.display = 'none';
  }

  async function buyAddon(addonKey) {
    try {
      const tg = window.Telegram?.WebApp;
      const headers = { 'Content-Type': 'application/json' };
      if (tg?.initData) headers['x-telegram-init-data'] = tg.initData;

      // Провайдер: для пользователей RU по умолчанию ЮKassa, остальным Stars
      const lang = (tg?.initDataUnsafe?.user?.language_code || '').toLowerCase();
      const provider = (lang === 'ru' || lang === 'be' || lang === 'uk') ? 'yookassa' : 'stars';

      const body = { action: 'create_addon', kind: 'addon', key: addonKey, provider };
      const r = await fetch('/api/payment', { method: 'POST', headers, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        alert('Ошибка: ' + (j.error || r.status));
        return;
      }

      if (provider === 'stars' && j.invoice_url && tg?.openInvoice) {
        tg.openInvoice(j.invoice_url, (status) => {
          if (status === 'paid' && tg.showAlert) tg.showAlert('Оплата прошла, обновляю…');
          if (status === 'paid') setTimeout(() => location.reload(), 1500);
        });
      } else if (j.invoice_url) {
        if (tg?.openLink) tg.openLink(j.invoice_url);
        else window.open(j.invoice_url, '_blank');
      }
    } catch (e) {
      alert('Ошибка соединения: ' + e.message);
    }
  }

  // === ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК 403 ===
  // Перехватывает все fetch-ответы из приложения и показывает модалку,
  // если сервер вернул один из известных лимит-кодов.
  // Это самый чистый способ — не приходится менять каждую ручку отдельно.
  const KNOWN_LIMIT_REASONS = {
    'oracle_limit_reached': {
      icon: '🔮',
      title: 'Дневной лимит Оракула',
      message: 'На бесплатном тарифе доступно 1 предсказание в день. Открой Хранителя — 3 в день. Или Мастер — безлимит.',
      addonKey: 'oracle_unlimited_7d',
      addonLabel: 'Безлимит на 7 дней — 149 ₽'
    },
    'compatibility_limit_reached': {
      icon: '💑',
      title: 'Лимит совместимости',
      message: 'Бесплатная проверка уже использована. У Хранителя 5 проверок в месяц, у Мастера — безлимит.',
      addonKey: 'compatibility_pdf',
      addonLabel: 'Глубокая совместимость PDF — 249 ₽'
    },
    'hero_journey_locked': {
      icon: '🗺',
      title: 'Путь Героя ещё закрыт',
      message: 'Этот Путь Героя можно открыть: пригласи друга с этим даром (тебе откроется превью бесплатно), купи за 300 кристаллов / 50 звёзд / 99 ₽, или возьми Мастера — у него открыты все 64 дара.',
    }
  };

  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const _origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      // === Симуляция тарифа для админа ===
      // Если в localStorage есть _simulate_tier, прокидываем header во все запросы.
      // Сервер увидит его только если у юзера is_admin=TRUE (см. pricing.getEffectiveTierWithSimulation).
      try {
        const simTier = localStorage.getItem('_simulate_tier');
        if (simTier) {
          init = init || {};
          init.headers = { ...(init.headers || {}), 'x-admin-simulate-tier': simTier };
        }
      } catch (e) {}

      const resp = await _origFetch(input, init);
      // Клонируем для безопасного чтения без потери оригинального response
      if (resp.status === 403) {
        try {
          const cloned = resp.clone();
          const data = await cloned.json();
          const reason = data.error || data.reason;
          if (reason && KNOWN_LIMIT_REASONS[reason]) {
            const cfg = KNOWN_LIMIT_REASONS[reason];
            show({
              icon: cfg.icon,
              title: cfg.title,
              message: data.message || cfg.message,
              addonKey: cfg.addonKey,
              addonLabel: cfg.addonLabel
            });
          }
        } catch (e) {
          // не JSON или нет reason — игнорируем
        }
      }
      return resp;
    };
  }

  return { show, hide, buyAddon };
})();
