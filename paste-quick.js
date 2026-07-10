/* «Сохранить как пасту» на staff.example.com.
   По сообщению из контекстного меню открывает форму «Создание шаблона»
   (кнопка .js-ui-add-template) и подставляет выделенный текст в поле
   «Описание» (textarea.js-ui-text). */
(() => {
    if (location.hostname !== 'staff.example.com') return;
    console.log('%c[Paste] v3.11 загружен (Ctrl+Shift+H)', 'color:#7cc4ff');

    // Текст выделения с сохранением структуры (переносы строк, списки),
    // т.к. info.selectionText из меню схлопывает форматирование.
    function rangeToText(range) {
        const div = document.createElement('div');
        div.appendChild(range.cloneContents());
        div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        div.querySelectorAll('li').forEach(li => { li.prepend('• '); li.append('\n'); });
        div.querySelectorAll('p, div, tr, h1, h2, h3, h4, h5, blockquote').forEach(el => el.append('\n'));
        return div.textContent.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    function grabSelection(fallback) {
        try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount && sel.toString().trim()) {
                const t = rangeToText(sel.getRangeAt(0));
                if (t) return t;
                return sel.toString();
            }
        } catch (_) {}
        return fallback || '';
    }

    function fillDesc(text) {
        // только видимое поле «Описание» открытой формы шаблона
        const ta = [...document.querySelectorAll('textarea.js-ui-text')].find(e => e.offsetParent !== null);
        if (!ta) return false;
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        try { ta.focus(); } catch (_) {}
        return true;
    }

    function openPasteForm(text) {
        if (!text) return;
        // если форма уже открыта — просто заполняем
        if (fillDesc(text)) return;
        const addBtn = document.querySelector('.js-ui-add-template');
        if (addBtn) addBtn.click();
        // ждём появления textarea формы
        let tries = 0;
        const timer = setInterval(() => {
            if (fillDesc(text) || ++tries > 60) clearInterval(timer);
        }, 50);
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === 'savePaste') {
            // считываем живое выделение (с форматированием) до открытия формы;
            // если его нет — текст из контекстного меню
            const text = grabSelection(msg.text);
            openPasteForm(text);
        }
    });

    // Горячая клавиша Ctrl+Shift+H — сохранить выделение как пасту
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyH') {
            const text = grabSelection('');
            if (text) {
                e.preventDefault();
                e.stopPropagation();
                openPasteForm(text);
            }
        }
    }, true);
})();
