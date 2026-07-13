/* clip-capture.js — автосохранение того, что копирует пользователь, в «Буфер».
   Слушает copy/cut на странице, берёт выделенный текст и отправляет в background,
   который кладёт его в историю (chrome.storage.local → clipItems).
   Opt-in: выключено по умолчанию, включается в разделе «Буфер» (clipAutoCapture).
   Поля паролей и другие чувствительные поля не захватываются. */
(function () {
  'use strict';
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) return;

  const DBG = false;
  const log = (...a) => { if (DBG) try { console.log('%c[Clip]', 'color:#4f6aff;font-weight:bold', ...a); } catch (e) {} };

  // Privacy: auto-capture is OPT-IN. Off unless the user explicitly enables it
  // in Settings → Clipboard. This avoids silently collecting everything the user
  // copies (which could include passwords/tokens) on every page.
  let enabled = false;
  chrome.storage.local.get(['clipAutoCapture'], d => { enabled = d.clipAutoCapture === true; });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.clipAutoCapture) enabled = c.clipAutoCapture.newValue === true;
  });

  // Never capture from sensitive inputs (password fields and anything the page
  // marks as sensitive via autocomplete tokens).
  function isSensitiveTarget() {
    try {
      const el = document.activeElement;
      if (!el) return false;
      if (el.tagName === 'INPUT' && String(el.type).toLowerCase() === 'password') return true;
      const ac = String(el.getAttribute && el.getAttribute('autocomplete') || '').toLowerCase();
      if (/(^|\s)(current-password|new-password|one-time-code|cc-number|cc-csc)(\s|$)/.test(ac)) return true;
    } catch (_) {}
    return false;
  }

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
    if (!enabled) { log('skip: auto-capture disabled'); return; }
    if (isSensitiveTarget()) { log('skip: sensitive field'); return; }
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
