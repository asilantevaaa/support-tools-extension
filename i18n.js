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
        "Инструменты технической поддержки": "Support engineer's toolkit",

        // — Языки переводчика —
        "Русский": "Russian", "Английский": "English", "Украинский": "Ukrainian",
        "Немецкий": "German", "Французский": "French", "Испанский": "Spanish",
        "Итальянский": "Italian", "Португальский": "Portuguese", "Польский": "Polish",
        "Турецкий": "Turkish", "Нидерландский": "Dutch", "Китайский": "Chinese",
        "Японский": "Japanese", "Корейский": "Korean", "Арабский": "Arabic",
        "Казахский": "Kazakh", "Белорусский": "Belarusian", "Узбекский": "Uzbek",
        "Азербайджанский": "Azerbaijani", "Армянский": "Armenian", "Грузинский": "Georgian",
        "Иврит": "Hebrew", "Хинди": "Hindi", "Определить язык": "Detect language",
        "Определён:": "Detected:", "Перевожу…": "Translating…",
        "Перевожу страницу… это может занять время": "Translating the page… this may take a while",
        "Оригинал восстановлен": "Original restored",
        "Текст для перевода не найден": "No text to translate found",
        "Не удалось перевести": "Translation failed",
        "Нельзя перевести служебную страницу. Открой обычный сайт.": "Can't translate a system page. Open a regular site.",

        // — Генератор паролей —
        "Слабый": "Weak", "Средний": "Medium", "Хороший": "Good", "Надёжный": "Strong",

        // — Записи (DNS templates) —
        "A-запись": "A record", "MX-запись": "MX record", "DKIM-запись (значение TXT)": "DKIM record (TXT value)",
        "Новая запись": "New record", "Записи, по одной в строке": "Records, one per line",
        "Значения, по одному в строке (IP, домен, текст...)": "Values, one per line (IP, domain, text...)",
        "Название (например, ExampleHost)": "Name (e.g. ExampleHost)", "Название (необязательно)": "Name (optional)",
        "Название шаблона": "Template name", "Mail.ru — мягкая": "Mail.ru — relaxed", "Mail.ru — строгая": "Mail.ru — strict",
        "Универсальный (для всех)": "Universal (for all)", "Записей не найдено": "No records found",
        "Редактировать": "Edit", "Копировать всё": "Copy all", "Копировать строку": "Copy row",
        "задаётся сервисом (например us._domainkey)": "set by the service (e.g. us._domainkey)",
        "для отправки с SMTP": "for sending via SMTP", "для отправки с php mail()": "for sending via php mail()",
        "через серверы Beget (php mail() / локальный SMTP)": "via Beget servers (php mail() / local SMTP)",
        "через сторонние SMTP": "via third-party SMTP", "1. Приватный ключ": "1. Private key", "2. Публичный ключ": "2. Public key",

        // — 2FA —
        "Название аккаунта:": "Account name:", "Нажмите, чтобы скопировать": "Click to copy",
        "Ошибка импорта:": "Import error:", "QR-код не распознан": "QR code not recognized",
        "Не найдено аккаунтов в QR": "No accounts found in the QR", "✓ Аккаунт добавлен": "✓ Account added",
        "Пустой migration-QR": "Empty migration QR", "В QR нет otpauth-данных": "No otpauth data in the QR",
        "Ошибка разбора QR:": "QR parse error:", "⏳ Распознаю QR...": "⏳ Recognizing QR...", "⏳ Сканирую экран...": "⏳ Scanning screen...",

        // — Почта / стек —
        "Конструктор": "Site builder", "Конструктор/CMS": "Site builder/CMS", "Фреймворк": "Framework",
        "Хостинг": "Hosting", "Хостинг / дата-центр": "Hosting / data center", "Аналитика": "Analytics",
        "CDN/прокси": "CDN/proxy", "Библиотека": "Library", "Прочее": "Other", "Облако": "Cloud",
        "Чёрные списки": "Blacklists", "Проверяем DNS…": "Checking DNS…", "Опрашиваем резолверы…": "Querying resolvers…",
        "Анализируем страницу…": "Analyzing the page…", "Запись v=spf1 не найдена": "v=spf1 record not found",
        "Запись v=DMARC1 не найдена": "v=DMARC1 record not found",
        "Не найден по популярным селекторам. Укажи селектор вручную, если знаешь.": "Not found by common selectors. Enter the selector manually if you know it.",

        // — Whois / DNS / SSL —
        "Дата регистрации": "Registration date", "Регистратор": "Registrar", "Действует до": "Valid until",
        "Издатель": "Issuer", "Издатель (CA)": "Issuer (CA)", "Домены (SAN)": "Domains (SAN)",
        "Серийный №": "Serial №", "Выдан": "Issued", "истёк": "expired", "Статус": "Status",
        "Последнее обновление": "Last updated", "Проверено:": "Checked:", "История выдач (CT)": "Issuance history (CT)",
        "SSL установлен правильно": "SSL is set up correctly", "рабочий SSL не обнаружен": "no working SSL detected",
        "Запрашиваем DNS...": "Requesting DNS...", "Запрашиваем Whois...": "Requesting Whois...",
        "Запрашиваем историю DNS...": "Requesting DNS history...", "Запрашиваем поддомены...": "Requesting subdomains...",

        // — Общие статусы / кнопки —
        "Готово.": "Done.", "Ошибка": "Error", "Ошибка:": "Error:", "Отмена (Esc)": "Cancel (Esc)",
        "Не удалось выполнить запрос": "Request failed", "Нет данных": "No data", "нет данных": "no data",
        "Нет ответа": "No response", "нет ответа": "no response", "Загружаем...": "Loading...",
        "Загружаем страницу…": "Loading the page…", "Ищем…": "Searching…", "Собираю…": "Collecting…",
        "Выполняем…": "Running…", "Запускаю…": "Starting…", "Остановлено.": "Stopped.", "Очищено": "Cleared",
        "История пуста. Скопируй что-нибудь.": "History is empty. Copy something.",
        "Нет сохранённых. Нажми ★ у записи в истории.": "Nothing saved. Tap ★ on an item in history.",
        "Ничего не найдено.": "Nothing found.", "Открыть в новой вкладке": "Open in new tab",
        "В сохранённое": "To saved", "Убрать из сохранённого": "Remove from saved", "Скриншотов нет": "No screenshots",
        "Не удалось скопировать картинку в буфер": "Failed to copy the image to the clipboard",
        "Нет активной вкладки": "No active tab", "Нет активной вкладки.": "No active tab.",
        "нет": "no", "есть": "yes", "чисто": "clean", "в списке!": "listed!", "недоступен": "unavailable",
        "не задан": "not set", "не найден": "not found", "не найдены": "not found", "показать": "show", "скрыть": "hide",
        "активен": "active", "ок": "ok", "частично": "partial", "таймаут": "timeout", "ошибка": "error", "сейчас": "now",

        // — Даты —
        "день": "day", "дня": "days", "дней": "days", "дн.": "d", "мес.": "mo",
        "января": "January", "февраля": "February", "марта": "March", "апреля": "April",
        "мая": "May", "июня": "June", "июля": "July", "августа": "August",
        "сентября": "September", "октября": "October", "ноября": "November", "декабря": "December"
    };

    const getLang = () => { try { return localStorage.getItem('appLang') || 'ru'; } catch (e) { return 'ru'; } };

    // нормализованная карта (схлопнутые пробелы) — на случай двойных пробелов/переносов
    const NORM = {};
    for (const k in DICT) NORM[k.replace(/\s+/g, ' ').trim()] = DICT[k];
    const lookup = (s) => DICT[s] || NORM[s.replace(/\s+/g, ' ').trim()];

    function translate(root) {
        if (getLang() !== 'en' || !root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const nodes = []; let n;
        while ((n = walker.nextNode())) nodes.push(n);
        for (const node of nodes) {
            const raw = node.nodeValue;
            const t = raw.trim();
            if (!t) continue;
            const tr = lookup(t);
            if (tr) node.nodeValue = raw.replace(t, tr);
        }
        root.querySelectorAll('[placeholder],[title]').forEach(el => {
            ['placeholder', 'title'].forEach(a => {
                const v = el.getAttribute(a);
                if (v) { const tr = lookup(v.trim()); if (tr) el.setAttribute(a, tr); }
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
