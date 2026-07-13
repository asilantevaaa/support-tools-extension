# Support Tools — Support Engineer's Browser Toolkit

A **Chrome Extension (Manifest V3)** that bundles ~20 day-to-day tools for a technical
support / hosting engineer into a single popup and a detachable floating panel:
domain diagnostics, a canvas screenshot editor, a built-in 2FA authenticator, a text
linter, a clipboard history, an in-browser translator, and more.

> ⚠️ **Sanitized portfolio version** — internal domains, endpoints and credentials have
> been removed and replaced with neutral placeholders (`example.com`). This build is for
> code review / demonstration; connect your own endpoints in **Settings** to run it live.

*(Русская версия — [ниже](#русская-версия).)*

---

## ✨ Features

- **Screenshot editor (canvas / Fabric.js)** — capture a region, then blur sensitive
  data, crop, draw shapes/arrows/lines, add text and numbered markers; copy or save.
- **2FA / TOTP authenticator** — generate one-time codes in the browser; import accounts
  from a Google Authenticator QR (via `jsQR`) or a secret key (via `otpauth`).
- **Domain diagnostics** — WHOIS, DNS records, IP / host checks (check-host.net),
  Punycode ⇄ Unicode, subdomain lookup (SecurityTrails).
- **Mail authentication** — SPF / DKIM / DMARC / MX / A / rDNS lookups and DNSBL
  blacklist checks over DNS-over-HTTPS, plus DKIM key normalization and DMARC templates.
- **SSL tools** — mixed-content scanner for HTTPS pages and bulk certificate-request
  automation (create / renew from a list).
- **Website tech detector** — Wappalyzer-style stack detection (CMS, frameworks,
  hosting, analytics) for the current tab.
- **Text linter** — LanguageTool integration plus custom corporate style rules,
  inline on editable fields.
- **Translator** — free text translation (24 languages, auto-detect) and whole-page
  in-place translation with a one-click restore.
- **Clipboard buffer** — auto-captured copy history + saved items, image capture via
  context menu, search, and ZIP export of screenshots.
- **Password generator** — cryptographically secure, configurable charset, strength meter.
- **Ticket notifications** — sound + desktop notification when a new item lands in a
  work queue, with a quiet-threshold and selectable tones (offscreen audio).
- **Bilingual UI (RU / EN)** — a language switch in Settings with a lightweight runtime
  translation layer.
- **Quality-of-life** — password/date helpers, quick-paste templates, a URL shortener
  (YOURLS) client, a detachable floating panel with hotkeys, and a Dark-Reader-style
  dark theme for work sites.

## 🧩 Module map

| Module | Role |
| --- | --- |
| `manifest.json` | MV3 manifest — permissions, content scripts, commands |
| `background.js` | Service worker: message router, context menus, external API calls, offscreen audio, hotkeys |
| `popup.html` / `popup.js` | Main popup UI and all tab logic (~5.5k lines) |
| `settings.html` / `settings.js` | Options page (tabs order, theme, notifications, integrations) |
| `content.js` | Screenshot region-selection overlay |
| `editor.html` / `editor.js` / `editor-init.js` / `fabric.min.js` | Canvas screenshot editor |
| `offscreen.html` / `offscreen.js` | Offscreen document for autoplay notification audio |
| `clip-capture.js` | Clipboard history auto-capture (content script) |
| `domain-watch.js` | Auto-fill selected domain into tool inputs |
| `dark-theme.js` | Dark theme injector for work sites |
| `float-panel.js` | Detachable, resizable floating panel |
| `linter-hybrid.js` | Hybrid text linter (LanguageTool + custom rules) |
| `paste-quick.js` | Quick-paste template saving |
| `postpone-quick.js` / `postpone-page.js` | Date/time helpers (timezone-aware) |
| `ssl-requests.js` | Bulk SSL certificate-request automation (content script) |
| `ticket-watch.js` | New-item queue notifications (content script) |
| `employees2-ignore.js` | Bulk form automation helper (content script) |
| `libs/otpauth.umd.min.js` | TOTP generation (third-party) |
| `libs/jsQR.min.js` | QR decoding for 2FA import (third-party) |

## 🛠 Tech

- **Manifest V3** — background **service worker**, **content scripts**,
  `chrome.storage`, `chrome.notifications`, `chrome.contextMenus`,
  `chrome.commands`, `chrome.scripting`.
- Vanilla JavaScript, **~12k lines** of app code (no build step, no framework).
- External APIs (pluggable): DNS-over-HTTPS, check-host.net, LanguageTool, a free
  translation endpoint, SecurityTrails, and an optional LLM API for text rewriting.

## 🔒 Privacy & data handling

- **Everything stays local.** All data — snippets, clipboard history, screenshots,
  2FA secrets, saved settings and API keys — is kept in `chrome.storage.local` on
  your machine. Nothing is sent to any server owned by this project (it has none).
- **Network calls go only to the diagnostic APIs** you actually use (DNS-over-HTTPS,
  check-host.net, translation, SecurityTrails, and any LLM endpoint you configure),
  and only with the domain / text you explicitly submit.
- **Clipboard auto-capture is opt-in.** It is **off by default** and can be enabled
  in the **Clipboard** tab. When on, it saves copied text to local history but
  **skips password and other sensitive fields**.
- **Stored secrets are not encrypted at rest.** 2FA seeds and API keys live in
  `chrome.storage.local` in plaintext (standard for extensions — Chrome does not
  provide per-item encryption). Anyone with access to your OS user profile could
  read them. Use it on a trusted machine and treat it like any other local
  credential store.

## 🚀 Installation (load unpacked)

1. `git clone` this repository.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. (Optional) Open the extension **Settings** and fill in your own endpoints / API keys
   (see `config.example.json` for the shape of what's configurable).

## 🖼 Screenshots

_Placeholders — add your own images to `docs/`._

| Popup | Screenshot editor | Settings |
| --- | --- | --- |
| _(screenshot)_ | _(screenshot)_ | _(screenshot)_ |

## 📄 License

[MIT](LICENSE)

---

## Русская версия

**Support Tools** — расширение для Chrome (**Manifest V3**), объединяющее ~20 повседневных
инструментов поддержки в одном попапе и открепляемой плавающей
панели: диагностика доменов, редактор скриншотов на canvas, встроенный 2FA-аутентификатор,
линтер текста, история буфера обмена, переводчик и другое.

> ⚠️ **Санитизированная версия для портфолио** — внутренние домены, эндпоинты и учётные
> данные удалены и заменены нейтральными заглушками (`example.com`). Сборка предназначена
> для ревью кода и демонстрации; для реальной работы укажи свои эндпоинты в **Настройках**.

### Возможности

- **Редактор скриншотов (canvas / Fabric.js)** — захват области, размытие, обрезка,
  фигуры/стрелки/линии, текст и нумерованные метки; копирование или сохранение.
- **2FA / TOTP** — генерация одноразовых кодов в браузере; импорт из QR Google
  Authenticator (`jsQR`) или по секретному ключу (`otpauth`).
- **Диагностика доменов** — WHOIS, DNS, IP/host-проверки (check-host.net),
  Punycode ⇄ Unicode, поддомены (SecurityTrails).
- **Почтовая аутентификация** — SPF/DKIM/DMARC/MX/A/rDNS и чёрные списки (DNSBL) через
  DNS-over-HTTPS, нормализация DKIM-ключа, шаблоны DMARC.
- **SSL** — поиск mixed content на HTTPS-странице и массовые заявки на сертификаты
  (создание/продление списком).
- **Детектор технологий сайта** — определение стека (CMS, фреймворки, хостинг,
  аналитика) по текущей вкладке, аналог Wappalyzer.
- **Линтер текста** — LanguageTool + корпоративные правила стиля, прямо в полях ввода.
- **Переводчик** — бесплатный перевод текста (24 языка, автоопределение) и перевод всей
  страницы на месте с откатом к оригиналу.
- **Буфер обмена** — авто-история копирований + сохранённое, захват картинок через
  контекстное меню, поиск и экспорт скриншотов в ZIP.
- **Генератор паролей** — криптостойкий, настраиваемый набор символов, индикатор надёжности.
- **Уведомления о новых заявках** — звук и всплывающее уведомление при появлении новой
  задачи в очереди, с порогом тишины и выбором звука (offscreen audio).
- **Двуязычный интерфейс (RU / EN)** — переключатель языка в настройках с лёгким
  слоем перевода на лету.
- **Мелочи** — помощники по датам, быстрые пасты, клиент сокращателя ссылок (YOURLS),
  плавающая панель с горячими клавишами и тёмная тема для рабочих сайтов.

### Технологии

- **Manifest V3** — фоновый **service worker**, **content scripts**,
  `chrome.storage`, `chrome.notifications`, `chrome.contextMenus`, `chrome.commands`,
  `chrome.scripting`.
- Чистый JavaScript, **~12 000 строк** кода приложения (без сборки и фреймворков).

### Приватность и данные

- **Всё хранится локально.** Сниппеты, история буфера, скриншоты, 2FA-секреты,
  настройки и API-ключи лежат в `chrome.storage.local` на твоей машине. Ни на
  какой сервер проекта данные не уходят (его попросту нет).
- **Сетевые запросы** идут только к тем диагностическим API, которыми ты
  пользуешься (DoH, check-host.net, перевод, SecurityTrails, указанный тобой LLM),
  и только с доменом/текстом, которые ты явно отправил.
- **Автозахват буфера — по желанию.** По умолчанию **выключен**, включается на
  вкладке **Буфер**. Во включённом виде сохраняет копируемый текст в локальную
  историю, но **пропускает поля паролей и другие чувствительные поля**.
- **Секреты хранятся без шифрования.** 2FA-сиды и API-ключи лежат в
  `chrome.storage.local` в открытом виде (обычная практика для расширений — Chrome
  не даёт пошаговое шифрование). Используй на доверенной машине.

### Установка (load unpacked)

1. Склонируй репозиторий.
2. Открой `chrome://extensions/`, включи **Режим разработчика**.
3. Нажми **Загрузить распакованное расширение** и выбери папку проекта.
4. (Опционально) в **Настройках** укажи свои эндпоинты / API-ключи
   (структура — в `config.example.json`).

### Лицензия

[MIT](LICENSE)
