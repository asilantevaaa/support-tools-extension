// ── Глобальный перехват ошибок ──
const showError = (msg, details = '') => {
    try {
        const banner = document.getElementById('global-error-banner');
        const detailsDiv = document.getElementById('error-details');
        if (banner && detailsDiv) {
            banner.style.display = 'block';
            if (details) {
                detailsDiv.textContent = details.substring(0, 200);
            }
        }
    } catch (e) {
        console.error('Error showing error banner:', e);
    }
};

// Проверка наличия chrome API прямо в момент вызова
const isChromeAvailable = () => {
    try {
        return !!(typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage);
    } catch {
        return false;
    }
};

window.onerror = (msg, url, line, col, err) => {
    const s = String(msg);
    if (!s.includes('Extension context invalidated') && !s.includes('sendMessage')) {
        showError('Window Error', s);
    }
    return false;
};

window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason?.message || String(e.reason);
    if (!reason.includes('Extension context invalidated') && !reason.includes('sendMessage')) {
        showError('Promise Rejection', reason.substring(0, 200));
    }
});

// ── Тема: применяем сразу при загрузке ──────────────────────────────────
const applyTheme = () => {
    const t = localStorage.getItem('theme') || 'dark';
    document.documentElement.classList.toggle('light', t === 'light');
};
applyTheme();
window.addEventListener('storage', (e) => { if (e.key === 'theme') applyTheme(); });

// ── Режим отдельного окна: класс на body + сохранение размера ──
const IS_DETACHED = new URLSearchParams(location.search).get('mode') === 'detached';
if (IS_DETACHED) {
    document.documentElement.classList.add('detached');
    window.addEventListener('beforeunload', () => {
        localStorage.setItem('detachedW', window.outerWidth);
        localStorage.setItem('detachedH', window.outerHeight);
    });
}

// ── Кэш результатов (TTL из настроек, localStorage) ─────────────────────
const getCacheTTL = () => {
    const mins = parseInt(localStorage.getItem('cacheTTL') || '5');
    return mins * 60 * 1000; // 0 = отключён
};
const cacheSet = (key, data) => {
    if (!getCacheTTL()) return;
    try { localStorage.setItem('stc_' + key, JSON.stringify({ data, ts: Date.now() })); } catch {}
};
const cacheGet = (key) => {
    if (!getCacheTTL()) return null;
    try {
        const ttl  = getCacheTTL();
        const item = JSON.parse(localStorage.getItem('stc_' + key) || 'null');
        if (!item) return null;
        if (Date.now() - item.ts > ttl) { localStorage.removeItem('stc_' + key); return null; }
        return item.data;
    } catch { return null; }
};

document.addEventListener('DOMContentLoaded', () => {

    // ── Настройки и Открепить — инициализируем в первую очередь ─────────────
    (() => {
        const settingsUrl = chrome.runtime.getURL('settings.html');

        const openSettings = () => {
            const w = parseInt(localStorage.getItem('settingsW') || '500');
            const h = parseInt(localStorage.getItem('settingsH') || '680');
            // Пробуем открыть как popup-окно; при любой ошибке — как вкладку
            try {
                chrome.windows.create(
                    { url: settingsUrl, type: 'popup', width: w, height: h },
                    () => { if (chrome.runtime.lastError) chrome.tabs.create({ url: settingsUrl }); }
                );
            } catch (_) {
                chrome.tabs.create({ url: settingsUrl });
            }
        };

        document.getElementById('btn-gear-header')?.addEventListener('click', openSettings);
        document.getElementById('btn-gear')?.addEventListener('click', openSettings);

        // Открепить → float panel
        document.getElementById('btn-detach')?.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id || /^chrome:\/\//.test(tab.url || '')) {
                    alert('Плавающую панель нельзя открыть на этой странице');
                    return;
                }
                await chrome.storage.local.set({ floatActive: true });
                chrome.tabs.sendMessage(tab.id, { action: 'floatOn' }, () => {
                    if (chrome.runtime.lastError) {
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['float-panel.js']
                        }).catch(() => {});
                    }
                });
                window.close();
            } catch (e) {
                console.error('[detach]', e);
                alert('Ошибка: ' + e.message);
            }
        });
    })();

    // Универсальное копирование: Clipboard API + fallback execCommand
    // (в плавающей панели Clipboard API заблокирован политикой страницы)
    function copyClip(text) {
        return new Promise((resolve, reject) => {
            const fallback = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
                    document.body.appendChild(ta);
                    ta.focus(); ta.select();
                    const ok = document.execCommand('copy');
                    ta.remove();
                    ok ? resolve() : reject(new Error('copy failed'));
                } catch (e) { reject(e); }
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(resolve).catch(fallback);
            } else { fallback(); }
        });
    }

    // Копирование любого поля результата по клику (Whois / DNS / IP-Check)
    ['whois-result', 'dns-result', 'checkhost-info', 'checkhost-nodes', 'st-result'].forEach(cid => {
        const cont = document.getElementById(cid);
        if (!cont) return;
        cont.addEventListener('click', (e) => {
            const val = e.target.closest('.r-value');
            if (!val || !cont.contains(val)) return;
            if (window.getSelection().toString()) return;
            const txt = val.textContent.trim();
            if (!txt || txt === '—') return;
            copyClip(txt).then(() => {
                const tag = document.createElement('span');
                tag.textContent = ' ✓';
                tag.style.color = 'var(--ok)';
                val.appendChild(tag);
                setTimeout(() => tag.remove(), 900);
            });
        });
    });
    // Подсказка-курсор для значений
    const fieldCopyStyle = document.createElement('style');
    fieldCopyStyle.textContent = '#whois-result .r-value,#dns-result .r-value,#checkhost-info .r-value,#st-result .r-value{cursor:pointer} #whois-result .r-value:hover,#dns-result .r-value:hover,#checkhost-info .r-value:hover,#st-result .r-value:hover{color:var(--accent)}';
    document.head.appendChild(fieldCopyStyle);

    // Клик по результату «Даты» — копирование
    ['date-calc-result', 'date-diff-result'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.cursor = 'pointer';
            el.title = 'Нажмите, чтобы скопировать';
            el.addEventListener('click', () => {
                const t = el.textContent.trim();
                if (t) copyClip(t).then(() => {
                    const old = el.style.color;
                    el.style.color = 'var(--ok)';
                    setTimeout(() => { el.style.color = old; }, 800);
                });
            });
        }
    });

    // ── Иконки копирования у полей результата ──
    const COPY_ICO_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const ICO_SEARCH   = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>';
    const ICO_GLOBE    = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6"/></svg>';
    const ICO_BUILDING = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="12" height="10"/><path d="M5 14V9h6v5"/><line x1="5" y1="7" x2="5" y2="7.01"/><line x1="8" y1="7" x2="8" y2="7.01"/><line x1="11" y1="7" x2="11" y2="7.01"/><line x1="2" y1="4" x2="8" y2="1" x2="8" y2="1"/><path d="M2 4L8 1l6 3"/></svg>';
    const ICO_PUZZLE   = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h4v2c0 1 1 1.5 1 1.5S12 6 13 6h1v4h-2c-1 0-1.5 1-1.5 1S10 12 10 13v1H6v-2c0-1-1-1.5-1-1.5S4 10 3 10H2V6h2c1 0 1.5-1 1.5-1S6 4 6 3V2z"/></svg>';
    const ICO_LIGHTNING= '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><polygon points="9,1 3,9 8,9 7,15 13,7 8,7"/></svg>';
    const ICO_PLAY     = '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><polygon points="4,2 13,8 4,14"/></svg>';
    const ICO_TRASH    = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2,4 14,4"/><path d="M5 4V2h6v2M5 7v6M11 7v6"/><rect x="3" y="4" width="10" height="10" rx="1"/></svg>';

    // Плавающий исчезающий тост «✓ Скопировано» рядом с элементом
    function showCopiedToast(anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        // не даём тосту уехать за края окна
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 130));
        const top = Math.max(4, r.top - 26);
        const t = document.createElement('div');
        t.textContent = '✓ Скопировано';
        t.style.cssText = `position:fixed;z-index:2147483647;left:${left}px;top:${top}px;
            background:var(--ok,#22c55e);color:#fff;font-size:11px;font-weight:600;padding:3px 8px;
            border-radius:6px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.25);
            transition:opacity .4s,transform .4s;opacity:1`;
        document.body.appendChild(t);
        // держим видимым дольше, потом плавно гаснет
        setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-6px)'; }, 1100);
        setTimeout(() => t.remove(), 1600);
    }
    function attachCopyIcons(containerId) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        const addIcons = () => {
            cont.querySelectorAll('.result-row').forEach(row => {
                const v = row.querySelector('.r-value');
                if (!v || row.querySelector('.copy-ico')) return;
                const text = v.textContent.trim();
                if (!text) return;
                const b = document.createElement('button');
                b.className = 'copy-ico';
                b.title = 'Скопировать';
                b.innerHTML = COPY_ICO_SVG;
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const text = v.dataset.copy || v.textContent.trim();
                    copyClip(text).then(() => {
                        b.classList.add('ok');
                        showCopiedToast(b);
                        setTimeout(() => b.classList.remove('ok'), 900);
                    });
                });
                row.appendChild(b); // в конец строки, а не внутрь значения
            });
        };
        new MutationObserver(addIcons).observe(cont, { childList: true, subtree: true });
        addIcons();
    }
    // Копирование для .result-plain (Даты и пр.) — иконка в углу
    function attachPlainCopy(id) {
        const el = document.getElementById(id);
        if (!el) return;
        const sync = () => {
            if (el.dataset.copyReady) return;
            el.style.position = 'relative';
        };
        const obs = new MutationObserver(() => {
            const txt = el.textContent.trim();
            let b = el.querySelector(':scope > .copy-ico');
            if (txt && !b) {
                b = document.createElement('button');
                b.className = 'copy-ico';
                b.style.cssText = 'position:absolute;top:6px;right:6px';
                b.title = 'Скопировать'; b.innerHTML = COPY_ICO_SVG;
                el.style.position = 'relative';
                el.appendChild(b);
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const clone = el.cloneNode(true);
                    clone.querySelectorAll('.copy-ico').forEach(x => x.remove());
                    copyClip(clone.textContent.trim()).then(() => { b.classList.add('ok'); showCopiedToast(b); setTimeout(() => b.classList.remove('ok'), 900); });
                });
            } else if (!txt && b) { b.remove(); }
        });
        obs.observe(el, { childList: true, subtree: true });
        sync();
    }

    // Безопасный отправитель сообщений — проверяет runtime прямо в момент вызова
    const safeSendMessage = (msg, callback) => {
        try {
            if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
                callback?.({ success: false, error: 'Chrome API недоступен' });
                return;
            }
            chrome.runtime.sendMessage(msg, (response) => {
                if (chrome.runtime.lastError) {
                    const err = chrome.runtime.lastError.message || '';
                    if (!err.includes('Extension context invalidated')) {
                        console.warn('sendMessage lastError:', err);
                    }
                    callback?.({ success: false, error: err });
                    return;
                }
                callback?.(response);
            });
        } catch (err) {
            if (!err.message?.includes('Extension context invalidated')) {
                console.error('sendMessage error:', err.message);
            }
            callback?.({ success: false, error: err.message });
        }
    };

    // Кнопка закрытия error-banner
    const errorClose = document.getElementById('error-close');
    if (errorClose) {
        errorClose.addEventListener('click', () => {
            document.getElementById('global-error-banner').style.display = 'none';
        });
    }

    // ── Утилита: добавляет кнопку × к полю ввода ──
    const addClearBtn = (inputId, onClear) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        // Оборачиваем input в контейнер
        const wrap = document.createElement('div');
        wrap.className = 'input-clearable';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement('button');
        btn.className = 'input-clear';
        btn.title = 'Очистить';
        btn.innerHTML = '×';
        wrap.appendChild(btn);

        const sync = () => { btn.style.display = input.value ? 'flex' : 'none'; };
        input.addEventListener('input', sync);
        sync();

        btn.addEventListener('click', () => {
            input.value = '';
            btn.style.display = 'none';
            onClear?.();
        });
    };

    // ══════════════════════════════════════
    //  ГОРИЗОНТАЛЬНЫЙ СКРОЛЛ ТАБОВ КОЛЕСИКОМ
    // ══════════════════════════════════════
    const tabsNav = document.querySelector('.tabs-nav');
    if (tabsNav) {
        tabsNav.addEventListener('wheel', (e) => {
            // берём наибольшую по модулю ось (обычное колесо даёт deltaY,
            // горизонтальное колесо/тачпад — deltaX); вниз/вправо = вправо
            const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (!raw) return;
            // нормализуем шаг для режима «по строкам» (deltaMode=1) и пикселей
            const step = e.deltaMode === 1 ? raw * 30 : raw;
            const before = tabsNav.scrollLeft;
            tabsNav.scrollLeft += step;
            // гасим страничный скролл только если таб-бар реально сместился
            if (tabsNav.scrollLeft !== before) e.preventDefault();
        }, { passive: false });
    }

    // ══════════════════════════════════════
    //  TABS — порядок и видимость (localStorage)
    // ══════════════════════════════════════
    const ALL_TABS = [
        { id: 'tab-whois',     label: 'Whois' },
        { id: 'tab-dns',       label: 'DNS' },
        { id: 'tab-shorten',   label: 'Ссылка' },
        { id: 'tab-checkhost', label: 'IP / Check' },
        { id: 'tab-date',      label: 'Даты' },
        { id: 'tab-punycode',  label: 'Punycode' },
        { id: 'tab-pass',      label: 'Пароль' },
        { id: 'tab-translate', label: 'Перевод' },
        { id: 'tab-clip',      label: 'Буфер' },
        { id: 'tab-st',        label: 'ST' },
        { id: 'tab-scanner',   label: 'Домены' },
        { id: 'tab-ssl',       label: 'SSL' },
        { id: 'tab-dnstpl',    label: 'Записи' },
        { id: 'tab-auth',      label: '2FA' },
        { id: 'tab-l2',        label: 'Почта' },
    ];

    const loadTabConfig = () => {
        try { return JSON.parse(localStorage.getItem('tabConfig') || 'null'); } catch { return null; }
    };
    const saveTabConfig = (cfg) => localStorage.setItem('tabConfig', JSON.stringify(cfg));

    const applyTabOrder = (cfg) => {
        const nav   = document.querySelector('.tabs-nav');
        // Кнопка настроек теперь в шапке (btn-gear-header), а не внутри nav.
        // insertBefore требует, чтобы опорный узел был ребёнком nav — иначе
        // вставляем в конец (gear=null). Поэтому берём gear, только если он в nav.
        const gearCand = document.getElementById('btn-gear');
        const gear  = (gearCand && gearCand.parentNode === nav) ? gearCand : null;
        let order = cfg?.order ? cfg.order.slice() : ALL_TABS.map(t => t.id);
        // новые вкладки, которых нет в сохранённом порядке — добавляем В КОНЕЦ
        ALL_TABS.forEach(t => { if (!order.includes(t.id)) order.push(t.id); });
        const hidden = new Set(cfg?.hidden || []);

        order.forEach(id => {
            const btn = nav.querySelector(`[data-target="${id}"]`);
            if (!btn) return;
            nav.insertBefore(btn, gear);
            btn.style.display = hidden.has(id) ? 'none' : '';
        });

        // Если активная вкладка скрыта — активируем первую видимую
        const activeBtn = nav.querySelector('.tab-btn.active');
        if (!activeBtn || activeBtn.style.display === 'none') {
            const first = nav.querySelector('.tab-btn:not([style*="none"])');
            if (first) first.click();
        }
    };

    // Инициализация порядка
    applyTabOrder(loadTabConfig());

    // ══════════════════════════════════════
    //  Объединение Whois/DNS/IP-Check → «Проверка домена»
    // ══════════════════════════════════════
    (function applyDomainMerge() {
        if (localStorage.getItem('domainMerge') !== '1') return;
        const nav = document.querySelector('.tabs-nav');
        if (!nav || document.getElementById('tab-domain')) return;
        const SUBS = [
            { id: 'tab-whois',     label: 'Whois' },
            { id: 'tab-dns',       label: 'DNS' },
            { id: 'tab-checkhost', label: 'IP / Check' },
        ];
        const panes = SUBS.map(s => document.getElementById(s.id));
        if (panes.some(p => !p)) return;

        // стили подвкладок
        const st = document.createElement('style');
        st.textContent =
            '.dom-subtabs{display:flex;gap:6px;margin-bottom:12px}' +
            '.dom-sub{flex:1;padding:7px 0;border:1px solid var(--border);background:var(--surface2);color:var(--muted);border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}' +
            '.dom-sub:hover{color:var(--text)}' +
            '.dom-sub.active{background:var(--accent);color:#fff;border-color:var(--accent)}' +
            '#tab-domain .dom-pane{display:none}' +
            '#tab-domain .dom-pane.active{display:block}';
        document.head.appendChild(st);

        // контейнер новой вкладки
        const dom = document.createElement('div');
        dom.id = 'tab-domain';
        dom.className = 'tab-content';
        const subnav = document.createElement('div');
        subnav.className = 'dom-subtabs';
        subnav.innerHTML = SUBS.map((s, i) => `<button class="dom-sub${i === 0 ? ' active' : ''}" data-sub="${s.id}">${s.label}</button>`).join('');
        dom.appendChild(subnav);
        const body = document.createElement('div');
        body.className = 'dom-body';
        dom.appendChild(body);

        // переносим существующие панели внутрь, снимаем класс .tab-content
        panes.forEach((p, i) => {
            p.classList.remove('tab-content', 'active');
            p.classList.add('dom-pane');
            if (i === 0) p.classList.add('active');
            body.appendChild(p);
        });
        nav.parentNode.appendChild(dom);

        // кнопка «Проверка домена» на месте Whois
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.target = 'tab-domain';
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Проверка домена';
        const firstBtn = nav.querySelector('[data-target="tab-whois"]');
        nav.insertBefore(btn, firstBtn);
        // прячем исходные кнопки
        SUBS.forEach(s => { const b = nav.querySelector(`[data-target="${s.id}"]`); if (b) b.style.display = 'none'; });

        // активировать вкладку «Проверка домена» без опоры на глобальный обработчик
        // (он навешивается ниже по коду и на момент инициализации ещё не готов)
        const openDomain = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            dom.classList.add('active');
            try { localStorage.setItem('stActiveTab', 'tab-domain'); } catch (e) {}
        };

        // переключение подвкладок
        const activateSub = (id) => {
            const s = subnav.querySelector(`[data-sub="${id}"]`);
            if (!s) return;
            subnav.querySelectorAll('.dom-sub').forEach(x => x.classList.toggle('active', x === s));
            body.querySelectorAll('.dom-pane').forEach(p => p.classList.toggle('active', p.id === id));
            try { localStorage.setItem('domActiveSub', id); } catch (e) {}
        };
        subnav.addEventListener('click', (e) => { const s = e.target.closest('.dom-sub'); if (s) activateSub(s.dataset.sub); });

        // клики (в т.ч. программные) по скрытым кнопкам → открыть вкладку + нужную подвкладку
        SUBS.forEach(s => {
            const b = nav.querySelector(`[data-target="${s.id}"]`);
            if (!b) return;
            b.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); openDomain(); activateSub(s.id); }, true);
        });

        // если последний активный раздел был из объединённых — открыть «Проверку домена»
        let last = null; try { last = localStorage.getItem('stActiveTab'); } catch (e) {}
        if (SUBS.some(s => s.id === last)) { try { localStorage.setItem('stActiveTab', 'tab-domain'); localStorage.setItem('domActiveSub', last); } catch (e) {} }

        // восстановить подвкладку
        const lastSub = localStorage.getItem('domActiveSub');
        if (SUBS.some(s => s.id === lastSub)) activateSub(lastSub);

        // если активной оказалась скрытая/объединённая вкладка — активируем «Проверку домена»
        const activeBtn = nav.querySelector('.tab-btn.active');
        if (!activeBtn || activeBtn.style.display === 'none' || SUBS.some(s => s.id === activeBtn.dataset.target)) {
            openDomain();
        }
    })();

    // ══════════════════════════════════════
    //  Генератор паролей
    // ══════════════════════════════════════
    (function initPassGen() {
        const genBtn = document.getElementById('pg-gen');
        if (!genBtn) return;
        const $ = id => document.getElementById(id);
        const lenNum = $('pg-length'), lenRange = $('pg-length-range');
        const out = $('pg-out'), strength = $('pg-strength'), copyOk = $('pg-copy-ok');

        const SETS = {
            digits: '0123456789',
            upper:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            lower:  'abcdefghijklmnopqrstuvwxyz',
            special: '%*)?@#$~',
        };
        const AMBIG = new Set('0Oo1lI|'.split(''));

        // синхронизация ползунка и числа
        lenRange.addEventListener('input', () => { lenNum.value = lenRange.value; });
        lenNum.addEventListener('input', () => {
            let v = parseInt(lenNum.value, 10) || 0;
            if (v > 64) lenRange.value = 64; else if (v < 4) lenRange.value = 4; else lenRange.value = v;
        });

        const rand = (n) => {
            const a = new Uint32Array(1);
            crypto.getRandomValues(a);
            return a[0] % n;
        };

        const buildPools = () => {
            const noamb = $('pg-noambig').checked;
            const clean = s => noamb ? s.split('').filter(c => !AMBIG.has(c)).join('') : s;
            const pools = [];
            if ($('pg-digits').checked)  pools.push(clean(SETS.digits));
            if ($('pg-upper').checked)   pools.push(clean(SETS.upper));
            if ($('pg-lower').checked)   pools.push(clean(SETS.lower));
            if ($('pg-special').checked) pools.push(clean(SETS.special));
            return pools.filter(Boolean);
        };

        const genOne = (len, pools) => {
            const all = pools.join('');
            const chars = [];
            // гарантируем минимум по одному символу из каждого выбранного набора
            pools.forEach(p => { if (chars.length < len) chars.push(p[rand(p.length)]); });
            while (chars.length < len) chars.push(all[rand(all.length)]);
            // перемешиваем (Fisher–Yates)
            for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
            return chars.join('');
        };

        const showStrength = (len, poolSize) => {
            const bits = poolSize > 1 ? Math.round(len * Math.log2(poolSize)) : 0;
            let label, color, pct;
            if (bits < 40)      { label = 'Слабый';   color = 'var(--err)';  pct = 30; }
            else if (bits < 60) { label = 'Средний';  color = '#e0a800';     pct = 55; }
            else if (bits < 80) { label = 'Хороший';  color = '#4f9dff';     pct = 78; }
            else                { label = 'Надёжный'; color = 'var(--ok)';   pct = 100; }
            strength.style.display = 'block';
            strength.innerHTML =
                `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
                    <span style="color:var(--muted)">Надёжность: <b style="color:${color}">${label}</b></span>
                    <span style="color:var(--muted)">~${bits} бит энтропии</span>
                 </div>
                 <div class="pg-bar"><div style="width:${pct}%;background:${color}"></div></div>`;
        };

        const flashCopied = () => {
            if (!copyOk) return;
            copyOk.style.display = 'block';
            setTimeout(() => { copyOk.style.display = 'none'; }, 1500);
        };

        const generate = () => {
            const pools = buildPools();
            if (!pools.length) {
                out.innerHTML = '<div style="font-size:12px;color:var(--err);padding:4px 2px">Выбери хотя бы один набор символов.</div>';
                strength.style.display = 'none';
                return;
            }
            let len = parseInt(lenNum.value, 10) || 12;
            len = Math.max(1, Math.min(256, len));
            if (len < pools.length) len = pools.length; // чтобы влез минимум по одному из набора
            const count = Math.max(1, Math.min(50, parseInt($('pg-count').value, 10) || 1));
            const poolSize = pools.join('').length;

            out.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const pwd = genOne(len, pools);
                const row = document.createElement('div');
                row.className = 'pg-item';
                const code = document.createElement('code');
                code.textContent = pwd;
                const btn = document.createElement('button');
                btn.className = 'pg-copy';
                btn.title = 'Копировать';
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                btn.addEventListener('click', () => { navigator.clipboard.writeText(pwd).then(flashCopied).catch(() => {}); });
                row.appendChild(code); row.appendChild(btn);
                out.appendChild(row);
            }
            showStrength(len, poolSize);
        };

        genBtn.addEventListener('click', generate);
    })();

    // ══════════════════════════════════════
    //  Переводчик (бесплатный Google Translate endpoint через background)
    // ══════════════════════════════════════
    (function initTranslate() {
        const goBtn = document.getElementById('tr-go');
        if (!goBtn) return;
        const $ = id => document.getElementById(id);
        const fromSel = $('tr-from'), toSel = $('tr-to'), swap = $('tr-swap');
        const src = $('tr-src'), out = $('tr-out'), outWrap = $('tr-out-wrap');
        const status = $('tr-status'), copyBtn = $('tr-copy'), copyOk = $('tr-copy-ok');

        const LANGS = [
            ['auto', 'Определить язык'], ['ru', 'Русский'], ['en', 'Английский'], ['uk', 'Украинский'],
            ['de', 'Немецкий'], ['fr', 'Французский'], ['es', 'Испанский'], ['it', 'Итальянский'],
            ['pt', 'Португальский'], ['pl', 'Польский'], ['tr', 'Турецкий'], ['nl', 'Нидерландский'],
            ['zh-CN', 'Китайский'], ['ja', 'Японский'], ['ko', 'Корейский'], ['ar', 'Арабский'],
            ['kk', 'Казахский'], ['be', 'Белорусский'], ['uz', 'Узбекский'], ['az', 'Азербайджанский'],
            ['hy', 'Армянский'], ['ka', 'Грузинский'], ['he', 'Иврит'], ['hi', 'Хинди'],
        ];
        const nameOf = code => (LANGS.find(l => l[0] === code) || [code, code])[1];

        // заполняем селекты (в «Куда» без auto)
        fromSel.innerHTML = LANGS.map(l => `<option value="${l[0]}">${l[1]}</option>`).join('');
        toSel.innerHTML = LANGS.filter(l => l[0] !== 'auto').map(l => `<option value="${l[0]}">${l[1]}</option>`).join('');
        // восстановление выбора
        fromSel.value = localStorage.getItem('trFrom') || 'auto';
        toSel.value = localStorage.getItem('trTo') || 'ru';
        if (!toSel.value) toSel.value = 'ru';
        fromSel.addEventListener('change', () => { try { localStorage.setItem('trFrom', fromSel.value); } catch (e) {} });
        toSel.addEventListener('change', () => { try { localStorage.setItem('trTo', toSel.value); } catch (e) {} });

        swap.addEventListener('click', () => {
            if (fromSel.value === 'auto') return; // нечего менять местами при автоопределении
            const a = fromSel.value; fromSel.value = toSel.value; toSel.value = a;
            try { localStorage.setItem('trFrom', fromSel.value); localStorage.setItem('trTo', toSel.value); } catch (e) {}
            // если уже есть перевод — исходником становится он
            if (out.textContent.trim()) { src.value = out.textContent; }
        });

        const setStatus = (msg, err) => {
            status.style.display = msg ? 'block' : 'none';
            status.textContent = msg || '';
            status.style.color = err ? 'var(--err)' : 'var(--muted)';
        };

        const translate = () => {
            const text = src.value.trim();
            if (!text) { src.focus(); return; }
            goBtn.disabled = true;
            setStatus('Перевожу…', false);
            outWrap.style.display = 'none';
            chrome.runtime.sendMessage(
                { action: 'translate', text, from: fromSel.value, to: toSel.value },
                (resp) => {
                    goBtn.disabled = false;
                    if (chrome.runtime.lastError || !resp) { setStatus('Ошибка связи с фоном. Перезагрузи расширение.', true); return; }
                    if (!resp.success) { setStatus('✗ ' + (resp.error || 'Не удалось перевести'), true); return; }
                    out.textContent = resp.text;
                    outWrap.style.display = 'block';
                    const detected = (fromSel.value === 'auto' && resp.detected) ? ('Определён: ' + nameOf(resp.detected) + ' · ') : '';
                    setStatus(detected + 'через ' + (resp.engine || 'Google'), false);
                }
            );
        };

        goBtn.addEventListener('click', translate);
        // Ctrl+Enter — быстрый перевод
        src.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); translate(); } });

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(out.textContent).then(() => {
                copyOk.style.display = 'block';
                setTimeout(() => { copyOk.style.display = 'none'; }, 1500);
            }).catch(() => {});
        });

        // ── Перевод всей открытой страницы «на месте» ──
        const pageBtn = $('tr-page'), restoreBtn = $('tr-page-restore'), pageStatus = $('tr-page-status');
        const setPageStatus = (msg, err) => {
            pageStatus.style.display = msg ? 'block' : 'none';
            pageStatus.textContent = msg || '';
            pageStatus.style.color = err ? 'var(--err)' : 'var(--muted)';
        };
        const activeTab = async () => {
            try { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; } catch (e) { return null; }
        };
        const badUrl = u => !u || /^(chrome|edge|about|chrome-extension|devtools):/i.test(u) || u.startsWith('https://chrome.google.com/webstore');

        // функция, исполняемая В КОНТЕКСТЕ страницы (isolated world — есть chrome.runtime)
        const pageTranslateFn = async (to) => {
            const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'INPUT', 'SELECT']);
            const send = (text) => new Promise(res => {
                try { chrome.runtime.sendMessage({ action: 'translate', text, from: 'auto', to }, r => res(r && r.success ? r.text : null)); }
                catch (e) { res(null); }
            });
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode(n) {
                    const v = n.nodeValue;
                    if (!v || !/\p{L}/u.test(v)) return NodeFilter.FILTER_REJECT;
                    const p = n.parentElement;
                    if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
                    if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
                    const st = getComputedStyle(p);
                    if (st.display === 'none' || st.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            const nodes = []; let n;
            while ((n = walker.nextNode())) nodes.push(n);
            if (!nodes.length) return { nodes: 0 };
            window.__stTransOrig = window.__stTransOrig || new Map();

            // батчим узлы по ~1200 символов; текст узла нормализуем (без переносов)
            const batches = []; let cur = [], len = 0;
            for (const node of nodes) {
                const t = node.nodeValue.replace(/\s+/g, ' ').trim();
                if (!t) continue;
                if (len + t.length > 1200 && cur.length) { batches.push(cur); cur = []; len = 0; }
                cur.push(node); len += t.length + 1;
            }
            if (cur.length) batches.push(cur);

            let okBatches = 0;
            for (const batch of batches) {
                const texts = batch.map(nd => nd.nodeValue.replace(/\s+/g, ' ').trim());
                const out = await send(texts.join('\n'));
                if (!out) continue;
                const parts = out.split('\n');
                if (parts.length === batch.length) {
                    batch.forEach((nd, i) => {
                        if (!window.__stTransOrig.has(nd)) window.__stTransOrig.set(nd, nd.nodeValue);
                        nd.nodeValue = parts[i];
                    });
                } else {
                    // разбивка не совпала — переводим по одному узлу
                    for (let i = 0; i < batch.length; i++) {
                        const o = await send(texts[i]);
                        if (o) { if (!window.__stTransOrig.has(batch[i])) window.__stTransOrig.set(batch[i], batch[i].nodeValue); batch[i].nodeValue = o; }
                    }
                }
                okBatches++;
            }
            return { nodes: nodes.length, batches: batches.length, okBatches };
        };

        const pageRestoreFn = () => {
            if (window.__stTransOrig) { window.__stTransOrig.forEach((v, nd) => { try { nd.nodeValue = v; } catch (e) {} }); window.__stTransOrig.clear(); }
            return true;
        };

        pageBtn.addEventListener('click', async () => {
            const tab = await activeTab();
            if (!tab || badUrl(tab.url)) { setPageStatus('Нельзя перевести служебную страницу. Открой обычный сайт.', true); return; }
            pageBtn.disabled = true; setPageStatus('Перевожу страницу… это может занять время', false);
            try {
                const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageTranslateFn, args: [toSel.value] });
                pageBtn.disabled = false;
                if (!result || !result.nodes) { setPageStatus('Текст для перевода не найден', true); return; }
                setPageStatus(`Готово: переведено фрагментов ~${result.nodes} (${result.okBatches}/${result.batches} блоков)`, false);
            } catch (e) {
                pageBtn.disabled = false;
                setPageStatus('✗ ' + (e.message || 'не удалось выполнить на странице'), true);
            }
        });

        restoreBtn.addEventListener('click', async () => {
            const tab = await activeTab();
            if (!tab || badUrl(tab.url)) { setPageStatus('Недоступно для этой страницы', true); return; }
            try {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageRestoreFn });
                setPageStatus('Оригинал восстановлен', false);
            } catch (e) { setPageStatus('✗ ' + (e.message || 'ошибка'), true); }
        });
    })();

    // ══════════════════════════════════════
    //  Буфер обмена — история текста и скриншотов
    // ══════════════════════════════════════
    (function initClipboard() {
        const listEl = document.getElementById('clip-list');
        if (!listEl) return;
        const $ = id => document.getElementById(id);
        const emptyEl = $('clip-empty'), countEl = $('clip-count'), statusEl = $('clip-status');
        const searchEl = $('clip-search'), exportBtn = $('clip-export');
        const subBtns = [...document.querySelectorAll('.clip-subbtn')];
        const MAX_ITEMS = 100;
        let items = [];
        let view = 'history'; // 'history' | 'saved'

        const status = (msg, err) => {
            if (!msg) { statusEl.style.display = 'none'; return; }
            statusEl.style.display = 'block';
            statusEl.textContent = msg;
            statusEl.style.color = err ? 'var(--err)' : 'var(--ok)';
            setTimeout(() => { statusEl.style.display = 'none'; }, 1800);
        };

        // хронологический порядок (новые сверху); сохранённые (pinned) не вытесняются лимитом
        const normalize = () => {
            const saved = items.filter(x => x.pinned);
            const rest = items.filter(x => !x.pinned).slice(0, Math.max(0, MAX_ITEMS - saved.length));
            items = [...saved, ...rest].sort((a, b) => b.ts - a.ts);
        };
        const load = (cb) => chrome.storage.local.get(['clipItems'], d => { items = Array.isArray(d.clipItems) ? d.clipItems : []; normalize(); cb && cb(); });
        const save = (cb) => { normalize(); chrome.storage.local.set({ clipItems: items }, cb); };

        const fmtTime = (ts) => {
            try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
            catch { return ''; }
        };
        const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

        const add = (item) => { items.unshift(item); save(render); };

        // гарантируем image/png (буфер обмена Chrome надёжно принимает только png)
        const toPngBlob = (dataUrl) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    c.getContext('2d').drawImage(img, 0, 0);
                    c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/png');
                } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error('img load'));
            img.src = dataUrl;
        });

        const copyItem = async (it) => {
            try {
                if (it.type === 'image') {
                    try { window.focus(); } catch (e) {}
                    let blob = await (await fetch(it.data)).blob();
                    if (blob.type !== 'image/png') blob = await toPngBlob(it.data);
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                } else {
                    await navigator.clipboard.writeText(it.data);
                }
                status('✓ Скопировано', false);
            } catch (e) {
                status('Не удалось скопировать картинку в буфер', true);
            }
        };

        const render = () => {
            const q = (searchEl.value || '').trim().toLowerCase();
            const base = view === 'saved' ? items.filter(it => it.pinned) : items;
            const shown = q ? base.filter(it => it.type === 'text' && it.data.toLowerCase().includes(q)) : base;
            listEl.innerHTML = '';
            countEl.textContent = base.length ? (q ? `(${shown.length}/${base.length})` : '(' + base.length + ')') : '';
            emptyEl.style.display = shown.length ? 'none' : 'block';
            emptyEl.textContent = q ? 'Ничего не найдено.'
                : (view === 'saved' ? 'Нет сохранённых. Нажми ★ у записи в истории.' : 'История пуста. Скопируй что-нибудь.');
            shown.forEach(it => {
                const row = document.createElement('div');
                row.className = 'clip-item';
                if (it.pinned) row.style.borderColor = 'var(--accent)';
                const preview = it.type === 'image'
                    ? `<img src="${it.data}" title="Открыть в новой вкладке">`
                    : `<div class="clip-body"><div class="clip-txt">${esc(it.data.slice(0, 400))}</div><div class="clip-meta">${fmtTime(it.ts)} · текст</div></div>`;
                const bodyMeta = it.type === 'image'
                    ? `<div class="clip-body"><div class="clip-meta">${fmtTime(it.ts)} · изображение</div></div>`
                    : '';
                const starColor = it.pinned ? 'var(--accent)' : 'currentColor';
                row.innerHTML = preview + bodyMeta +
                    `<div class="clip-acts">
                        <button class="clip-pin" title="${it.pinned ? 'Убрать из сохранённого' : 'В сохранённое'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="${it.pinned ? 'var(--accent)' : 'none'}" stroke="${starColor}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
                        <button class="clip-copy" title="Копировать"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                        <button class="clip-del" title="Удалить"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
                    </div>`;
                row.querySelector('.clip-pin').addEventListener('click', () => { it.pinned = !it.pinned; save(render); });
                row.querySelector('.clip-copy').addEventListener('click', () => copyItem(it));
                row.querySelector('.clip-del').addEventListener('click', () => { items = items.filter(x => x.id !== it.id); save(render); });
                const img = row.querySelector('img');
                if (img) img.addEventListener('click', () => chrome.tabs.create({ url: it.data }));
                listEl.appendChild(row);
            });
        };

        const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        // ── мини-ZIP (метод store, без сжатия — png уже сжат) ──
        const CRC = (() => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
        const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
        const dataUrlToBytes = (u) => { const s = atob(u.split(',')[1] || ''); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
        const makeZip = (files) => {
            const enc = new TextEncoder(), u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
            const parts = [], central = []; let offset = 0;
            for (const f of files) {
                const name = enc.encode(f.name), crc = crc32(f.bytes), sz = f.bytes.length;
                const lh = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0)]);
                parts.push(lh, name, f.bytes);
                central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
                offset += lh.length + name.length + f.bytes.length;
            }
            let cenSize = 0; central.forEach(c => cenSize += c.length);
            const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cenSize), ...u32(offset), ...u16(0)]);
            return new Blob([...parts, ...central, end], { type: 'application/zip' });
        };

        // Подвкладки: История буфера / Сохранённое
        subBtns.forEach(b => b.addEventListener('click', () => {
            view = b.dataset.view;
            subBtns.forEach(x => x.classList.toggle('active', x === b));
            render();
        }));

        // Поиск
        searchEl.addEventListener('input', render);

        // Экспорт всех скриншотов в ZIP
        exportBtn.addEventListener('click', () => {
            const imgs = items.filter(x => x.type === 'image');
            if (!imgs.length) { status('Скриншотов нет', true); return; }
            try {
                const files = imgs.map((it, i) => ({ name: `screenshot-${String(i + 1).padStart(2, '0')}.png`, bytes: dataUrlToBytes(it.data) }));
                const blob = makeZip(files);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'screenshots.zip';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
                status(`✓ Экспортировано: ${imgs.length}`, false);
            } catch (e) { status('Ошибка экспорта', true); }
        });

        // Живое обновление, если копирование пришло от content-script при открытом попапе
        chrome.storage.onChanged.addListener((c, area) => {
            if (area === 'local' && c.clipItems) { items = Array.isArray(c.clipItems.newValue) ? c.clipItems.newValue : []; normalize(); render(); }
        });

        // Очистить (в «Сохранённом» — только сохранённые, в «Истории» — только несохранённые)
        $('clip-clear').addEventListener('click', () => {
            if (!items.length) return;
            items = view === 'saved' ? items.filter(x => !x.pinned) : items.filter(x => x.pinned);
            save(render);
            status('Очищено', false);
        });

        load(render);
    })();

    // Иконки копирования у полей результатов
    ['whois-result', 'dns-result', 'checkhost-info', 'ssl-ch-info', 'st-result'].forEach(attachCopyIcons);
    ['date-calc-result', 'date-diff-result', 'date-cost-result'].forEach(attachPlainCopy);

    // ===================== ST API-КЛЮЧ =====================
    (function initStKey() {
        const input = document.getElementById('st-key-input');
        const ok = document.getElementById('st-key-ok');
        const badge = document.getElementById('st-key-status');
        const eye = document.getElementById('st-key-eye');
        if (!input) return;

        const signupHint = document.getElementById('st-signup-hint');
        const setBadge = (has) => {
            if (!badge) return;
            badge.textContent = has ? 'активен' : 'не задан';
            badge.classList.toggle('ok', has);
            if (signupHint) signupHint.style.display = has ? 'none' : '';
        };
        const flash = (msg) => {
            if (!ok) return;
            ok.textContent = msg;
            setTimeout(() => { ok.textContent = ''; }, 2500);
        };

        chrome.storage.local.get(['stApiKey'], (d) => {
            if (d.stApiKey) input.value = d.stApiKey;
            setBadge(!!d.stApiKey);
        });

        if (eye) eye.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
        });

        document.getElementById('st-key-save').addEventListener('click', () => {
            const k = input.value.trim();
            if (!k) { flash('Введите ключ перед сохранением'); return; }
            chrome.storage.local.set({ stApiKey: k }, () => {
                setBadge(true);
                flash('✓ Ключ сохранён');
            });
        });
        document.getElementById('st-key-reset').addEventListener('click', () => {
            input.value = '';
            chrome.storage.local.remove('stApiKey', () => {
                setBadge(false);
                flash('Ключ удалён');
            });
        });
    })();


    // ── L2 ──────────────────────────────────────────────────────────────────
    (() => {
        // Переключатель подвкладок L2
        const l2nav = document.querySelector('#tab-l2 .l2-sub');
        if (l2nav) {
            l2nav.addEventListener('click', (e) => {
                const b = e.target.closest('.l2-subbtn');
                if (!b) return;
                l2nav.querySelectorAll('.l2-subbtn').forEach(x => x.classList.toggle('active', x === b));
                document.querySelectorAll('#tab-l2 .l2-pane').forEach(p => {
                    p.style.display = p.dataset.pane === b.dataset.l2 ? '' : 'none';
                });
            });
        }

        const sbBtn = document.getElementById('l2-sendbridge-btn');
        const mtBtn = document.getElementById('l2-mailtester-btn');
        sbBtn?.addEventListener('click', () => chrome.tabs.create({ url: 'https://sendbridge.com/mail-tester' }));
        mtBtn?.addEventListener('click', () => chrome.tabs.create({ url: 'https://www.mail-tester.com/' }));

        // ── Проверка домена (SPF/DKIM/DMARC/MX/A/PTR/blacklist) ──
        const dEl   = document.getElementById('l2-mc-domain');
        const selEl = document.getElementById('l2-mc-selector');
        const btn   = document.getElementById('l2-mc-btn');
        const stEl  = document.getElementById('l2-mc-status');
        const resEl = document.getElementById('l2-mc-results');
        if (!btn) return;

        const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const card = (name, badgeClass, badgeText, valHtml) => `
            <div class="mc-card">
                <div class="mc-head"><span class="mc-name">${name}</span><span class="mc-badge ${badgeClass}">${badgeText}</span></div>
                ${valHtml ? `<div class="mc-val">${valHtml}</div>` : ''}
            </div>`;

        const render = (d) => {
            let html = '';

            if (!d.isIp) {
                // A
                html += card('A-запись', d.a?.length ? 'mc-ok' : 'mc-err',
                    d.a?.length ? 'найдено' : 'нет', (d.a || []).map(esc).join('<br>'));
                // MX
                html += card('MX-запись', d.mx?.length ? 'mc-ok' : 'mc-warn',
                    d.mx?.length ? 'найдено' : 'нет', (d.mx || []).map(esc).join('<br>'));
                // SPF
                html += card('SPF', d.spf ? 'mc-ok' : 'mc-err',
                    d.spf ? 'есть' : 'нет', d.spf ? esc(d.spf) : 'Запись v=spf1 не найдена');
                // DKIM
                html += card('DKIM', d.dkim ? 'mc-ok' : 'mc-warn',
                    d.dkim ? `селектор: ${esc(d.dkimSelector)}` : 'не найден',
                    d.dkim ? esc(d.dkim) : 'Не найден по популярным селекторам. Укажи селектор вручную, если знаешь.');
                // DMARC
                html += card('DMARC', d.dmarc ? 'mc-ok' : 'mc-warn',
                    d.dmarc ? 'есть' : 'нет', d.dmarc ? esc(d.dmarc) : 'Запись v=DMARC1 не найдена');
            }

            // PTR
            if (d.ptr?.length) {
                const ptrHtml = d.ptr.map(p =>
                    `${esc(p.ip)} → ${p.names.length ? p.names.map(esc).join(', ') : '<span style="color:var(--err)">нет PTR</span>'}`
                ).join('<br>');
                const allHave = d.ptr.every(p => p.names.length);
                html += card('rDNS (PTR)', allHave ? 'mc-ok' : 'mc-warn', allHave ? 'ок' : 'частично', ptrHtml);
            }

            // Blacklist
            if (d.blacklists?.length) {
                const byIp = {};
                d.blacklists.forEach(b => { (byIp[b.ip] = byIp[b.ip] || []).push(b); });
                const listedAny = d.blacklists.some(b => b.status === 'listed');
                let blHtml = '';
                for (const ip in byIp) {
                    blHtml += `<div style="margin-bottom:5px"><div class="mc-val" style="margin-bottom:3px">${esc(ip)}</div><div class="mc-bl">`;
                    blHtml += byIp[ip].map(b => {
                        if (b.status === 'listed')  return `<span class="mc-err">⛔ ${esc(b.zone)}</span>`;
                        if (b.status === 'unknown') return `<span class="mc-dim">— ${esc(b.zone)}</span>`;
                        return `<span class="mc-ok">✓ ${esc(b.zone)}</span>`;
                    }).join('');
                    blHtml += `</div></div>`;
                }
                blHtml += `<div style="font-size:10px;color:var(--muted);margin-top:4px">— = проверка недоступна (список блокирует публичный DNS)</div>`;
                html += card('Чёрные списки', listedAny ? 'mc-err' : 'mc-ok', listedAny ? 'в списке!' : 'чисто', blHtml);
            }

            resEl.innerHTML = html;
        };

        const go = () => {
            const domain = dEl.value.trim();
            if (!domain) { dEl.focus(); return; }
            btn.disabled = true;
            stEl.style.color = 'var(--muted)';
            stEl.textContent = 'Проверяем DNS…';
            resEl.innerHTML = '';
            safeSendMessage({ action: 'mailCheck', domain, selector: selEl.value.trim() }, (resp) => {
                btn.disabled = false;
                if (!resp?.success) {
                    stEl.style.color = 'var(--err)';
                    stEl.textContent = '✗ ' + (resp?.error || 'Ошибка');
                    return;
                }
                stEl.textContent = '';
                render(resp.data);
            });
        };

        btn.addEventListener('click', go);
        dEl.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        selEl.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    })();

    // ── СТЕК: детектор технологий сайта (Wappalyzer-подобный) ───────────────
    (() => {
        const btn = document.getElementById('stk-btn');
        const stEl = document.getElementById('stk-status');
        const resEl = document.getElementById('stk-results');
        if (!btn) return;

        // Фингерпринты: html/scripts — regex по HTML и src скриптов/ссылок;
        // gen — meta generator; cookie — regex по document.cookie;
        // globals — имена window-переменных (проверяются в MAIN world);
        // headers — {заголовок: regex|true(есть)}.
        const TECH = [
            // CMS
            { n: 'WordPress', c: 'CMS', html: [/wp-content|wp-includes/i], gen: /WordPress/i },
            { n: '1С-Битрикс', c: 'CMS', html: [/bitrix\/(js|templates|cache)/i], cookie: /BITRIX_/i, gen: /Bitrix/i },
            { n: 'Joomla', c: 'CMS', html: [/\/media\/jui\/|\/templates\/\w+\/css\/template/i], gen: /Joomla/i },
            { n: 'Drupal', c: 'CMS', html: [/sites\/(all|default)\/(themes|modules)/i], gen: /Drupal/i, headers: { 'x-generator': /Drupal/i } },
            { n: 'MODX', c: 'CMS', html: [/assets\/(components|templates|snippets)/i], headers: { 'x-powered-by': /MODX/i } },
            { n: 'OpenCart', c: 'CMS', html: [/catalog\/view\/theme|index\.php\?route=/i] },
            { n: 'DLE', c: 'CMS', html: [/engine\/(classes|modules)\/|dle_/i] },
            // Конструкторы сайтов
            { n: 'Tilda', c: 'Конструктор', html: [/tildacdn\.com|tilda-/i], globals: ['t_onFuncLoad', 't_lazyload'] },
            { n: 'Site Builder', c: 'Конструктор', html: [/craftum|cdn\.craftum/i] },
            { n: 'InSales', c: 'Конструктор', html: [/insales|assets\.insales/i] },
            { n: 'Wix', c: 'Конструктор', html: [/static\.wixstatic\.com|wix\.com/i], headers: { 'x-wix-request-id': true } },
            { n: 'Shopify', c: 'Конструктор', html: [/cdn\.shopify\.com/i], headers: { 'x-shopify-stage': true } },
            { n: 'Ecwid', c: 'Конструктор', html: [/ecwid/i] },
            { n: 'uKit / uCoz', c: 'Конструктор', html: [/ucoz|ukit/i] },
            { n: 'WordPress Elementor', c: 'Конструктор', html: [/elementor/i] },
            // E-commerce
            { n: 'WooCommerce', c: 'E-commerce', html: [/woocommerce/i] },
            { n: 'CS-Cart', c: 'E-commerce', html: [/cs-cart|\/skins\//i] },
            // Фреймворки
            { n: 'Next.js', c: 'Фреймворк', html: [/\/_next\/static/i], globals: ['__NEXT_DATA__'] },
            { n: 'Nuxt.js', c: 'Фреймворк', html: [/\/_nuxt\//i], globals: ['__NUXT__'] },
            { n: 'React', c: 'Фреймворк', html: [/data-reactroot|react(-dom)?(\.min)?\.js/i], globals: ['React'] },
            { n: 'Vue.js', c: 'Фреймворк', html: [/data-v-[0-9a-f]{8}|vue(\.min)?\.js/i], globals: ['Vue'] },
            { n: 'Angular', c: 'Фреймворк', html: [/ng-version|ng-app|angular(\.min)?\.js/i], globals: ['ng', 'angular'] },
            { n: 'jQuery', c: 'Библиотека', html: [/jquery[.-]/i], globals: ['jQuery'] },
            { n: 'Bootstrap', c: 'Библиотека', html: [/bootstrap(\.min)?\.(css|js)/i] },
            // Аналитика
            { n: 'Google Analytics', c: 'Аналитика', html: [/google-analytics\.com|gtag\/js|googletagmanager\.com\/gtag/i], globals: ['gtag', 'ga'] },
            { n: 'Яндекс.Метрика', c: 'Аналитика', html: [/mc\.yandex\.ru\/(metrika|watch)/i], globals: ['ym'] },
            { n: 'Google Tag Manager', c: 'Аналитика', html: [/googletagmanager\.com\/gtm/i], globals: ['dataLayer'] },
            // Сервер / язык
            { n: 'PHP', c: 'Сервер', cookie: /PHPSESSID/i, headers: { 'x-powered-by': /PHP/i } },
            { n: 'Nginx', c: 'Сервер', headers: { 'server': /nginx/i } },
            { n: 'Apache', c: 'Сервер', headers: { 'server': /apache/i } },
            { n: 'LiteSpeed', c: 'Сервер', headers: { 'server': /litespeed/i } },
            { n: 'IIS', c: 'Сервер', headers: { 'server': /iis|microsoft/i } },
            // CDN / хостинг
            { n: 'Cloudflare', c: 'CDN / Хостинг', headers: { 'server': /cloudflare/i, 'cf-ray': true } },
            { n: 'ExampleHost', c: 'CDN / Хостинг', headers: { 'server': /examplehost/i } },
            { n: 'Beget', c: 'CDN / Хостинг', headers: { 'server': /beget/i } },
            { n: 'Selectel', c: 'CDN / Хостинг', headers: { 'server': /selectel/i } },
            // Прочее
            { n: 'Google Fonts', c: 'Прочее', html: [/fonts\.googleapis\.com/i] },
            { n: 'reCAPTCHA', c: 'Прочее', html: [/recaptcha/i] },
            { n: 'ISPmanager', c: 'Панель', html: [/ispmanager/i] },
        ];

        // все глобалы, которые надо проверить в MAIN world
        const ALL_GLOBALS = [...new Set(TECH.flatMap(t => t.globals || []))];

        const matchTech = (sig) => {
            const found = [];
            const blob = (sig.html || '') + '\n' + (sig.scripts || '');
            const cookie = sig.cookie || '';
            const gen = sig.gen || '';
            const headers = sig.headers || {};
            const globals = sig.globals || {};
            for (const t of TECH) {
                let hit = false;
                if (t.html && t.html.some(rx => rx.test(blob))) hit = true;
                if (!hit && t.gen && gen && t.gen.test(gen)) hit = true;
                if (!hit && t.cookie && t.cookie.test(cookie)) hit = true;
                if (!hit && t.globals && t.globals.some(g => globals[g])) hit = true;
                if (!hit && t.headers) {
                    for (const [k, cond] of Object.entries(t.headers)) {
                        const hv = headers[k];
                        if (hv == null) continue;
                        if (cond === true || (cond.test && cond.test(hv))) { hit = true; break; }
                    }
                }
                if (hit) found.push(t);
            }
            return found;
        };

        const render = (found, url) => {
            if (!found.length) { resEl.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0">Ничего не определено</div>'; return; }
            const byCat = {};
            found.forEach(t => { (byCat[t.c] = byCat[t.c] || []).push(t.n); });
            let html = `<div style="font-size:11px;color:var(--muted);margin-bottom:6px;word-break:break-all">${url}</div>`;
            const ORDER = ['CMS', 'Конструктор', 'E-commerce', 'Фреймворк', 'Библиотека', 'Аналитика', 'Сервер', 'CDN / Хостинг', 'Панель', 'Прочее'];
            ORDER.forEach(cat => {
                if (!byCat[cat]) return;
                html += `<div class="stk-cat">${cat}</div><div class="stk-chips">` +
                    byCat[cat].map(n => `<span class="stk-chip">${n}</span>`).join('') + `</div>`;
            });
            resEl.innerHTML = html;
        };

        btn.addEventListener('click', async () => {
            resEl.innerHTML = '';
            stEl.style.color = 'var(--muted)';
            stEl.textContent = 'Анализируем страницу…';
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.url || /^chrome:\/\/|^edge:\/\/|chrome\.google\.com\/webstore/.test(tab.url)) {
                    stEl.style.color = 'var(--err)'; stEl.textContent = '✗ Недоступно на этой странице';
                    return;
                }
                // 1) Сигналы со страницы — в MAIN world (видны глобалы страницы)
                const [{ result: pageSig } = {}] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    args: [ALL_GLOBALS],
                    func: (globalNames) => {
                        const html = (document.documentElement ? document.documentElement.outerHTML : '').slice(0, 500000);
                        const srcs = [...document.scripts].map(s => s.src).filter(Boolean);
                        const links = [...document.querySelectorAll('link[href]')].map(l => l.href);
                        const gen = (document.querySelector('meta[name="generator"]') || {}).content || '';
                        const cookie = document.cookie || '';
                        const globals = {};
                        globalNames.forEach(g => { try { globals[g] = typeof window[g] !== 'undefined'; } catch (e) { globals[g] = false; } });
                        return { html, scripts: srcs.concat(links).join('\n'), gen, cookie, globals };
                    }
                });
                // 2) Заголовки ответа — фоном
                const headResp = await new Promise(res => safeSendMessage({ action: 'techHeaders', url: tab.url }, res));
                const sig = Object.assign({}, pageSig, { headers: (headResp && headResp.headers) || {} });
                const found = matchTech(sig);
                stEl.textContent = '';
                render(found, tab.url);
            } catch (e) {
                stEl.style.color = 'var(--err)';
                stEl.textContent = '✗ ' + (e.message || 'Ошибка анализа');
            }
        });
    })();

    // ── Заявки SSL (массовое удаление/повтор на staff.example.com/ssl) ──────
    (() => {
        const loginEl = document.getElementById('req-login');
        const domEl   = document.getElementById('req-domains');
        const stEl    = document.getElementById('req-status');
        const findBtn = document.getElementById('req-find');
        const renewBtn = document.getElementById('req-renew');
        if (!findBtn) return;

        const setStatus = (t, c) => { stEl.style.color = c || 'var(--muted)'; stEl.textContent = t; };

        const run = async (action) => {
            const domains = domEl.value.split('\n').map(s => s.trim()).filter(Boolean);
            const login = loginEl.value.trim();
            if (!domains.length && !login) { setStatus('Укажи логин или домены', 'var(--err)'); return; }

            let tab;
            try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (e) {}
            if (!tab || !/staff.example.com\/ssl/.test(tab.url || '')) {
                setStatus('Открой страницу staff.example.com/ssl', 'var(--err)'); return;
            }
            setStatus(action === 'find' ? 'Ищем…' : 'Выполняем…');
            try {
                const [{ result } = {}] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN', args: [domains, login, action],
                    func: (domains, login, action) => {
                        const norm = s => (s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.$/, '');
                        const toA = s => { try { return new URL('http://' + norm(s)).hostname; } catch { return norm(s); } };
                        const domSet = new Set(domains.map(toA).filter(Boolean));
                        const loginN = (login || '').trim().toLowerCase();
                        const rows = [...document.querySelectorAll('tr.domain-row')];
                        const matched = [];
                        rows.forEach(r => {
                            const dc = r.querySelector('.domain-cell_long');
                            const dom = dc ? toA((dc.textContent || '').trim().split(/\s+/)[0]) : '';
                            const ll = r.querySelector('a.cpS-lk-simple');
                            const rl = ll ? ll.textContent.trim().toLowerCase() : '';
                            let ok = true;
                            if (domSet.size) ok = ok && domSet.has(dom);
                            if (loginN) ok = ok && rl === loginN;
                            if (!domSet.size && !loginN) ok = false;
                            if (ok) matched.push(r);
                        });
                        if (action === 'find') {
                            rows.forEach(r => { r.style.outline = ''; });
                            matched.forEach(r => { r.style.outline = '2px solid #4f6aff'; });
                            if (matched[0]) matched[0].scrollIntoView({ block: 'center' });
                            return { matched: matched.length, total: rows.length };
                        }
                        if (action === 'renew') {
                            let n = 0; matched.forEach(r => { const b = r.querySelector('.js-send-request-button'); if (b) { b.click(); n++; } });
                            return { done: n, matched: matched.length };
                        }
                    }
                });
                if (!result) { setStatus('Не удалось выполнить на странице', 'var(--err)'); return; }
                if (action === 'find') {
                    setStatus(`Найдено на странице: ${result.matched} из ${result.total}`, result.matched ? 'var(--ok)' : 'var(--warn)');
                } else {
                    setStatus(`Готово: обновлено ${result.done} (совпало ${result.matched})`, 'var(--ok)');
                }
            } catch (e) {
                setStatus('✗ ' + (e.message || 'ошибка'), 'var(--err)');
            }
        };

        findBtn.addEventListener('click', () => run('find'));
        renewBtn.addEventListener('click', () => run('renew'));
    })();

    // ── Создание заявок SSL (Let's Encrypt) на staff.example.com ───────────
    (() => {
        const loginEl = document.getElementById('req-cr-login');
        const domEl   = document.getElementById('req-cr-domains');
        const btn     = document.getElementById('req-cr-btn');
        const stEl    = document.getElementById('req-cr-status');
        const resEl   = document.getElementById('req-cr-results');
        if (!btn) return;
        const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

        btn.addEventListener('click', async () => {
            const login = loginEl.value.trim();
            const domains = domEl.value.split('\n').map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
            if (!login) { loginEl.focus(); return; }
            if (!domains.length) { domEl.focus(); return; }

            let tab;
            try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (e) {}
            if (!tab || !/^https?:\/\/staff.example.com\//.test(tab.url || '')) {
                stEl.style.color = 'var(--err)'; stEl.textContent = 'Открой любую страницу staff.example.com'; return;
            }
            btn.disabled = true; resEl.innerHTML = '';
            stEl.style.color = 'var(--muted)'; stEl.textContent = 'Создаём заявки…';
            try {
                const [{ result } = {}] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN', args: [login, domains],
                    func: async (login, domains) => {
                        const j = async (url, opts) => {
                            const base = { credentials: 'include', headers: { 'Accept': 'application/json', 'x-client': 'angular' } };
                            const r = await fetch(url, Object.assign(base, opts || {}));
                            const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
                            return { ok: r.ok, status: r.status, data: d };
                        };
                        // 1) проверка аккаунта
                        const chk = await j('/customer/check-customer?customerLogin=' + encodeURIComponent(login));
                        if (!chk.ok) return { error: 'Аккаунт не найден или нет доступа (' + chk.status + ')' };
                        // 2) тип Let's Encrypt
                        const types = await j('/ssl/certificate/types');
                        const arr = Array.isArray(types.data) ? types.data : (types.data && (types.data.items || types.data.data)) || [];
                        let le = null;
                        arr.forEach(t => { if (le == null && /let.?s?\s*encrypt|(^|[^a-z])le([^a-z]|$)/i.test(JSON.stringify(t))) le = t; });
                        let sslType = le == null ? null : (le.id != null ? le.id : (le.value != null ? le.value : (le.code != null ? le.code : le)));
                        if (sslType == null) sslType = 85; // фолбэк: 85 = Let's Encrypt
                        // 3) создаём по одной заявке на домен
                        const results = [];
                        for (const dom of domains) {
                            try {
                                const res = await j('/ssl/certificate/create-request', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'x-client': 'angular' },
                                    body: JSON.stringify({ customer: login, domains: [dom], person: 0, sslType, email: null, autoprolong: true }),
                                });
                                const msg = res.data && (res.data.message || res.data.error || (res.data.errors && JSON.stringify(res.data.errors))) || '';
                                results.push({ domain: dom, ok: res.ok, status: res.status, msg });
                            } catch (e) { results.push({ domain: dom, ok: false, status: 0, msg: e.message }); }
                            await new Promise(r => setTimeout(r, 300));
                        }
                        return { sslType, results };
                    }
                });
                btn.disabled = false;
                if (!result) { stEl.style.color = 'var(--err)'; stEl.textContent = 'Не удалось выполнить на странице'; return; }
                if (result.error) { stEl.style.color = 'var(--err)'; stEl.textContent = '✗ ' + result.error; return; }
                const okN = result.results.filter(r => r.ok).length;
                stEl.style.color = okN ? 'var(--ok)' : 'var(--err)';
                stEl.textContent = `Готово: создано ${okN} из ${result.results.length}`;
                resEl.innerHTML = result.results.map(r =>
                    `<div style="display:flex;gap:6px;align-items:baseline;font-size:11px;padding:3px 0">
                        <span style="color:${r.ok ? 'var(--ok)' : 'var(--err)'}">${r.ok ? '✓' : '✗'}</span>
                        <span style="font-family:monospace">${esc(r.domain)}</span>
                        ${r.ok ? '' : `<span style="color:var(--muted)">${esc(r.msg || ('ошибка ' + r.status))}</span>`}
                    </div>`).join('');
            } catch (e) {
                btn.disabled = false;
                stEl.style.color = 'var(--err)'; stEl.textContent = '✗ ' + (e.message || 'ошибка');
            }
        });
    })();

    // ── Кнопки × для всех полей ввода ──────────────────────────────────────
    addClearBtn('whois-input',      () => { document.getElementById('whois-result').classList.remove('visible'); document.getElementById('whois-debug').style.display = 'none'; });
    addClearBtn('dns-input',        () => document.getElementById('dns-result').classList.remove('visible'));
    addClearBtn('checkhost-input',  () => { document.getElementById('checkhost-info').classList.remove('visible'); document.getElementById('checkhost-nodes').innerHTML = ''; });
    addClearBtn('st-input',         () => document.getElementById('st-result').classList.remove('visible'));
    addClearBtn('punycode-input',   () => { document.getElementById('punycode-result').style.display = 'none'; document.getElementById('punycode-copy-ok').style.display = 'none'; });
    addClearBtn('shorten-input');
    addClearBtn('acc-input',        () => { const t = document.getElementById('acc-type'); if (t) t.textContent = ''; });

    // Клики по вкладкам
    document.querySelector('.tabs-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn || btn.id === 'btn-gear') return;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
        try { localStorage.setItem('stActiveTab', btn.dataset.target); } catch (e) {}
    });

    // Восстановление последнего открытого раздела
    (() => {
        let last = null;
        try { last = localStorage.getItem('stActiveTab'); } catch (e) {}
        if (!last) return;
        const btn = document.querySelector(`.tab-btn[data-target="${last}"]`);
        if (btn && btn.style.display !== 'none') btn.click();
    })();

    // Панель настройки вкладок перенесена в settings.html

    // --- Утилиты ---
    const showCard = (id, html) => {
        const el = document.getElementById(id);
        el.innerHTML = html;
        el.classList.add('visible');
    };
    const showPlain = (id, html, color) => {
        const el = document.getElementById(id);
        el.innerHTML = html;
        if (color) el.style.color = color;
        el.style.display = 'block';
        el.classList.add('visible');
    };
    const loading = (text = 'Загружаем...') =>
        `<div class="result-row"><span class="spin"></span><span class="r-value" style="color:var(--muted);margin-left:8px">${text}</span></div>`;

    const fmt = (str) => {
        if (!str) return '—';
        const d = new Date(str);
        if (isNaN(d)) return str;
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const row = (label, val) =>
        `<div class="result-row"><span class="r-label">${label}</span><span class="r-value">${val || '—'}</span></div>`;
    const badge = (text, cls) => `<span class="badge ${cls}">${text}</span>`;

    // ===================== WHOIS =====================
    // Рендер — только отображение стандартной схемы, без парсинга и IF/ELSE на источники

    const renderWhois = (resp, domain) => {
        if (!resp?.success) {
            showCard('whois-result', row('Ошибка', resp?.error || 'Нет данных'));
            return;
        }
        const d = resp.data;   // стандартная схема: { registrar, created, updated, expires, status[], nameservers[], dnssec }

        // ── Утилиты рендера ──────────────────────────────────────────────────
        const val   = (v) => (v != null && v !== '') ? v : null;
        const dash  = (v) => val(v) || '—';

        const renderBadges = (arr) => {
            if (!arr?.length) return '—';
            return `<div class="status-list">${arr.map(s => {
                const clean = s.replace(/https?:\/\/\S+/g, '').trim();
                return badge(clean, /prohibited|lock|transfer/i.test(s) ? 'ok' : 'warn');
            }).join('')}</div>`;
        };

        const renderNs = (arr) =>
            arr?.length
                ? arr.map(ns => `<div style="font-family:monospace;font-size:11px">${ns}</div>`).join('')
                : '—';

        // ── Построение HTML строго из стандартных ключей ─────────────────────
        let html = `<div class="card-header">
            <div>
                <div class="card-domain">${dash(d.domain) !== '—' ? d.domain : domain}</div>
                ${val(d.registrar_url) ? `<div class="card-sub">${d.registrar_url}</div>` : ''}
            </div>
        </div>`;

        html += row('Регистратор',        dash(d.registrar));
        if (val(d.admin_contact)) {
            const ac = d.admin_contact;
            const isUrl = /^https?:\/\//i.test(ac);
            html += row('Admin contact', isUrl
                ? `<a href="${ac}" target="_blank" style="color:var(--accent);word-break:break-all">${ac}</a>`
                : `<span style="font-family:monospace;font-size:11px">${ac}</span>`);
        }
        html += row('Дата регистрации',   `<span style="color:var(--muted)">${fmt(d.created)}</span>`);
        html += row('Последнее обновление', `<span style="color:var(--muted)">${fmt(d.updated)}</span>`);
        html += row('Действует до',       `<strong style="color:${val(d.expires) ? 'var(--ok)' : 'var(--muted)'}">${fmt(d.expires)}</strong>`);
        html += `<div class="result-row"><span class="r-label">Статус</span><span class="r-value">${renderBadges(d.status)}</span></div>`;
        html += `<div class="result-row"><span class="r-label">Name Servers</span><span class="r-value">${renderNs(d.nameservers)}</span></div>`;
        html += row('DNSSEC', `<span style="font-family:monospace;font-size:11px;color:var(--muted)">${dash(d.dnssec)}</span>`);

        // Фолбэк: если совсем ничего нет — ссылка на whois.com
        if (!val(d.created) && !val(d.expires) && !d.nameservers?.length) {
            html += `<div class="result-row" style="padding:10px 12px">
                <span class="r-value" style="color:var(--muted);font-size:11px">
                    Данные недоступны через API. →
                    <a href="https://www.whois.com/whois/${domain}" target="_blank" style="color:var(--accent)">Открыть на whois.com</a>
                </span>
            </div>`;
        }

        showCard('whois-result', html);

        // RAW-ответ всегда доступен — раскрывается по кнопке
        if (resp._raw) {
            const rawWrap = document.createElement('div');
            rawWrap.style.marginTop = '6px';
            rawWrap.innerHTML = `<button class="whois-raw-toggle" style="width:100%;text-align:left;background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:11px;font-family:inherit">▶ Показать RAW whois-ответ</button>
                <pre class="whois-raw-block" style="display:none;margin:4px 0 0;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:10px;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;color:var(--muted)">${String(resp._raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
            document.getElementById('whois-result').appendChild(rawWrap);
            rawWrap.querySelector('.whois-raw-toggle').addEventListener('click', function () {
                const blk = rawWrap.querySelector('.whois-raw-block');
                const open = blk.style.display !== 'none';
                blk.style.display = open ? 'none' : 'block';
                this.textContent = (open ? '▶' : '▼') + ' ' + (open ? 'Показать' : 'Скрыть') + ' RAW whois-ответ';
            });
        }

        // ── Диагностика источников ────────────────────────────────────────────
        const debugEl   = document.getElementById('whois-debug');
        const debugBody = document.getElementById('whois-debug-body');
        if (resp._errors?.length) {
            debugEl.style.display = 'block';
            debugBody.textContent = resp._errors.map((e, i) => `[${i+1}] ${e}`).join('\n');
            if (!document.getElementById('whois-raw-btn')) {
                const rawBtn = Object.assign(document.createElement('button'), { id: 'whois-raw-btn' }); rawBtn.style.cssText='display:inline-flex;align-items:center;gap:5px'; rawBtn.innerHTML=ICO_SEARCH+' Сырые ответы источников';
                Object.assign(rawBtn.style, { marginTop:'6px', width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:'8px', padding:'7px', cursor:'pointer', fontFamily:'inherit', fontSize:'11px' });
                rawBtn.addEventListener('click', () => {
                    rawBtn.textContent = 'Загружаем...'; rawBtn.disabled = true;
                    safeSendMessage({ action: 'whoisDebug', domain }, (r) => {
                        rawBtn.remove();
                        debugBody.textContent = r?.success
                            ? r.results.map(s => `══ ${s.name} [HTTP ${s.status}] ══\n${s.body}`).join('\n\n')
                            : 'Ошибка: ' + (r?.error || 'нет ответа');
                    });
                });
                debugEl.appendChild(rawBtn);
            }
        } else {
            debugEl.style.display = 'none';
        }
    };

    const doWhois = () => {
        const raw = document.getElementById('whois-input').value.trim();
        if (!raw) return;
        const domain = raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();

        // Сохраняем флаг что запрос идёт — для recovery если popup закроется
        if (typeof chrome !== 'undefined' && chrome?.storage?.session) {
            chrome.storage.session.set({ [`whois_loading_${domain}`]: { started: Date.now() } }).catch(() => {});
        }

        const cached = cacheGet(`whois_${domain}`);
        if (cached) { renderWhois(cached, domain); return; }
        showCard('whois-result', loading('Запрашиваем Whois...'));
        if (!isChromeAvailable()) { showCard('whois-result', row('Ошибка', 'Chrome API недоступен')); return; }
        safeSendMessage({ action: 'whois', domain }, (resp) => {
            if (resp?.success) cacheSet(`whois_${domain}`, resp);
            renderWhois(resp, domain);
            // Очищаем флаг загрузки
            if (typeof chrome !== 'undefined' && chrome?.storage?.session) {
                chrome.storage.session.remove([`whois_loading_${domain}`]).catch(() => {});
            }
        });
    };

    document.getElementById('whois-btn').addEventListener('click', doWhois);
    document.getElementById('whois-input').addEventListener('keydown', e => e.key === 'Enter' && doWhois());

    // Кнопка открыть на whois.com
    document.getElementById('whois-open-btn').addEventListener('click', () => {
        const raw = document.getElementById('whois-input').value.trim();
        if (!raw) return;
        const domain = raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
        chrome.tabs.create({ url: `https://www.whois.com/whois/${domain}` });
    });

    // Кнопка скопировать ссылку whois.com
    document.getElementById('whois-copy-link-btn').addEventListener('click', () => {
        const raw = document.getElementById('whois-input').value.trim();
        if (!raw) return;
        const domain = raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
        const url = `https://www.whois.com/whois/${domain}`;
        copyClip(url).then(() => {
            const btn = document.getElementById('whois-copy-link-btn');
            const orig = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!`;
            btn.style.color = 'var(--ok)';
            btn.style.borderColor = 'var(--ok)';
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
        });
    });

    // ===================== DNS =====================
    const renderDns = (data, type) => {
        if (data.Answer?.length) {
            showCard('dns-result', data.Answer.map(r =>
                `<div class="result-row">
                    <span class="r-label" style="font-family:monospace;font-size:10px">${r.name.replace(/\.$/, '')}</span>
                    <span class="r-value mono">${r.data}</span>
                 </div>`
            ).join(''));
        } else {
            showCard('dns-result', row(`Записи ${type}`, 'не найдены'));
        }
    };
    const doDns = async () => {
        const dnsInputEl = document.getElementById('dns-input');
        let domain = dnsInputEl.value.trim().replace(/^https?:\/\//i, '').split('/')[0];
        // Кириллический домен → punycode (xn--) и подставляем обратно в поле
        if (/[а-яёА-ЯЁ]/.test(domain)) {
            try { domain = new URL('http://' + domain).hostname; dnsInputEl.value = domain; } catch (e) {}
        }
        const type   = document.getElementById('dns-type').value;
        if (!domain) return;
        // DMARC — это TXT-запись поддомена _dmarc.<домен>
        const queryName = (type === 'DMARC') ? `_dmarc.${domain}` : domain;
        const queryType = (type === 'DMARC') ? 'TXT' : type;
        const cacheKey = `dns_${domain}_${type}`;
        const cached = cacheGet(cacheKey);
        if (cached) { renderDns(cached, queryType); return; }
        showCard('dns-result', loading('Запрашиваем DNS...'));
        try {
            const res  = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(queryName)}&type=${queryType}`);
            const data = await res.json();
            cacheSet(cacheKey, data);
            renderDns(data, queryType);
        } catch {
            showCard('dns-result', row('Ошибка', 'Не удалось выполнить запрос'));
        }
    };

    // DNS Propagation — несколько резолверов
    document.getElementById('dns-prop-btn').addEventListener('click', async () => {
        const dnsInputEl = document.getElementById('dns-input');
        let domain = dnsInputEl.value.trim().replace(/^https?:\/\//i, '').split('/')[0];
        if (/[а-яёА-ЯЁ]/.test(domain)) { try { domain = new URL('http://' + domain).hostname; } catch (e) {} }
        const type = document.getElementById('dns-type').value === 'DMARC' ? 'TXT' : document.getElementById('dns-type').value;
        const qName = document.getElementById('dns-type').value === 'DMARC' ? `_dmarc.${domain}` : domain;
        if (!domain) return;
        const propResult = document.getElementById('dns-prop-result');
        propResult.classList.add('visible');
        propResult.innerHTML = loading('Опрашиваем резолверы…');
        safeSendMessage({ action: 'dnsPropagation', domain: qName, type }, (resp) => {
            if (!resp?.success) { propResult.innerHTML = row('Ошибка', resp?.error || 'нет ответа'); return; }
            const servers = resp.servers || [];
            const ok = servers.filter(s => s.ok).length;
            let html = `<div class="card-header"><div class="card-domain">${domain} — ${type} · ${ok}/${servers.length} узлов</div></div>`;
            servers.forEach(s => {
                const color = s.err ? 'var(--muted)' : s.ok ? 'inherit' : 'var(--err)';
                const valsHtml = s.err || !s.ips?.length
                    ? '<span style="color:var(--muted)">—</span>'
                    : s.ips.map(v => `<span class="mono" style="font-size:11px">${v}</span>`).join('<br>');
                html += `<div class="result-row" style="align-items:flex-start;padding:7px 12px">
                    <span class="r-label" style="font-size:11px;flex:none;max-width:48%">
                        ${s.flag} <b>${s.name}</b><br>
                        <span style="color:var(--muted);font-size:10px">${s.loc}</span>
                    </span>
                    <span class="r-value" style="color:${color};font-size:11px;text-align:right;line-height:1.6">${valsHtml}</span>
                </div>`;
            });
            propResult.innerHTML = html;
        });
    });

    // Копировать ссылку на DNSChecker
    document.getElementById('dns-copy-link-btn').addEventListener('click', () => {
        let domain = document.getElementById('dns-input').value.trim().replace(/^https?:\/\//i, '').split('/')[0];
        if (/[а-яёА-ЯЁ]/.test(domain)) { try { domain = new URL('http://' + domain).hostname; } catch (e) {} }
        const type   = document.getElementById('dns-type').value;
        if (!domain) return;

        // DMARC → TXT-запись поддомена _dmarc.<домен>
        const url = (type === 'DMARC')
            ? `https://dnschecker.org/#TXT/_dmarc.${domain}`
            : `https://dnschecker.org/#${type}/${domain}`;
        copyClip(url).then(() => {
            const btn = document.getElementById('dns-copy-link-btn');
            const orig = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!`;
            btn.style.color = 'var(--ok)';
            btn.style.borderColor = 'var(--ok)';
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
        });
    });

    document.getElementById('dns-btn').addEventListener('click', doDns);
    document.getElementById('dns-input').addEventListener('keydown', e => e.key === 'Enter' && doDns());

    // ===================== СОКРАЩАТЕЛЬ =====================
    // Проверяем сохранённые учётные данные YOURLS
    const checkYourlsConfig = () => {
        try { chrome.storage.local.get(['yourlsServer','yourlsUser','yourlsPass','yourlsSig'], (cfg) => {
            const hasAuth = cfg.yourlsSig || (cfg.yourlsUser && cfg.yourlsPass);
            document.getElementById('yourls-login-form').style.display = hasAuth ? 'none' : 'block';
            if (cfg.yourlsServer) document.getElementById('yourls-server').value = cfg.yourlsServer;
            if (cfg.yourlsUser)   document.getElementById('yourls-user').value   = cfg.yourlsUser;
            if (cfg.yourlsPass)   document.getElementById('yourls-pass').value   = cfg.yourlsPass;
            if (cfg.yourlsSig)    document.getElementById('yourls-sig').value    = cfg.yourlsSig;
        }); } catch(e) { console.warn('storage.get error:', e.message); }
    };
    checkYourlsConfig();

    // Тоггл видимости пароля
    const passInput  = document.getElementById('yourls-pass');
    const passToggle = document.getElementById('yourls-pass-toggle');
    let passVisible  = true; // поле уже type=text
    passToggle.addEventListener('click', () => {
        passVisible = !passVisible;
        // Имитируем скрытие: заменяем символы на •
        if (!passVisible) {
            passInput.dataset.real = passInput.value;
            passInput.setAttribute('type', 'password');
            passToggle.textContent = 'показать';
        } else {
            passInput.setAttribute('type', 'text');
            passToggle.textContent = 'скрыть';
        }
    });

    // Сохранение настроек YOURLS
    document.getElementById('yourls-save-btn').addEventListener('click', () => {
        const cfg = {
            yourlsServer: document.getElementById('yourls-server').value.trim() || 'https://links.example.com',
            yourlsUser:   document.getElementById('yourls-user').value.trim(),
            yourlsPass:   document.getElementById('yourls-pass').value,
            yourlsSig:    document.getElementById('yourls-sig').value.trim(),
        };
        try { chrome.storage.local.set(cfg, () => {
            document.getElementById('yourls-login-form').style.display = 'none';
            const btn = document.getElementById('yourls-save-btn');
            btn.textContent = '✓ Сохранено';
            setTimeout(() => { btn.innerHTML = 'Сохранить и подключиться'; }, 1500);
        }); } catch(e) { console.warn('storage.set error:', e.message); }
    });

    // Ссылка "Настройки YOURLS"
    document.getElementById('yourls-settings-link').addEventListener('click', () => {
        const form = document.getElementById('yourls-login-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    // Автозаполнение URL текущей вкладки
    try {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                document.getElementById('shorten-input').value = tab.url;
            }
        });
    } catch(e) { /* ignore */ }

    const doShorten = () => {
        const url = document.getElementById('shorten-input').value.trim();
        if (!url) return;
        document.getElementById('shorten-error').style.display = 'none';
        document.getElementById('shorten-result').classList.remove('visible');
        const btn = document.getElementById('shorten-btn');
        btn.innerHTML = '<span class="spin"></span> Сокращаем...';
        btn.disabled = true;

        safeSendMessage({ action: 'shortenUrl', url }, (resp) => {
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Сократить и скопировать`;
            btn.disabled = false;
            if (resp?.success) {
                // YOURLS иногда отдаёт ссылку по http:// — принудительно https://
                const shortUrl = String(resp.shorturl || '').replace(/^http:\/\//i, 'https://');
                document.getElementById('shorten-url').textContent = shortUrl;
                document.getElementById('shorten-result').classList.add('visible');
                copyClip(shortUrl).catch(() => {});
            } else {
                const msg = resp?.error || 'нет ответа';
                showPlain('shorten-error', msg);
                // Если ошибка авторизации — показываем форму настроек
                if (resp?.needsLogin || msg.toLowerCase().includes('log in') || msg.toLowerCase().includes('auth')) {
                    document.getElementById('yourls-login-form').style.display = 'block';
                }
            }
        });
    };
    document.getElementById('shorten-btn').addEventListener('click', doShorten);
    document.getElementById('shorten-input').addEventListener('keydown', e => e.key === 'Enter' && doShorten());

    // ===================== IP / CHECK-HOST =====================
    const FLAGS = { RU:'🇷🇺',US:'🇺🇸',DE:'🇩🇪',NL:'🇳🇱',FR:'🇫🇷',GB:'🇬🇧',FI:'🇫🇮',PL:'🇵🇱',CZ:'🇨🇿',UA:'🇺🇦',BY:'🇧🇾',KZ:'🇰🇿',JP:'🇯🇵',SG:'🇸🇬',AU:'🇦🇺',CA:'🇨🇦',BR:'🇧🇷',IN:'🇮🇳',CN:'🇨🇳',KR:'🇰🇷',TR:'🇹🇷',SE:'🇸🇪',NO:'🇳🇴',IT:'🇮🇹',ES:'🇪🇸' };
    const flag = cc => FLAGS[cc] || ICO_GLOBE;

    // Опознавание хостеров и конструкторов сайтов по названию ISP/Org/ASN/reverse-DNS.
    // Нужно поддержке, чтобы быстро понять, где стоит сайт (особенно конструкторы — Тильда и пр.).
    const HOSTER_SIGNS = [
        // ── Конструкторы сайтов ──
        { re: /tilda|tildacdn/i,            label: 'Tilda',        type: 'Конструктор' },
        { re: /craftum/i,                   label: 'Site Builder',      type: 'Конструктор' },
        { re: /creatium/i,                  label: 'Creatium',     type: 'Конструктор' },
        { re: /\bwix\b|wixsite/i,           label: 'Wix',          type: 'Конструктор' },
        { re: /ucoz|ucraft/i,               label: 'uCoz / uCraft',type: 'Конструктор' },
        { re: /nethouse/i,                  label: 'Nethouse',     type: 'Конструктор' },
        { re: /\bukit\b|\busite\b/i,        label: 'uKit',         type: 'Конструктор' },
        { re: /insales/i,                   label: 'InSales',      type: 'Конструктор' },
        { re: /flexbe/i,                    label: 'Flexbe',       type: 'Конструктор' },
        { re: /mottor|lpmotor/i,            label: 'Mottor (LPmotor)', type: 'Конструктор' },
        { re: /lpgenerator/i,               label: 'LPgenerator',  type: 'Конструктор' },
        { re: /taplink/i,                   label: 'Taplink',      type: 'Конструктор' },
        { re: /readymag/i,                  label: 'Readymag',     type: 'Конструктор' },
        { re: /webflow/i,                   label: 'Webflow',      type: 'Конструктор' },
        { re: /shopify/i,                   label: 'Shopify',      type: 'Конструктор' },
        { re: /squarespace/i,               label: 'Squarespace',  type: 'Конструктор' },
        { re: /wordpress\.com|automattic/i, label: 'WordPress.com',type: 'Конструктор' },
        { re: /bitrix24|bitrix/i,           label: 'Битрикс24',    type: 'Конструктор/CMS' },
        // ── Российские хостеры ──
        { re: /examplehost|infra1.|infra1/i,        label: 'ExampleHost',      type: 'Хостинг' },
        { re: /beget/i,                     label: 'Beget',        type: 'Хостинг' },
        { re: /\breg\.?ru\b|regru/i,        label: 'Reg.ru',       type: 'Хостинг' },
        { re: /selectel/i,                  label: 'Selectel',     type: 'Хостинг' },
        { re: /\bihor\b|ihor-online/i,      label: 'IHOR',         type: 'Хостинг' },
        { re: /firstvds|first-?vds/i,       label: 'FirstVDS',     type: 'Хостинг' },
        { re: /\bruvds\b/i,                 label: 'RuVDS',        type: 'Хостинг' },
        { re: /sprinthost/i,                label: 'Sprinthost',   type: 'Хостинг' },
        { re: /mchost/i,                    label: 'McHost',       type: 'Хостинг' },
        { re: /masterhost/i,                label: 'Masterhost',   type: 'Хостинг' },
        { re: /netangels/i,                 label: 'NetAngels',    type: 'Хостинг' },
        { re: /\bhostland\b/i,              label: 'Hostland',     type: 'Хостинг' },
        { re: /\bjino\b/i,                  label: 'Jino',         type: 'Хостинг' },
        { re: /\brun084|\brusonyx|reddock/i,label: 'Rusonyx',      type: 'Хостинг' },
        // ── Зарубежные хостеры/облака/CDN ──
        { re: /cloudflare/i,                label: 'Cloudflare',   type: 'CDN/прокси' },
        { re: /hetzner/i,                   label: 'Hetzner',      type: 'Хостинг' },
        { re: /\bovh\b|ovhcloud/i,          label: 'OVH',          type: 'Хостинг' },
        { re: /digitalocean/i,              label: 'DigitalOcean', type: 'Облако' },
        { re: /amazon|\baws\b|cloudfront/i, label: 'Amazon AWS',   type: 'Облако' },
        { re: /google cloud|\bgcp\b|1e100/i,label: 'Google Cloud', type: 'Облако' },
        { re: /microsoft|azure/i,           label: 'Microsoft Azure', type: 'Облако' },
        { re: /yandex.*cloud|yandexcloud/i, label: 'Yandex Cloud', type: 'Облако' },
        { re: /vk.*cloud|mail\.ru.*cloud/i, label: 'VK Cloud',     type: 'Облако' },
    ];
    const detectHosters = (d) => {
        const hay = [d.isp, d.org, d.as, d.asname, d.reverse, ...(d.orgVariants || []), ...(d.asns || [])]
            .filter(Boolean).join(' | ');
        const hits = []; const seen = new Set();
        for (const s of HOSTER_SIGNS) {
            if (s.re.test(hay) && !seen.has(s.label)) { seen.add(s.label); hits.push(s); }
        }
        return hits;
    };

    const renderIpInfo = (resp, infoId = 'checkhost-info', nodesId = 'checkhost-nodes') => {
        if (!resp?.success) { showCard(infoId, row('Ошибка', resp?.error || 'Нет данных')); return; }
        const d = resp.data;
        let html = '';

        // Опознанные хостеры/конструкторы — самое важное наверх
        const hits = detectHosters(d);
        if (hits.length) {
            const isConstr = (t) => /Конструктор/i.test(t);
            const chips = hits.map(h =>
                `<span class="badge ${isConstr(h.type) ? 'warn' : 'ok'}" title="${h.type}" style="margin:2px 3px 0 0">${isConstr(h.type) ? ICO_PUZZLE : ICO_BUILDING} ${h.label} · ${h.type}</span>`
            ).join('');
            html += `<div class="result-row" style="display:block;padding:8px 12px"><div class="r-label" style="width:auto;margin-bottom:4px">Опознано</div><div>${chips}</div></div>`;
        }

        // Все поля через row() — attachCopyIcons добавит кнопки ко всем
        html += `<div class="result-row"><span class="r-label">IP адрес</span><span class="r-value" style="font-family:monospace" data-copy="${d.query}">${d.query}</span></div>`;
        if (d.reverse) html += `<div class="result-row"><span class="r-label">Hostname</span><span class="r-value" style="font-family:monospace;font-size:11px" data-copy="${d.reverse}">${d.reverse}</span></div>`;
        html += `<div class="result-row"><span class="r-label">Страна</span><span class="r-value" data-copy="${d.country} (${d.countryCode})">${flag(d.countryCode)} ${d.country} <span style="color:var(--muted)">(${d.countryCode})</span></span></div>`;
        if (d.regionName) html += `<div class="result-row"><span class="r-label">Регион</span><span class="r-value" data-copy="${d.regionName}">${d.regionName}</span></div>`;
        if (d.city)       html += `<div class="result-row"><span class="r-label">Город</span><span class="r-value" data-copy="${d.city}">${d.city}</span></div>`;
        if (d.zip)        html += `<div class="result-row"><span class="r-label">Индекс</span><span class="r-value" data-copy="${d.zip}">${d.zip}</span></div>`;

        // ISP/Org — data-copy содержит только название без меток источника
        const sourced = d.orgSourced && d.orgSourced.length ? d.orgSourced
            : (d.orgVariants && d.orgVariants.length ? d.orgVariants.map(v => ({ val: v, srcs: [] }))
            : [d.isp, d.org].filter(Boolean).map(v => ({ val: v, srcs: [] })));
        if (sourced.length) {
            sourced.forEach(({ val, srcs }, idx) => {
                const srcHtml = srcs && srcs.length
                    ? ` <span style="font-size:10px;color:var(--muted)">[${srcs.join(', ')}]</span>` : '';
                html += `<div class="result-row"><span class="r-label">${idx === 0 ? 'ISP / Организация' : ''}</span><span class="r-value" style="font-size:12px" data-copy="${val}">${val}${srcHtml}</span></div>`;
            });
        } else {
            if (d.isp) html += `<div class="result-row"><span class="r-label">ISP</span><span class="r-value" data-copy="${d.isp}">${d.isp}</span></div>`;
            if (d.org) html += `<div class="result-row"><span class="r-label">Организация</span><span class="r-value" data-copy="${d.org}">${d.org}</span></div>`;
        }

        const asnList = (d.asns && d.asns.length) ? d.asns : [d.as].filter(Boolean);
        if (asnList.length) {
            asnList.forEach((a, idx) => {
                html += `<div class="result-row"><span class="r-label">${idx === 0 ? 'ASN' : ''}</span><span class="r-value" style="font-family:monospace;font-size:11px" data-copy="${a}">${a}</span></div>`;
            });
        }
        if (d.timezone) html += `<div class="result-row"><span class="r-label">Часовой пояс</span><span class="r-value" data-copy="${d.timezone}">${d.timezone}</span></div>`;
        if (d.hosting)  html += row('Хостинг / дата-центр', badge('Да', 'warn'));
        showCard(infoId, html);
    };

    const doCheck = () => {
        const host = document.getElementById('checkhost-input').value.trim();
        const type = document.getElementById('checkhost-type').value;
        if (!host) return;
        document.getElementById('checkhost-info').classList.remove('visible');
        document.getElementById('checkhost-nodes').innerHTML = '';
        const cacheKey = `check_${host}_${type}`;

        if (type === 'info') {
            const cached = cacheGet(cacheKey);
            if (cached) { renderIpInfo(cached); return; }
            showCard('checkhost-info', loading('Получаем информацию об IP...'));
            safeSendMessage({ action: 'ipInfo', target: host }, (resp) => {
                if (resp?.success) cacheSet(cacheKey, resp);
                renderIpInfo(resp);
            });
        } else {
            showCard('checkhost-info', loading('Запускаем проверку из нескольких точек...'));
            safeSendMessage({ action: 'checkHost', host, type }, (resp) => {
                if (!resp?.success) { showCard('checkhost-info', row('Ошибка', resp?.error || 'Нет ответа')); return; }
                const { nodes, results } = resp;
                let ok = 0, total = 0, cards = '';
                for (const [id, info] of Object.entries(nodes)) {
                    const [, ip, cc, city] = info;
                    const res = results[id];
                    total++;
                    // Форматы ответов check-host.net:
                    //   ping: res = [ [ ["OK",rtt,ip], ... ] ]   (массив попыток)
                    //   http: res = [ [ 1, time, "OK", "200", ip ] ]
                    //   tcp:  res = [ {address, time} ]  или  [ {error: "..."} ]
                    //   res === null → узел ещё считает; res[0] === null → узел не ответил
                    let st = badge('ожидание', 'warn');
                    if (res) {
                        const r = res[0];
                        if (r === null) { st = badge('timeout', 'err'); }
                        else if (type === 'ping') {
                            const att = Array.isArray(r) ? r : [];
                            const okA = att.filter(a => Array.isArray(a) && a[0] === 'OK');
                            if (okA.length) {
                                ok++;
                                const rtts = okA.map(a => a[1]).filter(x => typeof x === 'number');
                                const avg = rtts.length ? (rtts.reduce((s, x) => s + x, 0) / rtts.length) * 1000 : 0;
                                st = badge(`OK ${okA.length}/${att.length}${avg ? ' ' + avg.toFixed(0) + 'ms' : ''}`, okA.length === att.length ? 'ok' : 'warn');
                            } else st = badge('недоступен', 'err');
                        } else if (type === 'tcp') {
                            if (r && typeof r === 'object' && (r.address || r.time != null) && !r.error) {
                                ok++;
                                st = badge(`OK${r.time != null ? ' ' + (r.time * 1000).toFixed(0) + 'ms' : ''}`, 'ok');
                            } else st = badge('ошибка', 'err');
                        } else { // http
                            const success = Array.isArray(r) && r[0] === 1;
                            const code = Array.isArray(r) ? r[3] : null;
                            const reason = Array.isArray(r) ? r[2] : null;
                            if (success) { ok++; st = badge(`${code || ''} ${reason || 'OK'}`.trim(), 'ok'); }
                            else st = badge(reason || code || 'ошибка', 'err');
                        }
                    }
                    cards += `<div class="node-card"><div class="node-loc">${flag(cc)} ${city || cc}</div><div class="node-ip">${ip || ''}</div><div class="node-st">${st}</div></div>`;
                }
                const sum = total > 0
                    ? (ok === total ? badge(`✓ ${ok}/${total} точек`, 'ok') : badge(`${ok}/${total} точек`, 'warn'))
                    : badge('Нет данных', 'warn');
                showCard('checkhost-info', `<div class="card-header"><div class="card-domain">${host}</div><div>${sum}</div></div>`);
                document.getElementById('checkhost-nodes').innerHTML = cards;
            });
        }
    };
    document.getElementById('checkhost-btn').addEventListener('click', doCheck);
    document.getElementById('checkhost-input').addEventListener('keydown', e => e.key === 'Enter' && doCheck());

    // Кнопка скопировать ссылку check-host
    document.getElementById('checkhost-copy-link-btn').addEventListener('click', () => {
        const host = document.getElementById('checkhost-input').value.trim();
        const type = document.getElementById('checkhost-type').value;
        if (!host) return;

        // Определяем путь в зависимости от типа проверки
        let path = 'ip-info'; // по умолчанию для 'info'
        if (type === 'http') path = 'check-http';
        else if (type === 'ping') path = 'check-ping';
        else if (type === 'tcp') path = 'check-tcp';

        const url = `https://check-host.net/${path}?host=${encodeURIComponent(host)}&csrf_token=`;
        copyClip(url).then(() => {
            const btn = document.getElementById('checkhost-copy-link-btn');
            const orig = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!`;
            btn.style.color = 'var(--ok)';
            btn.style.borderColor = 'var(--ok)';
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
        });
    });

    // ===================== ДАТЫ =====================
    document.getElementById('date-start').valueAsDate = new Date();
    document.getElementById('date-diff-1').valueAsDate = new Date();

    document.getElementById('date-calc-btn').addEventListener('click', () => {
        const start = document.getElementById('date-start').value;
        const days  = parseInt(document.getElementById('date-days').value) || 0;
        if (!start) return;
        const d = new Date(start);
        d.setDate(d.getDate() + days);
        showPlain('date-calc-result', d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }));
    });

    document.getElementById('date-diff-btn').addEventListener('click', () => {
        const d1 = new Date(document.getElementById('date-diff-1').value);
        const d2 = new Date(document.getElementById('date-diff-2').value);
        if (isNaN(d1) || isNaN(d2)) return;
        const n   = Math.ceil(Math.abs(d2 - d1) / 86400000);
        const suf = n % 10 === 1 && n % 100 !== 11 ? 'день' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'дня' : 'дней';
        showPlain('date-diff-result', `${n} ${suf}`);
    });

    // ===================== SECURITY TRAILS =====================
    const valOfRec = (v) => v && (v.nameserver || v.ip || v.ipv6 || v.host || v.hostname || v.value || v.name || v.rdata || v.email || (typeof v === 'string' ? v : '')) || '';
    const durLabel = (a, b) => {
        const d1 = new Date(a), d2 = (b === 'сейчас' || !b) ? new Date() : new Date(b);
        if (isNaN(d1) || isNaN(d2)) return '';
        const days = Math.round((d2 - d1) / 86400000);
        if (days < 1) return '< 1 дня';
        if (days < 31) return days + ' дн.';
        const months = Math.round(days / 30.44);
        if (months < 12) return months + ' мес.';
        const years = (days / 365.25);
        return (years < 2 ? years.toFixed(1) : Math.round(years)) + ' г.';
    };
    const renderHistory = (domain, histType, records) => {
        if (!records || !records.length) { showCard('st-result', row('История', 'Записей не найдено')); return; }
        let html = `<div class="card-header"><div class="card-domain">${domain} — История ${histType.toUpperCase()}</div></div>`;
        records.slice(0, 40).forEach(rec => {
            const vals = (rec.values || []).map(valOfRec).filter(Boolean);
            if (!vals.length) return;
            const orgs = (rec.organizations || []).filter(Boolean).join(', ');
            const first = rec.first_seen || '?';
            const last = rec.last_seen || 'сейчас';
            const dur = durLabel(first, last);
            const active = last === 'сейчас';
            html += `<div class="result-row" style="display:block;padding:8px 0">
                <div class="mono" style="font-size:12px;line-height:1.5">${vals.map(v => `<div>${v}</div>`).join('')}</div>
                ${orgs ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${orgs}</div>` : ''}
                <div style="font-size:10px;color:var(--muted);margin-top:3px;font-family:monospace">
                    ${first} → ${active ? '<span style="color:var(--ok,#4caf50)">сейчас</span>' : last}${dur ? ' · ' + dur : ''}
                </div>
            </div>`;
        });
        showCard('st-result', html);
    };
    const renderSubdomains = (domain, subs) => {
        if (!subs || !subs.length) { showCard('st-result', row('Поддомены', 'Не найдено')); return; }
        let html = `<div class="card-header"><div class="card-domain">${domain} — поддомены (${subs.length})</div></div>`;
        html += `<div style="padding:6px 0">${subs.map(s =>
            `<div class="r-value" style="font-family:monospace;font-size:11.5px;padding:3px 10px;cursor:pointer" title="Скопировать">${s}</div>`
        ).join('')}</div>`;
        showCard('st-result', html);
        const cont = document.getElementById('st-result');
        // клик по строке — копирование одного поддомена
        cont.querySelectorAll('.r-value').forEach(el => {
            el.addEventListener('click', () => copyClip(el.textContent).then(() => showCopiedToast(el)));
        });
    };

    const doST = () => {
        const domain = document.getElementById('st-input').value.trim().replace(/^https?:\/\//i,'').split('/')[0];
        const mode   = document.getElementById('st-mode').value;
        if (!domain) return;

        if (mode === 'subdomains') {
            const cacheKey = `st_${domain}_subdomains`;
            const cached = cacheGet(cacheKey);
            if (cached) { renderSubdomains(domain, cached.subdomains || []); return; }
            showCard('st-result', loading('Запрашиваем поддомены...'));
            safeSendMessage({ action: 'stSubdomains', domain }, (resp) => {
                if (!resp?.success) { showCard('st-result', row('Ошибка', resp?.error || 'Нет ответа')); return; }
                cacheSet(cacheKey, resp.data);
                renderSubdomains(domain, resp.data?.subdomains || []);
            });
            return;
        }

        const histType = mode.replace('hist_', '');
        const cacheKey = `st_${domain}_${histType}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
            renderHistory(domain, histType, cached?.records || []);
            return;
        }
        showCard('st-result', loading('Запрашиваем историю DNS...'));
        safeSendMessage({ action: 'stHistory', domain, type: histType }, (resp) => {
            if (!resp?.success) { showCard('st-result', row('Ошибка', resp?.error || 'Нет ответа')); return; }
            if (resp.success) cacheSet(cacheKey, resp.data);
            renderHistory(domain, histType, resp.data?.records || []);
        });
    };
    document.getElementById('st-btn').addEventListener('click', doST);
    document.getElementById('st-input').addEventListener('keydown', e => e.key === 'Enter' && doST());

    // ===================== PUNYCODE =====================
    // Декодер xn-- → unicode (RFC 3492)
    const decodePunycodeLabel = (label) => {
        const lo = label.toLowerCase();
        if (!lo.startsWith('xn--')) return label;
        const input = lo.slice(4);
        const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700, iBias = 72, iN = 128;
        const b2d = (cp) => cp >= 48 && cp <= 57 ? cp - 22 : cp >= 97 && cp <= 122 ? cp - 97 : cp >= 65 && cp <= 90 ? cp - 65 : base;
        const adapt = (delta, pts, first) => {
            delta = first ? Math.floor(delta / damp) : delta >> 1;
            delta += Math.floor(delta / pts);
            let k = 0;
            while (delta > Math.floor((base - tMin) * tMax / 2)) { delta = Math.floor(delta / (base - tMin)); k += base; }
            return k + Math.floor((base - tMin + 1) * delta / (delta + skew));
        };
        const output = [];
        const lastDash = input.lastIndexOf('-');
        for (let j = 0; j < (lastDash < 0 ? 0 : lastDash); j++) output.push(input.charCodeAt(j));
        let i = 0, n = iN, bias = iBias, idx = lastDash < 0 ? 0 : lastDash + 1;
        while (idx < input.length) {
            const oldi = i;
            for (let w = 1, k = base; ; k += base) {
                const digit = b2d(input.charCodeAt(idx++));
                i += digit * w;
                const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
                if (digit < t) break;
                w *= base - t;
            }
            const len = output.length + 1;
            bias = adapt(i - oldi, len, oldi === 0);
            n += Math.floor(i / len);
            i %= len;
            output.splice(i++, 0, n);
        }
        return output.map(c => String.fromCodePoint(c)).join('');
    };
    const decodePunycode = (host) => host.split('.').map(l => { try { return decodePunycodeLabel(l); } catch { return l; } }).join('.');
    const hasPunycode = (s) => s.split('.').some(l => l.toLowerCase().startsWith('xn--'));

    document.getElementById('punycode-btn').addEventListener('click', () => {
        const input   = document.getElementById('punycode-input').value.trim();
        const copyOk  = document.getElementById('punycode-copy-ok');
        copyOk.style.display = 'none';
        if (!input) return;
        try {
            let result;
            if (hasPunycode(input.replace(/^https?:\/\//i, '').split('/')[0])) {
                // xn-- → Кириллица
                const host = input.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
                result = decodePunycode(host);
            } else {
                // Кириллица / любой домен → punycode
                result = new URL(input.includes('://') ? input : 'http://' + input).hostname;
            }
            showPlain('punycode-result', result);
            copyClip(result).then(() => {
                copyOk.style.display = 'block';
                setTimeout(() => { copyOk.style.display = 'none'; }, 2500);
            }).catch(() => {});
        } catch {
            showPlain('punycode-result', 'Некорректный домен', 'var(--err)');
        }
    });

    // ═══════════════════════════════════════════════════════════
    //  АВТОСОХРАНЕНИЕ И ВОССТАНОВЛЕНИЕ ПОЛЕЙ + РЕЗУЛЬТАТОВ
    // ═══════════════════════════════════════════════════════════

    // Сохраняем значение поля при каждом изменении
    const watchInput = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const saved = localStorage.getItem('val_' + id);
        if (saved) { el.value = saved; el.dispatchEvent(new Event('input')); } // показать × если есть значение
        el.addEventListener('input', () => {
            if (el.value) localStorage.setItem('val_' + id, el.value);
            else localStorage.removeItem('val_' + id);
        });
    };
    // Сохраняем значение select
    const watchSelect = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const saved = localStorage.getItem('val_' + id);
        if (saved) el.value = saved;
        el.addEventListener('change', () => localStorage.setItem('val_' + id, el.value));
    };

    watchInput('whois-input');
    watchInput('dns-input');
    watchInput('checkhost-input');
    watchInput('st-input');
    watchInput('punycode-input');
    watchSelect('dns-type');
    watchSelect('checkhost-type');
    watchSelect('st-mode');

    // ═══════════════════════════════════════════════════════════════
    // Recovery незавершённых запросов из session storage
    // ═══════════════════════════════════════════════════════════════
    if (typeof chrome !== 'undefined' && chrome?.storage?.session) {
        chrome.storage.session.get(null, (items) => {
            // Ищем результаты WHOIS которые сохранил background
            for (const [key, result] of Object.entries(items || {})) {
                if (key.startsWith('whois_result_')) {
                    const domain = key.replace('whois_result_', '');
                    // Вставляем домен в input если там его нет
                    const input = document.getElementById('whois-input');
                    if (!input.value && result?.data) {
                        input.value = domain;
                        renderWhois(result, domain);
                    }
                }
            }
        });
    }

    // Авто-восстановление результатов из кэша при открытии
    (() => {
        // WHOIS
        const wRaw = document.getElementById('whois-input').value.trim();
        if (wRaw) {
            const domain = wRaw.replace(/^https?:\/\//i,'').split('/')[0].toLowerCase();
            const c = cacheGet(`whois_${domain}`);
            if (c) renderWhois(c, domain);
        }
        // DNS
        const dDomain = document.getElementById('dns-input').value.trim();
        const dType   = document.getElementById('dns-type').value;
        if (dDomain) {
            const c = cacheGet(`dns_${dDomain}_${dType}`);
            if (c) renderDns(c, dType);
        }
        // IP/Check
        const chHost = document.getElementById('checkhost-input').value.trim();
        const chType = document.getElementById('checkhost-type').value;
        if (chHost) {
            const c = cacheGet(`check_${chHost}_${chType}`);
            if (c && chType === 'info') renderIpInfo(c);
        }
        // ST
        const stDomain = document.getElementById('st-input').value.trim().replace(/^https?:\/\//i,'').split('/')[0];
        const stMode   = document.getElementById('st-mode').value;
        if (stDomain) {
            const histType = stMode.replace('hist_','');
            const c = cacheGet(`st_${stDomain}_${histType}`);
            if (c && (c.records || []).length) {
                renderHistory(stDomain, histType, c.records);
            }
        }
    })();

    // ===================== ССЫЛКА НА ТИКЕТ ДЛЯ КЛИЕНТА =====================
    (async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) return;
            // staff.example.com/tickets/123  →  example.com/tickets/123
            const m = tab.url.match(/^https?:\/\/staff.example.com\/tickets\/(\d+)/i);
            if (!m) return;
            const clientUrl = `https://example.com/tickets/${m[1]}`;
            const box = document.getElementById('ticket-link-box');
            const urlInput = document.getElementById('ticket-link-url');
            const copyBtn = document.getElementById('ticket-link-copy');
            const ok = document.getElementById('ticket-link-ok');
            if (!box) return;
            urlInput.value = clientUrl;
            box.style.display = 'block';
            copyBtn.addEventListener('click', () => {
                copyClip(clientUrl).catch(() => {
                    urlInput.select(); document.execCommand('copy');
                });
                ok.style.display = 'block';
                setTimeout(() => { ok.style.display = 'none'; }, 1800);
            });
        } catch (e) {}
    })();

    // ===================== АВТОЗАПОЛНЕНИЕ ИЗ ВЫДЕЛЕНИЯ =====================
    // Заполняет поля всех инструментов выбранным доменом
    // Все поля, куда подставляется домен (в т.ч. новые: L2 «Проверка домена»)
    const DOMAIN_INPUT_IDS = ['whois-input', 'dns-input', 'checkhost-input', 'st-input',
        'punycode-input', 'ssl-input', 'ssl-dns-input', 'ssl-ch-input', 'l2-mc-domain'];
    function fillDomainEverywhere(domain) {
        if (!domain) return;
        DOMAIN_INPUT_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = domain; // не затираем то, что юзер уже ввёл
        });
    }
    function fillDomainForce(domain) {
        if (!domain) return;
        DOMAIN_INPUT_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = domain;
        });
    }

    // Запуск проверки из контекстного меню (правый клик по выделенному тексту):
    // подставляем запрос, переключаемся на нужную вкладку и жмём её кнопку.
    function runContextAction(act) {
        if (!act || !act.q || !act.tab) return;
        fillDomainForce(act.q);
        const tabBtn = document.querySelector(`.tab-btn[data-target="tab-${act.tab}"]`);
        if (tabBtn) tabBtn.click();
        const btnId = { whois: 'whois-btn', dns: 'dns-btn', checkhost: 'checkhost-btn', punycode: 'punycode-btn', ssl: 'ssl-btn' }[act.tab];
        const b = document.getElementById(btnId);
        if (b) setTimeout(() => b.click(), 60);
    }
    try {
        chrome.storage.local.get(['stContextAction'], (d) => {
            if (chrome.runtime.lastError) return;
            const a = d.stContextAction;
            if (a && a.ts && (Date.now() - a.ts < 60 * 1000)) {
                runContextAction(a);
                try { chrome.storage.local.remove('stContextAction'); } catch (e) {}
            }
        });
    } catch (e) {}

    // При открытии попапа — подставляем недавно выделенный домен
    try {
        chrome.storage.local.get(['lastSelectedDomain', 'lastSelectedTs'], (d) => {
            if (chrome.runtime.lastError) return;
            if (d.lastSelectedDomain && d.lastSelectedTs && (Date.now() - d.lastSelectedTs < 10 * 60 * 1000)) {
                fillDomainEverywhere(d.lastSelectedDomain);
            }
        });
    } catch (e) {}
    // Живое обновление (для откреплённого окна)
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.lastSelectedDomain) {
                try { fillDomainEverywhere(changes.lastSelectedDomain.newValue); } catch (e) {}
            }
        });
    } catch (e) {}
    // При возврате фокуса в откреплённое окно — перечитываем последний домен
    window.addEventListener('focus', () => {
        try {
            if (!chrome.runtime?.id) return;
            chrome.storage.local.get(['lastSelectedDomain', 'lastSelectedTs'], (d) => {
                if (chrome.runtime.lastError) return;
                if (d.lastSelectedDomain && d.lastSelectedTs && (Date.now() - d.lastSelectedTs < 10 * 60 * 1000)) {
                    fillDomainEverywhere(d.lastSelectedDomain);
                }
            });
        } catch (e) {}
    });

    // ===================== SSL (crt.sh) =====================
    (function initSsl() {
        const inp = document.getElementById('ssl-input');
        const btn = document.getElementById('ssl-btn');
        const status = document.getElementById('ssl-status');
        const out = document.getElementById('ssl-results');
        if (!btn) return;

        // Mixed content — анализ HTTP-ресурсов на HTTPS-странице (аналог jitbit)
        (() => {
            const mb = document.getElementById('ssl-mixed-btn');
            const mst = document.getElementById('ssl-mixed-status');
            const mres = document.getElementById('ssl-mixed-results');
            if (!mb) return;
            const escM = (s) => (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

            const parseMixed = (html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const found = [];
                const add = (type, url) => { if (url && /^http:\/\//i.test(url.trim())) found.push({ type, url: url.trim() }); };
                doc.querySelectorAll('script[src]').forEach(n => add('script', n.getAttribute('src')));
                doc.querySelectorAll('link[href]').forEach(n => { const rel = (n.getAttribute('rel') || '').toLowerCase(); if (/stylesheet|preload|icon/.test(rel)) add('link/css', n.getAttribute('href')); });
                doc.querySelectorAll('img[src]').forEach(n => add('img', n.getAttribute('src')));
                doc.querySelectorAll('iframe[src]').forEach(n => add('iframe', n.getAttribute('src')));
                doc.querySelectorAll('video[src],audio[src],source[src]').forEach(n => add('media', n.getAttribute('src')));
                doc.querySelectorAll('object[data]').forEach(n => add('object', n.getAttribute('data')));
                doc.querySelectorAll('embed[src]').forEach(n => add('embed', n.getAttribute('src')));
                doc.querySelectorAll('form[action]').forEach(n => add('form', n.getAttribute('action')));
                const urlRe = /url\(\s*['"]?(http:\/\/[^'")\s]+)/ig;
                doc.querySelectorAll('[style]').forEach(n => { let m; const s = n.getAttribute('style') || ''; while ((m = urlRe.exec(s))) add('css url()', m[1]); });
                doc.querySelectorAll('style').forEach(st => { let m; const s = st.textContent || ''; while ((m = urlRe.exec(s))) add('css url()', m[1]); });
                // дедуп по url
                const seen = new Set();
                return found.filter(f => { const k = f.type + '|' + f.url; if (seen.has(k)) return false; seen.add(k); return true; });
            };

            const render = (found) => {
                if (!found.length) {
                    mres.innerHTML = '<div style="font-size:12px;color:var(--ok);padding:6px 0">✓ Mixed content не найден — небезопасных HTTP-ресурсов нет</div>';
                    return;
                }
                let html = `<div style="font-size:12px;color:var(--err);font-weight:600;margin:4px 0 6px">Найдено ${found.length} небезопасных ресурсов:</div>`;
                html += found.map(f =>
                    `<div style="display:flex;gap:6px;align-items:baseline;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:4px">
                        <span style="font-size:9.5px;color:var(--warn);text-transform:uppercase;flex:none;min-width:56px">${escM(f.type)}</span>
                        <span style="font-family:monospace;font-size:10.5px;word-break:break-all;color:var(--text)">${escM(f.url)}</span>
                    </div>`).join('');
                mres.innerHTML = html;
            };

            mb.addEventListener('click', () => {
                const dom = (document.getElementById('ssl-input').value || '').trim();
                if (!dom) { document.getElementById('ssl-input').focus(); return; }
                mb.disabled = true;
                mres.innerHTML = '';
                mst.style.color = 'var(--muted)';
                mst.textContent = 'Загружаем страницу…';
                safeSendMessage({ action: 'mixedFetch', url: dom }, (resp) => {
                    mb.disabled = false;
                    if (!resp?.success) {
                        mst.style.color = 'var(--err)';
                        mst.textContent = '✗ ' + (resp?.error || 'Не удалось загрузить страницу');
                        return;
                    }
                    mst.style.color = 'var(--muted)';
                    mst.textContent = resp.finalUrl ? ('Проверено: ' + resp.finalUrl) : '';
                    render(parseMixed(resp.html));
                });
            });
        })();

        const fmtDt = (s) => {
            if (!s) return '—';
            const d = new Date(s);
            if (isNaN(d)) return s;
            return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        const esc = (s) => (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

        // ── certspotter/crt.sh НАПРЯМУЮ из попапа (host_permissions <all_urls> снимает
        //    CORS). Без фонового service worker — он в вашей сети не отвечал; DNS-проверка
        //    рядом работает именно потому, что fetch идёт прямо из попапа. ──
        // fetch с таймаутом: в корп.сети запрос может «висеть» без ошибки — без таймаута
        // фолбэк не сработает и результат не появится вовсе. По истечении — явная ошибка.
        const fetchT = async (url, opts, ms) => {
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), ms || 12000);
            try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
            catch (e) { throw (e && e.name === 'AbortError') ? new Error('таймаут ' + ((ms || 12000) / 1000) + ' c') : e; }
            finally { clearTimeout(t); }
        };
        const csMap = (arr) => (Array.isArray(arr) ? arr : []).map(c => ({
            common_name: (c.dns_names && c.dns_names[0]) || '',
            issuer_name: c.issuer ? (c.issuer.friendly_name ? c.issuer.friendly_name + ' (' + c.issuer.name + ')' : c.issuer.name) : '',
            not_before: c.not_before, not_after: c.not_after,
            name_value: (c.dns_names || []).join('\n'),
            serial_number: c.cert_sha256 || c.id || ''
        }));
        const csQuery = async (d) => {
            const u = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(d)}&include_subdomains=true&expand=dns_names&expand=issuer`;
            const r = await fetchT(u, { headers: { Accept: 'application/json' } }, 12000);
            if (!r.ok) throw new Error('certspotter HTTP ' + r.status);
            return csMap(await r.json());
        };
        const crtQuery = async (d) => {
            const r = await fetchT(`https://crt.sh/?q=${encodeURIComponent(d)}&output=json`, { headers: { Accept: 'application/json' } }, 12000);
            if (!r.ok) throw new Error('crt.sh HTTP ' + r.status);
            const t = await r.text(); let arr = [];
            try { arr = JSON.parse(t); } catch { try { arr = JSON.parse('[' + t.trim().replace(/}\s*{/g, '},{') + ']'); } catch {} }
            return Array.isArray(arr) ? arr : [];
        };

        const loadCt = async () => {
            const domain = (inp.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            if (!domain) { inp.focus(); return; }
            out.innerHTML = '';
            status.style.display = 'block';
            status.textContent = 'Запрашиваю Certificate Transparency…';
            let certs = [], source = 'certspotter';
            try {
                certs = await csQuery(domain);
                if (!certs.length) {
                    const p = domain.split('.').length > 2 ? domain.split('.').slice(1).join('.') : null;
                    if (p) certs = await csQuery(p);
                }
            } catch (e1) {
                try { certs = await crtQuery(domain); source = 'crt.sh'; }
                catch (e2) { status.textContent = 'CT недоступен (' + e1.message + '). Проверяю живой серт…'; loadLive(); return; }
            }
            if (!certs.length) { status.textContent = `В CT для «${domain}» ничего нет — проверяю живой серт…`; loadLive(); return; }
            try {
                const covers = (names) => names.some(n => {
                    n = n.toLowerCase().replace(/\.$/, '');
                    if (n === domain) return true;
                    if (n.startsWith('*.')) {
                        const base = n.slice(2);
                        if (domain.endsWith('.' + base) && domain.slice(0, -(base.length + 1)).indexOf('.') === -1) return true;
                    }
                    return false;
                });
                const namesOf = (c) => [c.common_name, ...String(c.name_value || '').split(/\n+/)].map(s => (s || '').trim()).filter(Boolean);
                const seen = new Set();
                let list = certs.filter(c => covers(namesOf(c)))
                    .sort((a, b) => new Date(b.not_before) - new Date(a.not_before))
                    .filter(c => { const k = c.serial_number || (c.id + ''); if (seen.has(k)) return false; seen.add(k); return true; });
                if (!list.length) { status.textContent = `В CT нет серта именно для «${domain}» (по зоне найдено ${certs.length}). Проверяю живой…`; loadLive(); return; }
                const now = Date.now();
                const active = list.filter(c => new Date(c.not_after).getTime() > now);
                status.style.display = 'none';
                const head = document.createElement('div');
                head.className = 'result-plain visible'; head.style.cssText = 'margin-bottom:4px';
                head.innerHTML = `Сертификаты для <b>${esc(domain)}</b> (CT · ${esc(source)}). Найдено: ${list.length}, действующих: ${active.length}. Первый — самый свежий.`;
                out.appendChild(head);
                const liveBtn = document.createElement('button');
                liveBtn.className = 'btn'; liveBtn.textContent = 'Живой серт (leaderssl)'; liveBtn.style.marginBottom = '8px';
                liveBtn.onclick = () => loadLive();
                out.appendChild(liveBtn);
                list.slice(0, 25).forEach(c => {
                    const exp = new Date(c.not_after).getTime() < now;
                    const daysLeft = Math.round((new Date(c.not_after).getTime() - now) / 86400000);
                    const card = document.createElement('div'); card.className = 'result-card visible'; card.style.padding = '4px 0';
                    const names = [...new Set((c.name_value || '').split(/\n+/).map(s => s.trim()).filter(Boolean))];
                    card.innerHTML =
                        row('Subject (CN)', esc(c.common_name || names[0] || '—')) +
                        row('Издатель', esc(c.issuer_name || '—')) +
                        row('Выдан', fmtDt(c.not_before)) +
                        row('Действует до', fmtDt(c.not_after) + ' ' + (exp ? badge('истёк', 'err') : badge(daysLeft >= 0 ? `осталось ${daysLeft} дн.` : 'активен', 'ok'))) +
                        row('Серийный №', `<span style="font-family:monospace;font-size:11px;word-break:break-all">${esc(c.serial_number || '—')}</span>`) +
                        row('Домены (SAN)', `<span style="word-break:break-all">${esc(names.slice(0, 12).join(', '))}${names.length > 12 ? ' …+' + (names.length - 12) : ''}</span>`);
                    out.appendChild(card);
                });
            } catch (e) { status.style.display = 'block'; status.textContent = 'Сбой отображения результата: ' + (e && e.message); }
        };

        // Живой сертификат через leaderssl — тоже НАПРЯМУЮ из попапа, без фона.
        const MON_RU = { 'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11 };
        const parseLeader = (html) => {
            const ok = /установлен правильно/i.test(html);
            const chain = [...html.matchAll(/<a class="cert-\d+"[^>]*>(?:\s*<i[^>]*><\/i>)?\s*([^<]+)<\/a>/g)].map(m => m[1].trim()).filter(Boolean);
            const dates = []; const re = /(\d{1,2})\s+([а-яё]+)\s+(\d{4})/gi; let m;
            while ((m = re.exec(html))) { const mm = MON_RU[m[2].toLowerCase()]; if (mm != null) dates.push(new Date(Date.UTC(+m[3], mm, +m[1]))); }
            const now = Date.now();
            const fut = dates.filter(d => d.getTime() > now).sort((a, b) => a - b);
            const past = dates.filter(d => d.getTime() <= now).sort((a, b) => b - a);
            return { ok, present: ok || chain.length > 0 || fut.length > 0, leaf: chain[chain.length - 1] || '', issuer: chain.slice(0, -1).join(' ← ') || null, validFrom: past[0] ? past[0].toISOString() : null, validTo: fut[0] ? fut[0].toISOString() : null };
        };
        const loadLive = async () => {
            const domain = (inp.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            if (!domain) { inp.focus(); return; }
            out.innerHTML = '';
            status.style.display = 'block';
            status.textContent = 'Проверяю живой сертификат (leaderssl)…';
            const cn = /^\d/.test(domain) ? ('https://' + domain) : domain;
            const checkUrl = `https://www.leaderssl.ru/tools/ssl_checker?cn=${encodeURIComponent(cn)}&commit=%D0%9F%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%B8%D1%82%D1%8C`;
            let resp;
            try { const r = await fetchT(checkUrl, { headers: { Accept: 'text/html' } }, 15000); resp = parseLeader(await r.text()); }
            catch (e) {
                status.textContent = 'leaderssl недоступен: ' + e.message + '. Смотрю историю выдач (CT)…';
                const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'История выдач (CT)';
                b.style.marginTop = '8px'; b.onclick = () => loadCt(); out.appendChild(b);
                return;
            }
            try {
                status.style.display = 'none'; out.innerHTML = '';
                const head = document.createElement('div'); head.className = 'result-plain visible'; head.style.cssText = 'margin-bottom:4px';
                head.innerHTML = `Живой сертификат для <b>${esc(domain)}</b> · leaderssl`;
                out.appendChild(head);
                const dl = resp.validTo ? Math.round((new Date(resp.validTo).getTime() - Date.now()) / 86400000) : null;
                const card = document.createElement('div'); card.className = 'result-card visible'; card.style.padding = '4px 0';
                if (!resp.present) {
                    card.innerHTML = row('Статус', badge('рабочий SSL не обнаружен', 'err')) +
                        row('Комментарий', 'leaderssl не подтвердил рабочий сертификат (нет HTTPS, ошибка соединения или серт не отдаётся).');
                } else {
                    card.innerHTML =
                        row('Статус', resp.ok ? badge('SSL установлен правильно', 'ok') : badge('есть замечания (см. leaderssl)', 'err')) +
                        (resp.leaf ? row('Домен (лист)', esc(resp.leaf)) : '') +
                        (resp.issuer ? row('Издатель (CA)', esc(resp.issuer)) : '') +
                        (resp.validFrom ? row('Выдан', fmtDt(resp.validFrom)) : '') +
                        (resp.validTo ? row('Действует до', fmtDt(resp.validTo) + ' ' +
                            (dl < 0 ? badge('истёк', 'err') : badge('осталось ' + dl + ' дн.', 'ok'))) : '');
                }
                out.appendChild(card);
                const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap';
                const openBtn = document.createElement('button'); openBtn.className = 'btn'; openBtn.textContent = 'Открыть на leaderssl';
                openBtn.onclick = () => chrome.tabs.create({ url: checkUrl });
                const ctBtn = document.createElement('button'); ctBtn.className = 'btn'; ctBtn.textContent = 'История выдач (CT)';
                ctBtn.onclick = () => loadCt();
                actions.append(openBtn, ctBtn);
                out.appendChild(actions);
            } catch (e) { status.style.display = 'block'; status.textContent = 'Сбой отображения: ' + (e && e.message); }
        };

        // Основная проверка — certspotter (надёжный JSON CT): какой SSL, кем выдан,
        // до какого числа и сколько дней осталось. При недоступности — фолбэк на leaderssl.
        const run = loadCt;
        btn.addEventListener('click', run);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    })();

    // ============ SSL: под-разделы + DNS-проверка ============
    (function initSslSub() {
        // переключение под-разделов (Сертификаты / Пакетная проверка)
        const subBtns = document.querySelectorAll('#tab-ssl .ssl-subtab');
        subBtns.forEach(b => b.addEventListener('click', () => {
            const sub = b.dataset.sub;
            subBtns.forEach(x => x.classList.toggle('active', x === b));
            document.querySelectorAll('#tab-ssl .ssl-sub').forEach(s => { s.style.display = (s.dataset.sub === sub) ? '' : 'none'; });
        }));

        // DNS-проверка (как раздел DNS, через DoH dns.google)
        const dInp = document.getElementById('ssl-dns-input');
        const dType = document.getElementById('ssl-dns-type');
        const dBtn = document.getElementById('ssl-dns-btn');
        const dCopy = document.getElementById('ssl-dns-copy');
        if (!dBtn) return;

        const render = (data, type) => {
            if (data.Answer && data.Answer.length) {
                showCard('ssl-dns-result', data.Answer.map(r =>
                    `<div class="result-row"><span class="r-label" style="font-family:monospace;font-size:10px">${r.name.replace(/\.$/, '')}</span><span class="r-value mono">${r.data}</span></div>`
                ).join(''));
            } else {
                showCard('ssl-dns-result', row(`Записи ${type}`, 'не найдены'));
            }
        };
        const run = async () => {
            let domain = dInp.value.trim().replace(/^https?:\/\//i, '').split('/')[0];
            if (/[а-яёА-ЯЁ]/.test(domain)) { try { domain = new URL('http://' + domain).hostname; dInp.value = domain; } catch (e) {} }
            const type = dType.value;
            if (!domain) return;
            const qName = (type === 'DMARC') ? `_dmarc.${domain}` : domain;
            const qType = (type === 'DMARC') ? 'TXT' : type;
            showCard('ssl-dns-result', loading('Запрашиваем DNS...'));
            try {
                const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(qName)}&type=${qType}`);
                render(await res.json(), qType);
            } catch { showCard('ssl-dns-result', row('Ошибка', 'Не удалось выполнить запрос')); }
        };
        dBtn.addEventListener('click', run);
        dInp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
        dCopy.addEventListener('click', () => {
            let domain = dInp.value.trim().replace(/^https?:\/\//i, '').split('/')[0];
            if (/[а-яёА-ЯЁ]/.test(domain)) { try { domain = new URL('http://' + domain).hostname; } catch (e) {} }
            const type = dType.value;
            if (!domain) return;
            const url = (type === 'DMARC') ? `https://dnschecker.org/#TXT/_dmarc.${domain}` : `https://dnschecker.org/#${type}/${domain}`;
            copyClip(url).then(() => { const o = dCopy.innerHTML; dCopy.innerHTML = '✓ Скопировано'; setTimeout(() => { dCopy.innerHTML = o; }, 1500); });
        });
    })();

    // ── SSL: Check-Host (IP-инфо) ──────────────────────────────────────────────
    (() => {
        const chInp = document.getElementById('ssl-ch-input');
        const chType = document.getElementById('ssl-ch-type');
        const chBtn = document.getElementById('ssl-ch-btn');
        if (!chBtn) return;
        const run = () => {
            let host = chInp.value.trim().replace(/^https?:\/\//i, '').split('/')[0];
            if (!host) return;
            const type = chType.value;
            const cacheKey = `check_${host}_${type}`;
            if (type === 'info') {
                const cached = cacheGet(cacheKey);
                if (cached) { renderIpInfo(cached, 'ssl-ch-info', 'ssl-ch-nodes'); return; }
                showCard('ssl-ch-info', loading('Получаем информацию об IP...'));
                safeSendMessage({ action: 'ipInfo', target: host }, (resp) => {
                    if (resp?.success) cacheSet(cacheKey, resp);
                    renderIpInfo(resp, 'ssl-ch-info', 'ssl-ch-nodes');
                });
            } else {
                showCard('ssl-ch-info', loading('Запускаем проверку из нескольких точек...'));
                document.getElementById('ssl-ch-nodes').innerHTML = '';
                safeSendMessage({ action: 'checkHost', host, type }, (resp) => {
                    if (!resp?.success) { showCard('ssl-ch-info', row('Ошибка', resp?.error || 'Нет ответа')); return; }
                    const { nodes, results } = resp;
                    let ok = 0, total = 0, cards = '';
                    for (const [id, info] of Object.entries(nodes)) {
                        const [, ip, cc, city] = info;
                        const res = results[id];
                        total++;
                        let st = badge('ожидание', 'warn');
                        if (res) {
                            const r = res[0];
                            if (r === null) { st = badge('timeout', 'err'); }
                            else if (type === 'ping') {
                                const att = Array.isArray(r) ? r : [];
                                const okA = att.filter(a => Array.isArray(a) && a[0] === 'OK');
                                if (okA.length) { ok++; const rtts = okA.map(a => a[1]).filter(x => typeof x === 'number'); const avg = rtts.length ? (rtts.reduce((s, x) => s + x, 0) / rtts.length) * 1000 : 0; st = badge(`OK ${okA.length}/${att.length}${avg ? ' ' + avg.toFixed(0) + 'ms' : ''}`, okA.length === att.length ? 'ok' : 'warn'); }
                                else st = badge('недоступен', 'err');
                            } else if (type === 'tcp') {
                                if (r && typeof r === 'object' && (r.address || r.time != null) && !r.error) { ok++; st = badge(`OK${r.time != null ? ' ' + (r.time * 1000).toFixed(0) + 'ms' : ''}`, 'ok'); }
                                else st = badge('ошибка', 'err');
                            } else {
                                const success = Array.isArray(r) && r[0] === 1; const code = Array.isArray(r) ? r[3] : null; const reason = Array.isArray(r) ? r[2] : null;
                                if (success) { ok++; st = badge(`${code || ''} ${reason || 'OK'}`.trim(), 'ok'); } else st = badge(reason || code || 'ошибка', 'err');
                            }
                        }
                        cards += `<div class="node-card"><div class="node-loc">${flag(cc)} ${city || cc}</div><div class="node-ip">${ip || ''}</div><div class="node-st">${st}</div></div>`;
                    }
                    const sum = total > 0 ? (ok === total ? badge(`✓ ${ok}/${total} точек`, 'ok') : badge(`${ok}/${total} точек`, 'warn')) : badge('Нет данных', 'warn');
                    showCard('ssl-ch-info', `<div class="card-header"><div class="card-domain">${host}</div><div>${sum}</div></div>`);
                    document.getElementById('ssl-ch-nodes').innerHTML = cards;
                });
            }
        };
        chBtn.addEventListener('click', run);
        chInp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    })();

    // ── Выбор области на странице (раздел вместо всей страницы) ──────────────
    // Попап закрывается, как только пользователь кликает по странице, поэтому
    // результат передаём через chrome.storage.local (ключ stAreaPick) + просим
    // фон переоткрыть попап. В плавающей панели результат подхватится мгновенно
    // через storage.onChanged (см. consumeAreaPick в блоках «Домены»/SSL).
    async function startAreaPicker(scope, hintEl) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || /^chrome:\/\//.test(tab.url || '')) {
                if (hintEl) { hintEl.style.display = 'block'; hintEl.textContent = 'Недоступно на этой странице'; }
                return;
            }
            await chrome.storage.local.remove('stAreaPick');
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                args: [scope],
                func: (pickScope) => {
                    if (window.__stAreaPicker) return;
                    window.__stAreaPicker = true;
                    let hovered = null;
                    const hl = document.createElement('div');
                    hl.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #4f6aff;background:rgba(79,106,255,.12);border-radius:3px;display:none';
                    const bar = document.createElement('div');
                    bar.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:50%;transform:translateX(-50%);background:#0f1320;color:#cdd6f4;font:13px/1.4 "Segoe UI",sans-serif;padding:8px 14px;border-radius:0 0 10px 10px;box-shadow:0 4px 20px rgba(0,0,0,.5);display:flex;gap:10px;align-items:center;border:1px solid #2b3350;border-top:none';
                    const label = document.createElement('span');
                    label.textContent = '🎯 Кликните по разделу для сканирования';
                    const wholeBtn = document.createElement('button');
                    wholeBtn.textContent = 'Вся страница';
                    wholeBtn.style.cssText = 'background:#4f6aff;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = 'Отмена (Esc)';
                    cancelBtn.style.cssText = 'background:transparent;color:#9ca3af;border:1px solid #2b3350;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit';
                    bar.append(label, wholeBtn, cancelBtn);
                    (document.documentElement || document.body).append(hl, bar);

                    const cleanup = () => {
                        hl.remove(); bar.remove();
                        document.removeEventListener('mousemove', onMove, true);
                        document.removeEventListener('click', onClick, true);
                        document.removeEventListener('keydown', onKey, true);
                        window.__stAreaPicker = false;
                    };
                    const finish = (el) => {
                        // Собираем не только видимый текст, но и домены из атрибутов
                        // (href/title/value/data-*) по всему поддереву — иначе не
                        // цепляются домены-ссылки в таблицах стаффа и заказа сертов.
                        const harvest = (root) => {
                            if (!root) return '';
                            const parts = [root.innerText || root.textContent || ''];
                            const ATTRS = ['href', 'title', 'value', 'data-domain', 'data-url', 'data-clipboard-text', 'aria-label'];
                            const grab = (n) => {
                                if (!n || !n.getAttribute) return;
                                ATTRS.forEach(a => { const v = n.getAttribute(a); if (v) parts.push(v); });
                                if (typeof n.value === 'string' && n.value) parts.push(n.value);
                            };
                            grab(root);
                            root.querySelectorAll('*').forEach(grab);
                            return parts.join('\n');
                        };
                        const text = harvest(el);
                        cleanup();
                        try {
                            chrome.storage.local.set({ stAreaPick: { scope: pickScope, text, ts: Date.now() } }, () => {
                                try { chrome.runtime.sendMessage({ action: 'areaPickDone' }); } catch (e) {}
                            });
                        } catch (e) {}
                    };
                    const onMove = (e) => {
                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        if (!el || el === hl || el === bar || bar.contains(el)) return;
                        hovered = el;
                        const r = el.getBoundingClientRect();
                        hl.style.display = 'block';
                        hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px';
                        hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
                    };
                    const onClick = (e) => {
                        if (e.target === wholeBtn || e.target === cancelBtn || bar.contains(e.target)) return;
                        e.preventDefault(); e.stopPropagation();
                        finish(hovered || document.body);
                    };
                    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); } };
                    wholeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); finish(document.body); });
                    cancelBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cleanup(); });
                    document.addEventListener('mousemove', onMove, true);
                    document.addEventListener('click', onClick, true);
                    document.addEventListener('keydown', onKey, true);
                }
            });
            if (hintEl) { hintEl.style.display = 'block'; hintEl.textContent = 'Выберите раздел на странице (или «Вся страница»)…'; }
            // В обычном попапе закрываемся — иначе клик по странице всё равно его закроет.
            if (!IS_DETACHED) setTimeout(() => { try { window.close(); } catch (e) {} }, 200);
        } catch (e) {
            if (hintEl) { hintEl.style.display = 'block'; hintEl.textContent = 'Ошибка: ' + (e.message || e); }
        }
    }

    // ============ ПАКЕТНАЯ ПРОВЕРКА SSL (leaderssl) ============
    (function initSslBulk() {
        const inp = document.getElementById('ssl-bulk-input');
        const out = document.getElementById('ssl-bulk-output');
        const statusEl = document.getElementById('ssl-bulk-status');
        const collectBtn = document.getElementById('ssl-bulk-collect');
        const runBtn = document.getElementById('ssl-bulk-run');
        const openBtn = document.getElementById('ssl-bulk-open');
        const stopBtn = document.getElementById('ssl-bulk-stop');
        const concInp = document.getElementById('ssl-bulk-conc');
        const timeoutInp = document.getElementById('ssl-bulk-timeout');
        const listBox = document.getElementById('ssl-bulk-list');
        const listItems = document.getElementById('ssl-bulk-items');
        const listCnt = document.getElementById('ssl-bulk-list-cnt');
        if (!runBtn) return;

        const LEADER = 'https://www.leaderssl.ru/tools/ssl_checker?cn={DOMAIN}&commit=%D0%9F%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%B8%D1%82%D1%8C';
        // постоянный список игнорирования (хранится в storage; пополняется кнопкой «В игнор»)
        const IGNORE_KEY = 'sslBulkIgnore';
        const IGNORE_SEED = ['clck.ru'];
        let ignoreSet = new Set(IGNORE_SEED);
        const saveIgnore = () => { try { chrome.storage.local.set({ [IGNORE_KEY]: [...ignoreSet] }); } catch (e) {} };
        try {
            chrome.storage.local.get([IGNORE_KEY], (d) => {
                ignoreSet = new Set([...(d[IGNORE_KEY] || []), ...IGNORE_SEED].map(x => String(x).toLowerCase().replace(/\.$/, '')));
                saveIgnore();
            });
        } catch (e) {}
        // исключения пакетной проверки: служебные зоны + пользовательский игнор
        const BULK_EXCLUDE = (d) => ignoreSet.has(d);
        // свои домены: по одному в строке ИЛИ через запятую/пробел/точку с запятой
        const parseDomains = () => [...new Set(
            (inp.value || '')
                .split(/[\n,;\s]+/)
                .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
                .filter(Boolean)
                .filter(d => !BULK_EXCLUDE(d))
        )];
        // leaderssl ломается на доменах, начинающихся с цифры — лечится префиксом https://
        const cnFix = d => /^\d/.test(d) ? 'https://' + d : d;
        let stopFlag = false;

        // ---- Чеклист собранных доменов: снятые галочки = исключены из проверки ----
        const updListCnt = () => {
            if (!listCnt) return;
            const boxes = [...listItems.querySelectorAll('input[type=checkbox]')];
            const on = boxes.filter(b => b.checked).length;
            listCnt.textContent = `Выбрано ${on} из ${boxes.length}`;
        };
        const renderChecklist = (domains) => {
            if (!listItems) return;
            listItems.innerHTML = '';
            const visible = domains.filter(d => !ignoreSet.has(d));
            if (!visible.length) { listBox.style.display = 'none'; return; }
            visible.forEach(d => {
                const rowEl = document.createElement('div');
                rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 10px;font-size:12px';
                const lbl = document.createElement('label');
                lbl.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer';
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.checked = true; cb.value = d; cb.style.cssText = 'flex:none;margin:0';
                cb.addEventListener('change', updListCnt);
                const span = document.createElement('span');
                span.textContent = d; span.style.cssText = 'word-break:break-all';
                lbl.append(cb, span);
                const ig = document.createElement('button');
                ig.type = 'button'; ig.textContent = 'В игнор'; ig.title = 'Добавить в постоянный список игнорирования';
                ig.style.cssText = 'flex:none;font-size:10px;padding:2px 7px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--muted);cursor:pointer';
                ig.addEventListener('click', () => {
                    ignoreSet.add(d); saveIgnore();
                    rowEl.remove();
                    // убираем и из текстового поля, чтобы не вернулся при пересборке
                    inp.value = parseDomains().filter(x => x !== d).join('\n');
                    updListCnt();
                    if (!listItems.querySelector('input[type=checkbox]')) listBox.style.display = 'none';
                    statusEl.textContent = `«${d}» добавлен в игнорирование (всего в игноре: ${ignoreSet.size}).`;
                });
                rowEl.append(lbl, ig);
                listItems.appendChild(rowEl);
            });
            listBox.style.display = '';
            updListCnt();
        };
        // домены для проверки: если чеклист показан — только отмеченные, иначе из текстового поля
        const selectedDomains = () => {
            if (listBox && listBox.style.display !== 'none') {
                return [...listItems.querySelectorAll('input[type=checkbox]:checked')]
                    .map(b => b.value).filter(d => !BULK_EXCLUDE(d));
            }
            return parseDomains();
        };
        // ручная правка текстового поля — пересобираем чеклист (если он показан)
        if (inp) inp.addEventListener('change', () => { if (listBox && listBox.style.display !== 'none') renderChecklist(parseDomains()); });
        if (listItems) {
            document.getElementById('ssl-bulk-all').addEventListener('click', e => {
                e.preventDefault();
                listItems.querySelectorAll('input[type=checkbox]').forEach(b => b.checked = true); updListCnt();
            });
            document.getElementById('ssl-bulk-none').addEventListener('click', e => {
                e.preventDefault();
                listItems.querySelectorAll('input[type=checkbox]').forEach(b => b.checked = false); updListCnt();
            });
        }

        // ---- Сбор доменов из .ssl-table__name-col текущей вкладки staff ----
        collectBtn.addEventListener('click', async () => {
            collectBtn.disabled = true;
            const orig = collectBtn.textContent;
            collectBtn.textContent = 'Собираю…';
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) { statusEl.textContent = 'Нет активной вкладки.'; return; }
                const [{ result } = {}] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const norm = raw => {
                            if (!raw) return '';
                            let s = String(raw).trim()
                                .replace(/^\s*[a-z]+:\/\//i, '').replace(/^\s*\/\//, '')
                                .split(/[\/?#]/)[0].replace(/:\d+$/, '').replace(/\.+$/, '');
                            return s.trim().toLowerCase();
                        };
                        const out = [], seen = new Set();
                        const push = d => { if (!d) return; if (seen.has(d)) return; seen.add(d); out.push(d); };

                        // 1) если открыт список сертификатов — берём из его таблицы
                        document.querySelectorAll('.ssl-table__name-col a').forEach(a =>
                            push(norm(a.textContent || a.getAttribute('title') || a.getAttribute('href'))));
                        if (out.length) return out;

                        // 2) иначе — сканируем страницу (тикет/карта) на клиентские домены
                        const TLDS = new Set(['ru','com','net','org','info','io','рф','su','kz','by','ua','tech','online','site','store','pro','app','dev','me','tv','cc','biz','name','xyz','top','club','shop','agency','team','space','cloud','digital','life','world','group','art','fun','wiki']);
                        const EXCLUDE = new Set(['example.com','example.com','example.com','staff.example.com','example.com','tw1.ru','tmweb.ru','infra1.net','nic.ru','reg.ru','reseller.example','gmail.com','yandex.ru','mail.ru','ya.ru','list.ru']);
                        const RE = /(?<![\w.@-])(?:https?:\/\/)?(?:www\.)?((?:[a-zA-Z0-9а-яё](?:[a-zA-Z0-9а-яё-]{0,61}[a-zA-Z0-9а-яё])?\.)+[a-zA-Zа-яё]{2,})/gi;
                        const text = document.body ? document.body.innerText : '';
                        let m;
                        while ((m = RE.exec(text))) {
                            const d = norm(m[1]);
                            if (!d) continue;
                            const parts = d.split('.');
                            if (parts.length < 2) continue;
                            if (EXCLUDE.has(d)) continue;
                            if (d.endsWith('.example.com') || d.endsWith('.example.com')) continue;
                            if (/^(ns|dns|mx|smtp|pop|imap|mail|www)\d*\./i.test(d)) continue;
                            if (!TLDS.has(parts[parts.length - 1])) continue;
                            push(d);
                        }
                        return out;
                    }
                });
                const collected = result || [];
                if (!collected.length) { statusEl.textContent = 'Доменов не найдено. Откройте список сертификатов («показать все») либо страницу тикета/карты клиента с доменами.'; return; }
                // объединяем с уже введёнными, без дублей
                const merged = [...new Set([...parseDomains(), ...collected])];
                inp.value = merged.join('\n');
                renderChecklist(merged);
                statusEl.textContent = `Собрано доменов: ${collected.length} (всего: ${merged.length}). Снимите галочки с ненужных.`;
            } catch (e) {
                statusEl.textContent = 'Не удалось собрать со страницы: ' + (e.message || e);
            } finally {
                collectBtn.disabled = false;
                collectBtn.textContent = orig;
            }
        });

        // ---- Извлечение доменов из произвольного текста (для выбора раздела) ----
        const SSL_TLDS = new Set(['ru','com','net','org','info','io','рф','su','kz','by','ua','tech','online','site','store','pro','app','dev','me','tv','cc','biz','name','xyz','top','club','shop','agency','team','space','cloud','digital','life','world','group','art','fun','wiki']);
        const extractDomainsFromText = (text) => {
            const RE = /(?<![\w.@-])(?:https?:\/\/)?(?:www\.)?((?:[a-zA-Z0-9а-яё](?:[a-zA-Z0-9а-яё-]{0,61}[a-zA-Z0-9а-яё])?\.)+[a-zA-Zа-яё]{2,})/gi;
            const out = new Set(); let m;
            while ((m = RE.exec(text || ''))) {
                const d = m[1].toLowerCase().replace(/\.+$/, '');
                const parts = d.split('.');
                if (parts.length < 2) continue;
                if (!SSL_TLDS.has(parts[parts.length - 1])) continue;
                if (/^(ns|dns|mx|smtp|pop|imap|mail|www)\d*\./i.test(d)) continue;
                // инфраструктура хостера — исключаем сам домен и любые его поддомены
                if (/(^|\.)(example.(ru|com|net|org)|infra1.ru|tmweb\.ru|infra1\.net)$/i.test(d)) continue;
                if (BULK_EXCLUDE(d)) continue;
                out.add(d);
            }
            return [...out];
        };
        const ingestSslDomains = (collected) => {
            if (!collected.length) { statusEl.textContent = 'В выбранном разделе доменов не найдено.'; return; }
            const merged = [...new Set([...parseDomains(), ...collected])];
            inp.value = merged.join('\n');
            renderChecklist(merged);
            statusEl.textContent = `Собрано доменов: ${collected.length} (всего: ${merged.length}). Снимите галочки с ненужных.`;
        };

        // ---- Выбрать раздел на странице ----
        const areaBtn = document.getElementById('ssl-bulk-area');
        if (areaBtn) areaBtn.addEventListener('click', () => startAreaPicker('ssl', statusEl));

        // ---- Приём выбранного раздела (через storage; см. startAreaPicker) ----
        const consumeSslPick = (pick) => {
            if (!pick || pick.scope !== 'ssl') return;
            if (Date.now() - (pick.ts || 0) > 120000) return; // не старше 2 минут
            chrome.storage.local.remove('stAreaPick');
            // переключаемся на вкладку SSL → под-раздел «Пакетная проверка»
            document.querySelector('.tab-btn[data-target="tab-ssl"]')?.click();
            document.querySelector('#tab-ssl .ssl-subtab[data-sub="bulk"]')?.click();
            ingestSslDomains(extractDomainsFromText(pick.text));
        };
        try { chrome.storage.local.get('stAreaPick', (d) => consumeSslPick(d.stAreaPick)); } catch (e) {}
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && ch.stAreaPick && ch.stAreaPick.newValue) consumeSslPick(ch.stAreaPick.newValue);
        });

        // ---- Открыть вкладками ----
        // ВАЖНО: открываем вкладки НЕ разом, а по одной с задержкой. Иначе leaderssl
        // получает пачку одновременных запросов и мгновенно банит по IP (особенно на
        // доменах с кодом 500 / долгой загрузкой). Задержка обязательна.
        const OPEN_THROTTLE_MS = 1200;
        openBtn.addEventListener('click', async () => {
            const domains = selectedDomains().slice(0, 300);
            if (!domains.length) { inp.focus(); return; }
            if (domains.length > 40 && !confirm(`Откроется ${domains.length} вкладок по одной с задержкой. Продолжить?`)) return;
            stopFlag = false;
            openBtn.disabled = true; runBtn.disabled = true; collectBtn.disabled = true;
            stopBtn.style.display = '';
            let opened = 0;
            for (const d of domains) {
                if (stopFlag) break;
                const url = LEADER.replace('{DOMAIN}', encodeURIComponent(cnFix(d)));
                chrome.tabs.create({ url, active: false });
                opened++;
                statusEl.textContent = `Открыто вкладок: ${opened}/${domains.length} (с задержкой ${OPEN_THROTTLE_MS/1000}с)…`;
                if (opened < domains.length && !stopFlag) await new Promise(r => setTimeout(r, OPEN_THROTTLE_MS));
            }
            stopBtn.style.display = 'none';
            openBtn.disabled = false; runBtn.disabled = false; collectBtn.disabled = false;
            statusEl.textContent = (stopFlag ? 'Остановлено. ' : 'Готово. ') + `Открыто вкладок: ${opened}/${domains.length}.`;
        });

        // ---- Проверить без открытия (фоновые запросы) ----
        const checkOne = (domain, timeout) => new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'sslCheckLeader', domain, timeout }, resp => {
                if (chrome.runtime.lastError) return resolve(false);
                resolve(!!(resp && resp.success && resp.ok));
            });
        });

        stopBtn.addEventListener('click', () => { stopFlag = true; statusEl.textContent += ' — останавливаю…'; });

        runBtn.addEventListener('click', async () => {
            const domains = selectedDomains();
            if (!domains.length) { inp.focus(); return; }
            // Безопасные настройки: 1 параллельный поток, задержка 2.5с между запросами
            // — защита от бана leaderssl (бан наступает мгновенно при быстрых запросах,
            // особенно если домен возвращает 500 или долго грузится)
            const concurrency = 1;
            const THROTTLE_MS = 2500;
            const timeout = 20000;

            stopFlag = false;
            out.value = '';
            runBtn.disabled = true; openBtn.disabled = true; collectBtn.disabled = true;
            stopBtn.style.display = '';
            let done = 0, failed = 0;
            const upd = () => { statusEl.textContent = `Проверено: ${done}/${domains.length} | Без серта: ${failed} | Задержка: ${THROTTLE_MS/1000}с/запрос`; };
            upd();

            let cursor = 0;
            const worker = async () => {
                while (cursor < domains.length && !stopFlag) {
                    const d = domains[cursor++];
                    upd();
                    const ok = await checkOne(d, timeout);
                    done++;
                    if (!ok) { failed++; out.value += d + '\n'; }
                    upd();
                    if (cursor < domains.length && !stopFlag) await new Promise(r => setTimeout(r, THROTTLE_MS));
                }
            };
            await Promise.all(Array.from({ length: concurrency }, worker));

            stopBtn.style.display = 'none';
            runBtn.disabled = false; openBtn.disabled = false; collectBtn.disabled = false;
            statusEl.textContent = (stopFlag ? 'Остановлено. ' : 'Готово. ') +
                `Проверено: ${done}/${domains.length} | Без серта: ${failed}` +
                (failed ? ' (см. список ниже)' : '');
        });
    })();

    // ===================== СКАНЕР ДОМЕНОВ =====================
    const scannerBtn = document.getElementById('scanner-btn');
    if (scannerBtn) {
        // Регэксп доменов
        const SCAN_RE = /(?<![\w.@-])(?:https?:\/\/)?(?:www\.)?((?:[a-zA-Z0-9а-яё](?:[a-zA-Z0-9а-яё-]{0,61}[a-zA-Z0-9а-яё])?\.)+[a-zA-Zа-яё]{2,})/gi;
        // Единый список TLD — синхронизирован с SSL-сканером
        const VALID_TLDS = new Set([
            // ccTLD — страновые
            'ru','ua','by','kz','рф','рус','su','eu','uk','co','de','fr','it','es','nl','pl',
            'be','ch','at','se','no','dk','fi','pt','gr','cz','sk','hu','ro','bg','hr','si',
            'ee','lv','lt','cn','jp','kr','in','vn','th','sg','hk','tw','id','ph','my','pk',
            'br','ar','mx','cl','pe','ve','ec','uy','us','ca','au','nz','za','ng','eg','ma',
            // generic
            'com','net','org','info','biz','name','mobi','tel','pro','aero','coop','int','edu','gov','mil',
            // popular new gTLD
            'io','ai','me','tv','cc','icu','xyz','top','club','online','site','tech','store','shop',
            'app','dev','web','wiki','live','news','blog','cloud','digital','agency','team','group',
            'media','studio','space','world','life','today','social','chat','email','link','click',
            'codes','center','works','zone','tools','network','systems','solutions','services',
            'company','marketing','support','finance','ventures','international','directory',
            'partners','training','host','hosting','website','software','photos','design',
            'film','music','game','games','casino','bet','sport','fitness','health','clinic',
            'law','legal','money','bank','credit','consulting','expert','coach','beauty',
            'house','home','estate','realty','construction','pizza','food','cafe','restaurant',
            'coffee','market','deals','sale','trade','gift','wedding','farm','green','energy',
            'eco','cool','red','blue','black','gold','vip','plus','guru','ninja','one','ltd','inc',
            'foundation','school','college','university','academy','exchange','express','global',
            'capital','fun','art','cat','wtf','lol','sexy','porn','adult',
        ]);
        // Исключения: служебные/регистраторские домены, НЕ домены клиента
        // com.ru убран — это zone, а не домен; example.com.ru должен находиться
        const EXCLUDE = new Set([
            'admin.example', 'reseller.example', 'nic.ru', 'reg.ru', 'example.com',
            'example.com', 'example.com', 'staff.example.com', 'whois.com', 'dnschecker.org', 'check-host.net'
        ]);
        // Системные/инфраструктурные домены: CDN, аналитика, шрифты, соцсети,
        // почтовики, регистраторы, хостеры. Сверяем по РЕГИСТРИРУЕМОМУ домену
        // (последние два лейбла), поэтому ловятся и поддомены вроде fonts.googleapis.com.
        const SYSTEM_REGISTRABLE = new Set([
            // Инфраструктура хостеров
            'example.com', 'example.com', 'example.com', 'example.org', 'infra1.net', 'tw1.ru', 'tmweb.ru',
            'beget.com', 'beget.pro', 'selectel.ru', 'selectel.org', 'reg.ru', 'nic.ru',
            'webnames.ru', 'nameself.com', 'r01.ru', 'hostland.ru', 'ihc.ru', 'sweb.ru',
            // Google / CDN / шрифты / аналитика
            'google.com', 'googleapis.com', 'gstatic.com', 'googletagmanager.com',
            'google-analytics.com', 'googlesyndication.com', 'doubleclick.net', 'googleusercontent.com',
            'jquery.com', 'jsdelivr.net', 'bootstrapcdn.com', 'cloudflare.com', 'cloudflare.net',
            'jsdelivr.com', 'unpkg.com', 'cdnjs.com', 'fontawesome.com', 'typekit.net',
            // Яндекс инфраструктура/статика/метрика
            'yandex.ru', 'yandex.net', 'yandex.com', 'ya.ru', 'yastatic.net', 'yandexcloud.net',
            // Соцсети / мессенджеры / видео
            'vk.com', 'vk.ru', 'vkontakte.ru', 'userapi.com', 'facebook.com', 'fbcdn.net',
            'instagram.com', 'twitter.com', 'x.com', 't.me', 'telegram.org', 'telegram.me',
            'youtube.com', 'youtu.be', 'ok.ru', 'wa.me', 'whatsapp.com',
            // Почтовые провайдеры
            'gmail.com', 'googlemail.com', 'mail.ru', 'list.ru', 'bk.ru', 'inbox.ru',
            'rambler.ru', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me',
            // Стандарты/прочее
            'w3.org', 'schema.org', 'wordpress.org', 'wp.com', 'gravatar.com',
            'whois.com', 'dnschecker.org', 'check-host.net', 'tilda.cc', 'tildacdn.com',
        ]);
        // Регистрируемый домен — учитываем составные TLD (.com.ru, .org.ru, .net.ru, .co.uk и т.д.)
        const COMPOUND_TLDS = new Set(['com.ru','net.ru','org.ru','pp.ru','co.uk','org.uk','me.uk','ltd.uk','plc.uk','com.ua','org.ua','net.ua','com.kz','net.kz','org.kz']);
        const registrable = (d) => {
            const p = d.split('.');
            if (p.length <= 2) return d;
            const last2 = p.slice(-2).join('.');
            // если последние 2 части — составной TLD, берём 3 последних лейбла
            if (COMPOUND_TLDS.has(last2)) return p.slice(-3).join('.');
            return last2;
        };

        // Пользовательские исключения (раздел «Домены», управляются в настройках)
        let userExclusions = new Set();
        const loadExclusions = (cb) => chrome.storage.local.get(['scanExclusions'], (d) => {
            userExclusions = new Set((d.scanExclusions || []).map(x => String(x).toLowerCase().replace(/\.$/, '')));
            if (cb) cb();
        });
        loadExclusions();
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && ch.scanExclusions) {
                userExclusions = new Set((ch.scanExclusions.newValue || []).map(x => String(x).toLowerCase().replace(/\.$/, '')));
            }
        });
        const addExclusion = (d, cb) => {
            d = String(d).toLowerCase().replace(/\.$/, '');
            chrome.storage.local.get(['scanExclusions'], (data) => {
                const list = data.scanExclusions || [];
                if (!list.includes(d)) list.push(d);
                chrome.storage.local.set({ scanExclusions: list }, () => { userExclusions.add(d); cb && cb(); });
            });
        };

        function normDom(s) {
            return s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
        }
        function isClientDomain(d) {
            d = d.replace(/\.$/, ''); // убираем точку на конце
            if (EXCLUDE.has(d)) return false;
            if (userExclusions.has(d)) return false;
            // системные/инфраструктурные домены — по регистрируемому домену (ловит и поддомены)
            if (SYSTEM_REGISTRABLE.has(d) || SYSTEM_REGISTRABLE.has(registrable(d))) return false;
            if (d.endsWith('.example.com') || d.endsWith('.example.com')) return false;
            // исключаем сами NS/DNS/MX/служебные хосты (ns1.example.com, dns2.yandex.net, mx1.beget.com, cdn., static., img.)
            if (/^(ns|dns|mx|smtp|pop|imap|mail|webmail|cpanel|cdn|static|assets|img|images|fonts|api|cp)\d*\./i.test(d)) return false;
            const parts = d.split('.');
            if (parts.length < 2) return false;
            const tld = parts[parts.length - 1];
            return VALID_TLDS.has(tld); // только реальные TLD
        }

        let lastScanned = [];
        let lastWhoisData = {}; // domain -> resp.data (заполняется при «Whois всех»)
        let exportMode = 'domains'; // domains | info | whois

        // Переключение режима экспорта
        document.querySelectorAll('#scanner-export .exp-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                exportMode = btn.dataset.mode;
                document.querySelectorAll('#scanner-export .exp-mode').forEach(b => {
                    const on = b === btn;
                    b.style.background = on ? 'var(--accent)' : 'var(--surface2)';
                    b.style.color = on ? '#fff' : 'var(--muted)';
                    b.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
                });
            });
        });

        function exportDomains(fmt) {
            if (!lastScanned.length) return;
            const humanDomain = (d) => d.endsWith('.xn--p1ai') ? d.replace('.xn--p1ai', '.рф') : d;

            // Формируем строки/объекты в зависимости от режима
            const buildRow = (d) => {
                const hd = humanDomain(d);
                if (exportMode === 'domains') return hd;
                const wd = lastWhoisData[d];
                if (exportMode === 'info') {
                    if (!wd) return `${hd}\t(whois не запрашивался)`;
                    return `${hd}\t${wd.registrar || '—'}\t${wd.expires || '—'}`;
                }
                // whois — полные данные
                if (!wd) return `${hd}\t(нет данных whois)`;
                const ns = (wd.nameservers || []).join('; ');
                const st = (wd.status || []).join('; ');
                return `${hd}\t${wd.registrar || '—'}\tРег: ${wd.created || '—'}\tОбновл: ${wd.updated || '—'}\tДо: ${wd.expires || '—'}\tСтатус: ${st}\tNS: ${ns}\tDNSSEC: ${wd.dnssec || '—'}`;
            };

            const buildObj = (d) => {
                const hd = humanDomain(d);
                if (exportMode === 'domains') return hd;
                const wd = lastWhoisData[d];
                if (exportMode === 'info') return { domain: hd, registrar: wd?.registrar || null, expires: wd?.expires || null };
                return { domain: hd, ...(wd || {}) };
            };

            let content, mime, ext;
            if (fmt === 'json') {
                const data = lastScanned.map(buildObj);
                content = JSON.stringify({ exportedAt: new Date().toISOString(), mode: exportMode, count: data.length, domains: data }, null, 2);
                mime = 'application/json'; ext = 'json';
            } else if (fmt === 'csv') {
                const rows = lastScanned.map(buildRow);
                content = rows.map(r => typeof r === 'string' ? r.split('\t').map(c => `"${c.replace(/"/g,'""')}"`).join(',') : r).join('\n');
                mime = 'text/csv'; ext = 'csv';
            } else {
                content = lastScanned.map(buildRow).join('\n');
                mime = 'text/plain'; ext = 'txt';
            }
            const blob = new Blob([content], { type: mime });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `domains_${exportMode}_${Date.now()}.${ext}`;
            a.click();
            URL.revokeObjectURL(a.href);
        }
        document.querySelectorAll('#scanner-export [data-fmt]').forEach(btn => {
            btn.addEventListener('click', () => exportDomains(btn.dataset.fmt));
        });

        function renderScan(domains) {
            const box = document.getElementById('scanner-results');
            const status = document.getElementById('scanner-status');
            const exportBar = document.getElementById('scanner-export');
            lastScanned = domains;
            lastWhoisData = {};
            box.innerHTML = '';
            if (!domains.length) {
                status.style.display = 'block';
                status.textContent = 'Доменов не найдено';
                exportBar.style.display = 'none';
                return;
            }
            status.style.display = 'block';
            status.textContent = `Найдено доменов: ${domains.length}`;
            exportBar.style.display = 'flex';

            // Полная Whois-карточка домена (как во вкладке Whois)
            const buildWhoisCard = (dd, domain) => {
                if (!dd) return '<div style="padding:8px 10px;color:var(--err);font-size:11px">Whois недоступен</div>';
                const v = (x) => (x != null && x !== '') ? x : null;
                const dash = (x) => v(x) || '—';
                const badges = (arr) => !arr || !arr.length ? '—'
                    : `<div class="status-list">${arr.map(s => badge(s.replace(/https?:\/\/\S+/g, '').trim(), /prohibited|lock|transfer/i.test(s) ? 'ok' : 'warn')).join('')}</div>`;
                const ns = (arr) => arr && arr.length ? arr.map(x => `<div style="font-family:monospace;font-size:11px">${x}</div>`).join('') : '—';
                let h = `<div class="card-header"><div><div class="card-domain">${dash(dd.domain) !== '—' ? dd.domain : domain}</div></div></div>`;
                h += row('Регистратор', dash(dd.registrar));
                h += row('Дата регистрации', `<span style="color:var(--muted)">${fmt(dd.created)}</span>`);
                h += row('Последнее обновление', `<span style="color:var(--muted)">${fmt(dd.updated)}</span>`);
                h += row('Действует до', `<strong style="color:${v(dd.expires) ? 'var(--ok)' : 'var(--muted)'}">${fmt(dd.expires)}</strong>`);
                h += `<div class="result-row"><span class="r-label">Статус</span><span class="r-value">${badges(dd.status)}</span></div>`;
                h += `<div class="result-row"><span class="r-label">Name Servers</span><span class="r-value">${ns(dd.nameservers)}</span></div>`;
                h += row('DNSSEC', `<span style="font-family:monospace;font-size:11px;color:var(--muted)">${dash(dd.dnssec)}</span>`);
                return h;
            };

            // Кнопка «Скопировать все домены» в буфер
            const copyAll = document.createElement('button');
            copyAll.className = 'btn';
            copyAll.style.cssText = 'width:100%;margin-bottom:8px;background:var(--accent);border:none;color:#fff;display:flex;align-items:center;justify-content:center;gap:6px';
            copyAll.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Скопировать все домены';
            copyAll.addEventListener('click', () => {
                const list = domains.map(d => d.endsWith('.xn--p1ai') ? d.replace('.xn--p1ai', '.рф') : d).join('\n');
                copyClip(list).then(() => {
                    copyAll.innerHTML = '✓ Скопировано (' + domains.length + ')';
                    setTimeout(() => { copyAll.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Скопировать все домены'; }, 1500);
                });
            });
            box.appendChild(copyAll);

            // Кнопка «Whois всех» — массовая проверка
            const whoisAll = document.createElement('button');
            whoisAll.className = 'btn';
            whoisAll.style.cssText = 'width:100%;margin-bottom:8px;background:var(--surface2);border:1px solid var(--border);color:var(--text)';
            whoisAll.textContent = 'Whois всех доменов';
            const rowCard = {}; // domain -> card container
            whoisAll.addEventListener('click', async () => {
                whoisAll.disabled = true; whoisAll.textContent = 'Проверяю...';
                for (const d of domains) {
                    const card = rowCard[d];
                    if (card) { card.style.display = 'block'; card.innerHTML = '<div style="padding:8px 10px;color:var(--muted);font-size:11px">⏳ Запрос...</div>'; }
                    await new Promise(res => {
                        safeSendMessage({ action: 'whois', domain: d }, (resp) => {
                            if (resp && resp.success) {
                                lastWhoisData[d] = resp.data;
                                if (card) card.innerHTML = buildWhoisCard(resp.data, d);
                            } else {
                                if (card) card.innerHTML = '<div style="padding:8px 10px;color:var(--err);font-size:11px">✗ ' + ((resp && resp.error) || 'нет данных') + '</div>';
                            }
                            res();
                        });
                    });
                }
                whoisAll.textContent = 'Whois всех доменов'; whoisAll.disabled = false;
            });
            box.appendChild(whoisAll);

            domains.forEach(d => {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'margin-bottom:6px';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border-radius:6px;';
                const display = d.endsWith('.xn--p1ai') ? d.replace('.xn--p1ai', '.рф') : d;
                const left = document.createElement('div');
                left.style.cssText = 'flex:1;min-width:0';
                left.innerHTML = `<div style="font-family:monospace;word-break:break-all">${display}</div>`;
                row.appendChild(left);
                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex;gap:4px;flex:none';
                // Кнопка «проверить» — подставит домен во все инструменты и откроет Whois
                const useBtn = document.createElement('button');
                useBtn.className = 'btn';
                useBtn.style.cssText = 'padding:3px 8px;font-size:12px;background:var(--accent);color:#fff;border:none;border-radius:5px;cursor:pointer';
                useBtn.textContent = 'проверить';
                useBtn.title = 'Запустить Whois и DNS для этого домена';
                useBtn.addEventListener('click', () => {
                    fillDomainForce(d);
                    // Запускаем DNS-проверку
                    const dnsBtn = document.getElementById('dns-btn');
                    if (dnsBtn) dnsBtn.click();
                    // Запускаем Whois и переключаемся на его вкладку
                    const whoisTab = document.querySelector('.tab-btn[data-target="tab-whois"]');
                    if (whoisTab) whoisTab.click();
                    const wb = document.getElementById('whois-btn');
                    if (wb) wb.click();
                });
                // Копировать (векторная иконка)
                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn';
                copyBtn.style.cssText = 'display:flex;align-items:center;padding:3px 7px;background:var(--surface);border:1px solid var(--border);color:var(--muted);border-radius:5px;cursor:pointer';
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                copyBtn.title = 'Скопировать';
                copyBtn.addEventListener('click', () => copyClip(display));
                // Кнопка «в исключения» — добавляет домен в исключения и убирает из списка
                const exclBtn = document.createElement('button');
                exclBtn.className = 'btn';
                exclBtn.style.cssText = 'display:flex;align-items:center;padding:3px 7px;background:var(--surface);border:1px solid var(--border);color:var(--err);border-radius:5px;cursor:pointer';
                exclBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
                exclBtn.title = 'В исключения (больше не показывать)';
                exclBtn.addEventListener('click', () => {
                    addExclusion(d, () => {
                        wrap.remove();
                        lastScanned = lastScanned.filter(x => x !== d);
                        const st = document.getElementById('scanner-status');
                        if (st) st.textContent = `Найдено доменов: ${lastScanned.length}`;
                    });
                });
                btns.appendChild(useBtn);
                btns.appendChild(copyBtn);
                btns.appendChild(exclBtn);
                row.appendChild(btns);
                wrap.appendChild(row);
                // контейнер под полную Whois-карточку этого домена
                const card = document.createElement('div');
                card.className = 'result-card';
                card.style.cssText = 'display:none;margin-top:4px';
                wrap.appendChild(card);
                rowCard[d] = card;
                box.appendChild(wrap);
            });
        }

        // Общая обработка текста → список клиентских доменов → рендер
        const scanText = (text) => {
            const found = new Set();
            for (const m of (text || '').matchAll(SCAN_RE)) {
                const d = (m[1] || m[0]).toLowerCase().replace(/\.+$/, '').split('/')[0].split(':')[0];
                if (isClientDomain(d)) found.add(d);
            }
            renderScan([...found].sort());
        };

        scannerBtn.addEventListener('click', async () => {
            const status = document.getElementById('scanner-status');
            status.style.display = 'block';
            status.textContent = 'Сканирую страницу...';
            document.getElementById('scanner-results').innerHTML = '';
            await new Promise(r => loadExclusions(r));   // свежие исключения
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || (tab.url || '').startsWith('chrome://')) {
                    status.textContent = 'Недоступно на этой странице';
                    return;
                }
                const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const parts = [];
                        // SSL-таблица (как в пакетной проверке SSL)
                        document.querySelectorAll('.ssl-table__name-col a').forEach(a =>
                            parts.push(a.textContent || a.getAttribute('title') || ''));
                        // Весь видимый текст
                        parts.push(document.body ? document.body.innerText : '');
                        return parts.join('\n');
                    }
                });
                scanText(result || '');
            } catch (e) {
                status.textContent = 'Ошибка сканирования: ' + e.message;
            }
        });

        // ---- Выбрать раздел на странице ----
        const areaBtn = document.getElementById('scanner-area-btn');
        if (areaBtn) areaBtn.addEventListener('click', () =>
            startAreaPicker('domains', document.getElementById('scanner-status')));

        // ---- Приём выбранного раздела (через storage; см. startAreaPicker) ----
        const consumeScanPick = (pick) => {
            if (!pick || pick.scope !== 'domains') return;
            if (Date.now() - (pick.ts || 0) > 120000) return; // не старше 2 минут
            chrome.storage.local.remove('stAreaPick');
            document.querySelector('.tab-btn[data-target="tab-scanner"]')?.click();
            loadExclusions(() => scanText(pick.text));
        };
        try { chrome.storage.local.get('stAreaPick', (d) => consumeScanPick(d.stAreaPick)); } catch (e) {}
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && ch.stAreaPick && ch.stAreaPick.newValue) consumeScanPick(ch.stAreaPick.newValue);
        });
    }

    // ===================== ШАБЛОНЫ DNS =====================
    (function initDnsTemplates() {
        const body = document.getElementById('dns-tpl-body');
        if (!body) return;

        const DEFAULTS = {
            ns: {
                'ExampleHost': ['ns1.example.com.', 'ns2.example.com.', 'ns3.example.org.', 'ns4.example.org.'],
                'Яндекс': ['dns1.yandex.net.', 'dns2.yandex.net.'],
                'Ru-Center / nic.ru': ['ns3.nic.ru.', 'ns4.nic.ru.', 'ns8.nic.ru.'],
                'Webnames': ['ns1.nameself.com', 'ns2.nameself.com'],
                'Selectel': ['ns1.selectel.org.', 'ns2.selectel.org.', 'ns3.selectel.org.', 'ns4.selectel.org.'],
                'Beget': ['ns1.beget.com.', 'ns2.beget.com.', 'ns1.beget.pro.', 'ns2.beget.pro.']
            },
            mx: {
                'ExampleHost': ['10 mx1.example.com.', '20 mx2.example.com.'],
                'Яндекс': ['10 mx.yandex.net.'],
                'Ru-Center / nic.ru': ['10 mail.nic.ru.'],
                'Webnames': ['10 mail.webnames.ru.'],
                'Selectel': ['10 mail.ВАШ-ДОМЕН.ru.'],
                'Beget': ['10 mx1.beget.com.', '20 mx2.beget.com.']
            },
            spf: {
                'ExampleHost': ['v=spf1 include:_spf.example.com ~all'],
                'Яндекс': ['v=spf1 redirect=_spf.yandex.net'],
                'Ru-Center / nic.ru': ['v=spf1 include:_spf.nic.ru ~all'],
                'Webnames': ['v=spf1 a mx ~all'],
                'Selectel': ['v=spf1 ip4:IP_ВАШЕГО_СЕРВЕРА ~all'],
                'Beget': ['v=spf1 redirect=_spf.beget.com']
            },
            dmarc: {
                'Универсальный (для всех)': ['v=DMARC1; p=none;'],
                'Mail.ru — мягкая': ['v=DMARC1; p=none; rua=mailto:admin@yourdomain.com'],
                'Mail.ru — строгая': ['v=DMARC1; p=reject; rua=mailto:admin@yourdomain.com']
            },
            custom: {}
        };

        // механизм SPF для каждого сервиса (для конструктора с мультивыбором)
        const SPF_MECH = {
            'ExampleHost': 'include:_spf.example.com',
            'Яндекс': 'include:_spf.yandex.net',
            'Ru-Center / nic.ru': 'include:_spf.nic.ru',
            'Webnames': 'a mx',
            'Beget': 'include:_spf.beget.com'
        };

        let DATA = JSON.parse(JSON.stringify(DEFAULTS));
        let section = 'ns';

        function persist() { chrome.storage.local.set({ dnsTpl: DATA }); }
        function load(cb) {
            chrome.storage.local.get(['dnsTpl'], (d) => {
                if (d.dnsTpl) {
                    // мердж: дефолты + сохранённое
                    DATA = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), d.dnsTpl);
                    ['ns','mx','spf','dmarc','custom'].forEach(s => { if (!DATA[s]) DATA[s] = {}; });
                }
                cb && cb();
            });
        }

        function flash(btn, label) {
            const o = btn.innerHTML; btn.textContent = label || '✓';
            setTimeout(() => { btn.innerHTML = o; }, 1200);
        }
        function copyVal(text, btn) {
            copyClip(text).then(() => flash(btn, '✓ Скопировано'));
        }

        // ── DKIM ──
        const DKIM_SELECTORS = {
            'ExampleHost': [
                { case: 'для отправки с php mail()', sel: 'mail._domainkey' },
                { case: 'для отправки с SMTP', sel: 'dkim._domainkey' }
            ],
            'Яндекс': [
                { case: 'для отправки с SMTP', sel: 'mail._domainkey' }
            ],
            'Руцентр': [
                { case: 'для отправки с php mail()', sel: 'mail._domainkey' },
                { case: 'для отправки с SMTP', sel: 'mail._domainkey' }
            ],
            'WebNames': [
                { case: 'для отправки с php mail()', sel: 'default._domainkey' },
                { case: 'для отправки с SMTP', sel: 'default._domainkey' }
            ],
            'Selectel': [
                { case: 'обычно (зависит от панели)', sel: 'default._domainkey' },
                { case: 'или', sel: 'mail._domainkey' }
            ],
            'Beget': [
                { case: 'через серверы Beget (php mail() / локальный SMTP)', sel: 'beget._domainkey' },
                { case: 'через сторонние SMTP', sel: 'задаётся сервисом (например us._domainkey)' }
            ],
            'Google': [
                { case: 'для отправки с SMTP', sel: 'google._domainkey' }
            ]
        };

        function dkimCopyRow(label, value, mono) {
            return `<div style="margin-bottom:10px">
                <div class="lbl" style="font-size:11px;color:var(--muted);margin-bottom:3px">${label}</div>
                <div style="display:flex;align-items:flex-start;gap:6px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 10px">
                    <span style="flex:1;${mono ? 'font-family:Consolas,monospace;' : ''}font-size:12px;white-space:pre-wrap;word-break:break-all">${escapeHtml(value)}</span>
                    <button class="dkim-copy" data-copy="${encodeURIComponent(value)}" title="Копировать" style="flex:none;background:none;border:none;color:var(--muted);cursor:pointer;padding:2px">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                </div>
            </div>`;
        }

        function renderDkim() {
            const svc = Object.keys(DKIM_SELECTORS);
            body.innerHTML = `
                <div class="dns-build" style="border-color:var(--border)">
                    <div style="font-weight:600;font-size:12px;margin-bottom:8px">DKIM-запись</div>
                    <div class="lbl" style="font-size:11px;color:var(--muted);margin-bottom:3px">Сервис</div>
                    <select id="dkim-svc" style="width:100%;margin-bottom:8px">${svc.map(s => `<option${s === 'ExampleHost' ? ' selected' : ''}>${s}</option>`).join('')}</select>
                    <div class="lbl" style="font-size:11px;color:var(--muted);margin-bottom:3px">DKIM-подпись: base64, PEM (-----BEGIN PUBLIC KEY-----) или готовая запись — уберём переносы и лишнее сами</div>
                    <textarea id="dkim-key" rows="4" placeholder="-----BEGIN PUBLIC KEY-----&#10;MIGfMA0GCSq...AQAB&#10;-----END PUBLIC KEY-----" style="width:100%;resize:vertical;font-family:Consolas,monospace;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 10px;outline:none;margin-bottom:10px"></textarea>
                    <div id="dkim-out"></div>
                </div>
                <div class="dns-build" id="dkim-gen-block" style="border-color:var(--border);margin-top:10px">
                    <div style="font-weight:600;font-size:12px;margin-bottom:8px">Генерация DKIM для php mail()</div>
                    <div class="lbl" style="font-size:11px;color:var(--muted);margin-bottom:3px">Домен</div>
                    <input type="text" id="dkim-domain" placeholder="domain.ru" style="width:100%;margin-bottom:10px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 10px;outline:none">
                    <div id="dkim-cmds"></div>
                </div>`;

            const svcSel = document.getElementById('dkim-svc');
            const keyEl = document.getElementById('dkim-key');
            const out = document.getElementById('dkim-out');
            const genBlock = document.getElementById('dkim-gen-block');
            const updateOut = () => {
                const sel = svcSel.value;
                // генерация DKIM только для ExampleHost
                if (genBlock) genBlock.style.display = (sel === 'ExampleHost') ? 'block' : 'none';
                // Принимаем: голый base64, PEM (-----BEGIN/END PUBLIC KEY-----) или готовую запись v=DKIM1;…;p=…
                let raw = (keyEl.value || '')
                    .replace(/-----BEGIN[^-]*-----/gi, '')
                    .replace(/-----END[^-]*-----/gi, '')
                    .replace(/\s+/g, '');
                const pMatch = raw.match(/p=([A-Za-z0-9+/=]+)/i);
                const cleanKey = pMatch ? pMatch[1] : raw.replace(/[^A-Za-z0-9+/=]/g, '');
                const record = cleanKey ? `v=DKIM1; k=rsa; p=${cleanKey}` : 'v=DKIM1; k=rsa; p=…';
                let html = (DKIM_SELECTORS[sel] || []).map(item =>
                    dkimCopyRow(`${sel} ${item.case}:`, item.sel, true)).join('');
                html += dkimCopyRow('DKIM-запись (значение TXT)', record, true);
                out.innerHTML = html;
                bindDkimCopy(out);
            };
            svcSel.onchange = updateOut;
            keyEl.addEventListener('input', updateOut);
            updateOut();

            const domEl = document.getElementById('dkim-domain');
            const cmds = document.getElementById('dkim-cmds');
            const toPuny = (raw) => {
                const s = (raw || '').trim();
                if (!s) return 'domain.ru';
                try { return new URL('http://' + s).hostname; } catch { return s.replace(/[^a-zA-Z0-9.-]/g, '') || 'domain.ru'; }
            };
            // Авто-показ punycode под полем если введена кириллица
            const punyHint = document.createElement('div');
            punyHint.style.cssText = 'font-size:10px;color:var(--muted);margin-top:-6px;margin-bottom:8px;display:none';
            domEl.parentNode.insertBefore(punyHint, cmds);
            const updateCmds = () => {
                const raw = domEl.value.trim();
                const d = toPuny(raw);
                const hasCyrillic = /[а-яёА-ЯЁ]/.test(raw);
                punyHint.style.display = hasCyrillic ? 'block' : 'none';
                punyHint.textContent = hasCyrillic ? `→ punycode: ${d}` : '';
                cmds.innerHTML =
                    dkimCopyRow('1. Приватный ключ', `openssl genrsa -out ${d}.private 1024`, true)
                    + dkimCopyRow('2. Публичный ключ', `openssl rsa -in ${d}.private -out ${d}.public -pubout`, true);
                bindDkimCopy(cmds);
            };
            domEl.addEventListener('input', updateCmds);
            updateCmds();
        }
        function bindDkimCopy(container) {
            container.querySelectorAll('.dkim-copy').forEach(b =>
                b.addEventListener('click', () => copyVal(decodeURIComponent(b.dataset.copy), b)));
        }

        function render() {
            if (section === 'dkim') { renderDkim(); return; }
            let html = '';
            const data = DATA[section] || {};
            for (const [name, recsRaw] of Object.entries(data)) {
                // убираем точку на конце каждой записи (ns1.example.com. → ns1.example.com)
                const recs = recsRaw.map(r => r.replace(/\.\s*$/, ''));
                const joined = recs.join('\n');
                // строки с индивидуальным копированием
                const lines = recs.map((r, i) =>
                    `<div class="dns-line">
                        <span class="dns-line-txt">${escapeHtml(r)}</span>
                        <button class="dns-line-copy" data-copy="${encodeURIComponent(r)}" title="Копировать строку">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                    </div>`).join('');
                html += `<div class="dns-prov">
                    <div class="dns-prov-head">
                        <span class="dns-prov-name">${escapeHtml(name)}</span>
                        <div style="display:flex;gap:4px">
                            <button class="dns-copy" data-copy="${encodeURIComponent(joined)}" title="Копировать всё">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Всё
                            </button>
                            <button class="dns-mini" data-edit="${encodeURIComponent(name)}" title="Редактировать">✎</button>
                            <button class="dns-mini dns-del" data-del="${encodeURIComponent(name)}" title="Удалить">🗑</button>
                        </div>
                    </div>
                    <div class="dns-lines">${lines}</div>
                </div>`;
            }
            html += `<button class="btn dns-add" id="dns-add-btn">＋ Добавить запись</button>`;
            if (section === 'spf') html += renderSpfBuilder();
            body.innerHTML = html;
            bindCommon();
            if (section === 'spf') bindSpfBuilder();
        }

        function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        function bindCommon() {
            body.querySelectorAll('.dns-copy, .dns-line-copy').forEach(btn =>
                btn.addEventListener('click', () => copyVal(decodeURIComponent(btn.dataset.copy), btn)));
            body.querySelectorAll('[data-edit]').forEach(btn =>
                btn.addEventListener('click', () => openForm(decodeURIComponent(btn.dataset.edit))));
            body.querySelectorAll('[data-del]').forEach(btn =>
                btn.addEventListener('click', () => {
                    const name = decodeURIComponent(btn.dataset.del);
                    delete DATA[section][name]; persist(); render();
                }));
            const addBtn = document.getElementById('dns-add-btn');
            if (addBtn) addBtn.addEventListener('click', () => openForm(null));
        }

        // Форма добавления/редактирования записи
        const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'NS', 'MX', 'TXT', 'SRV', 'CAA', 'PTR'];
        const TYPE_RE = /^(A|AAAA|CNAME|NS|MX|TXT|SRV|CAA|PTR)\s/i;

        function openForm(editName) {
            const recs = editName ? DATA[section][editName] : [];
            const isCustom = section === 'custom';
            // в режиме «Свои» — выбор типа записи
            const typeSel = isCustom
                ? `<div class="lbl" style="font-size:11px;color:var(--muted);margin:0 0 4px">Тип записи:</div>
                   <select id="dnsf-type" style="width:100%;margin-bottom:6px">${DNS_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>`
                : '';
            const ov = document.createElement('div');
            ov.className = 'dns-form';
            ov.innerHTML = `
                <div style="font-weight:600;font-size:13px;margin-bottom:8px">${editName ? 'Редактировать' : 'Новая запись'} (${section.toUpperCase()})</div>
                <input type="text" id="dnsf-name" placeholder="${isCustom ? 'Имя/поддомен (@, www, mail...)' : 'Название (например, ExampleHost)'}" value="${editName ? escapeHtml(editName) : ''}">
                ${typeSel}
                <textarea id="dnsf-recs" placeholder="${isCustom ? 'Значения, по одному в строке (IP, домен, текст...)' : 'Записи, по одной в строке'}" rows="5">${recs.join('\n')}</textarea>
                <div style="display:flex;gap:8px;margin-top:8px">
                    <button class="btn" id="dnsf-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--muted)">Отмена</button>
                    <button class="btn btn-primary" id="dnsf-save" style="flex:1;margin:0">Сохранить</button>
                </div>`;
            body.appendChild(ov);
            document.getElementById('dnsf-cancel').onclick = () => render();
            document.getElementById('dnsf-save').onclick = () => {
                const name = document.getElementById('dnsf-name').value.trim();
                let recsArr = document.getElementById('dnsf-recs').value.split('\n').map(s => s.trim()).filter(Boolean);
                if (!name || !recsArr.length) return;
                if (isCustom) {
                    const type = document.getElementById('dnsf-type').value;
                    // добавляем тип к каждой строке (если он там ещё не указан)
                    recsArr = recsArr.map(v => TYPE_RE.test(v) ? v : `${type} ${v}`);
                }
                if (editName && editName !== name) delete DATA[section][editName];
                DATA[section][name] = recsArr;
                persist(); render();
            };
        }

        // ── SPF-конструктор с мультивыбором ──
        function renderSpfBuilder() {
            const checks = Object.keys(SPF_MECH).map(k =>
                `<label class="spf-row"><input type="checkbox" value="${escapeHtml(k)}"><span>${escapeHtml(k)}</span></label>`).join('');
            return `<div class="dns-build">
                <div style="font-weight:600;font-size:12px;margin-bottom:6px;display:flex;align-items:center;gap:5px"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Конструктор SPF</div>
                <div class="lbl">Откуда отправляется почта (можно несколько):</div>
                <div id="spf-checks">${checks}
                    <label class="spf-row"><input type="checkbox" id="spf-own"><span>Свой IP</span></label>
                </div>
                <div id="spf-ip-wrap" style="display:none">
                    <input type="text" id="spf-ip" placeholder="ip4: 203.0.113.10 (через запятую можно несколько)">
                </div>
                <div class="lbl">Политика для остальных (all):</div>
                <select id="spf-policy">
                    <option value="~all">~all — мягкий отказ (рекомендуется)</option>
                    <option value="-all">-all — строгий отказ</option>
                    <option value="?all">?all — нейтрально</option>
                </select>
                <div class="dns-out" id="spf-out">v=spf1 ~all</div>
                <button class="btn btn-primary" id="spf-copy" style="margin-top:8px">Скопировать SPF</button>
            </div>`;
        }

        function buildSpf() {
            const parts = [];
            document.querySelectorAll('#spf-checks input:checked').forEach(c => parts.push(SPF_MECH[c.value]));
            if (document.getElementById('spf-own').checked) {
                const ips = (document.getElementById('spf-ip').value || '').split(',').map(s => s.trim()).filter(Boolean);
                ips.forEach(ip => parts.push('ip4:' + ip));
            }
            const policy = document.getElementById('spf-policy').value;
            const result = `v=spf1${parts.length ? ' ' + parts.join(' ') : ''} ${policy}`;
            document.getElementById('spf-out').textContent = result;
            return result;
        }
        function bindSpfBuilder() {
            document.querySelectorAll('#spf-checks input').forEach(c => c.addEventListener('change', buildSpf));
            const own = document.getElementById('spf-own');
            own.addEventListener('change', () => {
                document.getElementById('spf-ip-wrap').style.display = own.checked ? 'block' : 'none';
                buildSpf();
            });
            document.getElementById('spf-ip').addEventListener('input', buildSpf);
            document.getElementById('spf-policy').addEventListener('change', buildSpf);
            document.getElementById('spf-copy').addEventListener('click', (e) => {
                copyClip(buildSpf()).then(() => flash(e.currentTarget, '✓ Скопировано'));
            });
            buildSpf();
        }

        // переключение под-вкладок
        document.querySelectorAll('#tab-dnstpl .dns-sub').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#tab-dnstpl .dns-sub').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                section = btn.dataset.sub;
                render();
            });
        });

        load(() => render());
    })();

    // ===================== 2FA / GOOGLE AUTHENTICATOR =====================
    (function initAuth() {
        const listEl = document.getElementById('auth-list');
        const addBtn = document.getElementById('auth-add-btn');
        if (!listEl || !addBtn || typeof OTPAuth === 'undefined') return;

        let accounts = []; // [{id, name, secret, issuer}]
        const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        function load(cb) {
            chrome.storage.local.get(['authAccounts'], (d) => {
                accounts = d.authAccounts || [];
                cb && cb();
            });
        }
        function persist() { chrome.storage.local.set({ authAccounts: accounts }); }

        function totpFor(acc) {
            try {
                const t = new OTPAuth.TOTP({
                    issuer: acc.issuer || '', label: acc.name || '',
                    algorithm: 'SHA1', digits: 6, period: 30,
                    secret: OTPAuth.Secret.fromBase32(acc.secret.replace(/\s/g, ''))
                });
                return t.generate();
            } catch (e) { return '------'; }
        }

        function renderList() {
            if (!accounts.length) {
                listEl.innerHTML = `<div class="auth-empty">Нет аккаунтов.<br>Нажмите «+ Аккаунт», введите ключ вручную или отсканируйте QR-код.</div>`;
                return;
            }
            listEl.innerHTML = accounts.map(a => `
                <div class="auth-item" data-id="${a.id}">
                    <div class="auth-row1">
                        <span class="auth-name">${escHtml(a.issuer ? a.issuer + ' · ' : '')}${escHtml(a.name || '')}</span>
                        <span class="auth-acts">
                            <button class="auth-mini" data-edit="${a.id}" title="Переименовать">✎</button>
                            <button class="auth-mini del" data-del="${a.id}" title="Удалить">🗑</button>
                        </span>
                    </div>
                    <div class="auth-row2">
                        <span class="auth-code" data-copy="${a.id}">······</span>
                        <svg class="auth-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="var(--border)" stroke-width="3"/><circle class="ring-fg" data-ring="${a.id}" cx="18" cy="18" r="16" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg>
                    </div>
                </div>`).join('');

            listEl.querySelectorAll('[data-copy]').forEach(el =>
                el.addEventListener('click', () => {
                    const a = accounts.find(x => x.id === el.dataset.copy);
                    if (a) copyClip(totpFor(a)).then(() => { el.classList.add('copied'); showCopiedToast(el); setTimeout(() => el.classList.remove('copied'), 900); });
                }));
            listEl.querySelectorAll('[data-del]').forEach(el =>
                el.addEventListener('click', () => {
                    accounts = accounts.filter(x => x.id !== el.dataset.del); persist(); renderList(); updateCodes();
                }));
            listEl.querySelectorAll('[data-edit]').forEach(el =>
                el.addEventListener('click', () => {
                    const a = accounts.find(x => x.id === el.dataset.edit);
                    if (!a) return;
                    const nn = prompt('Название аккаунта:', a.name || '');
                    if (nn !== null) { a.name = nn.trim(); persist(); renderList(); updateCodes(); }
                }));
            updateCodes();
        }

        function updateCodes() {
            const sec = 30 - (Math.floor(Date.now() / 1000) % 30);
            accounts.forEach(a => {
                const codeEl = listEl.querySelector(`.auth-code[data-copy="${a.id}"]`);
                if (codeEl && !codeEl.classList.contains('copied')) {
                    const code = totpFor(a);
                    codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
                }
                const ring = listEl.querySelector(`[data-ring="${a.id}"]`);
                if (ring) {
                    const C = 2 * Math.PI * 16;
                    ring.setAttribute('stroke-dasharray', C);
                    ring.setAttribute('stroke-dashoffset', C * (1 - sec / 30));
                    ring.setAttribute('stroke', sec <= 5 ? 'var(--err)' : 'var(--accent)');
                }
            });
        }

        function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        // Форма добавления
        function openForm() {
            const ov = document.createElement('div');
            ov.className = 'auth-form';
            ov.innerHTML = `
                <div style="font-weight:600;font-size:14px;margin-bottom:10px">Новый аккаунт</div>
                <div class="lbl">Название (сервис / email)</div>
                <input type="text" id="auth-name" placeholder="GitHub · user@mail.ru">
                <div class="lbl">Секретный ключ (Base32)</div>
                <input type="text" id="auth-secret" placeholder="JBSWY3DPEHPK3PXP">
                <button class="btn btn-primary" id="auth-save" style="width:100%">Сохранить</button>
                <div class="or">— или QR-код —</div>
                <button class="btn" id="auth-qr" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);margin-bottom:6px">Сканировать QR на странице</button>
                <button class="btn" id="auth-qr-img" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text)">Загрузить картинку с QR</button>
                <input type="file" id="auth-qr-file" accept="image/*" style="display:none">
                <div style="font-size:10px;color:var(--muted);text-align:center;margin-top:8px;line-height:1.5">
                    Перенести <b>все коды</b> из Google Authenticator: в приложении «Экспорт аккаунтов» → сохраните QR → загрузите картинку сюда.
                </div>
                <div id="auth-qr-status" style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px"></div>
                <button class="btn" id="auth-cancel" style="width:100%;margin-top:8px;background:none;border:none;color:var(--muted)">Отмена</button>`;
            listEl.innerHTML = '';
            listEl.appendChild(ov);

            document.getElementById('auth-cancel').onclick = () => renderList();
            document.getElementById('auth-save').onclick = () => {
                const name = document.getElementById('auth-name').value.trim();
                const secret = document.getElementById('auth-secret').value.replace(/\s/g, '');
                if (!secret) return;
                accounts.push({ id: uid(), name: name || 'Аккаунт', secret, issuer: '' });
                persist(); renderList();
            };
            document.getElementById('auth-qr').onclick = scanQr;
            const fileInp = document.getElementById('auth-qr-file');
            document.getElementById('auth-qr-img').onclick = () => fileInp.click();
            fileInp.onchange = () => {
                const f = fileInp.files[0];
                if (f) decodeQrFromImage(f, document.getElementById('auth-qr-status'));
            };
        }

        // Декод QR из изображения jsQR
        function readQrFromImageEl(img, status) {
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            cv.getContext('2d').drawImage(img, 0, 0);
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
            const code = (typeof jsQR !== 'undefined') ? jsQR(d.data, cv.width, cv.height) : null;
            if (!code) { status.textContent = 'QR-код не распознан'; return; }
            handleQrData(code.data, status);
        }
        function decodeQrFromImage(file, status) {
            status.textContent = '⏳ Распознаю QR...';
            const img = new Image();
            img.onload = () => readQrFromImageEl(img, status);
            img.onerror = () => { status.textContent = 'Не удалось открыть картинку'; };
            img.src = URL.createObjectURL(file);
        }

        // Сканирование QR через captureVisibleTab + jsQR
        function scanQr() {
            const status = document.getElementById('auth-qr-status');
            status.textContent = '⏳ Сканирую экран...';
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) { status.textContent = 'Нет активной вкладки'; return; }
                chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError || !dataUrl) { status.textContent = 'Не удалось сделать снимок'; return; }
                    const img = new Image();
                    img.onload = () => readQrFromImageEl(img, status);
                    img.src = dataUrl;
                });
            });
        }

        // Маршрутизация: одиночный otpauth:// или массовый otpauth-migration://
        function handleQrData(data, status) {
            if (data.startsWith('otpauth-migration://')) {
                importMigration(data, status);
            } else if (data.startsWith('otpauth://')) {
                parseOtpUri(data, status);
            } else {
                status.textContent = 'В QR нет otpauth-данных';
            }
        }

        function parseOtpUri(uri, status) {
            try {
                const parsed = OTPAuth.URI.parse(uri);
                accounts.push({
                    id: uid(),
                    name: parsed.label || (parsed.issuer || 'Аккаунт'),
                    issuer: parsed.issuer || '',
                    secret: parsed.secret.base32
                });
                persist();
                status.textContent = '✓ Аккаунт добавлен';
                setTimeout(() => renderList(), 700);
            } catch (e) {
                status.textContent = 'Ошибка разбора QR: ' + e.message;
            }
        }

        // ── Импорт ВСЕХ аккаунтов из Google Authenticator (otpauth-migration) ──
        function importMigration(uri, status) {
            try {
                const dataParam = new URL(uri).searchParams.get('data');
                if (!dataParam) { status.textContent = 'Пустой migration-QR'; return; }
                const bytes = b64ToBytes(dataParam);
                const items = parseMigrationProto(bytes);
                if (!items.length) { status.textContent = 'Не найдено аккаунтов в QR'; return; }
                items.forEach(it => accounts.push({
                    id: uid(), name: it.name || 'Аккаунт', issuer: it.issuer || '', secret: it.secret
                }));
                persist();
                status.textContent = `✓ Импортировано аккаунтов: ${items.length}`;
                setTimeout(() => renderList(), 900);
            } catch (e) {
                status.textContent = 'Ошибка импорта: ' + e.message;
            }
        }

        function b64ToBytes(b64) {
            const bin = atob(decodeURIComponent(b64));
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
        }

        // Минимальный парсер protobuf MigrationPayload
        function parseMigrationProto(buf) {
            const out = [];
            let i = 0;
            const readVarint = () => {
                let result = 0, shift = 0, b;
                do { b = buf[i++]; result |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
                return result >>> 0;
            };
            while (i < buf.length) {
                const tag = readVarint();
                const field = tag >> 3, wire = tag & 7;
                if (field === 1 && wire === 2) {
                    const len = readVarint();
                    out.push(parseOtpParams(buf.subarray(i, i + len)));
                    i += len;
                } else { // пропускаем прочие поля
                    if (wire === 0) readVarint();
                    else if (wire === 2) { const l = readVarint(); i += l; }
                    else if (wire === 5) i += 4;
                    else if (wire === 1) i += 8;
                }
            }
            return out;
        }
        function parseOtpParams(buf) {
            let i = 0; const res = { secret: '', name: '', issuer: '' };
            const readVarint = () => { let r = 0, s = 0, b; do { b = buf[i++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return r >>> 0; };
            const dec = new TextDecoder();
            while (i < buf.length) {
                const tag = readVarint(); const field = tag >> 3, wire = tag & 7;
                if (wire === 2) {
                    const len = readVarint(); const slice = buf.subarray(i, i + len); i += len;
                    if (field === 1) res.secret = bytesToBase32(slice);
                    else if (field === 2) res.name = dec.decode(slice);
                    else if (field === 3) res.issuer = dec.decode(slice);
                } else if (wire === 0) readVarint();
                else if (wire === 5) i += 4; else if (wire === 1) i += 8;
            }
            return res;
        }
        function bytesToBase32(bytes) {
            const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            let bits = 0, val = 0, out = '';
            for (let i = 0; i < bytes.length; i++) {
                val = (val << 8) | bytes[i]; bits += 8;
                while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; }
            }
            if (bits > 0) out += A[(val << (5 - bits)) & 31];
            return out;
        }

        addBtn.addEventListener('click', openForm);
        load(() => renderList());
        setInterval(() => { if (document.getElementById('tab-auth')?.classList.contains('active')) updateCodes(); }, 1000);
    })();

    // ===================== ИИ-ЧАТ (Google AI Studio / Gemini) =====================
    (function initAiChat() {
        const keyForm = document.getElementById('ai-key-form');
        const chat = document.getElementById('ai-chat');
        if (!keyForm || !chat) return;

        const keyInput = document.getElementById('ai-key-input');
        const keySave = document.getElementById('ai-key-save');
        const keyErr = document.getElementById('ai-key-err');
        const messagesEl = document.getElementById('ai-messages');
        const inputEl = document.getElementById('ai-input');
        const sendBtn = document.getElementById('ai-send');
        const chatSelect = document.getElementById('ai-chat-select');
        const attachBtn = document.getElementById('ai-attach-btn');
        const fileInput = document.getElementById('ai-file-input');
        const attachList = document.getElementById('ai-attach-list');

        let chats = [];        // [{id, title, system, messages:[{role,text,files}]}]
        let currentId = null;
        let pendingFiles = []; // файлы для текущего сообщения [{name,mime,data,isImage}]
        let templates = [];    // пользовательские шаблоны [{id,name,system}]
        let providers = [];    // [{id,name,format,baseUrl,key,model}]
        let activeProviderId = null;

        // Пресеты популярных API
        const AI_PRESETS = {
            gemini:    { name: 'Google Gemini',  format: 'gemini',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-flash-latest' },
            openai:    { name: 'OpenAI',         format: 'openai',    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
            deepseek:  { name: 'DeepSeek',       format: 'openai',    baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
            openrouter:{ name: 'OpenRouter',     format: 'openai',    baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
            groq:      { name: 'Groq',           format: 'openai',    baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
            anthropic: { name: 'Anthropic Claude', format: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest' },
            custom:    { name: 'Свой (OpenAI-совместимый)', format: 'openai', baseUrl: '', model: '' }
        };
        const activeProvider = () => providers.find(p => p.id === activeProviderId) || providers[0] || null;

        const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        // ── Встроенный шаблон «Исправить текст» ──
        const FIX_TEXT_PROMPT = `Ты — редактор службы поддержки. Перепиши черновой ответ специалиста так, чтобы он был вежливым, ясным и грамотным, сохранив исходный объём информации.

ПРАВИЛА:
1. Не сокращай смысл: оставляй все списки, вопросы и инструкции.
2. Тщательно проверяй орфографию и пунктуацию.
3. Не используй эмодзи. Тон — спокойный и профессиональный.
4. Работай только с фактами из черновика, ничего не выдумывай.
5. Убирай канцеляриты и слова-паразиты.
6. Местоимение «вы» — со строчной буквы, без фраз долженствования.

ФОРМАТ ОТВЕТА:
1. ГОТОВЫЙ ТЕКСТ: отредактированный ответ для клиента.
2. КОММЕНТАРИЙ РЕДАКТОРА: краткий список правок.`;

        const BUILTIN_TEMPLATES = [
            { id: 'fix-text', name: 'Исправить текст', system: FIX_TEXT_PROMPT, builtin: true }
        ];
        function allTemplates() { return BUILTIN_TEMPLATES.concat(templates); }

        function showChat(hasProvider) {
            keyForm.style.display = hasProvider ? 'none' : 'block';
            chat.style.display = hasProvider ? 'flex' : 'none';
            if (hasProvider) { loadChats(); renderProviderBar(); }
        }

        // Панель выбора провайдера в шапке чата
        function renderProviderBar() {
            let bar = document.getElementById('ai-prov-bar');
            const barParent = chat.querySelector('.ai-bar');
            if (!barParent) return;
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'ai-prov-bar';
                bar.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border)';
                barParent.parentNode.insertBefore(bar, barParent);
            }
            bar.innerHTML = `
                <span style="font-size:11px;color:var(--muted)">API:</span>
                <select id="ai-prov-sel" style="flex:1;height:30px;border-radius:8px;font-size:12px"></select>
                <button id="ai-prov-manage" title="Управление API" style="background:var(--surface);border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:5px 9px;cursor:pointer;font-size:12px">⚙</button>`;
            const sel = document.getElementById('ai-prov-sel');
            sel.innerHTML = providers.map(p => `<option value="${p.id}">${p.name} (${p.model || p.format})</option>`).join('');
            sel.value = activeProviderId;
            sel.onchange = () => { activeProviderId = sel.value; chrome.storage.local.set({ aiActiveProvider: activeProviderId }); };
            document.getElementById('ai-prov-manage').onclick = () => showChat(false);
        }

        // ── Хранилище чатов ──
        function persist() {
            chrome.storage.local.set({ aiChats: chats, aiCurrentChat: currentId });
        }
        function loadChats() {
            chrome.storage.local.get(['aiChats', 'aiCurrentChat', 'aiTemplates'], (d) => {
                chats = d.aiChats || [];
                currentId = d.aiCurrentChat;
                templates = d.aiTemplates || [];
                if (!chats.length) newChat();
                else {
                    if (!chats.find(c => c.id === currentId)) currentId = chats[0].id;
                    renderSelect(); renderMessages();
                }
            });
        }
        function current() { return chats.find(c => c.id === currentId); }

        // tpl — объект шаблона {name, system} или null для пустого чата
        function newChat(tpl) {
            const c = {
                id: uid(),
                title: tpl ? tpl.name : 'Новый чат',
                system: tpl ? tpl.system : '',
                messages: []
            };
            chats.unshift(c);
            currentId = c.id;
            persist(); renderSelect(); renderMessages();
        }
        function saveTemplates() { chrome.storage.local.set({ aiTemplates: templates }); }

        function renderSelect() {
            chatSelect.innerHTML = '';
            chats.forEach(c => {
                const o = document.createElement('option');
                o.value = c.id;
                o.textContent = c.title;
                if (c.id === currentId) o.selected = true;
                chatSelect.appendChild(o);
            });
        }

        function renderMessages() {
            messagesEl.innerHTML = '';
            const c = current();
            if (!c) return;
            if (!c.messages.length) {
                const hint = document.createElement('div');
                hint.className = 'ai-empty';
                hint.textContent = 'Начните диалог — задайте вопрос или прикрепите файл';
                messagesEl.appendChild(hint);
            }
            c.messages.forEach(m => renderBubble(m.role, m.text, m.files));
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // Простой markdown → HTML (заголовки, списки, жирный, код)
        function mdToHtml(src) {
            let s = (src || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // блоки кода ```
            s = s.replace(/```([\s\S]*?)```/g, (m, c) => `<pre class="ai-pre">${c.replace(/\n$/, '')}</pre>`);
            // инлайн код
            s = s.replace(/`([^`]+)`/g, '<code class="ai-code">$1</code>');
            const lines = s.split('\n');
            let html = '', inList = false;
            for (let line of lines) {
                const h = line.match(/^(#{1,6})\s+(.*)$/);
                const li = line.match(/^\s*[-*•]\s+(.*)$/);
                if (/^\s*---+\s*$/.test(line)) {
                    if (inList) { html += '</ul>'; inList = false; }
                    html += '<hr class="ai-hr">';
                } else if (h) {
                    if (inList) { html += '</ul>'; inList = false; }
                    const lvl = Math.min(h[1].length, 3);
                    const size = lvl === 1 ? '15px' : lvl === 2 ? '14px' : '13px';
                    html += `<div class="ai-h" style="font-size:${size}">${fmtInline(h[2])}</div>`;
                } else if (li) {
                    if (!inList) { html += '<ul class="ai-ul">'; inList = true; }
                    html += `<li>${fmtInline(li[1])}</li>`;
                } else {
                    if (inList) { html += '</ul>'; inList = false; }
                    html += line.trim() === '' ? '<div style="height:6px"></div>' : `<div>${fmtInline(line)}</div>`;
                }
            }
            if (inList) html += '</ul>';
            return html;
        }
        // Извлекаем только блок «ГОТОВЫЙ ТЕКСТ» (без комментария редактора)
        function extractReady(raw) {
            if (!raw || !/ГОТОВЫЙ\s+ТЕКСТ/i.test(raw)) return (raw || '').trim();
            const m = raw.match(/ГОТОВЫЙ\s+ТЕКСТ/i);
            let after = raw.slice(m.index + m[0].length);
            // убираем хвост строки заголовка (":", "**", "#", пробелы)
            after = after.replace(/^[:*#\s]*/, '');
            // обрезаем на «КОММЕНТАРИЙ РЕДАКТОРА»
            after = after.split(/[#*\s]*КОММЕНТАРИЙ\s+РЕДАКТОРА/i)[0];
            // убираем завершающий разделитель --- или ***
            after = after.replace(/[\r\n]+[-*_]{3,}[\r\n\s]*$/, '');
            return after.trim();
        }

        function fmtInline(t) {
            return t
                .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
                .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
        }

        function renderBubble(role, text, files) {
            const isUser = role === 'user';
            const row = document.createElement('div');
            row.className = 'ai-row ' + (isUser ? 'user' : 'bot');

            const av = document.createElement('div');
            av.className = 'ai-av ' + (isUser ? 'user' : 'bot');
            av.textContent = isUser ? 'Я' : '✦';

            const bubble = document.createElement('div');
            bubble.className = 'ai-bubble';
            bubble.title = 'Нажмите, чтобы скопировать';
            if (files && files.length) {
                files.forEach(f => {
                    if (f.isImage) {
                        const img = document.createElement('img');
                        img.src = `data:${f.mime};base64,${f.data}`;
                        bubble.appendChild(img);
                    } else {
                        const chip = document.createElement('div');
                        chip.style.cssText = 'font-size:11px;opacity:.8;margin-bottom:4px';
                        chip.textContent = '📎 ' + f.name;
                        bubble.appendChild(chip);
                    }
                });
            }
            const txt = document.createElement('div');
            txt.className = 'ai-txt';
            // бот — рендерим markdown, юзер — простой текст
            if (isUser) txt.textContent = text;
            else txt.innerHTML = mdToHtml(text);
            txt._raw = text;
            bubble.appendChild(txt);

            // Что копировать: если есть блок «ГОТОВЫЙ ТЕКСТ» — только его
            const copyText = () => extractReady(txt._raw || txt.textContent);

            // Копирование по клику (если ничего не выделено)
            bubble.addEventListener('click', () => {
                if (window.getSelection().toString()) return;
                copyClip(copyText()).then(() => flashCopied(bubble));
            });

            const doReply = () => {
                const raw = (txt._raw || txt.textContent).slice(0, 120);
                inputEl.value = `> ${raw.replace(/\n/g, ' ')}\n\n` + inputEl.value;
                inputEl.focus();
                inputEl.dispatchEvent(new Event('input'));
            };
            const doCopy = () => {
                copyClip(copyText()).then(() => flashCopied(bubble));
            };

            // Колонка: пузырь + (для бота) панель действий снизу
            const col = document.createElement('div');
            col.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0';
            col.appendChild(bubble);

            if (!isUser) {
                const actions = document.createElement('div');
                actions.className = 'ai-actions';
                const copyBtn = document.createElement('button');
                copyBtn.className = 'ai-actbtn';
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Копировать';
                copyBtn.addEventListener('click', (e) => { e.stopPropagation(); doCopy(); });
                const replyBtn = document.createElement('button');
                replyBtn.className = 'ai-actbtn';
                replyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg> Ответить';
                replyBtn.addEventListener('click', (e) => { e.stopPropagation(); doReply(); });
                actions.appendChild(copyBtn);
                actions.appendChild(replyBtn);
                col.appendChild(actions);
            }

            row.appendChild(av);
            row.appendChild(col);
            messagesEl.appendChild(row);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return txt; // элемент текста — чтобы обновлять loader
        }

        function flashCopied(bubble) {
            const tag = document.createElement('div');
            tag.textContent = '✓ Скопировано';
            tag.style.cssText = 'position:absolute;top:-8px;right:8px;font-size:10px;background:var(--ok);color:#fff;padding:2px 6px;border-radius:6px;pointer-events:none';
            bubble.style.position = 'relative';
            bubble.appendChild(tag);
            setTimeout(() => tag.remove(), 1200);
        }

        // ── Провайдеры API ──
        function saveProviders() { chrome.storage.local.set({ aiProviders: providers, aiActiveProvider: activeProviderId }); }

        function loadProviders() {
            chrome.storage.local.get(['aiProviders', 'aiActiveProvider', 'googleKey'], (d) => {
                providers = d.aiProviders || [];
                activeProviderId = d.aiActiveProvider || (providers[0] && providers[0].id);
                // миграция старого googleKey в провайдер
                if (!providers.length && d.googleKey) {
                    const p = { id: uid(), ...AI_PRESETS.gemini, key: d.googleKey };
                    providers.push(p); activeProviderId = p.id; saveProviders();
                }
                renderProviderForm();
                showChat(providers.length > 0);
            });
        }

        // Форма/список провайдеров в #ai-key-form
        function renderProviderForm() {
            keyForm.classList.add('prov-mode');
            const presetOpts = Object.entries(AI_PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
            const list = providers.map(p => `
                <div style="display:flex;align-items:center;gap:6px;padding:7px 9px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
                    <span style="flex:1;font-size:12px">${p.name} <span style="color:var(--muted)">· ${p.model || p.format}</span></span>
                    <button class="prov-del" data-id="${p.id}" style="background:none;border:1px solid var(--border);color:var(--err);border-radius:6px;cursor:pointer;padding:2px 7px;font-size:11px">✕</button>
                </div>`).join('');
            keyForm.innerHTML = `
                <div class="ai-logo" style="margin:0 auto 12px"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                <h3 style="text-align:center">Подключение ИИ</h3>
                ${providers.length ? `<div style="margin:10px 0">${list}</div>` : '<div class="desc" style="text-align:center">Добавьте API любого ИИ. Ключ хранится только локально.</div>'}
                <div style="border-top:1px solid var(--border);margin:10px 0;padding-top:10px">
                    <div class="lbl" style="font-size:11px;color:var(--muted);margin-bottom:4px">Сервис</div>
                    <select id="prov-preset" style="width:100%;margin-bottom:8px">${presetOpts}</select>
                    <input type="text" id="prov-name" placeholder="Название (необязательно)" style="margin-bottom:8px">
                    <input type="text" id="prov-base" placeholder="Base URL" style="margin-bottom:8px">
                    <input type="text" id="prov-model" placeholder="Модель" style="margin-bottom:8px">
                    <input type="password" id="prov-key" placeholder="API-ключ" style="margin-bottom:8px">
                    <button id="prov-add" class="btn btn-primary" style="width:100%">Добавить API</button>
                    <div id="prov-err" style="color:var(--err);font-size:11px;margin-top:6px;display:none"></div>
                </div>
                ${providers.length ? '<button id="prov-done" class="btn" style="width:100%;margin-top:8px;background:var(--surface2);border:1px solid var(--border);color:var(--text)">Готово</button>' : ''}`;

            const presetSel = document.getElementById('prov-preset');
            const applyPreset = () => {
                const pr = AI_PRESETS[presetSel.value];
                document.getElementById('prov-base').value = pr.baseUrl;
                document.getElementById('prov-model').value = pr.model;
                document.getElementById('prov-name').value = pr.name;
            };
            presetSel.onchange = applyPreset; applyPreset();

            document.getElementById('prov-add').onclick = () => {
                const preset = AI_PRESETS[presetSel.value];
                const key = document.getElementById('prov-key').value.trim();
                const base = document.getElementById('prov-base').value.trim();
                const model = document.getElementById('prov-model').value.trim();
                const name = document.getElementById('prov-name').value.trim() || preset.name;
                const err = document.getElementById('prov-err');
                if (!key) { err.style.display = 'block'; err.textContent = 'Введите API-ключ'; return; }
                if (!base || !model) { err.style.display = 'block'; err.textContent = 'Заполните Base URL и модель'; return; }
                const p = { id: uid(), name, format: preset.format, baseUrl: base, model, key };
                providers.push(p); activeProviderId = p.id; saveProviders();
                renderProviderForm();
            };
            document.querySelectorAll('.prov-del').forEach(b => b.onclick = () => {
                providers = providers.filter(x => x.id !== b.dataset.id);
                if (activeProviderId === b.dataset.id) activeProviderId = providers[0] && providers[0].id;
                saveProviders(); renderProviderForm();
                if (!providers.length) showChat(false);
            });
            const done = document.getElementById('prov-done');
            if (done) done.onclick = () => showChat(true);
        }

        loadProviders();
        document.getElementById('ai-reset-key')?.addEventListener('click', () => showChat(false));

        // ── Управление чатами + меню шаблонов ──
        const newBtn = document.getElementById('ai-new');

        function buildTemplateMenu() {
            // удаляем старое меню
            const old = document.getElementById('ai-tpl-menu');
            if (old) old.remove();

            const menu = document.createElement('div');
            menu.id = 'ai-tpl-menu';
            menu.style.cssText = 'position:absolute;top:46px;left:10px;z-index:50;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);padding:6px;min-width:220px;display:flex;flex-direction:column;gap:2px';

            const mkItem = (label, onClick, opts = {}) => {
                const it = document.createElement('div');
                it.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:7px;cursor:pointer;font-size:13px;color:var(--text)';
                it.onmouseenter = () => it.style.background = 'var(--surface2)';
                it.onmouseleave = () => it.style.background = 'none';
                const lbl = document.createElement('span');
                lbl.textContent = label;
                if (opts.accent) lbl.style.color = 'var(--accent)';
                it.appendChild(lbl);
                it.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
                if (opts.onDelete) {
                    const del = document.createElement('span');
                    del.textContent = '✕';
                    del.style.cssText = 'color:var(--err);font-size:11px;cursor:pointer';
                    del.addEventListener('click', (e) => { e.stopPropagation(); opts.onDelete(); });
                    it.appendChild(del);
                }
                return it;
            };

            menu.appendChild(mkItem('＋ Пустой чат', () => { newChat(null); menu.remove(); }));
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border);margin:4px 0';
            menu.appendChild(sep);

            allTemplates().forEach(t => {
                menu.appendChild(mkItem(t.name,
                    () => { newChat(t); menu.remove(); },
                    t.builtin ? {} : { onDelete: () => {
                        templates = templates.filter(x => x.id !== t.id);
                        saveTemplates(); buildTemplateMenu();
                    }}));
            });

            const sep2 = document.createElement('div');
            sep2.style.cssText = 'height:1px;background:var(--border);margin:4px 0';
            menu.appendChild(sep2);
            menu.appendChild(mkItem('⚙ Создать шаблон…', () => { menu.remove(); openTemplateForm(); }, { accent: true }));

            document.getElementById('tab-ai').appendChild(menu);
        }

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.getElementById('ai-tpl-menu')) { document.getElementById('ai-tpl-menu').remove(); return; }
            buildTemplateMenu();
        });
        document.addEventListener('click', () => {
            const m = document.getElementById('ai-tpl-menu');
            if (m) m.remove();
        });

        // ── Форма создания шаблона ──
        function openTemplateForm() {
            if (document.getElementById('ai-tpl-form')) return;
            const ov = document.createElement('div');
            ov.id = 'ai-tpl-form';
            ov.style.cssText = 'position:absolute;inset:0;z-index:60;background:var(--bg);display:flex;flex-direction:column;padding:14px;gap:8px';
            ov.innerHTML = `
                <div style="font-weight:600;font-size:14px">Новый шаблон</div>
                <input type="text" id="tpl-name" placeholder="Название шаблона" style="width:100%">
                <textarea id="tpl-system" placeholder="Системная инструкция (правила для ИИ)..." style="flex:1;resize:none;font-family:inherit;font-size:12px;line-height:1.5;background:var(--surface2);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:10px;outline:none"></textarea>
                <div style="display:flex;gap:8px">
                    <button id="tpl-cancel" class="btn" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--muted)">Отмена</button>
                    <button id="tpl-save" class="btn btn-primary" style="flex:1;margin:0">Сохранить</button>
                </div>`;
            document.getElementById('tab-ai').appendChild(ov);
            document.getElementById('tpl-cancel').addEventListener('click', () => ov.remove());
            document.getElementById('tpl-save').addEventListener('click', () => {
                const name = document.getElementById('tpl-name').value.trim();
                const system = document.getElementById('tpl-system').value.trim();
                if (!name || !system) { return; }
                templates.push({ id: uid(), name, system });
                saveTemplates();
                ov.remove();
            });
        }

        chatSelect.addEventListener('change', () => {
            currentId = chatSelect.value; persist(); renderMessages();
        });
        document.getElementById('ai-delete').addEventListener('click', () => {
            chats = chats.filter(c => c.id !== currentId);
            if (!chats.length) newChat();
            else { currentId = chats[0].id; persist(); renderSelect(); renderMessages(); }
        });

        // ── Файлы ──
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            for (const f of fileInput.files) {
                const isImage = f.type.startsWith('image/');
                const data = await readFileBase64(f);
                pendingFiles.push({ name: f.name, mime: f.type || 'text/plain', data, isImage });
            }
            fileInput.value = '';
            renderAttachList();
        });
        function readFileBase64(file) {
            return new Promise((res) => {
                const r = new FileReader();
                r.onload = () => res(r.result.split(',')[1]); // base64 без префикса
                r.readAsDataURL(file);
            });
        }
        function renderAttachList() {
            attachList.innerHTML = '';
            attachList.style.display = pendingFiles.length ? 'flex' : 'none';
            pendingFiles.forEach((f, i) => {
                const chip = document.createElement('span');
                chip.className = 'ai-chip';
                chip.innerHTML = `${f.isImage ? '🖼' : '📎'} ${f.name} <span class="x" data-i="${i}">✕</span>`;
                chip.querySelector('[data-i]').addEventListener('click', () => {
                    pendingFiles.splice(i, 1); renderAttachList();
                });
                attachList.appendChild(chip);
            });
        }

        // ── Автоувеличение textarea ──
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        });

        // ── Отправка ──
        async function send() {
            const text = inputEl.value.trim();
            if (!text && !pendingFiles.length) return;
            const c = current();
            if (!c) return;

            const userMsg = { role: 'user', text, files: pendingFiles.slice() };
            c.messages.push(userMsg);
            renderBubble('user', text, userMsg.files);

            // Заголовок чата из первого сообщения
            if (c.title === 'Новый чат' && text) {
                c.title = text.slice(0, 30) + (text.length > 30 ? '…' : '');
                renderSelect();
            }

            pendingFiles = []; renderAttachList();
            inputEl.value = ''; inputEl.style.height = 'auto';

            const loader = renderBubble('model', '⋯');
            sendBtn.disabled = true;
            messagesEl.scrollTop = messagesEl.scrollHeight;
            persist();

            const prov = activeProvider();
            if (!prov) { loader.textContent = '⚠️ Не выбран API. Добавьте провайдера.'; sendBtn.disabled = false; return; }
            chrome.runtime.sendMessage({ action: 'aiChat', provider: prov, messages: c.messages, system: c.system || '' }, (resp) => {
                sendBtn.disabled = false;
                if (chrome.runtime.lastError || !resp) { loader.textContent = '⚠️ Ошибка связи'; return; }
                if (!resp.success) { loader.textContent = '⚠️ ' + (resp.error || 'Ошибка запроса к ИИ'); return; }
                loader.innerHTML = mdToHtml(resp.reply);
                loader._raw = resp.reply;
                c.messages.push({ role: 'model', text: resp.reply });
                persist();
                messagesEl.scrollTop = messagesEl.scrollHeight;
            });
        }
        sendBtn.addEventListener('click', send);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
    })();

    // ===================== СКРИНШОТ =====================
    // ── Стиль вкладок (применяется при загрузке и при изменении в настройках) ──
    // tabsNav уже объявлен выше (блок «горизонтальный скролл табов»), переиспользуем его.
    const applyTabStyle = (value) => {
        if (tabsNav) tabsNav.classList.toggle('tabs-scroll', value === 'scroll');
    };
    try { chrome.storage.local.get(['tabStyle'], (d) => { if (!chrome.runtime.lastError) applyTabStyle(d.tabStyle || 'wrap'); }); } catch (e) {}
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.tabStyle) try { applyTabStyle(changes.tabStyle.newValue); } catch (e) {}
        });
    } catch (e) {}

    const delaySelect = document.getElementById('screenshot-delay');

    // Восстанавливаем сохранённый выбор задержки
    if (delaySelect) {
        try { chrome.storage.local.get(['screenshotDelay'], (data) => { if (!chrome.runtime.lastError && data.screenshotDelay != null) delaySelect.value = String(data.screenshotDelay); }); } catch (e) {}
        delaySelect.addEventListener('change', () => {
            try { chrome.storage.local.set({ screenshotDelay: parseInt(delaySelect.value) || 0 }); } catch (e) {}
        });
    }

    // ── Вкладка «Скрипты» (Tampermonkey-style) ──────────────────────────────
    (function initScripts() {
        const STORE_KEY = 'userScripts';
        const listEl  = document.getElementById('scripts-list');
        const nameIn  = document.getElementById('scripts-name');
        const editor  = document.getElementById('scripts-editor');
        const status  = document.getElementById('scripts-status');
        const result  = document.getElementById('scripts-result');
        if (!listEl) return;

        const esc = (s) => (s || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

        // scripts = [{id, name, code, enabled}]
        let scripts = [];
        let activeId = null;

        // ── Хелперы хранилища ──
        const loadScripts = () => new Promise(res => {
            try {
                chrome.storage.local.get([STORE_KEY], d => {
                    if (chrome.runtime.lastError) { scripts = []; res(); return; }
                    const raw = d[STORE_KEY];
                    if (Array.isArray(raw)) {
                        scripts = raw;
                    } else if (raw && typeof raw === 'object') {
                        // Миграция старого формата {name: code}
                        scripts = Object.entries(raw).map(([name, code]) => ({
                            id: 'sc_' + Math.random().toString(36).slice(2),
                            name, code, enabled: true
                        }));
                    } else {
                        scripts = [];
                    }
                    res();
                });
            } catch (e) { scripts = []; res(); }
        });

        const saveScripts = () => new Promise(res => {
            try { chrome.storage.local.set({ [STORE_KEY]: scripts }, () => res()); }
            catch (e) { res(); }
        });

        // ── Парсинг метаданных UserScript ──
        const parseMeta = (code) => {
            const meta = { name: '', description: '', match: [], runAt: 'document_end' };
            const block = (code || '').match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
            if (!block) return meta;
            for (const line of block[1].split('\n')) {
                const m = line.match(/\/\/\s*@(\w[\w-]*)\s+(.*)/);
                if (!m) continue;
                const [, key, val] = m;
                if (key === 'name') meta.name = val.trim();
                else if (key === 'description') meta.description = val.trim();
                else if (key === 'match' || key === 'include') meta.match.push(val.trim());
                else if (key === 'run-at') meta.runAt = val.trim().replace('-', '_');
            }
            return meta;
        };

        // ── Рендер списка ──
        const renderList = () => {
            listEl.innerHTML = '';
            if (!scripts.length) return;
            scripts.forEach(sc => {
                const meta = parseMeta(sc.code);
                const matchInfo = meta.match.length
                    ? meta.match.map(m => m.replace(/^https?:\/\//, '').replace(/\*\//g, '*')).join(', ')
                    : '';
                const autoTag = meta.match.length
                    ? `<span class="sc-badge">${ICO_LIGHTNING} авто</span>` : '';

                const item = document.createElement('div');
                item.className = 'sc-item' + (sc.id === activeId ? ' active' : '');
                item.dataset.id = sc.id;
                item.innerHTML = `
                    <label class="sc-tog" title="${sc.enabled ? 'Включён' : 'Выключен'}">
                        <input type="checkbox" ${sc.enabled ? 'checked' : ''}>
                        <div class="sc-tog-track"></div>
                    </label>
                    <div class="sc-item-info">
                        <div class="sc-item-name">${esc(sc.name)}${autoTag}</div>
                        ${matchInfo ? `<div class="sc-item-meta">${esc(matchInfo)}</div>` : (meta.description ? `<div class="sc-item-meta">${esc(meta.description)}</div>` : '')}
                    </div>
                    <button class="sc-item-del" title="Удалить">${ICO_TRASH}</button>`;

                // Клик по строке → выбрать скрипт
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.sc-tog') || e.target.closest('.sc-item-del')) return;
                    selectScript(sc.id);
                });

                // Тоггл enable/disable
                item.querySelector('.sc-tog input').addEventListener('change', async (e) => {
                    e.stopPropagation();
                    sc.enabled = e.target.checked;
                    await saveScripts();
                    item.querySelector('label.sc-tog').title = sc.enabled ? 'Включён' : 'Выключен';
                });

                // Удаление
                item.querySelector('.sc-item-del').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Удалить скрипт «${sc.name}»?`)) return;
                    scripts = scripts.filter(s => s.id !== sc.id);
                    if (activeId === sc.id) { activeId = null; clearEditor(); }
                    await saveScripts();
                    renderList();
                    setStatus('');
                });

                listEl.appendChild(item);
            });
        };

        const clearEditor = () => {
            nameIn.value = '';
            editor.value = '';
            result.style.display = 'none';
            status.textContent = '';
        };

        const selectScript = (id) => {
            activeId = id;
            const sc = scripts.find(s => s.id === id);
            if (!sc) { clearEditor(); renderList(); return; }
            nameIn.value = sc.name;
            editor.value = sc.code;
            result.style.display = 'none';
            status.textContent = '';
            renderList();
            // Скроллим элемент в видимость
            const el = listEl.querySelector(`[data-id="${id}"]`);
            if (el) el.scrollIntoView({ block: 'nearest' });
        };

        const setStatus = (msg, color) => {
            status.textContent = msg;
            status.style.color = color || 'var(--muted)';
        };

        const showResult = (text, color) => {
            result.style.display = 'block';
            result.style.color = color || 'var(--text)';
            result.textContent = text;
        };

        loadScripts().then(() => renderList());

        // ── Новый скрипт ──
        document.getElementById('scripts-new').addEventListener('click', () => {
            activeId = null;
            nameIn.value = '';
            editor.value = `// ==UserScript==\n// @name         Новый скрипт\n// @description  Описание\n// @match        https://staff.example.com/*\n// ==/UserScript==\n\n`;
            result.style.display = 'none';
            renderList();
            nameIn.focus();
            nameIn.select();
            setStatus('Введите название и код скрипта.');
        });

        // ── Удалить выбранный ──
        document.getElementById('scripts-del').addEventListener('click', async () => {
            if (!activeId) { setStatus('Сначала выберите скрипт.'); return; }
            const sc = scripts.find(s => s.id === activeId);
            if (!sc || !confirm(`Удалить скрипт «${sc.name}»?`)) return;
            scripts = scripts.filter(s => s.id !== activeId);
            activeId = null;
            clearEditor();
            await saveScripts();
            renderList();
        });

        // ── Загрузка файла ──
        document.getElementById('scripts-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const code = ev.target.result;
                const meta = parseMeta(code);
                const name = meta.name || file.name.replace(/\.user\.js$|\.js$/, '');
                activeId = null;
                nameIn.value = name;
                editor.value = code;
                result.style.display = 'none';
                setStatus(`Файл «${file.name}» загружен. Нажмите «Сохранить».`);
                renderList();
            };
            reader.readAsText(file, 'utf-8');
            e.target.value = '';
        });

        // ── Сохранить ──
        document.getElementById('scripts-save').addEventListener('click', async () => {
            const name = nameIn.value.trim() || parseMeta(editor.value).name;
            if (!name) { setStatus('Введите название скрипта.', 'var(--err)'); return; }
            const code = editor.value;
            if (activeId) {
                const sc = scripts.find(s => s.id === activeId);
                if (sc) { sc.name = name; sc.code = code; }
            } else {
                const newId = 'sc_' + Date.now().toString(36);
                scripts.push({ id: newId, name, code, enabled: true });
                activeId = newId;
            }
            await saveScripts();
            renderList();
            setStatus(`✓ «${name}» сохранён.`, 'var(--ok)');
            setTimeout(() => setStatus(''), 2500);
        });

        // ── Tab → отступ в редакторе ──
        editor.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = editor.selectionStart, en = editor.selectionEnd;
                editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(en);
                editor.selectionStart = editor.selectionEnd = s + 2;
            }
        });

        // ── Запустить на странице ──
        document.getElementById('scripts-run').addEventListener('click', async () => {
            const code = editor.value.trim();
            if (!code) return;
            result.style.display = 'none';
            setStatus('Запускаю…');
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) { setStatus('Нет активной вкладки.', 'var(--err)'); return; }
                if ((tab.url || '').startsWith('chrome://')) {
                    setStatus('Нельзя запустить на системных страницах.', 'var(--err)'); return;
                }
                const [entry] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    func: (src) => {
                        const GM_POLYFILL = `
var __gmCmds=[];
window.__gmCmdStore=window.__gmCmdStore||{};
function GM_getValue(k,d){try{var v=localStorage.getItem('__gm_'+k);return v===null?d:JSON.parse(v)}catch(e){return d}}
function GM_setValue(k,v){try{localStorage.setItem('__gm_'+k,JSON.stringify(v))}catch(e){}}
function GM_deleteValue(k){localStorage.removeItem('__gm_'+k)}
function GM_listValues(){return Object.keys(localStorage).filter(function(k){return k.startsWith('__gm_')}).map(function(k){return k.slice(5)})}
function GM_addStyle(css){var s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s);return s}
function GM_log(){console.log.apply(console,arguments)}
function GM_openInTab(url){window.open(url,'_blank')}
function GM_setClipboard(data){window.__gmLastClipboard=String(data);try{navigator.clipboard.writeText(String(data)).catch(function(){var t=document.createElement('textarea');t.value=String(data);document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()})}catch(e){var t=document.createElement('textarea');t.value=String(data);document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}}
function GM_notification(opts){var o=typeof opts==='string'?{text:opts}:opts;if(window.Notification&&Notification.permission==='granted'){new Notification(o.title||'Script',{body:o.text||''})}else{console.info('[notify]',(o.title?o.title+': ':'')+o.text)}}
function GM_registerMenuCommand(name,fn){var id='__gmc'+Math.random().toString(36).slice(2);window.__gmCmdStore[id]=fn;__gmCmds.push({id:id,name:String(name)})}
function GM_unregisterMenuCommand(id){delete window.__gmCmdStore[id]}
function GM_getResourceText(){return''}
function GM_getResourceURL(){return''}
function GM_xmlhttpRequest(d){var init={method:(d.method||'GET'),headers:d.headers||{}};if(d.data)init.body=d.data;fetch(d.url,init).then(function(r){return r.text().then(function(t){var o={status:r.status,statusText:r.statusText,responseText:t,response:t,responseHeaders:'',finalUrl:r.url};if(d.onload)d.onload(o)})}).catch(function(e){if(d.onerror)d.onerror({error:e.message})})}
var GM={getValue:GM_getValue,setValue:GM_setValue,deleteValue:GM_deleteValue,listValues:GM_listValues,addStyle:GM_addStyle,log:GM_log,openInTab:GM_openInTab,setClipboard:GM_setClipboard,notification:GM_notification,registerMenuCommand:GM_registerMenuCommand,xmlHttpRequest:GM_xmlhttpRequest};
var GM_info={script:{name:'UserScript',version:'1.0',description:''},scriptMetaStr:'',version:'4.0'};
`;
                        const key = '__stpR' + Math.random().toString(36).slice(2);
                        const tag = document.createElement('script');
                        const ser = `function(a){try{return typeof a==='object'&&a!==null?JSON.stringify(a):String(a)}catch(e){return String(a)}}`;
                        tag.textContent = `(function(){
var __logs=[];
var __oc={log:console.log,info:console.info,warn:console.warn,error:console.error};
function __cap(lvl){return function(){var s=Array.from(arguments).map(${ser}).join(' ');__logs.push(lvl==='log'?s:'['+lvl+'] '+s);__oc[lvl].apply(console,arguments)}}
console.log=__cap('log');console.info=__cap('info');console.warn=__cap('warn');console.error=__cap('error');
${GM_POLYFILL}
try{
var _v=(function(){\n${src}\n})();
Object.assign(console,__oc);
window['${key}']={ok:true,val:_v===undefined?null:String(_v),logs:__logs,cmds:__gmCmds};
}catch(e){
Object.assign(console,__oc);
window['${key}']={ok:false,val:e.message+'\\n'+(e.stack||'').split('\\n').slice(1,4).join('\\n'),logs:__logs,cmds:__gmCmds};
}})()`;
                        (document.head || document.documentElement).appendChild(tag);
                        tag.remove();
                        const r = window[key];
                        delete window[key];
                        return r || { ok: true, val: null, logs: [], cmds: [] };
                    },
                    args: [code]
                });
                const res = entry?.result;
                if (!res) {
                    setStatus('✕ Нет результата (страница недоступна?)', 'var(--err)');
                } else {
                    // Показываем кнопки зарегистрированных команд
                    const cmds = res.cmds || [];
                    if (cmds.length) {
                        result.style.display = 'block';
                        result.style.color = 'var(--text)';
                        result.innerHTML = '';
                        const hint = document.createElement('div');
                        hint.style.cssText = 'font-size:10px;color:var(--muted);margin-bottom:5px';
                        hint.textContent = 'Команды скрипта:';
                        result.appendChild(hint);
                        cmds.forEach(cmd => {
                            const b = document.createElement('button');
                            b.className = 'btn btn-primary';
                            b.style.cssText = 'width:100%;margin-bottom:4px;font-size:12px;text-align:left';
                            b.innerHTML = ICO_PLAY + ' ' + cmd.name;
                            b.addEventListener('click', async () => {
                                b.disabled = true;
                                b.textContent = '⋯ ' + cmd.name;
                                try {
                                    const [cmdEntry] = await chrome.scripting.executeScript({
                                        target: { tabId: tab.id },
                                        world: 'MAIN',
                                        func: (id) => {
                                            if (!window.__gmCmdStore || !window.__gmCmdStore[id]) return { ok: false, val: 'Команда не найдена. Нажмите «Запустить» заново.' };
                                            window.__gmLastClipboard = null;
                                            var logs = [];
                                            var oc = { log: console.log, info: console.info, warn: console.warn, error: console.error };
                                            ['log','info','warn','error'].forEach(function(l){ console[l] = function(){ logs.push((l==='log'?'':'['+l+'] ')+Array.from(arguments).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' ')); oc[l].apply(console,arguments); }; });
                                            try {
                                                window.__gmCmdStore[id]();
                                                Object.assign(console, oc);
                                                return { ok: true, logs: logs, clipboard: window.__gmLastClipboard };
                                            } catch(e) {
                                                Object.assign(console, oc);
                                                return { ok: false, val: e.message, logs: logs, clipboard: window.__gmLastClipboard };
                                            }
                                        },
                                        args: [cmd.id]
                                    });
                                    const cr = cmdEntry?.result;
                                    if (cr?.clipboard) {
                                        try { await navigator.clipboard.writeText(cr.clipboard); } catch(e) {}
                                    }
                                    const cmdLines = [...(cr?.logs || [])];
                                    if (cr?.val) cmdLines.push(cr.ok === false ? '✕ ' + cr.val : cr.val);
                                    if (cr?.clipboard) cmdLines.push('Скопировано: ' + cr.clipboard.slice(0, 120) + (cr.clipboard.length > 120 ? '…' : ''));
                                    if (cmdLines.length) showResult(cmdLines.join('\n'), cr?.ok === false ? 'var(--err)' : 'var(--text)');
                                    b.innerHTML = ICO_PLAY + ' ' + cmd.name;
                                    b.disabled = false;
                                } catch(e) {
                                    b.innerHTML = ICO_PLAY + ' ' + cmd.name;
                                    b.disabled = false;
                                }
                            });
                            result.appendChild(b);
                        });
                        setStatus(res.ok ? '✓ Выполнено.' : '✕ Ошибка выполнения:', res.ok ? 'var(--ok)' : 'var(--err)');
                    } else if (!res.ok) {
                        setStatus('✕ Ошибка выполнения:', 'var(--err)');
                        const lines = [...(res.logs || []), res.val];
                        showResult(lines.join('\n'), 'var(--err)');
                    } else {
                        const lines = [...(res.logs || [])];
                        if (res.val != null) lines.push('→ ' + res.val);
                        if (lines.length) {
                            setStatus('✓ Выполнено.', 'var(--ok)');
                            showResult(lines.join('\n'), 'var(--text)');
                        } else {
                            setStatus('✓ Выполнено (нет вывода).', 'var(--ok)');
                            setTimeout(() => setStatus(''), 3000);
                        }
                    }
                }
            } catch (e) {
                const msg = e.message || String(e);
                setStatus('✕ ' + msg.split('\n')[0], 'var(--err)');
                if (msg.includes('\n')) showResult(msg, 'var(--err)');
            }
        });
    })();

    // ── Закрыть все плавающие панели и iframe во всех вкладках ──────────────
    document.getElementById('close-all-btn').addEventListener('click', async () => {
        // Закрыть плавающие панели во всех вкладках
        try {
            const tabs = await chrome.tabs.query({});
            let count = 0;
            for (const tab of tabs) {
                if (!tab.id || (tab.url || '').startsWith('chrome://')) continue;
                chrome.tabs.sendMessage(tab.id, { action: 'closeAllPanels' }).catch(() => {});
                count++;
            }
            const btn = document.getElementById('close-all-btn');
            const orig = btn.innerHTML;
            btn.title = `Закрыто во вкладках: ${count}`;
            btn.textContent = '✓';
            btn.style.color = 'var(--ok)';
            setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
        } catch (e) {}

        // Очистить все поля ввода и результаты во всех разделах
        const inputIds = [
            'whois-input', 'dns-input', 'shorten-input', 'checkhost-input',
            'st-input', 'punycode-input', 'ssl-input', 'ssl-dns-input', 'ssl-ch-input', 'ssl-bulk-input',
            'acc-input', 'dns-track-input', 'dns-track-expected',
        ];
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = '';
            el.dispatchEvent(new Event('input')); // обновить кнопку × и счётчики
        });

        const resultIds = [
            'whois-result', 'dns-result', 'shorten-result',
            'checkhost-info', 'checkhost-nodes',
            'st-result', 'punycode-result', 'punycode-copy-ok',
            'ssl-result', 'ssl-dns-result', 'ssl-ch-info', 'ssl-ch-nodes', 'ssl-bulk-result',
            'dns-prop-result', 'dns-track-result',
            'date-calc-result', 'date-diff-result', 'date-cost-result',
            'acc-result',
        ];
        resultIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('visible');
            el.innerHTML = '';
        });
    });

    document.getElementById('screenshot-btn').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            if ((tab.url || '').startsWith('chrome://') || (tab.url || '').startsWith('https://chrome.google.com/webstore')) {
                showError('Ошибка скриншота', 'Скриншот недоступен на системных страницах');
                return;
            }
            const delay = parseInt(delaySelect?.value) || 0;
            const tabId = tab.id;
            // Инжект делает background (он живёт после закрытия попапа)
            chrome.runtime.sendMessage({ action: 'triggerScreenshot', tabId, delay });
            window.close();
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                showError('Ошибка скриншота', e.message);
            }
        }
    });
});
