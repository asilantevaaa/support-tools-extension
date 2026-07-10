/* clip-capture.js — автосохранение того, что копирует пользователь, в «Буфер».
   Слушает copy/cut на странице, берёт выделенный текст и отправляет в background,
   который кладёт его в историю (chrome.storage.local → clipItems).
   Можно отключить в разделе «Буфер» (настройка clipAutoCapture). */
(function () {
  'use strict';
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) return;

  const DBG = false;
  const log = (...a) => { if (DBG) try { console.log('%c[Clip]', 'color:#4f6aff;font-weight:bold', ...a); } catch (e) {} };

  let enabled = true;
  chrome.storage.local.get(['clipAutoCapture'], d => { if ('clipAutoCapture' in d) enabled = d.clipAutoCapture !== false; });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.clipAutoCapture) enabled = c.clipAutoCapture.newValue !== false;
  });

  let lastText = '';
  let lastAt = 0;

  function selText(e) {
    // 1) из события копирования (самый надёжный источник — то, что реально попало в буфер)
    try {
      if (e && e.clipboardData) {
        const t = e.clipboardData.getData('text/plain');
        if (t && t.trim()) return t;
      }
    } catch (_) {}
    // 2) обычное выделение на странице
    try {
      const sel = document.getSelection();
      const t = sel ? sel.toString() : '';
      if (t && t.trim()) return t;
    } catch (_) {}
    // 3) выделение внутри input/textarea
    try {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && typeof el.selectionStart === 'number') {
        return (el.value || '').slice(el.selectionStart, el.selectionEnd);
      }
    } catch (_) {}
    return '';
  }

  function grab(e) {
    if (!enabled) { log('пропуск: автозахват выключен'); return; }
    const text = (selText(e) || '').trim();
    if (!text) { log('пусто — нечего сохранять'); return; }
    const now = Date.now();
    if (text === lastText && now - lastAt < 3000) { log('антидубль'); return; }
    lastText = text; lastAt = now;
    log('сохраняю:', text.slice(0, 60));
    try { chrome.runtime.sendMessage({ action: 'clipAdd', type: 'text', data: text }, () => chrome.runtime.lastError); } catch (e) {}
  }

  // читаем синхронно в момент события (в фазе всплытия clipboardData ещё доступен)
  document.addEventListener('copy', grab, true);
  document.addEventListener('cut',  grab, true);
  log('clip-capture загружен на', location.host);
})();
