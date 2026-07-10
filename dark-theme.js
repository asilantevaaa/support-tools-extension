/* Тёмная тема для сайтов — минималистичный современный движок.
   Управляется из настроек: chrome.storage.local.darkTheme
   { enabled, theme: gray|blue|oled, mode: smart|filter, exclusions: [] }

   Философия (flat / Linear-Vercel-GitHub Dark):
     • near-black нейтральный фон, мягкая высота (elevation) для разделения зон, а не рамки;
     • тонкие hairline-границы только у полей ввода и крупных панелей;
     • сильно приглушённые акценты, контраст-зависимый текст, плоско (без теней);
     • иконки сохраняют цвет, серые — светлеют. */
(() => {
    const STYLE_ID = '__support_dark_theme__';
    const PROC = '__stdark';
    const host = location.hostname.replace(/^www\./, '');

    // ── Минималистичные палитры ───────────────────────────────────
    // levels: [фон-блоков, панель, карточка, поле] — нейтральные ступени высоты
    const PALETTES = {
        gray: {
            rootBg: '#0d0d0f', rootText: '#e6e6e9',
            hue: 222, sat: 0.03,
            levels: [0.065, 0.100, 0.130, 0.130],
            elevCap: 0.205,
            text: [204, 206, 212], muted: '#8d8e94', link: '#6ea8ff',
            border: [38, 39, 43],        // hairline (мелочь)
            panelBorder: [58, 60, 67],   // заметная рамка панелей/секций
            borderField: [62, 63, 70],   // рамка полей ввода
            scrollThumb: '#2c2d31'
        },
        blue: {
            rootBg: '#0a0d12', rootText: '#dde6f0',
            hue: 214, sat: 0.16,
            levels: [0.070, 0.105, 0.135, 0.135],
            elevCap: 0.205,
            text: [200, 210, 222], muted: '#7f8b9b', link: '#7cc4ff',
            border: [32, 40, 52],
            panelBorder: [50, 64, 84],
            borderField: [54, 68, 88],
            scrollThumb: '#27313e'
        },
        oled: {
            rootBg: '#000000', rootText: '#e2e2e2',
            hue: 0, sat: 0,
            levels: [0.0, 0.070, 0.105, 0.105],
            elevCap: 0.165,
            text: [205, 205, 205], muted: '#808080', link: '#5aa9ff',
            border: [30, 30, 30],
            panelBorder: [52, 52, 52],
            borderField: [56, 56, 56],
            scrollThumb: '#242424'
        }
    };

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'EMBED', 'OBJECT', 'PICTURE', 'NOSCRIPT', 'LINK', 'META', 'HEAD']);
    const STRUCT_TAGS = new Set(['DIV', 'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'ARTICLE', 'UL', 'OL', 'TABLE', 'TBODY', 'THEAD', 'TR', 'FORM', 'FIELDSET', 'BODY', 'HTML', 'DL']);

    function isExcluded(exclusions) {
        return (exclusions || []).some(d => host === d || host.endsWith('.' + d));
    }

    // ── Цветовые утилиты ──────────────────────────────────────────
    function parseColor(str) {
        if (!str) return null;
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(s => parseFloat(s.trim()));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s = 0; const l = (mx + mn) / 2;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return { h, s, l };
    }
    function hslToRgbStr(h, s, l) {
        h /= 360;
        const f = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
        }
        return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }
    const withAlpha = (rgbStr, a) => a < 1 ? rgbStr.replace('rgb(', 'rgba(').replace(')', `, ${a})`) : rgbStr;
    const relLum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    function hexLum(hex) {
        const m = hex.replace('#', '');
        return relLum(parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16));
    }
    const lumOfStr = (str) => { const c = parseColor(str); return c ? relLum(c.r, c.g, c.b) : 0; };
    function isIcon(el) {
        const cn = (typeof el.className === 'string' ? el.className : '') + '';
        return /(?:^|[\s_-])icon(?:[\s_-]|$)|(?:^|\s)(fa|fas|far|fab|glyphicon|material-icons)(?:\s|$)|fa-/.test(cn);
    }

    // ── Решения по цвету ──────────────────────────────────────────
    function surfaceLevelL(origL, P) {
        if (origL < 0.22) return P.levels[0];
        if (origL < 0.55) return P.levels[1];
        if (origL < 0.85) return P.levels[2];
        return P.levels[3];
    }

    // Возвращает { str, lum, lvl(или null если акцент/тинт), alpha }
    function darkBg(c, P, accentEligible, forceNeutral) {
        if (!c || c.a === 0) return null;
        const hsl = rgbToHsl(c.r, c.g, c.b);

        // Нейтрализуем цвет (для ссылок): любой цветной фон → обычная тёмная
        // поверхность без оттенка, чтобы не было синей/цветной заливки.
        if (forceNeutral) {
            const lvl = surfaceLevelL(hsl.l, P);
            const str = hslToRgbStr(P.hue, P.sat, lvl);
            return { str: withAlpha(str, c.a), lum: lumOfStr(str), lvl, alpha: c.a };
        }

        const isAccent = accentEligible && hsl.s > 0.35 && hsl.l > 0.16 && hsl.l < 0.97;

        if (isAccent) {
            // приглушённый акцент (минимализм: сильная десатурация)
            const s = Math.min(hsl.s * 0.6, 0.42);
            const l = Math.min(Math.max(hsl.l, 0.34), 0.44);
            const str = hslToRgbStr(hsl.h, s, l);
            return { str: withAlpha(str, c.a), lum: lumOfStr(str), lvl: null, alpha: c.a };
        }
        // цветная подсветка крупного блока (просрочка/флаг) → тёмный тинт с сохранением оттенка.
        // НО крупные/структурные синие панели (шапки, бары) нейтрализуем в серый,
        // чтобы интерфейс не был «весь синий».
        if (hsl.s > 0.35 && hsl.l > 0.2) {
            const tl = Math.min(Math.max(hsl.l * 0.42, 0.17), 0.24);
            const blueish = hsl.h >= 195 && hsl.h <= 270;
            if (!accentEligible && blueish) {
                const str = hslToRgbStr(0, 0, tl);   // нейтральный серый
                return { str: withAlpha(str, c.a), lum: lumOfStr(str), lvl: null, alpha: c.a };
            }
            const str = hslToRgbStr(hsl.h, Math.min(hsl.s, 0.4), tl);
            return { str: withAlpha(str, c.a), lum: lumOfStr(str), lvl: null, alpha: c.a };
        }
        const lvl = surfaceLevelL(hsl.l, P);
        const str = hslToRgbStr(P.hue, P.sat, lvl);
        return { str: withAlpha(str, c.a), lum: lumOfStr(str), lvl, alpha: c.a };
    }

    function pickText(c, bgLum, P, isIconEl) {
        if (!c) return null;
        const hsl = rgbToHsl(c.r, c.g, c.b);
        const onLight = bgLum > 0.45;
        const satKeep = isIconEl ? 0.3 : 0.5;
        if (hsl.s > satKeep && hsl.l > 0.22) {
            const l = onLight ? 0.30 : (isIconEl ? Math.max(hsl.l, 0.58) : 0.72);
            return hslToRgbStr(hsl.h, Math.min(hsl.s, 0.85), l);
        }
        if (onLight) return 'rgb(22, 23, 26)';
        return `rgb(${P.text[0]}, ${P.text[1]}, ${P.text[2]})`;
    }

    function coloredBorder(c) {
        const hsl = rgbToHsl(c.r, c.g, c.b);
        return hslToRgbStr(hsl.h, Math.min(hsl.s, 0.8), Math.max(hsl.l, 0.55));
    }

    function recolorSvg(el, P) {
        const cs = getComputedStyle(el);
        ['fill', 'stroke'].forEach(prop => {
            const c = parseColor(cs[prop]);
            if (!c || c.a === 0) return;
            const hsl = rgbToHsl(c.r, c.g, c.b);
            let out;
            if (hsl.s > 0.3 && hsl.l > 0.22) out = hslToRgbStr(hsl.h, Math.min(hsl.s, 0.8), Math.max(hsl.l, 0.6));
            else if (hsl.l < 0.6) out = `rgb(${P.text[0]}, ${P.text[1]}, ${P.text[2]})`;
            else return;
            el.style.setProperty(prop, out, 'important');
        });
    }

    function effectiveBgLum(el, P) {
        let n = el;
        while (n && n.nodeType === 1) {
            if (typeof n.__bgLum === 'number') return n.__bgLum;
            n = n.parentElement;
        }
        return P._rootLum;
    }
    function parentSurfL(el) {
        let n = el.parentElement;
        while (n && n.nodeType === 1) {
            if (typeof n.__surfL === 'number') return n.__surfL;
            n = n.parentElement;
        }
        return null;
    }

    // ── Обработка элемента ────────────────────────────────────────
    function processEl(el, P) {
        if (!el || el.nodeType !== 1 || el[PROC]) return;
        if (SKIP_TAGS.has(el.tagName)) return;
        const svgAnc = el.closest && el.closest('svg');
        if (svgAnc) {
            if (svgAnc === el) { el[PROC] = true; try { recolorSvg(el, P); } catch {} return; }
            // внутренние фигуры Highcharts с почти-белой заливкой (фон/полосы простоя) → тёмные;
            // цветные бары (синие/жёлтые) не трогаем
            const cls = (el.getAttribute && el.getAttribute('class')) || '';
            if (/highcharts-(point|column|area|rect|background|plot|grid)/.test(cls)) {
                el[PROC] = true;
                try {
                    const f = parseColor(getComputedStyle(el).fill);
                    if (f && f.a > 0) {
                        const h = rgbToHsl(f.r, f.g, f.b);
                        if (h.s < 0.16 && h.l > 0.78) el.style.setProperty('fill', hslToRgbStr(P.hue, P.sat, P.levels[2]), 'important');
                    }
                } catch {}
            }
            return;
        }
        el[PROC] = true;

        const cs = getComputedStyle(el);
        const area = el.offsetWidth * el.offsetHeight;
        const cn = (typeof el.className === 'string' ? el.className : '') + '';
        // Статус-бейдж тикета (.ticket-status и Angular .ticket-block__status):
        // не трогаем инлайном — стилизацию отдаём CSS-правилу, иначе инлайн перекрывает
        // его и «в процессе» становится нечитаемым.
        if (/ticket-status|ticket-block__status/.test(cn)) return;
        // ExtJS-чекбоксы/радио (управление ролями, флаги) рисуются фон-картинкой-спрайтом
        // (галочка/кружок). Если зальём фоном или уберём картинку — состояние не видно,
        // и кажется, что «управление ролями недоступно». Оставляем нативный контрол.
        if (/\bx-form-checkbox\b|\bx-form-radio\b/.test(cn)) return;
        const icon = isIcon(el);
        const structural = STRUCT_TAGS.has(el.tagName);
        const isBig = area > 45000;
        // Ссылки и legend НЕ делаем акцентной заливкой (иначе синий фон —
        // плохо читается). Цветной фон у них уводим в обычную тёмную поверхность.
        const neutralTag = el.tagName === 'A' || el.tagName === 'LEGEND';
        // Широкая горизонтальная плашка (шапка/баннер сверху тикета): даже если по
        // тегу/размеру она «акцентная», синий фон у такой полосы недопустим —
        // исключаем её из акцентных, чтобы синева ушла в нейтральный серый.
        const isWideBar = el.offsetHeight > 0 && el.offsetHeight < 140 &&
            el.offsetWidth > 480 && el.offsetWidth > (window.innerWidth || 1280) * 0.5;
        const accentEligible = !structural && !isBig && !neutralTag && !isWideBar;
        const slaRow = (el.tagName === 'TD' || el.tagName === 'TR') &&
            el.closest && el.closest('[class*="sla_state"]');
        // Контейнеры, фон которых целиком задаёт baseCss единым цветом (левое меню,
        // секции карты клиента). Для них НЕ выставляем инлайн background-color: иначе
        // inline !important перебивает правило baseCss и цвет «разъезжается»
        // (часть серая, часть чёрная; меню разноцветное).
        // html/body фон задаёт baseCss единым rootBg. Если их красит processEl —
        // html и body получают РАЗНЫЕ ступени серого (16,16,17 и 25,25,26), и страница
        // выходит «половина серая, половина тёмная». Поэтому их фон не трогаем.
        const cssOwnedBg = el.tagName === 'HTML' || el.tagName === 'BODY' ||
            /\b(menu-panel|menu-logo|menu-header|menu-footer|js-main-menu|cpS-menu-two-level|cpS-main-sub-menu|cpS-sub-menu-blk|cpS-sub-menu-cnt|cpS-main-menu-item|cpS-sub-menu-item|customers-wide-fieldset|old-form-box|x-grid-cell|x-grid-td|x-grid-row|menu-sidebar|ant-layout-sider|side-menu|ant-menu)\b/.test(cn) ||
            // ЛЮБОЙ элемент внутри ant-сайдбара (вкл. ссылку-текст <a> без класса меню):
            // фон отдаём целиком baseCss, иначе пункты получают серую плашку за текстом.
            !!(el.closest && el.closest('.menu-sidebar, .side-menu, nz-sider, .ant-menu-submenu-popup'));
        // Карта клиента должна быть ОДНОТОННОЙ: любые контейнеры внутри секций
        // (div, table[bgcolor=white], кастомные sf-block и т.п.) не заливаем разными
        // ступенями высоты — иначе «половина серая, половина тёмная». Делаем их
        // прозрачными, разделение остаётся только по рамкам. Поля ввода, кнопки и
        // бейджи НЕ трогаем — у них собственный фон.
        const cardFlatten = !cssOwnedBg && el.closest &&
            el.closest('.customers-wide-fieldset, .old-form-box, sf-block') &&
            !/^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION|SVG|IMG)$/.test(el.tagName) &&
            !/\b(btn|button|ant-btn|badge|tag|ticket-status|ver-code|toggle|switch|domain-status|domain-state)\b/i.test(cn);

        // ── Фон ──
        let res = null;
        const hasGradient = !slaRow && cs.backgroundImage && /gradient/.test(cs.backgroundImage);
        if (cssOwnedBg) {
            // фон задаёт baseCss — фиксируем только светлоту для выбора цвета текста
            el.__bgLum = 0.15;
        } else if (cardFlatten) {
            el.style.setProperty('background-color', 'transparent', 'important');
            el.__bgLum = 0.11;
        } else if (slaRow) {
            // Фон строки-подсветки отдаём CSS-правилам (см. baseCss). Но текст у нас
            // светлый, а страница форсит ячейкам белый фон (table td{...white!important}),
            // поэтому фиксируем тёмный __bgLum — иначе pickText решит, что фон светлый,
            // и сделает текст тёмным → нечитаемо.
            el.__bgLum = 0.13;
        } else if (hasGradient) {
            if (structural || isBig) {
                el.style.setProperty('background-image', 'none', 'important');
                res = darkBg(parseColor(cs.backgroundColor) || { r: 200, g: 200, b: 200, a: 1 }, P, false);
            }
        } else if ((el.tagName === 'TD' || el.tagName === 'TH') &&
                   !/normal_s|nochange|header_s/.test(cn) &&
                   !(el.closest && el.closest('[class*="sla_state"], .cpS-table, table.list, table.table'))) {
            // Ячейки обычных key-value таблиц (карта аккаунта и т.п.): не даём им
            // отдельный фон — иначе каждая ячейка выглядит «плашкой» на панели.
            // Делаем прозрачными → сливаются с фоном панели/строки.
            el.style.setProperty('background-color', 'transparent', 'important');
        } else if (/specification/.test(cn)) {
            // блок «характеристик» (dl.specification + метки/значения): фон-маска для
            // пунктирных лидеров в тёмной теме превращается в серую плашку за текстом
            // («текст выделяется серым» на главной) — убираем фон у всего блока.
            el.style.setProperty('background-color', 'transparent', 'important');
        } else if (/template-button/.test(cn)) {
            // плашки шаблонов с произвольным HEX — приглушаем в тёмный тинт с
            // сохранением оттенка (иначе яркие синие/фиолетовые «фонарики»).
            const bg = parseColor(cs.backgroundColor);
            if (bg && bg.a > 0) {
                const hsl = rgbToHsl(bg.r, bg.g, bg.b);
                // синие/голубые плашки сильно выделяются — делаем нейтрально тёмно-серыми;
                // остальные оттенки приглушаем в тёмный тинт с сохранением цвета.
                const isBlue = hsl.h >= 195 && hsl.h <= 270 && hsl.s > 0.15;
                const str = isBlue
                    ? hslToRgbStr(P.hue, P.sat, 0.20)
                    : hslToRgbStr(hsl.h, Math.min(hsl.s, 0.45), 0.24);
                el.style.setProperty('background-color', str, 'important');
                el.__bgLum = lumOfStr(str);
            }
        } else {
            const bg = parseColor(cs.backgroundColor);
            if (bg && bg.a > 0) res = darkBg(bg, P, accentEligible, neutralTag);
        }
        if (res) {
            let str = res.str, lum = res.lum;
            if (res.lvl != null) {
                // мягкая высота: вложенная поверхность того же уровня → на ступень светлее
                const pL = parentSurfL(el);
                let lv = res.lvl;
                if (pL != null && lv <= pL + 0.012) lv = Math.min(pL + 0.035, P.elevCap);
                if (lv !== res.lvl) { str = withAlpha(hslToRgbStr(P.hue, P.sat, lv), res.alpha); lum = lumOfStr(str); }
                el.__surfL = lv;
            }
            el.style.setProperty('background-color', str, 'important');
            if (lum >= 0) el.__bgLum = lum;
        } else if (hasGradient) {
            el.__bgLum = 0.45;
        }

        // саппорт vs клиент: лёгкий тинт саппорту, чуть светлее — клиенту
        if (/__staff-comment|staff-comment/.test(cn)) {
            const tint = hslToRgbStr(212, 0.2, 0.135);
            el.style.setProperty('background-color', tint, 'important');
            el.__bgLum = lumOfStr(tint);
            // если автор — бот ("... (Бот)"), помечаем для плашки «Бот»
            if (/ticket-comments-list-item/.test(cn) && !el.classList.contains('__st-bot')) {
                const hdr = el.querySelector('.comment-h');
                if (hdr && /\(\s*бот\s*\)/i.test(hdr.textContent)) el.classList.add('__st-bot');
            }
        } else if (/__simple-comment/.test(cn)) {
            // сообщения клиента — чуть светлее обычной поверхности (читаемее)
            const tint = hslToRgbStr(P.hue, P.sat, 0.175);
            el.style.setProperty('background-color', tint, 'important');
            el.__bgLum = lumOfStr(tint);
        }

        // ── Текст ──
        // Фон статус-бейджа сохраняет оттенок состояния, но текст всё равно
        // приводим к контрастному (раньше пропускали → нечитаемо на тёмном).
        {
            const bgLum = effectiveBgLum(el, P);
            // синий цвет — только у action-ссылок (триггеров), а не у навигационных
            // (темы/отправители в гриде имеют реальный href → остаются обычным текстом).
            let asAction = false;
            if (el.tagName === 'A' && !icon && bgLum < 0.4) {
                const href = el.getAttribute('href');
                const navLink = href && href !== '#' && !/^javascript:/i.test(href);
                const toolbar = /menu-item|operation-menu-item/.test(cn);
                // заголовки сворачиваемых секций (legend) — не подсвечиваем синим
                const inLegend = el.closest && el.closest('legend');
                asAction = !navLink && !toolbar && !inLegend && !el.querySelector('img,svg,i');
            }
            if (asAction) {
                el.style.setProperty('color', P.link, 'important');
            } else {
                const nc = pickText(parseColor(cs.color), bgLum, P, icon);
                if (nc) el.style.setProperty('color', nc, 'important');
            }
        }

        // ── Границы ── (минимализм: hairline; поля заметнее; мелочь — без рамки)
        if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) ||
            parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderRightWidth)) {
            const oc = parseColor(cs.borderTopColor);
            const ohsl = oc && oc.a > 0 ? rgbToHsl(oc.r, oc.g, oc.b) : null;
            const isField = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ||
                /select2-selection|select2-search|k-dropdown|k-textbox|k-input|textbox|form-control|ant-input|ant-select-selector/.test(cn);
            const isCell = el.tagName === 'TD' || el.tagName === 'TH';
            const tinyInline = !structural && /^(SPAN|B|I|EM|SMALL|A|LABEL|STRONG)$/.test(el.tagName);
            // Ячейки гридов и «расчерченных» таблиц несут линии-разделители (border) —
            // если их обнулить, строки/ячейки сливаются (расписание, договоры, списки).
            // Для таких ячеек оставляем видимую hairline-рамку.
            const isGridCell = /x-grid-cell|x-grid-td/.test(cn) ||
                (isCell && el.closest && el.closest('.table-bordered, table.list, .cpS-table, .bordered_table, table.table'));
            if (ohsl && ohsl.s > 0.35) {
                el.style.setProperty('border-color', coloredBorder(oc), 'important');
            } else if (isGridCell) {
                el.style.setProperty('border-color', `rgb(${P.border[0]}, ${P.border[1]}, ${P.border[2]})`, 'important');
            } else if (isField) {
                el.style.setProperty('border-color', `rgb(${P.borderField[0]}, ${P.borderField[1]}, ${P.borderField[2]})`, 'important');
            } else if (isCell || tinyInline) {
                // ячейки таблиц и мелкий инлайн — без рамки (нет ряби)
                el.style.setProperty('border-color', 'transparent', 'important');
            } else if (structural || isBig) {
                // карточки/секции/панели с рамкой — сохраняем рамку видимой (разграничение зон)
                el.style.setProperty('border-color', `rgb(${P.panelBorder[0]}, ${P.panelBorder[1]}, ${P.panelBorder[2]})`, 'important');
            } else {
                el.style.setProperty('border-color', 'transparent', 'important');
            }
        }

        // плоско: убираем падающие тени
        if (cs.boxShadow && cs.boxShadow !== 'none' && !/inset/.test(cs.boxShadow)) {
            el.style.setProperty('box-shadow', 'none', 'important');
        }
    }

    function processSubtree(root, P) {
        if (root.nodeType === 1) { try { processEl(root, P); } catch {} }
        if (root.querySelectorAll) {
            const all = root.querySelectorAll('*');
            for (let i = 0; i < all.length; i++) { try { processEl(all[i], P); } catch {} }
        }
    }

    // ── Базовый CSS ───────────────────────────────────────────────
    function baseCss(P) {
        const bd = `rgb(${P.border[0]}, ${P.border[1]}, ${P.border[2]})`;
        const bdf = `rgb(${P.borderField[0]}, ${P.borderField[1]}, ${P.borderField[2]})`;
        const pb = `rgb(${P.panelBorder[0]}, ${P.panelBorder[1]}, ${P.panelBorder[2]})`;
        const fieldBg = hslToRgbStr(P.hue, P.sat, P.levels[3]);
        return `
            html, body { background-color: ${P.rootBg} !important; color: ${P.rootText} !important; }
            html { color-scheme: dark; }
            ::placeholder { color: ${P.muted} !important; opacity: 1 !important; }
            input, textarea, select { caret-color: ${P.rootText} !important; }
            img, video, picture, canvas { filter: brightness(.94); }
            ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
            ::-webkit-scrollbar-thumb { background: ${P.scrollThumb}; border-radius: 8px; border: 2px solid ${P.rootBg}; }
            ::-webkit-scrollbar-thumb:hover { background: ${bdf}; }
            /* мягкий ховер вместо белой вспышки (точные классы staff + общие) */
            .ticket-main-menu-item:hover, .ticket-main-menu-item:focus,
            [class*="main-menu-item"]:hover, [class*="menu-item"]:hover,
            [class*="ticket-h"]:hover, [class*="ticket-action"]:hover, [class*="-action"]:hover,
            .label-row:hover, [role="button"]:hover, li:hover,
            a:hover, button:hover, [class*="btn"]:hover, [onclick]:hover, [class*="link"]:hover {
                background-color: rgba(255, 255, 255, 0.06) !important;
            }
            .ant-btn:hover, .ant-btn:focus, .ant-btn-dashed:hover, .ant-btn-dangerous:hover {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[3])} !important;
                color: ${P.rootText} !important;
            }
            /* тулбар-кнопки тикета — вид кнопок с рамкой + подсветка при наведении.
               ВАЖНО: сюда НЕ включаем .cpS-sub-menu-item (это пункты левого меню) —
               рамка+padding на них ломали вёрстку меню при наведении. */
            .ticket-main-menu-item, .ticket-operation-menu-item-lk {
                border: 1px solid ${bdf} !important;
                border-radius: 7px !important;
                padding: 6px 10px !important;
                transition: background-color .12s, border-color .12s !important;
            }
            .ticket-main-menu-item:hover, .ticket-operation-menu-item-lk:hover {
                background-color: rgba(255,255,255,0.07) !important;
                border-color: ${pb} !important;
            }
            /* левое меню: ховер пункта — только мягкая подсветка фоном, без рамки и
               без смещения (border/padding меню не трогаем, чтобы вёрстка не «ехала») */
            .cpS-sub-menu-item, .cpS-main-menu-item {
                border: 0 !important;
                transition: background-color .12s !important;
            }
            .cpS-sub-menu-item:hover, .cpS-main-menu-item:hover {
                background-color: rgba(255,255,255,0.07) !important;
            }
            /* Карта клиента: ховер строк таблиц услуг — не белый */
            #services_table tr:hover, #services_table tr:hover > td,
            .customers-wide-fieldset .colored tr:hover td,
            .customers-wide-fieldset table tr:hover > td {
                background-color: rgba(255,255,255,0.07) !important;
                box-shadow: none !important;
                color: ${P.rootText} !important;
            }
            /* статус-бейдж — контрастная читаемая плашка (повтор ниже — финальные стили там) */
            .ticket-status, .ticket-status *, .ticket-block__status, .ticket-block__status * { color: #eaf1ff !important; }
            .ticket-status, .ticket-block__status { background-color: rgba(110,168,255,0.22) !important; border: 1px solid rgba(110,168,255,0.5) !important; border-radius: 5px !important; font-weight: 600 !important; }
            /* подписи Клиент / Саппорт над сообщениями тикета */
            .ticket-comments-list-item { position: relative !important; }
            .ticket-comments-list-item::before {
                content: "Клиент"; position: absolute; top: 0; left: 0; z-index: 3;
                font-size: 9px; font-weight: 600; letter-spacing: .3px; padding: 1px 6px;
                background: #2a2118; color: #d8a566; border-bottom-right-radius: 6px; pointer-events: none;
            }
            .ticket-comments-list-item.__staff-comment::before { content: "Саппорт"; background: #16222e; color: #7fb0d8; }
            .ticket-comments-list-item.__staff-comment.__st-bot::before { content: "Бот"; background: #16261c; color: #7fd8a0; }
            .ticket-comments-list-item.__internal-comment::before { content: "Внутр."; background: #2a2a2e; color: ${P.muted}; }
            .ticket-comments-list-item.__transfer-comment::before { content: "Передан"; background: #26262a; color: ${P.muted}; }
            .ticket-comments-list-item.__trainee-review::before { content: "Стажёр"; background: #2a2118; color: #d8a566; }
            /* поля ввода и виджеты → тёмные с тонкой рамкой */
            input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            select, textarea, option, optgroup,
            .k-dropdown-wrap, .k-list, .k-list-container, .k-animation-container, .k-textbox,
            .k-input, .k-picker, [class*="dropdown"] .k-input,
            .select2-selection, .select2-search__field, .select2-dropdown, .select2-results__option,
            .select2-selection__rendered, .select2-selection__choice,
            [class*="multiselect"], [class*="multi-select"], [class*="-textbox"], [class*="search-field"] {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[3])} !important;
                color: ${P.rootText} !important;
                border: 1px solid ${bdf} !important;
            }
            .select2-results__option--highlighted, .k-state-selected, .k-state-hover { background-color: rgba(255,255,255,0.06) !important; }
            /* ExtJS grid: строки сливались — добавляем зебру, разделители, ховер и
               подсветку выделенной строки, чтобы строки сотрудников различались. */
            .x-grid-cell, .x-grid-td { background-color: transparent !important; }
            .x-grid-row-alt .x-grid-td, .x-grid-row-alt .x-grid-cell {
                background-color: rgba(255, 255, 255, 0.022) !important;
            }
            .x-grid-row:hover .x-grid-td, .x-grid-row-over .x-grid-td,
            .x-grid-item-over .x-grid-td {
                background-color: rgba(255, 255, 255, 0.06) !important;
            }
            .x-grid-item-selected .x-grid-td, .x-grid-row-selected .x-grid-td,
            .x-grid-row-focused .x-grid-td {
                background-color: rgba(255, 255, 255, 0.11) !important;
            }
            .x-grid-header-ct, .x-column-header { border-color: ${bd} !important; }
            /* Расчерченные таблицы (расписание, договоры, списки) сливались — линии
               ячеек были обнулены. Возвращаем сетку, шапку и ховер строк. */
            .table-bordered > thead > tr > th, .table-bordered > tbody > tr > td,
            table.table > thead > tr > th, table.list > thead > tr > th,
            .table-bordered td, .table-bordered th {
                border-color: ${bd} !important;
            }
            .table > thead > tr > th, .table-bordered > thead > tr > th,
            table.list > thead > tr > th {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important;
                color: ${P.rootText} !important;
            }
            .table-bordered > tbody > tr:hover > td, table.table > tbody > tr:hover > td,
            table.list > tbody > tr:hover > td {
                background-color: rgba(255, 255, 255, 0.05) !important;
            }
            /* ExtJS classic: поля и комбобоксы белые, потому что .x-form-text/.x-form-field
               имеют background: url(text-bg.gif) ... white — белая фон-картинка перекрывает
               наш тёмный background-color. Убираем картинку и задаём тёмный фон. */
            .x-form-text, .x-form-field:not(.x-form-checkbox):not(.x-form-radio),
            textarea.x-form-field, input.x-form-field:not(.x-form-checkbox):not(.x-form-radio),
            .x-form-item-body, .x-form-trigger-wrap, .x-form-text-wrap {
                background-image: none !important;
                background-color: ${fieldBg} !important;
                color: ${P.rootText} !important;
                border-color: ${bdf} !important;
            }
            /* ExtJS-чекбоксы/радио — оставляем нативный спрайт (галочку видно). */
            .x-form-checkbox, .x-form-radio {
                background-color: transparent !important;
                border-color: transparent !important;
            }
            /* кнопка-стрелка выпадающего списка (light-спрайт) — инвертируем в тёмную,
               чтобы стрелка осталась видимой, но не была белым квадратом */
            .x-form-trigger, .x-form-trigger-icon, .x-form-spinner-up, .x-form-spinner-down {
                background-color: ${fieldBg} !important;
                border-color: ${bdf} !important;
                filter: invert(0.92) hue-rotate(180deg) !important;
            }
            /* База: ячейки таблиц сразу тёмные (убирает «белый» флэш до обработки JS;
               страница форсит table td{white!important}, наш стиль вставляется последним
               → выигрывает на равной специфичности; sla/header-правила ниже специфичнее). */
            td, th { border-radius: 0 !important; }
            /* Левое меню (саундбар) — целиком единый нейтральный серый: панель,
               логотип, шапка, список пунктов, подменю-вылеты, футер. Серый без
               оттенка палитры (hue/sat=0), чтобы не было синевы и «разноцветности». */
            .menu-panel, .menu-logo,
            .menu-header, .cpS-menu-two-level.menu-header,
            .menu-footer, .cpS-menu-two-level.menu-footer,
            .js-main-menu, .cpS-menu-two-level.js-main-menu,
            .cpS-main-sub-menu, .js-main-submenu,
            .cpS-sub-menu-blk, .cpS-sub-menu-cnt {
                background-color: ${hslToRgbStr(0, 0, 0.155)} !important;
            }
            /* пункты меню — прозрачные, чтобы лежать на едином сером фоне панели */
            .cpS-main-menu-item, .cpS-sub-menu-item {
                background-color: transparent !important;
            }
            /* Новый Angular/ant-design сайдбар (/a/*): сайдбар, меню и раскрытые
               подменю красились в РАЗНЫЕ серые (25 / 33 / 42) — раскрытое подменю
               выглядело как серая плашка за текстом. Сводим всё к одному серому. */
            .menu-sidebar, .ant-layout-sider, .ant-layout-sider-dark,
            .side-menu, .side-menu.ant-menu, .ant-menu-root,
            .menu-sidebar .ant-menu, .menu-sidebar .ant-menu-sub,
            .ant-menu-inline.ant-menu-sub, .ant-menu-submenu-popup .ant-menu,
            .ant-menu-submenu > .ant-menu {
                background-color: ${hslToRgbStr(0, 0, 0.155)} !important;
            }
            /* сами пункты и заголовки подменю — прозрачные (без серых плашек) */
            .menu-sidebar .ant-menu-item, .menu-sidebar .ant-menu-submenu-title,
            .side-menu .ant-menu-item, .side-menu .ant-menu-submenu-title,
            .ant-menu-sub .ant-menu-item,
            .menu-sidebar .ant-menu-item a, .side-menu .ant-menu-item a,
            .ant-menu-sub .ant-menu-item a,
            .menu-sidebar .ant-menu-title-content, .side-menu .ant-menu-title-content {
                background-color: transparent !important;
            }
            /* ховер и выбранный пункт — мягкая подсветка, а не другой серый */
            .menu-sidebar .ant-menu-item:hover, .side-menu .ant-menu-item:hover,
            .menu-sidebar .ant-menu-submenu-title:hover, .ant-menu-sub .ant-menu-item:hover {
                background-color: rgba(255, 255, 255, 0.06) !important;
            }
            .menu-sidebar .ant-menu-item-selected, .side-menu .ant-menu-item-selected,
            .ant-menu-sub .ant-menu-item-selected {
                background-color: rgba(255, 255, 255, 0.12) !important;
            }
            /* блок характеристик на главной — без серой плашки за текстом.
               Пунктирные «лидеры» (точки между подписью и значением) в тёмной теме
               мешают читать текст — убираем сами точки (фон-картинки лидеров). */
            .specification, .specification__label, .specification__value,
            .specification__label-text, .specification__value-text {
                background-color: transparent !important;
                background-image: none !important;
            }
            .specification__label::after, .specification__label::before,
            .specification__value::after, .specification__value::before {
                background-image: none !important; content: none !important;
            }
            /* грид тикетов staff (устойчиво к ре-рендеру) */
            td.normal_s_pointer, td.nochange, td.normal_s {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important; color: ${P.rootText} !important; border-color: transparent !important;
            }
            td.header_s, th.header_s { background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important; color: ${P.rootText} !important; }
            td.normal_s_pointer a, td.nochange a { color: ${P.rootText} !important; }
            /* SLA-подсветка строк. Утроенный класс (.X.X.X td) повышает специфичность
               до (0,3,2) — это гарантированно бьёт правила страницы (вида
               tr.sla_state_X td{...!important}) НЕЗАВИСИМО от порядка стилей, поэтому
               строки не белеют при повторном входе/ре-рендере SPA. */
            tr.sla_state_white.sla_state_white.sla_state_white td,
            tr.sla_state_black.sla_state_black.sla_state_black td,
            tr.sla_state_green.sla_state_green.sla_state_green td { background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important; }
            tr.sla_state_vip.sla_state_vip.sla_state_vip td { background-color: #3a2630 !important; }
            tr.sla_state_red.sla_state_red.sla_state_red td { background-color: #381e1e !important; }
            tr.sla_state_yellow.sla_state_yellow.sla_state_yellow td { background-color: #34301a !important; }
            tr.sla_state_orange.sla_state_orange.sla_state_orange td { background-color: #382a1a !important; }
            tr[class*="sla_state"]:hover > td { filter: brightness(1.22); }
            /* Карта клиента: ОДНОТОННО. Все секции и обёртки форм делаем прозрачными —
               они сливаются с фоном страницы, а разделяются только тонкой рамкой.
               Так не остаётся «половина серая / половина тёмная» из-за того, что одни
               панели залиты, а другие — нет. */
            .customers-wide-fieldset, .old-form-box,
            .customers-wide-fieldset > div, .customers-wide-fieldset > .x-panel,
            .customers-wide-fieldset > .x-panel-body {
                background-color: transparent !important;
            }
            .customers-wide-fieldset {
                border: 1px solid rgb(${P.panelBorder[0]}, ${P.panelBorder[1]}, ${P.panelBorder[2]}) !important;
                border-radius: 8px !important;
                box-sizing: border-box !important;
                overflow: visible !important;
            }
            /* Карта клиента: заголовки секций (legend) — без плашки и без синевы */
            .customers-wide-fieldset legend {
                background-color: transparent !important;
                border-radius: 0 !important; padding: 1px 6px 1px 0 !important;
            }
            /* заголовки секций — обычный светлый текст, без синевы ссылки */
            .customers-wide-fieldset legend, .customers-wide-fieldset legend a,
            .customers-wide-fieldset legend a:link, .customers-wide-fieldset legend a:visited { color: ${P.rootText} !important; }
            .customers-wide-fieldset legend a:hover { background: transparent !important; text-decoration: underline; }
            /* Теги клиента: ховер не белый, текст читаемый */
            .customer-tag-list li:hover { background-color: rgba(255,255,255,0.08) !important; }
            .customer-tag-list li:hover, .customer-tag-list li:hover span { color: ${P.rootText} !important; }
            /* Старые формы (в т.ч. поля сотрудников) — тёмные поля вместо белых */
            .old-form-input input, .old-form-select select,
            .form input, .form select, .form textarea, .form .form-control {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[3])} !important;
                color: ${P.rootText} !important;
                border: 1px solid ${bdf} !important;
            }
            /* ── Фреймворк cp-style-theme / page-tickets (тикеты, отчёт, заказы) ── */
            /* белые панели/блоки → тёмная поверхность */
            .cp-style-theme .cpS-common-block-all-corn,
            .cp-style-theme .cpS-common-block-no-corn,
            .cp-style-theme .cpS-common-block-bottom-corn,
            .cp-style-theme .cpS-common-inner-block-all,
            .cp-style-theme .cpS-common-inner-block-s,
            .cp-style-theme .cpS-operation-panel,
            .cp-style-theme .operation-menu,
            .page-tickets .ticket-comments-blk,
            .page-tickets .ticket-comments-list,
            .page-tickets .ticket-account {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important;
                color: ${P.rootText} !important;
            }
            .cp-style-theme .cpS-table { background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important; }
            .cp-style-theme .cpS-table-h, .cp-style-theme .cpS-table-h-light,
            .cp-style-theme .cpS-table-f, .cp-style-theme .cpS-table th {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important; color: ${P.rootText} !important;
            }
            .cp-style-theme .cpS-table tr:hover, .cp-style-theme .cpS-table tr:hover > td {
                background-color: rgba(255,255,255,0.05) !important;
            }
            /* пагинация и Kendo-дропдауны заявок (SSL/домены) → тёмные */
            .cp-style-theme .pagination li, .cp-style-theme .pagination li > a,
            .cp-style-theme .k-dropdown-wrap, .cp-style-theme .cpS-combobox-input,
            .cp-style-theme .cpS-date-viewer-blk .cpS-input {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[3])} !important;
                color: ${P.rootText} !important;
            }
            /* розовая/жёлтая подсветка строк заявок → спокойный тёмный тинт */
            .cp-style-theme .cpS-table tr.__failed, .cp-style-theme .cpS-table tr.__failed > td { background-color: #381e1e !important; }
            .cp-style-theme .row-accordion.__active, .cp-style-theme .row-accordion.__active > td { background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important; }
            /* бейджи статусов заявок (домены/SSL) — тёмная пилюля + читаемый текст,
               оттенок состояния сохраняем через цветную рамку */
            .cp-style-theme [class*="domain-status_"], .cp-style-theme [class*="domain-type_"],
            .cp-style-theme [class*="domain-payment_"], .cp-style-theme .domain-state {
                background-color: rgba(255,255,255,0.10) !important;
                color: ${P.rootText} !important;
            }
            /* поля ввода фреймворка → тёмные */
            .cp-style-theme .cpS-field-style, .cp-style-theme .cpS-input,
            .cp-style-theme .k-multiselect-wrap, .cp-style-theme .textarea {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[3])} !important;
                color: ${P.rootText} !important;
                border: 1px solid ${bdf} !important;
            }
            /* Ховер кнопок/строк staff не белый. Без префикса .page-tickets/.cp-style-theme —
               тулбар встраивается и в карту клиента без этих обёрток; !important перебивает
               светлый ховер страницы (rgb(230,248,255)/rgb(208,239,255)/white) независимо от специфичности. */
            .ticket-main-menu-item:hover,
            .ticket-main-menu-item.zeroclipboard-is-hover,
            .ticket-operation-menu-item-lk:hover,
            .cpS-sub-menu-item:hover,
            .cpS-dropdown-menu-item:hover,
            .cpS-accordion-item-h:hover,
            .cpS-btn-icon:hover, .cpS-btn-simple:hover,
            .cpS-table.table-hovered tr:hover,
            .cpS-table.table-hovered tr:hover > td {
                background-color: rgba(255,255,255,0.08) !important;
                color: ${P.rootText} !important;
                box-shadow: none !important;
            }
            /* статус-бейдж тикета — контрастная читаемая плашка (.ticket-status + Angular .ticket-block__status) */
            .ticket-status, .ticket-status *, .ticket-block__status, .ticket-block__status * { color: #eaf1ff !important; }
            .ticket-status, .ticket-block__status {
                background-color: rgba(110,168,255,0.22) !important;
                border: 1px solid rgba(110,168,255,0.5) !important;
                border-radius: 5px !important;
                font-weight: 600 !important;
                padding: 1px 9px !important;
            }
            /* Ant Design — тёмные поверхности */
            .ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-input-number-input,
            .ant-select-selector, .ant-picker, .ant-cascader-picker, .ant-mentions, textarea.ant-input,
            .ant-select-dropdown, .ant-picker-panel-container, .ant-dropdown-menu, .ant-popover-inner,
            .ant-card, .ant-card-head, .ant-modal-content, .ant-modal-header, .ant-drawer-content, .ant-drawer-header,
            .ant-collapse, .ant-collapse-content, .ant-collapse-item, .ant-collapse-header,
            .ant-table, .ant-table-container, .ant-table-tbody > tr > td,
            .ant-table-cell, .ant-table-cell-fix-left, .ant-table-cell-fix-right,
            .ant-list, .ant-list-item, .ant-tabs-content-holder, .ant-btn-default,
            .ant-pagination-item, .ant-pagination-item-link, .ant-input-group-addon, .ant-segmented {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important;
                color: ${P.rootText} !important;
                border-color: ${bd} !important;
            }
            .ant-table-thead > tr > th { background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important; color: ${P.rootText} !important; border-color: ${bd} !important; }
            .ant-input::placeholder, .ant-select-selection-placeholder { color: ${P.muted} !important; }
            .ant-table-tbody > tr:hover > td { background-color: rgba(255,255,255,0.04) !important; }
            /* kendo: стрелка/кнопка выпадающего списка (была белой) */
            .k-select, .k-dropdown .k-select, .k-picker-wrap .k-select, .k-dropdown-wrap .k-select,
            .k-numeric-wrap .k-select, .k-i-arrow-s, .k-i-arrow-60-down, .k-button-icon {
                background-color: ${fieldBg} !important; color: ${P.rootText} !important; border-color: ${bdf} !important;
            }
            /* модальные окна / диалоги (напр. «Новый комментарий») */
            .modal, .modal-content, .modal-body, .modal-header, .modal-footer,
            .ui-dialog, .ui-widget-content, .ui-widget-header, .ui-dialog-titlebar,
            [class*="modal__"], [class*="dialog__"], [class*="popup__"], .popup, .popup-content,
            .jconfirm-box, .sweet-alert, .swal2-popup, .fancybox-skin {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important;
                color: ${P.rootText} !important;
                border-color: ${bd} !important;
            }
            /* записи истории/лога (Силантьева … Сгенерирован пароль) → серые карточки с рамкой */
            .comment:not(.comment-form):not(.comment-cnt):not(.comment-h):not(.comment-text):not(.comment-footer) {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important;
                border: 1px solid ${bd} !important;
                border-radius: 6px !important;
                margin-bottom: 6px !important;
                padding: 8px 10px !important;
            }
            /* карта клиента: разделять коллапс-секции рамкой и отступом */
            .ant-collapse-item, fieldset { border: 1px solid ${pb} !important; border-radius: 6px !important; }
            .ant-collapse-item { margin-bottom: 8px !important; }
            .ant-collapse-header, .ant-collapse-content { border-color: ${bd} !important; }
            /* Highcharts (SVG-графики, напр. «Учёт деятельности») — тёмный фон + светлые подписи */
            .highcharts-background { fill: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important; }
            .highcharts-plot-background, .highcharts-plot-border { fill: ${hslToRgbStr(P.hue, P.sat, P.levels[0])} !important; }
            .highcharts-grid-line, .highcharts-tick, .highcharts-axis-line { stroke: ${bd} !important; }
            .highcharts-axis-labels text, .highcharts-axis text, .highcharts-data-labels text,
            .highcharts-title, .highcharts-subtitle, .highcharts-legend-item text,
            .highcharts-yaxis-labels text, .highcharts-xaxis-labels text { fill: ${P.rootText} !important; }
            .highcharts-legend-box { fill: ${hslToRgbStr(P.hue, P.sat, P.levels[1])} !important; stroke: ${bd} !important; }
            .highcharts-tooltip-box { fill: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important; stroke: ${bd} !important; }
            .highcharts-tooltip text { fill: ${P.rootText} !important; }
            /* Ant DatePicker / Calendar / выпадающие панели — частые «белые» поля */
            .ant-picker-panel-container, .ant-picker-panel, .ant-picker-header, .ant-picker-body,
            .ant-picker-cell-inner, .ant-calendar, .ant-calendar-panel, .ant-time-picker-panel-inner,
            .ant-select-item, .ant-select-item-option, .ant-statistic-content, .ant-empty {
                background-color: ${hslToRgbStr(P.hue, P.sat, P.levels[2])} !important; color: ${P.rootText} !important;
            }
            .ant-select-item-option-active, .ant-picker-cell-inner:hover { background-color: rgba(255,255,255,0.06) !important; }
        `;
    }

    function filterCss() {
        return `
            html { filter: invert(0.92) hue-rotate(180deg) !important; background: #fff !important; }
            img, video, picture, canvas, svg, iframe, embed, object, [style*="background-image"] {
                filter: invert(1) hue-rotate(180deg) !important;
            }
        `;
    }

    // ── Применение / снятие ───────────────────────────────────────
    let currentMode = null, currentTheme = null, mo = null;

    let _lastCss = '';
    function injectStyle(css) {
        _lastCss = css;
        let el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(el);
        }
        el.textContent = css;
        return el;
    }
    function keepStyleLast() {
        let el = document.getElementById(STYLE_ID);
        // SPA при перезаходе/ре-рендере может УДАЛИТЬ наш <style> — тогда страница
        // снова красит строки белым. Если тега нет — заново его инжектим.
        if (!el && _lastCss) { el = injectStyle(_lastCss); }
        if (el && el.parentNode && el.parentNode.lastElementChild !== el) el.parentNode.appendChild(el);
    }

    function apply(cfg) {
        remove();
        if (!cfg || !cfg.enabled || isExcluded(cfg.exclusions)) return;
        currentMode = (cfg.mode === 'filter') ? 'filter' : 'smart';
        currentTheme = cfg.theme || 'gray';
        const P = PALETTES[currentTheme] || PALETTES.gray;
        P._rootLum = hexLum(P.rootBg);

        if (currentMode === 'filter') { injectStyle(filterCss()); keepStyleLast(); return; }

        injectStyle(baseCss(P));
        console.log('%c[DarkTheme] v3.24 применена (ExtJS-чекбоксы/радио: вернули спрайт — управление ролями снова видно/работает)', 'color:#7cc4ff');
        const run = () => { try { processSubtree(document.body || document.documentElement, P); } catch {} };
        if (document.body) run();
        else document.addEventListener('DOMContentLoaded', run, { once: true });

        let queued = false; const pending = new Set();
        // Петлю «наша запись style → повторная обработка» гасим тем, что для
        // mutation type=attributes сбрасываем PROC только при смене class
        // (style-мутации, вызванные нами, игнорируем). Чужие мутации НЕ теряем —
        // observer не отключаем (иначе пропадает асинхронно подгружаемый контент).
        mo = new MutationObserver(muts => {
            for (const m of muts) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(n => { if (n.nodeType === 1) pending.add(n); });
                } else if (m.type === 'attributes' && m.target.nodeType === 1) {
                    // только смена class → реальный повод перекрасить заново;
                    // изменение style почти всегда наше собственное → пропускаем
                    if (m.attributeName === 'class') { m.target[PROC] = false; pending.add(m.target); }
                }
            }
            if (!queued && pending.size) {
                queued = true;
                requestAnimationFrame(() => {
                    queued = false;
                    const list = [...pending]; pending.clear();
                    list.forEach(n => { try { processSubtree(n, P); } catch {} });
                    keepStyleLast();
                });
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }

    function remove() {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
        if (mo) { mo.disconnect(); mo = null; }
        try {
            document.querySelectorAll('*').forEach(n => {
                if (n[PROC]) {
                    n.style.removeProperty('background-color');
                    n.style.removeProperty('background-image');
                    n.style.removeProperty('color');
                    n.style.removeProperty('border-color');
                    n.style.removeProperty('box-shadow');
                    n.style.removeProperty('fill');
                    n.style.removeProperty('stroke');
                    n[PROC] = false; n.__bgLum = undefined; n.__surfL = undefined;
                }
            });
        } catch {}
        currentMode = currentTheme = null;
    }

    // ── Старт ─────────────────────────────────────────────────────
    chrome.storage.local.get('darkTheme', d => apply(d.darkTheme));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.darkTheme) apply(changes.darkTheme.newValue);
    });
})();
