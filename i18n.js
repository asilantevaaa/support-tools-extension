/* i18n.js — lightweight runtime RU→EN localization layer.
   Applies English translations to the UI when appLang === 'en' (default 'ru').
   Works by translating exact text-node matches + placeholder/title attributes,
   and re-applying on dynamic DOM changes (MutationObserver). Idempotent: once a
   string is English it is no longer in the dictionary, so no re-translation loop. */
(function () {
    'use strict';

    const DICT = {
        "(бесплатный план).": "(free plan).",
        "+ Добавить аккаунт": "+ Add account",
        "0 сек": "0 sec", "2 сек": "2 sec", "3 сек": "3 sec", "5 сек": "5 sec",
        "1 минута": "1 minute", "5 минут": "5 minutes", "10 минут": "10 minutes",
        "1. Подключите VPN (сервис недоступен из РФ).": "1. Connect a VPN (service may be region-restricted).",
        "2. Перейдите на": "2. Go to",
        "203.0.113.5 или example.com": "203.0.113.5 or example.com",
        "3 теста/день на IP": "3 tests/day per IP",
        "3. Войдите в Google-аккаунт → «Create API key».": "3. Sign in to your Google account → \"Create API key\".",
        "4. Скопируйте ключ и вставьте сюда.": "4. Copy the key and paste it here.",
        "API-ключ SecurityTrails": "SecurityTrails API key",
        "DKIM-селектор (необязательно, напр. dkim)": "DKIM selector (optional, e.g. dkim)",
        "DNS-проверка": "DNS check",
        "Enter — отправить, Shift+Enter — перенос": "Enter — send, Shift+Enter — newline",
        "IP-инфо": "IP info",
        "LanguageTool (онлайн)": "LanguageTool (online)",
        "Без похожих символов": "Exclude similar characters",
        "Буфер": "Clipboard",
        "Вернуть оригинал": "Restore original",
        "Вкладки": "Tabs",
        "Включите VPN (сервис недоступен из РФ).": "Enable a VPN (service may be region-restricted).",
        "Включить тёмную тему на всех сайтах": "Enable dark theme on all sites",
        "Вставьте API-ключ": "Paste API key",
        "Вставьте свой API-ключ": "Paste your API key",
        "Вставьте сюда. Ключ хранится только локально на вашем устройстве.": "Paste it here. The key is stored locally on your device only.",
        "Встроенная проверка текста": "Built-in text checker",
        "Вся страница": "Whole page",
        "Выбрать раздел": "Select area",
        "Выбрать раздел на странице кликом": "Select an area on the page by clicking",
        "Горячие клавиши:": "Hotkeys:",
        "Даты": "Dates",
        "Диагностика источников": "Source diagnostics",
        "Длина": "Length",
        "Дневная": "Light",
        "Добавить": "Add",
        "Добро пожаловать в Support Tools!": "Welcome to Support Tools!",
        "Домен": "Domain",
        "Домены": "Domains",
        "Если выключено — панель не будет появляться на каждой новой вкладке автоматически.": "If off, the panel won't appear automatically on every new tab.",
        "Задержка перед скриншотом": "Delay before screenshot",
        "Закрыть все плавающие панели и редакторы во всех вкладках": "Close all floating panels and editors in all tabs",
        "Записи": "Records",
        "Запрос": "Query",
        "Запросить SecurityTrails": "Query SecurityTrails",
        "Зарегистрируйтесь бесплатно": "Sign up for free",
        "Зарегистрируйтесь на": "Sign up at",
        "ИИ": "AI",
        "Изменить — на странице chrome://extensions/shortcuts": "Change them at chrome://extensions/shortcuts",
        "Инфо": "Info",
        "Исключения (по одному домену в строке)": "Exclusions (one domain per line)",
        "Исключения для раздела «Домены»": "Exclusions for the \"Domains\" section",
        "История A": "A history", "История AAAA": "AAAA history", "История MX": "MX history",
        "История NS": "NS history", "История SOA": "SOA history", "История TXT": "TXT history",
        "История буфера": "Clipboard history",
        "Как отображаются кнопки навигации": "How navigation buttons are displayed",
        "Как получить ключ:": "How to get a key:",
        "Как получить ключ?": "How to get a key?",
        "Кириллица → Punycode (xn--) и обратно — автоматически": "Cyrillic → Punycode (xn--) and back — automatically",
        "Классический сервис. Лимит считается по IP офиса — на всех общий.": "Classic service. The limit is per office IP — shared by everyone.",
        "Количество дней": "Number of days",
        "Конвертировать и скопировать": "Convert and copy",
        "Копировать": "Copy",
        "Копировать перевод": "Copy translation",
        "Копировать ссылку": "Copy link",
        "Копировать ссылку на check-host": "Copy check-host link",
        "Кэширование результатов": "Result caching",
        "Логин": "Login",
        "Многострочно": "Multi-line",
        "Настройка": "Setup",
        "Настройки": "Settings",
        "Настройки вкладок: порядок и видимость": "Tab settings: order and visibility",
        "Настройки генератора": "Generator settings",
        "Настройки — Support Tools": "Settings — Support Tools",
        "Настройте расширение — займёт меньше минуты.": "Set up the extension — takes under a minute.",
        "Не хранить (запрос каждый раз)": "Don't store (ask every time)",
        "Нет ключа?": "No key?",
        "Новый чат": "New chat",
        "Ночная": "Dark",
        "Объединить проверку домена": "Merge domain check",
        "Одна строка": "Single line",
        "Оригинал": "Original",
        "Орфография": "Spelling",
        "Открепить — плавающая панель поверх страницы": "Detach — floating panel over the page",
        "Открой сервис — он выдаст тестовый адрес": "Open the service — it will give a test address",
        "Открыть SendBridge": "Open SendBridge",
        "Открыть mail-tester": "Open mail-tester",
        "Открыть на whois.com": "Open on whois.com",
        "Отправить": "Send",
        "Отправь письмо с проверяемого сервера на этот адрес": "Send an email from the server being tested to this address",
        "Очистить": "Clear",
        "Пароль": "Password",
        "Перевести": "Translate",
        "Перевести страницу": "Translate page",
        "Перевод": "Translation",
        "Перевод всей страницы": "Whole-page translation",
        "Переводит текст открытой вкладки на язык из поля «В» — прямо на странице.": "Translates the current tab's text into the \"To\" language — right on the page.",
        "Плавающая панель": "Floating panel",
        "По умолчанию": "Default",
        "Поддомены": "Subdomains",
        "Подключение ИИ": "AI connection",
        "Подключить": "Connect",
        "Подтвердите почту и войдите.": "Confirm your email and sign in.",
        "Поиск по тексту…": "Search text…",
        "Показать/скрыть": "Show/hide",
        "Показывать на всех вкладках": "Show on all tabs",
        "Полный отчёт как у mail-tester, но без ограничения 3 теста/день. Без регистрации.": "Full report like mail-tester, but without the 3 tests/day limit. No signup.",
        "Поменять языки местами": "Swap languages",
        "Порядок вкладок": "Tab order",
        "Почта": "Mail",
        "Прибавить / отнять дни": "Add / subtract days",
        "Прикрепить файл": "Attach file",
        "Проверить": "Check",
        "Проверить mixed content": "Check mixed content",
        "Проверить распространение (несколько NS)": "Check propagation (multiple NS)",
        "Проверить текущий сайт": "Check current site",
        "Проверка текста (Линтер)": "Text checker (Linter)",
        "Проверяет стиль, орфографию и правила саппорта в реальном времени": "Checks spelling and grammar in real time",
        "Прописные буквы": "Uppercase letters",
        "Разница между датами": "Difference between dates",
        "Рассчитать": "Calculate",
        "Свои": "Custom",
        "Сделать скриншот и отредактировать его (Ctrl+Shift+S)": "Take a screenshot and edit it (Ctrl+Shift+S)",
        "Сервер": "Server",
        "Сервер (http://links.example.com)": "Server (http://links.example.com)",
        "Сертификаты домена": "Domain certificates",
        "Сигнатура (опционально)": "Signature (optional)",
        "Сканер доменов на странице": "Domain scanner on the page",
        "Скачать все скриншоты в ZIP": "Download all screenshots as ZIP",
        "Сколько паролей": "How many passwords",
        "Скопировать": "Copy",
        "Скопировать ссылку на dnschecker.org": "Copy dnschecker.org link",
        "Скриншот": "Screenshot",
        "Сменить ключ": "Change key",
        "Создать пароль": "Generate password",
        "Сократить и скопировать": "Shorten and copy",
        "Сокращатель ссылок (YOURLS)": "URL shortener (YOURLS)",
        "Сообщение…": "Message…",
        "Сохранить": "Save",
        "Сохранить ключ": "Save key",
        "Сохранить порядок": "Save order",
        "Сохранённое": "Saved",
        "Спам": "Spam",
        "Спец. символы": "Special characters",
        "Ссылка": "Link",
        "Ссылка DNSChecker": "DNSChecker link",
        "Ссылка на тикет для клиента (example.com):": "Ticket link for the client (example.com):",
        "Стек": "Stack",
        "Стиль вкладок": "Tab style",
        "Строчные буквы": "Lowercase letters",
        "Считать дни": "Count days",
        "Текст для перевода…": "Text to translate…",
        "Тема оформления": "Theme",
        "Типографика": "Typography",
        "Типы проверок:": "Check types:",
        "Тёмная тема для сайтов (как Dark Reader)": "Dark theme for sites (like Dark Reader)",
        "Тёмно-серая": "Dark gray",
        "Удалить": "Delete",
        "Удалить чат": "Delete chat",
        "Умный": "Smart",
        "Цифры": "Digits",
        "Чат": "Chat",
        "Шаблоны DNS-записей": "DNS record templates",
        "Экспорт скринов": "Export screenshots",
        "Эти домены не будут показываться при сканировании страницы.": "These domains won't be shown when scanning the page.",
        "без лимита": "no limit",
        "в браузере и никуда не передаётся.": "in the browser and is not sent anywhere.",
        "домен или IP": "domain or IP",
        "домен.рф → xn-- / xn-- → кириллица": "domain.xn → xn-- / xn-- → Cyrillic",
        "не задан": "not set",
        "объединяются в одну вкладку «Проверка домена» с внутренними подвкладками.": "are merged into a single \"Domain check\" tab with inner sub-tabs.",
        "скрыть": "hide",
        "только локально": "locally only",
        "— 50 запросов/месяц, VPN обязателен.": "— 50 requests/month, VPN required.",
        "— закрыть панель во всех окнах": "— close the panel in all windows",
        "— открыть/закрыть панель на текущей странице": "— open/close the panel on the current page",
        "— скопируйте ключ.": "— copy the key.",
        "⚙ Настройки YOURLS": "⚙ YOURLS settings",
        "⚠ Ошибка расширения": "⚠ Extension error",
        "✓ Скопировано": "✓ Copied",
        "✓ Скопировано в буфер": "✓ Copied to clipboard",
        "✓ Сохранено": "✓ Saved",
        "✓ Сохранить": "✓ Save",
        "✓ Ссылка для клиента скопирована": "✓ Client link copied",
        "✓ скопировано": "✓ copied",
        "Инструменты технической поддержки": "Support engineer's toolkit"
    };

    const getLang = () => { try { return localStorage.getItem('appLang') || 'ru'; } catch (e) { return 'ru'; } };

    function translate(root) {
        if (getLang() !== 'en' || !root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const nodes = []; let n;
        while ((n = walker.nextNode())) nodes.push(n);
        for (const node of nodes) {
            const raw = node.nodeValue;
            const t = raw.trim();
            if (t && DICT[t]) node.nodeValue = raw.replace(t, DICT[t]);
        }
        root.querySelectorAll('[placeholder],[title]').forEach(el => {
            ['placeholder', 'title'].forEach(a => {
                const v = el.getAttribute(a);
                if (v && DICT[v.trim()]) el.setAttribute(a, DICT[v.trim()]);
            });
        });
    }

    function apply() { try { translate(document.body); } catch (e) {} }
    window.__applyI18n = apply;
    window.__i18nLang = getLang;

    const start = () => {
        apply();
        let queued = false;
        try {
            const mo = new MutationObserver(() => {
                if (queued) return;
                queued = true;
                requestAnimationFrame(() => { queued = false; apply(); });
            });
            mo.observe(document.body, { childList: true, subtree: true, characterData: true });
        } catch (e) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
