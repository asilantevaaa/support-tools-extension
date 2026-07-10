/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ГИБРИДНЫЙ ЛИНТЕР — LanguageTool API + Custom Rules Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Архитектура:
 * 1. LanguageTool API (орфография, грамматика, пунктуация)
 * 2. Custom Rule Engine (корпоративные правила)
 * 3. Merge Manager (объединение + разрешение конфликтов)
 * 4. Единый формат выходных данных
 */

(function() {
    if (window._linterHybridInitialized) return;
    window._linterHybridInitialized = true;

    const LINTER_VERSION = 'v6-настройки';
    console.log('[HybridLinter] 🚀 Инициализация началась — ВЕРСИЯ: ' + LINTER_VERSION);

    // ═════════════════════════════════════════════════════════════════════
    // НАСТРОЙКИ (из chrome.storage, с живым обновлением)
    // ═════════════════════════════════════════════════════════════════════

    const SETTINGS = {
        enabled: true,        // мастер-выключатель линтера
        languageTool: true,   // онлайн-проверка LanguageTool
        customRules: true     // корпоративные правила
    };

    function loadSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['linterEnabled', 'linterLanguageTool'], (data) => {
                    try {
                        if (chrome.runtime.lastError) return;
                        SETTINGS.enabled = data.linterEnabled !== false;
                        SETTINGS.languageTool = data.linterLanguageTool !== false;
                        // Перепроверяем все поля при изменении настроек
                        document.querySelectorAll('textarea, [contenteditable]').forEach(el => {
                            if (el._hybridUI) el._hybridUI.check();
                        });
                    } catch (_) {}
                });
                // Живое обновление при изменении в настройках
                if (chrome.storage.onChanged) {
                    chrome.storage.onChanged.addListener((changes, area) => {
                        if (area !== 'local') return;
                        if (changes.linterEnabled) SETTINGS.enabled = changes.linterEnabled.newValue !== false;
                        if (changes.linterLanguageTool) SETTINGS.languageTool = changes.linterLanguageTool.newValue !== false;
                        document.querySelectorAll('textarea, [contenteditable]').forEach(el => {
                            if (el._hybridUI) el._hybridUI.check();
                        });
                    });
                }
            }
        } catch (_) {}
    }
    loadSettings();

    // ═════════════════════════════════════════════════════════════════════
    // КОНФИГУРАЦИЯ
    // ═════════════════════════════════════════════════════════════════════

    const CONFIG = {
        // API LanguageTool
        languageToolUrl: 'https://api.languagetool.org/v2/check',
        language: 'ru',
        debounceMs: 1200,

        // Custom Rules (корпоративный стиль)
        customRules: [
        ]
    };


    // Экранирование спецсимволов для regex
    function escapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


    // ═════════════════════════════════════════════════════════════════════
    // 1. LANGUAGETOOL CLIENT
    // ═════════════════════════════════════════════════════════════════════

    class LanguageToolClient {
        constructor(config) {
            this.url = config.languageToolUrl;
            this.language = config.language;
            this.debounceMs = config.debounceMs;
            this.cache = new Map();
            this.debounceTimer = null;
            this.isAvailable = true; // Флаг доступности API
        }

        // Простое хеширование текста для кеша
        hashText(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Конвертируем в 32-bit
            }
            return hash.toString(36);
        }

        // Основной метод с debounce и кешем
        async check(text) {
            return new Promise((resolve) => {
                // Резолвим предыдущий висящий promise, чтобы не было утечек
                if (this._pendingResolve) {
                    this._pendingResolve([]);
                    this._pendingResolve = null;
                }
                clearTimeout(this.debounceTimer);
                this._pendingResolve = resolve;

                this.debounceTimer = setTimeout(async () => {
                    this._pendingResolve = null;
                    // Проверяем кеш
                    const hash = this.hashText(text);
                    if (this.cache.has(hash)) {
                        console.log('[HybridLinter] 📦 Используем кеш для LanguageTool');
                        resolve(this.cache.get(hash));
                        return;
                    }

                    // Если API недоступен или выключен в настройках
                    if (!this.isAvailable || !SETTINGS.languageTool) {
                        resolve([]);
                        return;
                    }

                    try {
                        // Проверяем что контекст расширения ЖИВ (chrome.runtime.id есть
                        // только пока content script не осиротел после перезагрузки)
                        const ctxValid = (() => {
                            try {
                                return !!(typeof chrome !== 'undefined' &&
                                          chrome.runtime && chrome.runtime.id);
                            } catch (_) { return false; }
                        })();

                        if (!ctxValid) {
                            // Контекст мёртв — навсегда отключаем API в этом скрипте
                            this.isAvailable = false;
                            resolve([]);
                            return;
                        }

                        // Запрос через background worker (без CORS-проблем)
                        const response = await new Promise((res) => {
                            try {
                                chrome.runtime.sendMessage({
                                    action: 'languageToolCheck',
                                    text: text,
                                    language: this.language,
                                    url: this.url
                                }, (resp) => {
                                    // Безопасно читаем lastError (может бросить если контекст умер)
                                    let lastErr = null;
                                    try { lastErr = chrome.runtime.lastError; } catch (_) {}
                                    res(lastErr ? null : resp);
                                });
                            } catch (e) {
                                // Контекст умер прямо во время вызова — отключаем
                                this.isAvailable = false;
                                res(null);
                            }
                        });

                        if (!response || !response.success) {
                            resolve([]);
                            return;
                        }

                        const matches = response.matches || [];

                        // Фильтруем только важные ошибки (орфография, пунктуация)
                        const filtered = matches.filter(m => {
                            const ruleId = m.rule?.id || '';
                            const category = m.rule?.category?.id || '';
                            // Включаем опечатки, пунктуацию, грамматику; не стилистику
                            return ruleId.includes('HUNSPELL') ||
                                   ruleId.includes('MORFOLOGIK') ||
                                   category === 'TYPOS' ||
                                   category === 'PUNCTUATION' ||
                                   category === 'GRAMMAR';
                        });

                        // Кешируем результат
                        this.cache.set(hash, filtered);
                        console.log(`[HybridLinter] ✓ LanguageTool: ${filtered.length} ошибок (из ${matches.length})`);

                        resolve(filtered);
                    } catch (err) {
                        // Тихо отключаем при любой ошибке контекста (без красных логов)
                        const msg = String(err && err.message || err);
                        if (msg.includes('context invalidated') || msg.includes('sendMessage')) {
                            this.isAvailable = false;
                        }
                        resolve([]);
                    }
                }, this.debounceMs);
            });
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. CUSTOM RULE ENGINE
    // ═════════════════════════════════════════════════════════════════════

    class CustomRuleEngine {
        constructor(rules) {
            this.rules = rules.map(rule => ({
                ...rule,
                regex: new RegExp(rule.regex, rule.flags)
            }));
        }

        check(text) {
            const errors = [];

            for (const rule of this.rules) {
                rule.regex.lastIndex = 0;
                let match;
                while ((match = rule.regex.exec(text)) !== null) {
                    const matchedText = match[0].trim();
                    // Находим точный индекс matchedText внутри совпадения
                    // (правильно для пробела как СПЕРЕДИ, так и СЗАДИ)
                    const startOffset = match.index + match[0].indexOf(matchedText);

                    // Защита от бесконечного цикла при пустом совпадении
                    if (match[0].length === 0) { rule.regex.lastIndex++; continue; }

                    errors.push({
                        source: 'custom_rules',
                        ruleId: rule.id,
                        type: rule.level,
                        message: rule.message,
                        offset: startOffset,
                        length: matchedText.length,
                        context: matchedText,
                        replacements: rule.suggestions || []
                    });
                }
            }

            // Спец-логика: "Вы" с большой буквы ВНУТРИ предложения (не в начале)
            // Ловим "Вы" только если ДО НЕГО есть буква/цифра + пробел
            const vyRegex = /[а-яА-ЯёЁ0-9]\s+(Вы)\b/g;
            let vyMatch;
            while ((vyMatch = vyRegex.exec(text)) !== null) {
                const vyPos = vyMatch.index + vyMatch[0].indexOf('Вы');
                errors.push({
                    source: 'custom_rules',
                    ruleId: 'CRIT_VY_CAPITAL',
                    type: 'critical',
                    message: '"Вы" внутри предложения можно изменить → "вы" (строчная)',
                    offset: vyPos,
                    length: 2,
                    context: 'Вы',
                    replacements: ['вы']
                });
            }

            return errors;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. MERGE MANAGER
    // ═════════════════════════════════════════════════════════════════════

    class MergeManager {
        static merge(customErrors, apiErrors) {
            // Если есть ошибки Custom Rules, они имеют приоритет
            // Удаляем ошибки API, которые пересекаются с Custom Rules

            const merged = [...customErrors];

            for (const apiError of apiErrors) {
                let isOverlapping = false;

                for (const customError of customErrors) {
                    // Проверяем пересечение диапазонов
                    if (this.rangesOverlap(
                        apiError.offset, apiError.offset + apiError.length,
                        customError.offset, customError.offset + customError.length
                    )) {
                        isOverlapping = true;
                        console.log(`[HybridLinter] 🔄 Конфликт разрешён: Custom Rule имеет приоритет`);
                        break;
                    }
                }

                // Добавляем ошибку API, если нет пересечения
                if (!isOverlapping) {
                    // Извлекаем контекст из LanguageTool формата
                    const contextText = apiError.context?.text
                        ? apiError.context.text.substring(
                            apiError.context.offset,
                            apiError.context.offset + apiError.context.length
                          )
                        : '';

                    merged.push({
                        source: 'languagetool_api',
                        ruleId: apiError.rule?.id || 'UNKNOWN',
                        type: 'error',
                        message: apiError.shortMessage || apiError.message || 'Ошибка LanguageTool',
                        offset: apiError.offset,
                        length: apiError.length,
                        context: contextText,
                        replacements: (apiError.replacements || []).slice(0, 3).map(r => r.value || r)
                    });
                }
            }

            // Сортируем по offset
            return merged.sort((a, b) => a.offset - b.offset);
        }

        static rangesOverlap(start1, end1, start2, end2) {
            return start1 < end2 && start2 < end1;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. HYBRID VALIDATOR (главный класс)
    // ═════════════════════════════════════════════════════════════════════

    class HybridValidator {
        constructor(config) {
            this.languageTool = new LanguageToolClient(config);
            this.customEngine = new CustomRuleEngine(config.customRules);
            this.lastValidationTime = 0;
        }

        async validateText(text) {
            if (!text) return [];

            console.log(`[HybridLinter] 🔍 Проверка текста: "${text.substring(0, 50)}..."`);

            // Запускаем обе проверки параллельно
            const [customErrors, apiErrors] = await Promise.all([
                Promise.resolve(this.customEngine.check(text)),
                this.languageTool.check(text)
            ]);

            console.log(`[HybridLinter] Custom Rules: ${customErrors.length}, LanguageTool: ${apiErrors.length}`);

            // Объединяем с разрешением конфликтов
            const merged = MergeManager.merge(customErrors, apiErrors);

            console.log(`[HybridLinter] ✓ Итого ошибок: ${merged.length}`);

            return merged;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 5. UI LAYER (интеграция с текстовым полем)
    // ═════════════════════════════════════════════════════════════════════

    // Инжектим CSS для ::highlight() один раз на страницу
    function injectHighlightStyles() {
        if (document.getElementById('lt-highlight-styles')) return;
        const style = document.createElement('style');
        style.id = 'lt-highlight-styles';
        style.textContent = `
            ::highlight(lt-critical) {
                background-color: rgba(239, 68, 68, 0.28);
                text-decoration: underline wavy #ef4444;
                text-decoration-skip-ink: none;
            }
            ::highlight(lt-warning) {
                background-color: rgba(245, 158, 11, 0.30);
                text-decoration: underline wavy #f59e0b;
                text-decoration-skip-ink: none;
            }
        `;
        document.head.appendChild(style);
    }

    class HybridLinterUI {
        constructor(el, validator) {
            this.textarea = el;       // может быть textarea ИЛИ contenteditable
            this.isCE = (el.tagName !== 'TEXTAREA'); // contenteditable?
            this.validator = validator;
            this.popup = null;        // плавающий popup LanguageTool-стиль
            this.errors = [];
            this.debounceTimer = null;
            this._ignored = new Set();
            this._errorRanges = [];   // [{err, range}] для contenteditable
            // CSS Custom Highlight API — точная подсветка DOM-диапазонов (без overlay)
            this.useHighlightAPI = this.isCE && !!(window.CSS && CSS.highlights);
            this.init();
        }

        // Получить текст (для contenteditable — textContent для точного маппинга)
        getText() {
            return this.isCE ? this.textarea.textContent : this.textarea.value;
        }

        // Установить текст
        setText(v) {
            if (this.isCE) {
                this.textarea.textContent = v;
            } else {
                this.textarea.value = v;
            }
        }

        init() {
            if (!window._hybridLinterInstances) window._hybridLinterInstances = new Set();
            window._hybridLinterInstances.add(this);
            this.createPopup();

            if (this.useHighlightAPI) {
                // Точная подсветка через CSS Highlight API
                injectHighlightStyles();
                this.textarea.addEventListener('click', (e) => this._onEditorClick(e));
            } else {
                // Fallback: overlay (для textarea или старых браузеров)
                this.setupOverlay();
                this.textarea.addEventListener('scroll', () => this.syncScroll());
            }

            this.textarea.addEventListener('input', () => this.debounceCheck());
            this.textarea.addEventListener('focus', () => this.check());

            // Закрываем popup при клике вне (ссылку храним для снятия в destroy)
            this._onDocClick = (e) => {
                if (this.popup && !this.popup.contains(e.target) &&
                    e.target !== this.textarea && !this.textarea.contains(e.target)) {
                    this.hidePopup();
                }
            };
            document.addEventListener('click', this._onDocClick);

            console.log('[HybridLinter] ✓ UI инициализирован (' +
                (this.useHighlightAPI ? 'CSS Highlight API' : 'overlay') + ')');
        }

        // ── Полная очистка: вызывается при удалении поля из DOM ──────────
        destroy() {
            // Останавливаем RAF-цикл синхронизации overlay
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
            // Снимаем глобальные слушатели
            if (this._reposition) {
                window.removeEventListener('scroll', this._reposition, true);
                window.removeEventListener('resize', this._reposition);
                this._reposition = null;
            }
            if (this._onDocClick) {
                document.removeEventListener('click', this._onDocClick);
                this._onDocClick = null;
            }
            // Сбрасываем отложенную проверку
            if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
            // Удаляем overlay и popup из DOM
            if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
            if (this.popup && this.popup.parentNode) this.popup.parentNode.removeChild(this.popup);
            this.overlay = null; this.popup = null;
            // Чистим подсветку Highlight API только если это последний инстанс
            if (this.useHighlightAPI && window.CSS && CSS.highlights) {
                try {
                    if (window._hybridLinterInstances) window._hybridLinterInstances.delete(this);
                    const remaining = window._hybridLinterInstances
                        ? [...window._hybridLinterInstances].filter(i => i.useHighlightAPI)
                        : [];
                    if (remaining.length === 0) {
                        CSS.highlights.delete('lt-critical');
                        CSS.highlights.delete('lt-warning');
                    } else {
                        // Перерисовываем подсветки оставшихся инстансов
                        remaining.forEach(i => i.renderHighlightsCE());
                    }
                } catch (_) {}
            } else if (window._hybridLinterInstances) {
                window._hybridLinterInstances.delete(this);
            }
            this._errorRanges = [];
            // Снимаем ссылку, чтобы поле можно было привязать заново
            if (this.textarea) { this.textarea._hybridUI = null; this.textarea._hybridOverlay = null; }
        }

        // ── Собираем текстовые узлы с их глобальными смещениями ──────────
        _collectTextNodes() {
            const walker = document.createTreeWalker(this.textarea, NodeFilter.SHOW_TEXT, null);
            const nodes = [];
            let offset = 0;
            let node;
            while ((node = walker.nextNode())) {
                const len = node.textContent.length;
                nodes.push({ node, start: offset, end: offset + len });
                offset += len;
            }
            return nodes;
        }

        // Глобальный offset → {node, offsetInNode}
        _offsetToPoint(offset, nodes) {
            for (const n of nodes) {
                if (offset >= n.start && offset <= n.end) {
                    return { node: n.node, offset: offset - n.start };
                }
            }
            // За пределами — последний узел
            const last = nodes[nodes.length - 1];
            return last ? { node: last.node, offset: last.node.textContent.length } : null;
        }

        // (node, offsetInNode) → глобальный offset
        _pointToOffset(node, offsetInNode, nodes) {
            for (const n of nodes) {
                if (n.node === node) return n.start + offsetInNode;
            }
            return -1;
        }

        // Клик по редактору → ищем ошибку под курсором → popup
        // Геометрическая проверка: попал ли клик в прямоугольник подсветки
        _onEditorClick(e) {
            for (const er of this._errorRanges) {
                const rects = er.range.getClientRects();
                for (const r of rects) {
                    if (e.clientX >= r.left && e.clientX <= r.right &&
                        e.clientY >= r.top && e.clientY <= r.bottom) {
                        e.stopPropagation();
                        this.showPopup(er.err, er.range);
                        return;
                    }
                }
            }
        }

        // ── Создаём overlay ПОВЕРХ textarea (position: fixed) ───────────
        setupOverlay() {
            if (this.textarea._hybridOverlay) return;

            const overlay = document.createElement('div');
            overlay.className = 'lt-overlay';
            overlay.style.cssText = `
                position: fixed;
                pointer-events: none;
                overflow: hidden;
                z-index: 999999;
                color: transparent;
                white-space: pre-wrap;
                word-wrap: break-word;
                box-sizing: border-box;
                margin: 0;
                background: transparent;
            `;
            document.body.appendChild(overlay);

            this.overlay = overlay;
            this.textarea._hybridOverlay = overlay;

            // Обновляем позицию overlay при скролле/ресайзе
            this._reposition = () => this.repositionOverlay();
            window.addEventListener('scroll', this._reposition, true);
            window.addEventListener('resize', this._reposition);

            // Непрерывная синхронизация через requestAnimationFrame
            // (SPA-сайт динамически пересоздаёт layout)
            const rafLoop = () => {
                // Работаем только когда есть что показывать
                if (this.overlay.childNodes.length > 0) {
                    if (!document.body.contains(this.overlay)) {
                        document.body.appendChild(this.overlay);
                    }
                    this.repositionOverlay(false); // лёгкое — только координаты
                    this.syncScroll();
                }
                this._rafId = requestAnimationFrame(rafLoop);
            };
            this._rafId = requestAnimationFrame(rafLoop);
        }

        // Позиционируем overlay точно поверх textarea
        // copyStyles=true — копируем шрифт/отступы (дорого, делаем при рендере)
        repositionOverlay(copyStyles = true) {
            if (!this.overlay) return;
            const ta = this.textarea;
            const rect = ta.getBoundingClientRect();

            // Если textarea скрыт — прячем overlay
            if (rect.width === 0 || rect.height === 0) {
                this.overlay.style.display = 'none';
                return;
            }
            this.overlay.style.display = 'block';
            this.overlay.style.top = rect.top + 'px';
            this.overlay.style.left = rect.left + 'px';
            this.overlay.style.width = rect.width + 'px';
            this.overlay.style.height = rect.height + 'px';

            if (copyStyles) {
                const cs = window.getComputedStyle(ta);
                ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing',
                 'paddingTop','paddingRight','paddingBottom','paddingLeft',
                 'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
                 'textAlign','textIndent','whiteSpace','wordWrap','wordBreak'].forEach(prop => {
                    this.overlay.style[prop] = cs[prop];
                });
                this.overlay.style.borderStyle = 'solid';
                this.overlay.style.borderColor = 'transparent';
            }
        }

        syncScroll() {
            if (this.overlay) {
                // Сдвигаем содержимое overlay в соответствии со скроллом textarea
                this.overlay.scrollTop = this.textarea.scrollTop;
                this.overlay.scrollLeft = this.textarea.scrollLeft;
            }
        }

        // ── Рисуем подсветки ────────────────────────────────────────────
        renderHighlights() {
            if (this.useHighlightAPI) {
                this.renderHighlightsCE();
                return;
            }
            this.renderHighlightsOverlay();
        }

        // Подсветка через CSS Custom Highlight API (точно по DOM)
        renderHighlightsCE() {
            const nodes = this._collectTextNodes();
            const sorted = [...this.errors].filter(e => !this._isIgnored(e))
                .sort((a, b) => a.offset - b.offset);

            const critRanges = [];
            const warnRanges = [];
            this._errorRanges = [];

            sorted.forEach(err => {
                const s = this._offsetToPoint(err.offset, nodes);
                const e = this._offsetToPoint(err.offset + err.length, nodes);
                if (!s || !e) return;
                const range = document.createRange();
                try {
                    range.setStart(s.node, s.offset);
                    range.setEnd(e.node, e.offset);
                } catch (_) { return; }

                this._errorRanges.push({ err, range });
                if (err.type === 'warning') warnRanges.push(range);
                else critRanges.push(range);
            });

            // Регистрируем подсветки глобально
            try {
                CSS.highlights.set('lt-critical', new Highlight(...critRanges));
                CSS.highlights.set('lt-warning', new Highlight(...warnRanges));
            } catch (err) {
                console.warn('[HybridLinter] Highlight API ошибка:', err);
            }
        }

        // ── Рисуем подсветки через overlay (fallback для textarea) ───────
        renderHighlightsOverlay() {
            if (!this.overlay) return;
            this.repositionOverlay();

            const text = this.getText();
            const sorted = [...this.errors].filter(e => !this._isIgnored(e))
                .sort((a, b) => a.offset - b.offset);

            let html = '';
            let pos = 0;
            sorted.forEach((err, i) => {
                if (err.offset < pos) return;
                html += this._escape(text.substring(pos, err.offset));
                // Полупрозрачная подсветка — реальный текст просвечивает снизу
                const bg = err.type === 'warning' ? 'rgba(245,158,11,0.30)'
                    : 'rgba(239,68,68,0.28)';
                const underline = err.type === 'warning' ? '#f59e0b' : '#ef4444';
                html += `<mark class="lt-mark" data-idx="${i}" style="
                    background: ${bg};
                    border-bottom: 2px solid ${underline};
                    border-radius: 2px;
                    color: transparent;
                    cursor: pointer;
                    pointer-events: auto;
                ">${this._escape(text.substring(err.offset, err.offset + err.length))}</mark>`;
                pos = err.offset + err.length;
            });
            html += this._escape(text.substring(pos));

            this.overlay.innerHTML = html;

            // Клик по подсветке → popup
            this.overlay.querySelectorAll('.lt-mark').forEach(mark => {
                mark.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(mark.dataset.idx);
                    this.showPopup(sorted[idx], mark);
                });
            });

            this.syncScroll();
        }

        _escape(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        // ── Плавающий popup в стиле LanguageTool ────────────────────────
        createPopup() {
            const popup = document.createElement('div');
            popup.className = 'lt-popup';
            popup.style.cssText = `
                position: absolute;
                display: none;
                z-index: 2147483647;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                box-shadow: 0 8px 28px rgba(0,0,0,0.18);
                width: 300px;
                font-family: -apple-system, 'Segoe UI', sans-serif;
                overflow: hidden;
            `;
            document.body.appendChild(popup);
            this.popup = popup;
        }

        showPopup(err, anchorEl) {
            if (!err) return;
            this._activeErr = err;
            // Сохраняем Range (для contenteditable — чтобы заменить точечно)
            this._activeRange = (anchorEl instanceof Range) ? anchorEl : null;

            const accentColor = err.type === 'warning' ? '#f59e0b' : '#ef4444';

            // Заголовок ошибки (до →)
            const title = err.message.split('→')[0].trim();
            // Описание (после → или полное)
            const desc = err.message.includes('→')
                ? 'Замените на: ' + err.message.split('→')[1].trim()
                : err.message;

            // Кнопки-замены
            let buttons = '';
            (err.replacements || []).slice(0, 3).forEach((rep, ri) => {
                if (!rep) return;
                const label = rep === '(убрать)' ? 'убрать' : rep;
                buttons += `<button class="lt-apply" data-rep="${ri}" style="
                    background: #1c64f2;
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    padding: 7px 14px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    margin-right: 6px;
                ">${label}</button>`;
            });

            this.popup.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    border-bottom: 1px solid #f0f0f0;
                ">
                    <span style="background:#1c64f2;color:#fff;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;">LT</span>
                    <span style="font-weight:600;color:#111827;font-size:14px;flex:1;">Корректировка <span style="font-size:9px;color:#9ca3af;font-weight:400;">v6</span></span>
                    <span class="lt-close" style="cursor:pointer;color:#9ca3af;font-size:18px;line-height:1;">×</span>
                </div>
                <div style="padding: 12px 14px;">
                    <div style="font-weight:600;color:${accentColor};margin-bottom:6px;font-size:13px;">
                        ${title}
                    </div>
                    <div style="color:#374151;font-size:13px;margin-bottom:12px;line-height:1.4;">
                        Найдено: «<b>${err.context}</b>». ${desc}
                    </div>
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                        ${buttons}
                        <button class="lt-ignore" style="
                            background:#f3f4f6;color:#374151;border:none;border-radius:8px;
                            padding:7px 14px;font-size:13px;cursor:pointer;
                        ">Игнорировать</button>
                    </div>
                </div>
            `;

            // Позиционируем popup под подсвеченным словом
            const rect = anchorEl.getBoundingClientRect();
            this.popup.style.display = 'block';
            this.popup.style.top = (window.scrollY + rect.bottom + 6) + 'px';
            this.popup.style.left = (window.scrollX + rect.left) + 'px';

            // Обработчики кнопок
            this.popup.querySelector('.lt-close').addEventListener('click', () => this.hidePopup());
            this.popup.querySelectorAll('.lt-apply').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._applyFix(err, parseInt(btn.dataset.rep));
                    this.hidePopup();
                });
            });
            this.popup.querySelector('.lt-ignore').addEventListener('click', () => {
                this._ignoreError(err);
                this.hidePopup();
            });
        }

        hidePopup() {
            if (this.popup) this.popup.style.display = 'none';
        }

        debounceCheck() {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.check(), 300);
        }

        async check() {
            // Если линтер выключен в настройках — чистим подсветку
            if (!SETTINGS.enabled) {
                this.errors = [];
                this._clearHighlights();
                return;
            }
            const text = this.getText();
            const allErrors = await this.validator.validateText(text);
            this.errors = allErrors.filter(e => !this._isIgnored(e));
            this.renderHighlights();
        }

        _clearHighlights() {
            if (this.useHighlightAPI) {
                try {
                    CSS.highlights.delete('lt-critical');
                    CSS.highlights.delete('lt-warning');
                } catch (_) {}
                this._errorRanges = [];
            } else if (this.overlay) {
                this.overlay.innerHTML = '';
            }
            this.hidePopup();
        }

        _isIgnored(err) {
            return this._ignored.has(err.ruleId + ':' + err.context);
        }

        _applyFix(err, repIdx) {
            if (!err) return;
            const replacement = err.replacements[repIdx];
            let newReplacement = (replacement === '(убрать)') ? '' : replacement;

            // Подстраиваем регистр замены ПО ПОЗИЦИИ в предложении:
            // заглавная только если слово в начале предложения (после . ! ? или в начале)
            if (newReplacement) {
                const fullText = this.getText();
                let i = err.offset - 1;
                while (i >= 0 && /\s/.test(fullText[i])) i--; // пропускаем пробелы
                // начало предложения: начало текста ИЛИ перед этим . ! ? : ;
                const atSentenceStart = (i < 0) || /[.!?:;\n]/.test(fullText[i]);
                const repFirst = newReplacement[0];
                if (atSentenceStart) {
                    newReplacement = repFirst.toUpperCase() + newReplacement.slice(1);
                } else {
                    newReplacement = repFirst.toLowerCase() + newReplacement.slice(1);
                }
            }

            if (this.isCE && this._activeRange) {
                // contenteditable: точечная замена через Range (сохраняем абзацы!)
                const range = this._activeRange;
                try {
                    range.deleteContents();
                    if (newReplacement) {
                        range.insertNode(document.createTextNode(newReplacement));
                    }
                } catch (e) {
                    console.warn('[HybridLinter] Не удалось заменить через Range:', e);
                }
            } else {
                // textarea: замена по строке
                const text = this.getText();
                const before = text.substring(0, err.offset);
                const after = text.substring(err.offset + err.length);
                let result = before + newReplacement + after;
                if (newReplacement === '') {
                    result = result.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1');
                }
                this.setText(result);
            }

            this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            this.check();
        }

        _ignoreError(err) {
            if (!err) return;
            this._ignored.add(err.ruleId + ':' + err.context);
            this.check();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // ИНИЦИАЛИЗАЦИЯ
    // ═════════════════════════════════════════════════════════════════════

    // Создаём глобальный экземпляр валидатора
    window._hybridValidator = new HybridValidator(CONFIG);

    // Селектор полей ввода: textarea + contenteditable редакторы
    const EDITABLE_SELECTOR = 'textarea, [contenteditable="true"], [contenteditable=""]';

    function isEditable(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.tagName === 'TEXTAREA') return true;
        return el.isContentEditable;
    }

    function attachLinter(el) {
        if (el._hybridUI) return;
        // Привязываемся только к видимым полям (или станут видимыми позже)
        el._hybridUI = new HybridLinterUI(el, window._hybridValidator);
    }

    function initHybridLinter() {
        document.querySelectorAll(EDITABLE_SELECTOR).forEach(el => {
            if (isEditable(el)) attachLinter(el);
        });

        const detachLinter = (el) => {
            if (el && el._hybridUI && typeof el._hybridUI.destroy === 'function') {
                try { el._hybridUI.destroy(); } catch (_) {}
            }
        };

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (isEditable(node)) attachLinter(node);
                        if (node.querySelectorAll) {
                            node.querySelectorAll(EDITABLE_SELECTOR).forEach(el => {
                                if (isEditable(el)) attachLinter(el);
                            });
                        }
                    }
                });
                // Освобождаем ресурсы для удалённых из DOM полей
                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node._hybridUI) detachLinter(node);
                        if (node.querySelectorAll) {
                            node.querySelectorAll(EDITABLE_SELECTOR).forEach(detachLinter);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    try {
        initHybridLinter();
        console.log('[HybridLinter] ✓ Загружена гибридная система (Custom Rules + LanguageTool API)');
    } catch (err) {
        console.error('[HybridLinter] ✗ Ошибка инициализации:', err);
    }

    // Скриншот запускается командой Ctrl+Shift+S (manifest). PrtSc отключён.
})();
