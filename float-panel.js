/**
 * float-panel.js — плавающая панель Support Tools поверх страницы.
 * Переживает переход на другую страницу: если панель была открыта и включён
 * режим «показывать на всех вкладках», она восстанавливается на новой странице.
 * Позиция/размер хранятся в chrome.storage.local (общие для всех сайтов).
 */
(function () {
    'use strict';
    const ID = 'support-tools-float';
    const POS_KEY = 'stFloatPos';
    const EVERYWHERE_KEY = 'floatEverywhere'; // default true

    function applyPos(box, pos) {
        if (!pos || typeof pos !== 'object') return;
        if (pos.w) box.style.width = pos.w + 'px';
        if (pos.h) box.style.height = pos.h + 'px';
        if (pos.top != null) box.style.top = pos.top + 'px';
        if (pos.left != null) { box.style.left = pos.left + 'px'; box.style.right = 'auto'; }
    }

    function createPanel() {
        const existing = document.getElementById(ID);
        if (existing) { existing.style.display = 'flex'; return; }
        if (!document.documentElement) return;

        const url = chrome.runtime.getURL('popup.html?mode=detached&float=1&v=4');

        const box = document.createElement('div');
        box.id = ID;
        box.style.cssText = `position:fixed;
            top:90px;right:20px;
            width:380px;height:560px;
            z-index:2147483647;background:#0f1320;border:1px solid #2b3350;border-radius:12px;
            box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;min-width:320px;min-height:360px;
            display:flex;flex-direction:column;font-family:'Segoe UI',sans-serif;`;

        // Восстанавливаем позицию/размер из chrome.storage (общие для всех сайтов)
        try { chrome.storage.local.get(POS_KEY, r => applyPos(box, r && r[POS_KEY])); } catch (e) {}

        const bar = document.createElement('div');
        bar.style.cssText = `height:34px;flex:none;display:flex;align-items:center;justify-content:space-between;
            padding:0 10px;background:#161d2e;cursor:grab;color:#cdd6f4;font-size:13px;font-weight:600;
            border-bottom:1px solid #2b3350;user-select:none;`;
        bar.innerHTML = `<span>Support Tools</span>`;
        const close = document.createElement('span');
        close.textContent = '✕';
        close.style.cssText = 'cursor:pointer;font-size:15px;color:#9ca3af;padding:0 4px;';
        close.onclick = () => {
            box.remove();
            try { chrome.storage.local.set({ floatActive: false }); } catch (e) {}
        };
        bar.appendChild(close);

        const frame = document.createElement('iframe');
        frame.src = url;
        // разрешаем панели читать/писать буфер обмена (иначе копирование картинок из «Буфера» не работает)
        frame.allow = 'clipboard-read; clipboard-write';
        frame.style.cssText = 'flex:1;width:100%;border:none;background:#0f1320;';

        // Уголок для ручного ресайза (поверх iframe, чтобы iframe не перехватывал мышь)
        const grip = document.createElement('div');
        grip.style.cssText = `position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;
            z-index:2;background:linear-gradient(135deg,transparent 50%,#3a4a6f 50%,#3a4a6f 60%,transparent 60%,transparent 75%,#3a4a6f 75%,#3a4a6f 85%,transparent 85%);`;

        box.appendChild(bar);
        box.appendChild(frame);
        box.appendChild(grip);
        document.documentElement.appendChild(box);

        const savePos = () => {
            const r = box.getBoundingClientRect();
            try {
                chrome.storage.local.set({ [POS_KEY]: {
                    top: Math.round(r.top), left: Math.round(r.left),
                    w: Math.round(r.width), h: Math.round(r.height)
                }});
            } catch (e) {}
        };

        // Ручной ресайз за уголок
        let resizing = false, rw = 0, rh = 0, rx = 0, ry = 0;
        grip.addEventListener('mousedown', (e) => {
            resizing = true;
            const r = box.getBoundingClientRect();
            rw = r.width; rh = r.height; rx = e.clientX; ry = e.clientY;
            frame.style.pointerEvents = 'none';
            e.preventDefault(); e.stopPropagation();
        });
        document.addEventListener('mousemove', (e) => {
            if (!resizing) return;
            box.style.width  = Math.max(320, rw + (e.clientX - rx)) + 'px';
            box.style.height = Math.max(360, rh + (e.clientY - ry)) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!resizing) return;
            resizing = false; frame.style.pointerEvents = 'auto'; savePos();
        });

        // Перетаскивание за шапку
        let dragging = false, ox = 0, oy = 0;
        bar.addEventListener('mousedown', (e) => {
            if (e.target === close) return;
            dragging = true; bar.style.cursor = 'grabbing';
            const r = box.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            frame.style.pointerEvents = 'none';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            box.style.left = Math.max(0, Math.min(e.clientX - ox, innerWidth - box.offsetWidth)) + 'px';
            box.style.top = Math.max(0, Math.min(e.clientY - oy, innerHeight - box.offsetHeight)) + 'px';
            box.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false; bar.style.cursor = 'grab'; frame.style.pointerEvents = 'auto';
            savePos();
        });
    }

    function removePanel() {
        const el = document.getElementById(ID);
        if (el) el.remove();
    }

    function togglePanel() {
        if (document.getElementById(ID)) {
            removePanel();
            try { chrome.storage.local.set({ floatActive: false }); } catch (e) {}
        } else {
            createPanel();
            try { chrome.storage.local.set({ floatActive: true }); } catch (e) {}
        }
    }

    // Авто-восстановление при загрузке страницы:
    // только если панель активна И включён режим «на всех вкладках».
    try {
        chrome.storage.local.get(['floatActive', EVERYWHERE_KEY], (r) => {
            const everywhere = r[EVERYWHERE_KEY] !== false; // по умолчанию true
            if (r && r.floatActive && everywhere) createPanel();
        });
    } catch (e) {}

    // Команды от попапа / фоновой страницы (горячие клавиши)
    try {
        chrome.runtime.onMessage.addListener((req) => {
            if (req.action === 'floatOn') {
                chrome.storage.local.set({ floatActive: true });
                createPanel();
            } else if (req.action === 'floatOff') {
                chrome.storage.local.set({ floatActive: false });
                removePanel();
            } else if (req.action === 'floatToggle') {
                togglePanel();
            } else if (req.action === 'closeAllPanels') {
                chrome.storage.local.set({ floatActive: false });
                removePanel();
            }
        });
    } catch (e) {}
})();
