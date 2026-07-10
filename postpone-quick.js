/* Быстрое отложение тикета на staff.example.com.
   В модалке «Отложить тикет» над полем даты добавляет панель:
   подпись + кнопки «+1ч…+24ч» (прибавляют часы к текущей дате в поле) + «+N дней».
   Дата проставляется в kendo-datetimepicker input[name="delay_date"]. */
(() => {
    if (location.hostname !== 'staff.example.com') return;
    console.log('%c[Postpone] v3.3 загружен (передача даты через атрибут + фолбэк)', 'color:#7cc4ff');

    // Сеттер в контексте страницы (нужен доступ к kendo/jQuery, недоступным из isolated world).
    // Грузим внешним файлом через runtime.getURL — inline-скрипт блокируется CSP страницы.
    try {
        const pageScript = document.createElement('script');
        pageScript.src = chrome.runtime.getURL('postpone-page.js');
        pageScript.onload = () => pageScript.remove();
        (document.head || document.documentElement).appendChild(pageScript);
    } catch (err) {
        console.warn('[Postpone] Не удалось внедрить page-script:', err);
    }

    const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // Текущее московское время как Date с локальными геттерами (для fmt).
    // Берём стенные значения зоны Europe/Moscow и собираем из них Date —
    // getHours()/getDate() вернут именно московские значения независимо от пояса ПК.
    function moscowNow() {
        try {
            const f = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit',
                day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
            });
            const p = {};
            f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
            const h = p.hour === '24' ? 0 : +p.hour;
            return new Date(+p.year, +p.month - 1, +p.day, h, +p.minute);
        } catch (e) { return new Date(); }
    }

    // текущая дата из поля (dd.mm.yyyy HH:mm). Если пусто/некорректно — сейчас по МСК.
    function currentBase() {
        const inp = document.querySelector('input[name="delay_date"]');
        const v = inp && inp.value && inp.value.trim();
        const m = v && v.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
        if (m) {
            const d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
            if (!isNaN(d)) return d;
        }
        return moscowNow();
    }

    // Поставить в поле конкретную дату
    function setField(d) {
        const val = fmt(d);
        const inp = document.querySelector('input[name="delay_date"]');
        if (inp) inp.setAttribute('data-st-delay', val);
        document.dispatchEvent(new CustomEvent('stSetDelay', { detail: val }));
        if (inp) {
            inp.value = val;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function add(n, unit) {
        const d = currentBase();
        if (unit === 'days') d.setDate(d.getDate() + n);
        else if (unit === 'hours') d.setHours(d.getHours() + n);
        else d.setMinutes(d.getMinutes() + n);
        const val = fmt(d);
        const inp = document.querySelector('input[name="delay_date"]');
        // Значение кладём в DOM-атрибут (надёжно проходит между isolated/page world),
        // page-скрипт читает его и проставляет в kendo-datetimepicker.
        if (inp) inp.setAttribute('data-st-delay', val);
        document.dispatchEvent(new CustomEvent('stSetDelay', { detail: val }));
        // Фолбэк: ставим значение в само поле напрямую. Если есть kendo-виджет,
        // авторитетным остаётся page-скрипт (он вызовет kendo .value()); если нет —
        // сработает это присвоение.
        if (inp) {
            inp.value = val;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    const btnCss = 'padding:3px 8px;font-size:11px;line-height:1.25;border:1px solid rgba(140,140,150,.5);' +
        'border-radius:6px;background:rgba(140,140,150,.16);cursor:pointer;color:inherit;font-family:inherit;';

    function buildPanel(anchor) {
        // не дублируем: панель вставляется перед row (это может быть предок выше
        // anchor.parentNode), поэтому проверку привязываем к самому полю-якорю,
        // иначе при каждом scan панель добавляется заново и интерфейс «едет».
        if (anchor._stPanel && anchor._stPanel.isConnected) return;

        // Простая контролируемая строка (без нативных классов и рамки): всё в одну
        // линию, не переносится.
        const wrap = document.createElement('div');
        wrap.className = 'st-quick-delay';
        wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:nowrap;padding:8px 16px 4px;box-sizing:border-box';

        const clbl = document.createElement('span');
        clbl.textContent = 'Отложить на:';
        clbl.style.cssText = 'white-space:nowrap;flex:0 0 auto';   // шрифт скопируем с нативной подписи ниже

        const ctrlRow = document.createElement('div');
        ctrlRow.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:nowrap';

        const ci = document.createElement('input');
        ci.type = 'number'; ci.min = '1'; ci.value = '1';
        ci.style.cssText = 'width:52px;flex:0 0 auto;padding:3px 5px;font-size:11px;border:1px solid rgba(140,140,150,.5);border-radius:6px;background:transparent;color:inherit';

        // Единицу выбираем кнопками-переключателями (нативный <select> на staff
        // конфликтует с Kendo/стилями страницы и не отображается).
        let unit = 'hours';   // 'minutes' | 'hours' | 'days'
        const unitBase = btnCss + 'flex:0 0 auto;white-space:nowrap;padding:3px 7px;';
        const activeCss = unitBase + 'background:rgba(124,196,255,.30);border-color:rgba(124,196,255,.8);';
        const uMins  = document.createElement('button');
        const uHours = document.createElement('button');
        const uDays  = document.createElement('button');
        uMins.type = uHours.type = uDays.type = 'button';
        uMins.textContent = 'минут'; uHours.textContent = 'часов'; uDays.textContent = 'дней';
        const syncUnits = () => {
            uMins.style.cssText  = unit === 'minutes' ? activeCss : unitBase;
            uHours.style.cssText = unit === 'hours'   ? activeCss : unitBase;
            uDays.style.cssText  = unit === 'days'    ? activeCss : unitBase;
        };
        uMins.addEventListener('click',  e => { e.preventDefault(); unit = 'minutes'; syncUnits(); });
        uHours.addEventListener('click', e => { e.preventDefault(); unit = 'hours';   syncUnits(); });
        uDays.addEventListener('click',  e => { e.preventDefault(); unit = 'days';    syncUnits(); });
        syncUnits();

        const cb = document.createElement('button');
        cb.type = 'button'; cb.textContent = 'Применить';
        cb.style.cssText = btnCss + 'flex:0 0 auto;white-space:nowrap;font-weight:600;padding:3px 10px;';

        // Кнопка «Сейчас (МСК)» — ставит в поле текущее московское время
        const nowb = document.createElement('button');
        nowb.type = 'button'; nowb.textContent = 'Сейчас (МСК)';
        nowb.title = 'Поставить текущее московское время';
        nowb.style.cssText = btnCss + 'flex:0 0 auto;white-space:nowrap;padding:3px 10px;background:rgba(124,196,255,.18);border-color:rgba(124,196,255,.5);';
        nowb.addEventListener('click', e => { e.preventDefault(); setField(moscowNow()); });

        const applyCustom = () => {
            const n = parseInt(ci.value, 10) || 1;
            add(n, unit);
        };
        cb.addEventListener('click', e => { e.preventDefault(); applyCustom(); });
        ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } });

        ctrlRow.appendChild(nowb); ctrlRow.appendChild(ci); ctrlRow.appendChild(uMins);
        ctrlRow.appendChild(uHours); ctrlRow.appendChild(uDays); ctrlRow.appendChild(cb);
        wrap.appendChild(clbl); wrap.appendChild(ctrlRow);

        // Вставляем НИЖЕ всего блока полей, ВНЕ контейнера-сетки .cpS-input-list:
        // если положить панель внутрь сетки, она становится лишней ячейкой и ломает
        // ширину колонок (поля «Сообщение/Отложен» сужаются и съезжают).
        anchor._stPanel = wrap;   // запоминаем привязку к полю
        const list = anchor.closest('.cpS-input-list');
        const refLabel = anchor.closest('.cpS-title-subject-row')?.querySelector('.cpS-title-col, .cpS-label')
            || (list && list.querySelector('.cpS-title-col, .cpS-label'));
        if (list && list.parentNode) {
            list.parentNode.insertBefore(wrap, list.nextSibling);
        } else {
            const row = anchor.closest('.js-state-delay-row') || anchor.closest('.cpS-title-subject-row') || anchor.parentNode;
            row.parentNode.insertBefore(wrap, row.nextSibling);
        }
        // Выравниваем левый край подписи «Отложить на:» по нативным подписям
        // (Сообщение/Отложен): подгоняем левый отступ под реальную позицию их текста.
        if (refLabel) {
            try {
                const cs = getComputedStyle(refLabel);
                const padL = parseFloat(cs.paddingLeft) || 0;
                const target = refLabel.getBoundingClientRect().left + padL; // где начинается текст подписи
                const delta = target - wrap.getBoundingClientRect().left;
                wrap.style.paddingLeft = Math.max(0, Math.round(delta)) + 'px';
                // Копируем шрифт нативной подписи, чтобы «Отложить на:» не отличалось
                clbl.style.fontFamily = cs.fontFamily;
                clbl.style.fontSize = cs.fontSize;
                clbl.style.fontWeight = cs.fontWeight;
                clbl.style.color = cs.color;
                wrap.style.fontFamily = cs.fontFamily;   // те же шрифты у полей/кнопок
            } catch (_) {}
        }
    }

    function scan() {
        document.querySelectorAll('input[name="delay_date"]').forEach(inp => {
            if (inp.offsetParent !== null) buildPanel(inp);  // только видимое поле (открытая модалка)
        });
    }

    // Троттлим scan через requestAnimationFrame: на тяжёлой SPA мутации идут
    // пачками, и buildPanel сам добавляет узлы → без троттла observer молотит без конца.
    let scanScheduled = false;
    const scheduleScan = () => {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => { scanScheduled = false; scan(); });
    };

    const mo = new MutationObserver(scheduleScan);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    scan();
})();
