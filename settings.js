(() => {
    // ── Определяем первый запуск ─────────────────────────────────────────
    const IS_FIRST_RUN = new URLSearchParams(location.search).get('firstRun') === '1';
    if (IS_FIRST_RUN) {
        document.getElementById('first-run-banner').style.display = 'block';
    }

    // ── Тема ─────────────────────────────────────────────────────────────
    const applyTheme = (theme) => {
        document.documentElement.classList.toggle('light', theme === 'light');
        document.getElementById('theme-light-btn').classList.toggle('active', theme === 'light');
        document.getElementById('theme-dark-btn').classList.toggle('active', theme === 'dark');
    };
    const currentTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(currentTheme);

    document.getElementById('theme-light-btn').addEventListener('click', () => {
        localStorage.setItem('theme', 'light');
        applyTheme('light');
    });
    document.getElementById('theme-dark-btn').addEventListener('click', () => {
        localStorage.setItem('theme', 'dark');
        applyTheme('dark');
    });

    // ── Язык интерфейса / UI language ────────────────────────────────────
    (function initLang() {
        const cur = localStorage.getItem('appLang') || 'en';
        const ruBtn = document.getElementById('lang-ru-btn');
        const enBtn = document.getElementById('lang-en-btn');
        if (!ruBtn || !enBtn) return;
        const sync = (l) => { ruBtn.classList.toggle('active', l === 'ru'); enBtn.classList.toggle('active', l === 'en'); };
        sync(cur);
        const set = (l) => {
            localStorage.setItem('appLang', l);
            sync(l);
            location.reload(); // перерисовать страницу на выбранном языке
        };
        ruBtn.addEventListener('click', () => set('ru'));
        enBtn.addEventListener('click', () => set('en'));
    })();

    // ── Кэш ──────────────────────────────────────────────────────────────
    const cacheSel = document.getElementById('s-cache-ttl');
    cacheSel.value = localStorage.getItem('cacheTTL') || '5';
    cacheSel.addEventListener('change', () => {
        localStorage.setItem('cacheTTL', cacheSel.value);
        // очищаем существующий кэш при смене режима (особенно «Не хранить»)
        Object.keys(localStorage).filter(k => k.startsWith('stc_')).forEach(k => localStorage.removeItem(k));
    });

    // ── YOURLS ───────────────────────────────────────────────────────────
    const userEl   = document.getElementById('s-user');
    const passEl   = document.getElementById('s-pass');
    const serverEl = document.getElementById('s-server');
    const toggleEl = document.getElementById('s-pass-toggle');
    const savedOk  = document.getElementById('yourls-saved-ok');

    // Загружаем сохранённые данные
    chrome.storage.local.get(['yourlsUser', 'yourlsPass', 'yourlsServer'], (cfg) => {
        if (cfg.yourlsUser)   userEl.value   = cfg.yourlsUser;
        if (cfg.yourlsPass)   passEl.value   = cfg.yourlsPass;
        if (cfg.yourlsServer) serverEl.value = cfg.yourlsServer;
    });

    // Тоггл пароля
    let passVisible = true;
    toggleEl.addEventListener('click', () => {
        passVisible = !passVisible;
        passEl.type = passVisible ? 'text' : 'password';
        toggleEl.textContent = passVisible ? 'скрыть' : 'показать';
    });

    // Сохранение YOURLS
    document.getElementById('save-yourls-btn').addEventListener('click', () => {
        const cfg = {
            yourlsUser:   userEl.value.trim(),
            yourlsPass:   passEl.value,
            yourlsServer: serverEl.value.trim() || 'https://links.example.com',
            yourlsSig:    '', // сигнатуру убрали
        };
        chrome.storage.local.set(cfg, () => {
            if (IS_FIRST_RUN) {
                // При первом запуске отмечаем что настройка завершена
                chrome.storage.local.set({ setupDone: true });
            }
            savedOk.style.display = 'block';
            setTimeout(() => { savedOk.style.display = 'none'; }, 2000);
        });
    });

    // ── Порядок вкладок ───────────────────────────────────────────────────
    // ВНИМАНИЕ: список должен совпадать с ALL_TABS в popup.js
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
        { id: 'tab-acc',       label: 'Аккаунт' },
        { id: 'tab-l2',        label: 'L2' },
    ];

    const loadTabConfig = () => {
        try { return JSON.parse(localStorage.getItem('tabConfig') || 'null'); } catch { return null; }
    };
    const saveTabConfig = (cfg) => localStorage.setItem('tabConfig', JSON.stringify(cfg));

    const list = document.getElementById('s-tabs-list');

    const MERGED_IDS = ['tab-whois', 'tab-dns', 'tab-checkhost'];

    const renderTabs = () => {
        const cfg    = loadTabConfig() || { order: ALL_TABS.map(t => t.id), hidden: [] };
        const hidden = new Set(cfg.hidden || []);
        const merged = localStorage.getItem('domainMerge') === '1';
        list.innerHTML = '';

        cfg.order.forEach(id => {
            const meta = ALL_TABS.find(t => t.id === id);
            if (!meta) return;
            const item = document.createElement('div');
            item.className  = 'ts-item';
            item.dataset.id = id;
            // объединённые в «Проверку домена» — показываем, но неактивными
            // (оставляем в DOM, чтобы порядок сохранялся при перетаскивании остальных)
            if (merged && MERGED_IDS.includes(id)) {
                item.draggable = false;
                item.style.opacity = '.5';
                item.innerHTML =
                    `<span class="ts-drag" style="visibility:hidden">⠿</span>
                     <span class="ts-label">${meta.label}</span>
                     <span style="font-size:10.5px;color:var(--muted)">в «Проверке домена»</span>`;
                list.appendChild(item);
                return;
            }
            item.draggable  = true;
            item.innerHTML  = `
                <span class="ts-drag">⠿</span>
                <span class="ts-label">${meta.label}</span>
                <div class="ts-toggle ${hidden.has(id) ? '' : 'on'}" data-id="${id}"></div>`;
            list.appendChild(item);
        });

        let dragSrc = null;
        list.querySelectorAll('.ts-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', () => { dragSrc = item; item.classList.add('dragging'); });
            item.addEventListener('dragend',   () => { item.classList.remove('dragging'); persist(); });
            item.addEventListener('dragover',  (e) => { e.preventDefault(); if (item !== dragSrc) list.insertBefore(dragSrc, item); });
        });
    };

    // клик по тумблеру видимости — вешаем ОДИН раз (не в renderTabs, иначе дублируется)
    list.addEventListener('click', (e) => {
        const t = e.target.closest('.ts-toggle');
        if (t) { t.classList.toggle('on'); persist(); }
    });

    const persist = () => {
        const order  = [...list.querySelectorAll('.ts-item')].map(i => i.dataset.id);
        const hidden = [...list.querySelectorAll('.ts-toggle:not(.on)')].map(i => i.dataset.id);
        saveTabConfig({ order, hidden });
        showTabsSavedOk();
    };

    const showTabsSavedOk = () => {
        const savedOk = document.getElementById('tabs-saved-ok');
        if (savedOk) {
            savedOk.style.display = 'block';
            setTimeout(() => { savedOk.style.display = 'none'; }, 2000);
        }
    };

    // Кнопка сохранения порядка
    document.getElementById('save-tabs-btn').addEventListener('click', () => {
        persist();
    });

    // Кнопка сброса на начальный порядок
    document.getElementById('reset-tabs-btn').addEventListener('click', () => {
        localStorage.removeItem('tabConfig');
        renderTabs();
        showTabsSavedOk();
    });

    renderTabs();

    // ── Объединение вкладок Whois/DNS/IP-Check в «Проверка домена» ──
    (function initDomainMerge() {
        const tgl = document.getElementById('domain-merge-toggle');
        if (!tgl) return;
        tgl.classList.toggle('on', localStorage.getItem('domainMerge') === '1');
        tgl.addEventListener('click', () => {
            tgl.classList.toggle('on');
            localStorage.setItem('domainMerge', tgl.classList.contains('on') ? '1' : '0');
            renderTabs();      // обновляем список: помечаем/возвращаем объединённые вкладки
            showTabsSavedOk();
        });
    })();

    // ── Стиль вкладок ──────────────────────────────────────────────
    const tsWrap   = document.getElementById('tab-style-wrap');
    const tsScroll = document.getElementById('tab-style-scroll');
    if (tsWrap && tsScroll) {
        const setActiveTabStyle = (value) => {
            const active   = value === 'scroll' ? tsScroll : tsWrap;
            const inactive = value === 'scroll' ? tsWrap   : tsScroll;
            active.style.background  = 'var(--accent)';
            active.style.color       = '#fff';
            active.style.boxShadow   = '0 1px 4px rgba(79,106,255,.4)';
            inactive.style.background = 'transparent';
            inactive.style.color      = 'var(--muted)';
            inactive.style.boxShadow  = 'none';
        };
        chrome.storage.local.get(['tabStyle'], (d) => {
            setActiveTabStyle(d.tabStyle || 'wrap');
        });
        [tsWrap, tsScroll].forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.value;
                chrome.storage.local.set({ tabStyle: value });
                setActiveTabStyle(value);
            });
        });
    }

    // ── Линтер ────────────────────────────────────────────────────
    const enableToggle    = document.getElementById('linter-enabled-toggle');
    const ltToggle        = document.getElementById('linter-languagetool-toggle');
    const ruleToggles     = {
        spelling: document.getElementById('linter-rule-spelling'),
        infostyle: document.getElementById('linter-rule-infostyle'),
        support: document.getElementById('linter-rule-support'),
        typography: document.getElementById('linter-rule-typography')
    };

    // Загружаем состояние линтера
    chrome.storage.local.get(['linterEnabled', 'linterRules', 'linterLanguageTool'], (data) => {
        const enabled = data.linterEnabled !== false;
        const rules   = data.linterRules || { spelling: true, infostyle: true, support: true, typography: true };
        const ltOn    = data.linterLanguageTool !== false;

        enableToggle.classList.toggle('on', enabled);
        if (ltToggle) ltToggle.classList.toggle('on', ltOn);

        for (const [rule, toggle] of Object.entries(ruleToggles)) {
            toggle.classList.toggle('on', rules[rule] !== false);
        }
    });

    // Тоггл включения/выключения линтера
    enableToggle.addEventListener('click', () => {
        const newState = !enableToggle.classList.contains('on');
        enableToggle.classList.toggle('on', newState);
        chrome.storage.local.set({ linterEnabled: newState });
    });

    // Тоггл LanguageTool (онлайн проверка)
    if (ltToggle) {
        ltToggle.addEventListener('click', () => {
            const newState = !ltToggle.classList.contains('on');
            ltToggle.classList.toggle('on', newState);
            chrome.storage.local.set({ linterLanguageTool: newState });
        });
    }

    // Тоггл отдельных правил
    for (const [rule, toggle] of Object.entries(ruleToggles)) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('on');
            chrome.storage.local.get(['linterRules'], (data) => {
                const rules = data.linterRules || { spelling: true, infostyle: true, support: true, typography: true };
                rules[rule] = toggle.classList.contains('on');
                chrome.storage.local.set({ linterRules: rules });
            });
        });
    }

    // Кнопка «Сохранить» — сохраняет все настройки линтера разом
    const saveBtn    = document.getElementById('linter-save-btn');
    const saveStatus = document.getElementById('linter-save-status');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const rules = {};
            for (const [rule, toggle] of Object.entries(ruleToggles)) {
                rules[rule] = toggle.classList.contains('on');
            }
            chrome.storage.local.set({
                linterEnabled: enableToggle.classList.contains('on'),
                linterLanguageTool: ltToggle ? ltToggle.classList.contains('on') : true,
                linterRules: rules
            }, () => {
                if (saveStatus) {
                    saveStatus.textContent = '✓ Настройки сохранены';
                    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
                }
            });
        });
    }

    // ── Тёмная тема для сайтов (Dark Reader-аналог) ──────────────────────
    (function initDarkTheme() {
        const tgl  = document.getElementById('dt-enabled-toggle');
        const sel  = document.getElementById('dt-theme');
        const mode = document.getElementById('dt-mode');
        const excl = document.getElementById('dt-exclusions');
        const btn  = document.getElementById('dt-save-btn');
        const ok   = document.getElementById('dt-saved-ok');
        if (!tgl) return;

        chrome.storage.local.get('darkTheme', (d) => {
            const c = d.darkTheme || {};
            tgl.classList.toggle('on', !!c.enabled);
            if (c.theme) sel.value = c.theme;
            if (c.mode) mode.value = c.mode;
            excl.value = (c.exclusions || []).join('\n');
        });

        tgl.addEventListener('click', () => tgl.classList.toggle('on'));

        btn.addEventListener('click', () => {
            const cfg = {
                enabled: tgl.classList.contains('on'),
                theme: sel.value,
                mode: mode.value,
                exclusions: excl.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean)
            };
            chrome.storage.local.set({ darkTheme: cfg }, () => {
                if (ok) { ok.style.display = 'block'; setTimeout(() => { ok.style.display = 'none'; }, 2000); }
            });
        });
    })();

    // ── Плавающая панель: показывать на всех вкладках ─────────────────────
    (function initFloatEverywhere() {
        const tgl = document.getElementById('float-everywhere-toggle');
        if (!tgl) return;
        chrome.storage.local.get('floatEverywhere', (d) => {
            tgl.classList.toggle('on', d.floatEverywhere !== false); // по умолчанию вкл
        });
        tgl.addEventListener('click', () => {
            const on = !tgl.classList.contains('on');
            tgl.classList.toggle('on', on);
            chrome.storage.local.set({ floatEverywhere: on });
        });
    })();


    // ── Исключения для раздела «Домены» ──────────────────────────────────
    (function initScanExclusions() {
        const input = document.getElementById('s-excl-input');
        const addBtn = document.getElementById('s-excl-add');
        const list = document.getElementById('s-excl-list');
        if (!input || !addBtn || !list) return;

        const norm = (s) => String(s).trim().toLowerCase()
            .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0].replace(/\.$/, '');

        const render = (arr) => {
            list.innerHTML = '';
            if (!arr.length) {
                list.innerHTML = '<div style="font-size:11px;color:var(--muted)">Список пуст</div>';
                return;
            }
            arr.forEach((d) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px';
                const span = document.createElement('span');
                span.textContent = d;
                span.style.cssText = 'font-family:monospace;font-size:12px;word-break:break-all';
                const del = document.createElement('button');
                del.className = 'btn';
                del.textContent = 'Удалить';
                del.style.cssText = 'flex:none;padding:3px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--err);border-radius:5px;cursor:pointer';
                del.addEventListener('click', () => save(arr.filter(x => x !== d)));
                row.appendChild(span); row.appendChild(del);
                list.appendChild(row);
            });
        };

        const save = (arr) => {
            const uniq = [...new Set(arr.map(norm).filter(Boolean))].sort();
            chrome.storage.local.set({ scanExclusions: uniq }, () => render(uniq));
        };

        const load = () => chrome.storage.local.get(['scanExclusions'], (d) => render((d.scanExclusions || []).slice().sort()));

        const add = () => {
            const v = norm(input.value);
            if (!v) return;
            chrome.storage.local.get(['scanExclusions'], (d) => {
                const arr = d.scanExclusions || [];
                arr.push(v);
                input.value = '';
                save(arr);
            });
        };
        addBtn.addEventListener('click', add);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        load();
    })();
})();
