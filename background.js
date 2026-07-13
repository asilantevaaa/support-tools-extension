// Полифилл: Opera/Edge иногда поставляют WebExtensions API под именем browser, не chrome
if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
    // eslint-disable-next-line no-global-assign
    self.chrome = browser;
}

let ST_KEY_CUR = '';
// заголовки SecurityTrails с ключом пользователя (хранится локально в настройках)
const ST_HDR = () => ({ apikey: ST_KEY_CUR, Accept: 'application/json' });
try {
    chrome.storage.local.get(['stApiKey'], (d) => { if (d && d.stApiKey) ST_KEY_CUR = d.stApiKey; });
    chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && c.stApiKey) ST_KEY_CUR = c.stApiKey.newValue || ''; });
} catch (e) {}

// Fetch с таймаутом
const fetchT = (url, opts = {}, ms = 8000) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
};


// Нормализация дат из WHOIS
const normalizeDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    dateStr = dateStr.trim();
    if (!dateStr) return null;

    // Уже в формате YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);

    // Формат ДД.ММ.YYYY (русский) → YYYY-MM-DD
    if (/^\d{2}\.\d{2}\.\d{4}/.test(dateStr)) {
        const [d, m, y] = dateStr.slice(0, 10).split('.');
        return `${y}-${m}-${d}`;
    }

    // Формат DD/MM/YYYY → YYYY-MM-DD
    if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
        const [d, m, y] = dateStr.slice(0, 10).split('/');
        return `${y}-${m}-${d}`;
    }

    // Английский формат: January 1, 2020
    const enMonths = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
                       july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
    const enMatch = dateStr.match(/(\w+)\s+(\d+),?\s+(\d{4})/i);
    if (enMatch) {
        const month = enMonths[enMatch[1].toLowerCase()];
        if (month) return `${enMatch[3]}-${String(month).padStart(2, '0')}-${String(enMatch[2]).padStart(2, '0')}`;
    }

    // Русский формат: 1 января 2020
    const ruMonths = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
                       июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };
    const ruMatch = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
    if (ruMatch) {
        const month = ruMonths[ruMatch[2].toLowerCase()];
        if (month) return `${ruMatch[3]}-${String(month).padStart(2, '0')}-${String(ruMatch[1]).padStart(2, '0')}`;
    }

    // Попробуем парсить как сырую строку Date()
    const d = new Date(dateStr);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);

    return dateStr; // Если не смогли распарсить — возвращаем как есть
};

// ── Первый запуск: открыть настройки ─────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.get('setupDone', ({ setupDone }) => {
            if (!setupDone) {
                chrome.windows.create({
                    url: chrome.runtime.getURL('settings.html?firstRun=1'),
                    type: 'popup',
                    width: 480,
                    height: 640,
                });
            }
        });
    }
});

// ── Контекстное меню: проверка выделенного текста ────────────────────────
const CTX_ITEMS = [
    { id: 'st-ctx-whois',     title: 'WHOIS',      tab: 'whois' },
    { id: 'st-ctx-dns',       title: 'DNS',        tab: 'dns' },
    { id: 'st-ctx-checkhost', title: 'Check-host', tab: 'checkhost' },
    { id: 'st-ctx-punycode',  title: 'Punycode',   tab: 'punycode' },
    { id: 'st-ctx-ssl',       title: 'SSL',        tab: 'ssl' },
];
let ctxBuilding = false;
function buildContextMenus() {
    if (ctxBuilding) return;          // защита от гонки onInstalled + onStartup
    ctxBuilding = true;
    // колбэк, который «вычитывает» lastError, чтобы не было Unchecked runtime.lastError
    const swallow = () => { void chrome.runtime.lastError; };
    try {
        chrome.contextMenus.removeAll(() => {
            swallow();
            chrome.contextMenus.create({ id: 'st-ctx-root', title: 'Support Tools: check "%s"', contexts: ['selection'] }, swallow);
            CTX_ITEMS.forEach(it => chrome.contextMenus.create({
                id: it.id, parentId: 'st-ctx-root', title: it.title, contexts: ['selection'],
            }, swallow));
            // Только на staff.example.com — сохранить выделенное как пасту (шаблон)
            chrome.contextMenus.create({
                id: 'st-ctx-paste', title: 'Save as snippet', contexts: ['selection'],
                documentUrlPatterns: ['https://staff.example.com/*'],
            }, swallow);
            // Картинки — сохранить в «Буфер»
            chrome.contextMenus.create({
                id: 'st-ctx-clip-image', title: 'Save image to Clipboard', contexts: ['image'],
            }, swallow);
            ctxBuilding = false;
        });
    } catch (_) { ctxBuilding = false; }
}
chrome.runtime.onInstalled.addListener(buildContextMenus);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(buildContextMenus);

// Выделение → очищаем до хоста (убираем протокол/www/путь/пробелы)
function cleanCtxQuery(s) {
    if (!s) return '';
    let t = s.trim().split(/\s+/)[0] || '';
    t = t.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    t = t.split(/[\/?#]/)[0];
    return t.trim();
}

// ── Сохранение элементов в «Буфер» (общая логика) ────────────────────────
function saveClipItem(item) {
    chrome.storage.local.get(['clipItems'], (d) => {
        let items = Array.isArray(d.clipItems) ? d.clipItems : [];
        if (item.type === 'text') {
            const recent = items.find(x => x.type === 'text');
            if (recent && recent.data === item.data) return; // антидубль
        }
        items.unshift(item);
        const pinned = items.filter(x => x.pinned);
        const rest = items.filter(x => !x.pinned).slice(0, Math.max(0, 100 - pinned.length));
        items = [...pinned, ...rest].sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.ts - a.ts));
        chrome.storage.local.set({ clipItems: items });
    });
}
const clipGenId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return 'data:' + (blob.type || 'image/png') + ';base64,' + btoa(bin);
}
async function imageToDataUrl(srcUrl, tabId) {
    if (!srcUrl) return null;
    if (srcUrl.startsWith('data:image')) return srcUrl;
    // 1) качаем В КОНТЕКСТЕ СТРАНИЦЫ — там сессионная кука и верный origin
    //    (картинки в тикетах staff отдаются только авторизованному запросу)
    if (tabId) {
        try {
            const [{ result } = {}] = await chrome.scripting.executeScript({
                target: { tabId }, args: [srcUrl],
                func: async (u) => {
                    try {
                        const r = await fetch(u, { credentials: 'include' });
                        if (!r.ok) return null;
                        const b = await r.blob();
                        if (!/^image\//.test(b.type)) return null;   // это не картинка (редирект/HTML)
                        return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
                    } catch (e) { return null; }
                },
            });
            if (result && result.startsWith('data:image')) return result;
        } catch (e) {}
    }
    // 2) фолбэк: из фона с куками (host_permissions: <all_urls>)
    try {
        const r = await fetchT(srcUrl, { credentials: 'include' }, 12000);
        if (r.ok) {
            const b = await r.blob();
            if (/^image\//.test(b.type)) { const du = await blobToDataUrl(b); if (du.startsWith('data:image')) return du; }
        }
    } catch (e) {}
    return null;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Картинка → сохранить в «Буфер»
    if (info.menuItemId === 'st-ctx-clip-image') {
        (async () => {
            const dataUrl = await imageToDataUrl(info.srcUrl, tab && tab.id);
            const msg = dataUrl ? 'Image saved to Clipboard' : 'Failed to fetch the image';
            if (dataUrl) saveClipItem({ id: clipGenId(), type: 'image', data: dataUrl, ts: Date.now(), pinned: false });
            try {
                chrome.notifications.create('clip-img-' + Date.now(), {
                    type: 'basic', iconUrl: chrome.runtime.getURL('icon128.png'),
                    title: 'Support Tools', message: msg,
                }, () => void chrome.runtime.lastError);
            } catch (e) {}
        })();
        return;
    }
    // Сохранить как пасту → шлём выделение в content-script вкладки
    if (info.menuItemId === 'st-ctx-paste') {
        const text = (info.selectionText || '').trim();
        if (text && tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'savePaste', text }, () => void chrome.runtime.lastError);
        }
        return;
    }
    const item = CTX_ITEMS.find(i => i.id === info.menuItemId);
    if (!item) return;
    const q = cleanCtxQuery(info.selectionText || '');
    if (!q) return;
    chrome.storage.local.set({ stContextAction: { tab: item.tab, q, ts: Date.now() } }, () => {
        chrome.windows.create({
            url: chrome.runtime.getURL('popup.html?mode=detached'),
            type: 'popup', width: 460, height: 640,
        });
    });
});

// ── Горячая клавиша Ctrl+Shift+S — скриншот ──────────────────────────────
chrome.commands.onCommand.addListener((command) => {
    // Плавающая панель: переключить на текущей вкладке / закрыть во всех окнах
    if (command === 'toggle-float') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab || !tab.id) return;
            if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) return;
            chrome.tabs.sendMessage(tab.id, { action: 'floatToggle' }, () => {
                // Контент-скрипт ещё не загружен (страница открыта до обновления) — внедряем и повторяем
                if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['float-panel.js'] })
                        .then(() => chrome.tabs.sendMessage(tab.id, { action: 'floatToggle' }, () => chrome.runtime.lastError))
                        .catch(() => {});
                }
            });
        });
        return;
    }
    if (command === 'close-all-float') {
        chrome.storage.local.set({ floatActive: false });
        chrome.tabs.query({}, (tabs) => {
            (tabs || []).forEach(t => {
                if (t.id) chrome.tabs.sendMessage(t.id, { action: 'closeAllPanels' }, () => chrome.runtime.lastError);
            });
        });
        return;
    }
    if (command !== 'take-screenshot') return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) return;
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
            return; // системные страницы недоступны
        }
        chrome.storage.local.get(['screenshotDelay'], (data) => {
            const delay = parseInt(data.screenshotDelay) || 0;
            setTimeout(() => {
                chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
            }, delay);
        });
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // --- Запуск скриншота из попапа (попап закрывается, поэтому инжектим из BG) ---
    if (request.action === 'triggerScreenshot') {
        const tabId = request.tabId;
        const delay = parseInt(request.delay) || 0;
        if (!tabId) { sendResponse && sendResponse({ ok: false }); return true; }
        setTimeout(() => {
            chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch((e) => {
                console.error('[BG] screenshot inject error:', e);
            });
        }, delay);
        sendResponse && sendResponse({ ok: true });
        return true;
    }


    // --- Универсальный ИИ-чат (любой провайдер) ---
    if (request.action === 'aiChat') {
        const p = request.provider || {};
        const msgs = request.messages || [];
        const system = request.system || '';
        const fmt = p.format || 'openai';
        if (!p.key) { sendResponse({ success: false, error: 'Не указан API-ключ провайдера' }); return true; }

        const decodeFile = (f) => { try { return decodeURIComponent(escape(atob(f.data))); } catch (_) { return ''; } };

        // ── Gemini ──
        if (fmt === 'gemini') {
            const base = (p.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
            const model = p.model || 'gemini-flash-latest';
            const contents = msgs.map(m => {
                const parts = [];
                if (m.text) parts.push({ text: m.text });
                (m.files || []).forEach(f => {
                    if (f.isImage) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
                    else if (f.data) parts.push({ text: `\n[Файл ${f.name}]:\n${decodeFile(f).slice(0, 20000)}` });
                });
                if (!parts.length) parts.push({ text: '' });
                return { role: m.role === 'user' ? 'user' : 'model', parts };
            });
            const payload = { contents };
            if (system) payload.system_instruction = { parts: [{ text: system }] };
            fetchT(`${base}/models/${model}:generateContent?key=${encodeURIComponent(p.key)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            }, 60000).then(r => r.json()).then(d => {
                if (d.error) { sendResponse({ success: false, error: d.error.message }); return; }
                const c = d.candidates && d.candidates[0];
                const reply = c && c.content && c.content.parts ? c.content.parts.map(x => x.text || '').join('') : '';
                sendResponse({ success: true, reply: reply || '(пустой ответ)' });
            }).catch(e => sendResponse({ success: false, error: e.message }));
            return true;
        }

        // ── Anthropic (Claude) ──
        if (fmt === 'anthropic') {
            const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
            const messages = msgs.map(m => {
                let t = m.text || '';
                (m.files || []).forEach(f => { if (f.data && !f.isImage) t += `\n[Файл ${f.name}]:\n${decodeFile(f).slice(0, 20000)}`; });
                return { role: m.role === 'model' ? 'assistant' : 'user', content: t };
            });
            const body = { model: p.model || 'claude-3-5-sonnet-latest', max_tokens: 4096, messages };
            if (system) body.system = system;
            fetchT(`${base}/v1/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: JSON.stringify(body)
            }, 60000).then(r => r.json()).then(d => {
                if (d.error) { sendResponse({ success: false, error: d.error.message }); return; }
                const reply = d.content && d.content[0] && d.content[0].text ? d.content.map(x => x.text || '').join('') : '';
                sendResponse({ success: true, reply: reply || '(пустой ответ)' });
            }).catch(e => sendResponse({ success: false, error: e.message }));
            return true;
        }

        // ── OpenAI-совместимый (OpenAI, DeepSeek, OpenRouter, Groq, локальные) ──
        const base = (p.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        msgs.forEach(m => {
            const role = m.role === 'model' ? 'assistant' : 'user';
            const imgs = (m.files || []).filter(f => f.isImage);
            if (imgs.length) {
                const content = [{ type: 'text', text: m.text || '' }];
                imgs.forEach(f => content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.data}` } }));
                messages.push({ role, content });
            } else {
                let t = m.text || '';
                (m.files || []).forEach(f => { if (f.data && !f.isImage) t += `\n[Файл ${f.name}]:\n${decodeFile(f).slice(0, 20000)}`; });
                messages.push({ role, content: t });
            }
        });
        fetchT(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.key },
            body: JSON.stringify({ model: p.model || 'gpt-4o-mini', messages })
        }, 60000).then(r => r.json()).then(d => {
            if (d.error) { sendResponse({ success: false, error: d.error.message || JSON.stringify(d.error) }); return; }
            const reply = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
            sendResponse({ success: true, reply: reply || '(пустой ответ)' });
        }).catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    // --- Google AI Studio (Gemini) чат ---
    if (request.action === 'geminiChat') {
        chrome.storage.local.get(['googleKey'], (cfg) => {
            const key = cfg.googleKey;
            if (!key) { sendResponse({ success: false, error: 'Нет API-ключа' }); return; }

            // Конвертируем историю в формат Gemini contents
            const contents = (request.messages || []).map(m => {
                const parts = [];
                if (m.text) parts.push({ text: m.text });
                (m.files || []).forEach(f => {
                    if (f.isImage) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
                    else if (f.data) {
                        // текстовый файл — декодируем base64 в текст и добавляем
                        try {
                            const txt = decodeURIComponent(escape(atob(f.data)));
                            parts.push({ text: `\n[Файл ${f.name}]:\n${txt.slice(0, 20000)}` });
                        } catch (_) {}
                    }
                });
                if (!parts.length) parts.push({ text: '' });
                return { role: m.role === 'user' ? 'user' : 'model', parts };
            });

            const model = 'gemini-flash-latest';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

            const payload = { contents };
            if (request.system) {
                payload.system_instruction = { parts: [{ text: request.system }] };
            }

            fetchT(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, 60000)
                .then(r => r.json())
                .then(d => {
                    if (d.error) { sendResponse({ success: false, error: d.error.message || 'Ошибка API' }); return; }
                    const cand = d.candidates && d.candidates[0];
                    const reply = cand && cand.content && cand.content.parts
                        ? cand.content.parts.map(p => p.text || '').join('') : '';
                    sendResponse({ success: true, reply: reply || '(пустой ответ)' });
                })
                .catch(e => sendResponse({ success: false, error: e.message }));
        });
        return true;
    }

    // --- LanguageTool API (проверка орфографии/грамматики) ---
    if (request.action === 'sslLookup') {
        const dom = (request.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!dom) { sendResponse({ success: false, error: 'Не указан домен' }); return true; }

        // ── Источник 1: certspotter (SSLMate) — стабильный JSON-API CT ──────────
        const mapCs = (arr) => (Array.isArray(arr) ? arr : []).map(c => ({
            common_name: (c.dns_names && c.dns_names[0]) || dom,
            issuer_name: c.issuer ? (c.issuer.friendly_name ? c.issuer.friendly_name + ' (' + c.issuer.name + ')' : c.issuer.name) : '',
            not_before: c.not_before,
            not_after: c.not_after,
            name_value: (c.dns_names || []).join('\n'),
            serial_number: c.cert_sha256 || c.id || ''
        }));
        const queryCs = (d) => fetchT(
            `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(d)}` +
            `&include_subdomains=true&expand=dns_names&expand=issuer`,
            { headers: { Accept: 'application/json' } }, 15000)
            .then(r => { if (!r.ok) throw new Error('certspotter HTTP ' + r.status); return r.json(); })
            .then(mapCs);
        // Поддомен (mtt.timved.ru) часто покрыт wildcard'ом родителя (*.timved.ru),
        // которого нет в выдаче по самому поддомену — поэтому при пустом ответе
        // повторяем запрос по родительской зоне, а popup отфильтрует по covers().
        const parent = dom.split('.').length > 2 ? dom.split('.').slice(1).join('.') : null;
        const fromCertspotter = () => queryCs(dom)
            .then(certs => (certs.length || !parent) ? certs : queryCs(parent).catch(() => []));

        // ── Источник 2 (резерв): crt.sh — часто 502/таймаут ────────────────────
        const crtUrl = `https://crt.sh/?q=${encodeURIComponent(dom)}&output=json&exclude=expired`;
        const parseCrt = (t) => {
            let arr = [];
            try { arr = JSON.parse(t); } catch {
                try { arr = JSON.parse('[' + t.trim().replace(/}\s*{/g, '},{') + ']'); } catch {}
            }
            return Array.isArray(arr) ? arr : [];
        };
        const fromCrt = () => fetchT(crtUrl, { headers: { Accept: 'application/json' } }, 20000)
            .then(r => { if (!r.ok) throw new Error('crt.sh HTTP ' + r.status); return r.text(); })
            .then(parseCrt);

        // certspotter (HTTP 200) — авторитетный ответ: пусто = «сертификатов нет» (не ошибка).
        // crt.sh — только если certspotter недоступен (сеть/не-200).
        fromCertspotter()
            .then(certs => {
                console.log('[SSL] certspotter', dom, '→', (certs || []).length, 'серт.');
                sendResponse({ success: true, certs: certs || [], source: 'certspotter' });
            })
            .catch((e1) => {
                console.warn('[SSL] certspotter не сработал, резерв crt.sh:', e1 && e1.message);
                fromCrt()
                    .then(c2 => {
                        console.log('[SSL] crt.sh (резерв)', dom, '→', (c2 || []).length, 'серт.');
                        sendResponse({ success: true, certs: c2, source: 'crt.sh' });
                    })
                    .catch(e => {
                        console.warn('[SSL] crt.sh тоже не сработал:', e && e.message);
                        sendResponse({
                            success: false,
                            error: /abort/i.test(e.message || '')
                                ? 'CT-сервисы не ответили вовремя. Повторите через минуту.'
                                : ('Источники CT недоступны: ' + (e.message || 'ошибка'))
                        });
                    });
            });
        return true;
    }

    // Живой сертификат домена через leaderssl.ru (надёжно достижим в сети staff).
    // Парсим страницу чекера: статус, цепочку CA, даты действия листового серта.
    if (request.action === 'sslLive') {
        const raw = (request.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!raw) { sendResponse({ success: false, error: 'Не указан домен' }); return true; }
        const cn = /^\d/.test(raw) ? ('http://' + raw) : raw;
        const url = `https://www.leaderssl.ru/tools/ssl_checker?cn=${encodeURIComponent(cn)}&commit=%D0%9F%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%B8%D1%82%D1%8C`;
        const MON = { 'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11 };
        fetchT(url, { headers: { Accept: 'text/html' } }, 20000)
            .then(r => r.text())
            .then(html => {
                const ok = /установлен правильно/i.test(html);
                // цепочка: <a class="cert-N">ИМЯ</a> — последний обычно = домен (лист)
                const chain = [...html.matchAll(/<a class="cert-\d+"[^>]*>(?:\s*<i[^>]*><\/i>)?\s*([^<]+)<\/a>/g)]
                    .map(m => m[1].trim()).filter(Boolean);
                // все русские даты на странице → лист: ближайшая будущая (до) и последняя прошедшая (с)
                const dates = [];
                const re = /(\d{1,2})\s+([а-яё]+)\s+(\d{4})/gi; let m;
                while ((m = re.exec(html))) { const mm = MON[m[2].toLowerCase()]; if (mm != null) dates.push(new Date(Date.UTC(+m[3], mm, +m[1]))); }
                const now = Date.now();
                const future = dates.filter(d => d.getTime() > now).sort((a, b) => a - b);
                const past = dates.filter(d => d.getTime() <= now).sort((a, b) => b - a);
                const leaf = chain.length ? chain[chain.length - 1] : '';
                const issuerChain = chain.slice(0, -1);
                const present = ok || chain.length > 0 || future.length > 0;
                sendResponse({
                    success: true, present, ok, leaf,
                    issuer: issuerChain.join(' ← ') || null,
                    chain,
                    validFrom: past[0] ? past[0].toISOString() : null,
                    validTo: future[0] ? future[0].toISOString() : null,
                    checkUrl: url
                });
            })
            .catch(e => sendResponse({ success: false, error: e.message, checkUrl: url }));
        return true;
    }

    // Пакетная проверка наличия SSL через leaderssl.ru (фон обходит CORS — работает с любой страницы)
    if (request.action === 'sslCheckLeader') {
        const raw = (request.domain || '').trim();
        if (!raw) { sendResponse({ success: false, error: 'empty' }); return true; }
        // домен с цифры в начале ломает валидатор leaderssl — лечится префиксом http://
        const cn = /^\d/.test(raw) ? ('http://' + raw) : raw;
        const url = `https://www.leaderssl.ru/tools/ssl_checker?cn=${encodeURIComponent(cn)}&commit=%D0%9F%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%B8%D1%82%D1%8C`;
        const timeout = Math.min(Math.max(parseInt(request.timeout) || 20000, 3000), 60000);
        fetchT(url, { headers: { Accept: 'text/html' } }, timeout)
            .then(r => r.text())
            .then(t => sendResponse({ success: true, ok: t.includes('Сертификат проверен и установлен правильно') }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    if (request.action === 'languageToolCheck') {
        const url = request.url || 'https://api.languagetool.org/v2/check';
        const body = `text=${encodeURIComponent(request.text)}&language=${request.language || 'ru'}`;

        fetchT(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
        }, 10000)
            .then(r => r.json())
            .then(data => sendResponse({ success: true, matches: data.matches || [] }))
            .catch(e => sendResponse({ success: false, error: e.message, matches: [] }));
        return true;
    }

    // --- Инжекция content.js для скриншота ---
    if (request.action === 'startScreenshot') {
        console.log('[BG] Screenshot request from popup');
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                sendResponse({ success: false, error: 'No active tab found' });
                return;
            }
            const tab = tabs[0];
            console.log('[BG] Injecting content.js into tab:', tab.id);

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }).then(() => {
                console.log('[BG] content.js injected successfully');
                sendResponse({ success: true });
            }).catch(err => {
                console.error('[BG] Injection failed:', err);
                sendResponse({ success: false, error: err.message });
            });
        });
        return true; // Keep channel open for async response
    }

    // --- Сокращатель YOURLS (использует сохранённые учётные данные) ---
    if (request.action === 'shortenUrl') {
        chrome.storage.local.get(['yourlsServer','yourlsUser','yourlsPass','yourlsSig'], (cfg) => {
            const server = cfg.yourlsServer || 'https://links.example.com';
            const apiUrl = `${server}/yourls-api.php`;

            const makeBody = () => {
                const p = new URLSearchParams({ action: 'shorturl', format: 'json', url: request.url });
                if (cfg.yourlsSig)  p.set('signature', cfg.yourlsSig);
                else                { p.set('username', cfg.yourlsUser || ''); p.set('password', cfg.yourlsPass || ''); }
                return p.toString();
            };

            fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: makeBody() })
                .then(r => r.json())
                .then(d => d.shorturl
                    ? sendResponse({ success: true, shorturl: d.shorturl })
                    : sendResponse({ success: false, error: d.message || 'Ошибка авторизации', needsLogin: true }))
                .catch(e => sendResponse({ success: false, error: e.message }));
        });
        return true;
    }

    // --- Whois RAW DEBUG (показывает сырые ответы всех источников) ---
    if (request.action === 'whoisDebug') {
        const domain = request.domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
        const tld = domain.split('.').pop();
        const RDAP = { ru:'https://rdap.tcinet.ru/domain/',com:'https://rdap.verisign.com/com/v1/domain/',net:'https://rdap.verisign.com/net/v1/domain/' };
        const rdapBase = RDAP[tld] || 'https://rdap.org/domain/';

        const sources = [
            { name: 'HackerTarget',         fetch: () => fetchT(`https://api.hackertarget.com/whois/?q=${encodeURIComponent(domain)}`, {}, 12000) },
            { name: 'whoisjson.com',        fetch: () => fetchT(`https://whoisjson.com/api/v1/whois?domain=${encodeURIComponent(domain)}`) },
            { name: 'SecurityTrails',       fetch: () => fetchT(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/whois`, { headers: ST_HDR() }) },
            { name: `RDAP (${rdapBase})`,   fetch: () => fetchT(rdapBase + encodeURIComponent(domain), { headers: { Accept: 'application/rdap+json' } }) },
            { name: 'who-dat',              fetch: () => fetchT(`https://who-dat.as93.net/${encodeURIComponent(domain)}`) },
            { name: 'networkcalc',          fetch: () => fetchT(`https://networkcalc.com/api/dns/whois/${encodeURIComponent(domain)}`) },
        ];

        Promise.all(sources.map(async s => {
            try {
                const r = await s.fetch();
                const text = await r.text();
                return { name: s.name, status: r.status, body: text.slice(0, 800) };
            } catch(e) {
                return { name: s.name, status: 0, body: `ERROR: ${e.message}` };
            }
        })).then(results => sendResponse({ success: true, results }));
        return true;
    }

    // --- Whois ---
    if (request.action === 'whois') {
        const domain = request.domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
        const tld = domain.split('.').pop();

        // ── Стандартная схема, которую всегда получает popup ──────────────────
        // { domain, registrar, registrar_url, created, updated, expires,
        //   status[], nameservers[], dnssec }
        // Все даты — YYYY-MM-DD или null. Все массивы — всегда массивы.
        const toSchema = (src) => ({
            domain:        String(src.domain        || domain).toLowerCase(),
            registrar:     String(src.registrar     || ''),
            registrar_url: String(src.registrar_url || ''),
            admin_contact: String(src.admin_contact || ''),
            created:       src.created  || null,
            updated:       src.updated  || null,
            expires:       src.expires  || null,
            status:       (Array.isArray(src.status)      ? src.status      : []).filter(Boolean),
            nameservers:  (Array.isArray(src.nameservers) ? src.nameservers : []).filter(Boolean),
            dnssec:        String(src.dnssec || 'unsigned'),
        });

        // ── Приватные адаптеры под каждый источник ────────────────────────────

        // SecurityTrails: плоский объект
        const adaptSecurityTrails = (d) => {
            if (!d || d.message || d.code === 403 || d.code === 402) return null;
            const ns = (d.nameservers || d.nameServers || d.name_servers || [])
                .map(n => (typeof n === 'string' ? n : n?.name || '').toLowerCase()).filter(Boolean);
            const st = Array.isArray(d.status) ? d.status : (d.status ? [String(d.status)] : []);
            return {
                domain,
                registrar:     d.registrar_name || (typeof d.registrar === 'string' ? d.registrar : d.registrar?.name) || '',
                registrar_url: d.registrar_url  || '',
                admin_contact: d.admin_contact  || '',
                created:  normalizeDate(d.created_date  || d.creation_date  || d.createdDate),
                updated:  normalizeDate(d.updated_date  || d.updatedDate),
                expires:  normalizeDate(d.expires_date  || d.expiration_date || d.expiresDate || d['paid-till']),
                status: st, nameservers: ns,
                dnssec: d.dnssec || 'unsigned',
            };
        };

        // RDAP (JSON стандарт)
        const getVcard = (entity, field) => {
            const vcard = entity?.vcardArray?.[1];
            if (!vcard) return '';
            const item = vcard.find(f => f[0] === field);
            if (!item) return '';
            const v = item[3];
            if (Array.isArray(v)) return v.flat().filter(s => typeof s === 'string' && s.trim()).join(', ');
            return String(v || '');
        };
        const getEvent = (events, ...names) => {
            if (!events?.length) return null;
            for (const n of names) {
                const ev = events.find(e => e.eventAction?.toLowerCase().includes(n));
                if (ev?.eventDate) return ev.eventDate;
            }
            return null;
        };
        const adaptRdap = (d) => {
            const reg   = d.entities?.find(e => e.roles?.includes('registrar'));
            const admin = d.entities?.find(e => e.roles?.includes('administrative'));
            const ev    = [...(d.events || []), ...(d.entities?.flatMap(e => e.events || []) || [])];

            // admin-contact: tcinet хранит URL в links сущности с ролью administrative
            const adminContact =
                admin?.links?.find(l => l.href && /^https?:\/\//i.test(l.href))?.href ||
                getVcard(admin, 'url') ||
                getVcard(admin, 'email') ||
                getVcard(reg,   'email') || '';

            return {
                domain:        (d.ldhName || domain).toLowerCase(),
                registrar:     getVcard(reg, 'fn') || reg?.handle || '',
                registrar_url: getVcard(reg, 'url') || '',
                admin_contact: adminContact,
                created:  normalizeDate(getEvent(ev, 'registration', 'created')),
                updated:  normalizeDate(getEvent(ev, 'last changed', 'updated')),
                expires:  normalizeDate(getEvent(ev, 'expiration', 'expiry')),
                status:      (d.status || []).map(String).filter(Boolean),
                nameservers: (d.nameservers || []).map(n => (n.ldhName || '').toLowerCase()).filter(Boolean),
                dnssec: d.secureDNS?.delegationSigned ? 'signedDelegation' : 'unsigned',
            };
        };

        // who-dat: вложенные структуры dates / nameservers
        const adaptWhoDat = (d) => {
            const dates = d.dates || {};
            const ns = (d.domain?.name_servers || d.nameservers || [])
                .map(n => (typeof n === 'string' ? n : n?.name || '').toLowerCase()).filter(Boolean);
            // admin-contact может быть в contacts.admin или registrar.abuseEmail
            const adminContact =
                d.contacts?.admin?.url ||
                d.contacts?.admin?.email ||
                d.registrar?.abuseEmail ||
                d['admin-contact'] || '';
            return {
                domain:        d.domain?.name || d.name || domain,
                registrar:     d.registrar?.name || '',
                registrar_url: d.registrar?.referral_url || d.registrar?.url || '',
                admin_contact: adminContact,
                created:  normalizeDate(dates.created  || d.created_date),
                updated:  normalizeDate(dates.updated  || d.updated_date),
                expires:  normalizeDate(dates.expires  || d.expiration_date),
                status:   d.status || d.domain?.status || [],
                nameservers: ns,
                dnssec: (d.dnssec?.signed || d.domain?.dnssec?.signed) ? 'signedDelegation' : 'unsigned',
            };
        };

        // Plain-text WHOIS (HackerTarget)
        const adaptText = (text) => {
            if (!text || text.length < 20) return null;
            if (/not found|no found|error|query limit/i.test(text.slice(0, 200))) return null;
            const lines = text.split('\n');
            const get = (...keys) => {
                for (const key of keys) {
                    const line = lines.find(l => l.toLowerCase().includes(key.toLowerCase() + ':'));
                    if (line) { const m = line.match(/:(.+)$/); if (m) return m[1].trim(); }
                }
                return null;
            };
            const getAll = (...keys) => {
                const res = [];
                for (const key of keys)
                    lines.filter(l => l.toLowerCase().includes(key.toLowerCase() + ':')).forEach(l => {
                        const m = l.match(/:(.+)$/); if (m) res.push(m[1].trim());
                    });
                return [...new Set(res)].filter(Boolean);
            };
            const registrar = get('registrar','registrar name','sponsoring registrar');
            const created   = normalizeDate(get('created','creation date','registered on','registered','reg-date'));
            const expires   = normalizeDate(get('paid-till','expiry date','expires on','expiration date','registry expiry date','registrar registration expiration date'));
            const updated   = normalizeDate(get('changed','last-modified','updated date','last updated'));
            const ns        = getAll('nserver','name server','nameserver').map(n => n.toLowerCase().replace(/\.$/, ''));
            const stRaw     = get('state','status');
            const status    = stRaw ? stRaw.split(',').map(s => s.trim()).filter(Boolean) : getAll('domain status');
            if (!registrar && !created && !expires && !ns.length) return null;
            return {
                domain, registrar: registrar || '',
                registrar_url: '',
                admin_contact: get('admin-contact','admin email','admin') || '',
                created, updated, expires, status, nameservers: ns,
                dnssec: get('dnssec') || 'unsigned',
            };
        };

        // Универсальный адаптер — пробует все известные ключи
        const adaptGeneric = (d) => {
            if (!d || typeof d !== 'object') return null;
            if (d.message || d.error || d.statusCode >= 400) return null;

            const get = (...keys) => {
                for (const key of keys) {
                    const v = key.split('.').reduce((o, k) => o?.[k], d);
                    if (v != null && v !== '' && v !== 'null') return v;
                }
                return null;
            };
            const str = (...k) => { const v = get(...k); return typeof v === 'string' ? v : ''; };
            const getNs = () => {
                const keys = ['name_servers','nameservers','nameServers','nserver','domain.name_servers','ns'];
                for (const key of keys) {
                    const v = key.split('.').reduce((o,k) => o?.[k], d);
                    if (Array.isArray(v) && v.length)
                        return v.map(n => (typeof n === 'string' ? n : n?.name || '').toLowerCase().replace(/\.$/, '')).filter(Boolean);
                    if (typeof v === 'string' && v.trim())
                        return v.split(/[\s,;]+/).map(n => n.toLowerCase().replace(/\.$/, '')).filter(Boolean);
                }
                return [];
            };
            const getSt = () => {
                const v = get('status','state','domain.status');
                if (Array.isArray(v)) return v.map(String);
                if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
                return [];
            };
            return {
                domain: str('domain','domain.name','domainName','ldhName') || domain,
                registrar: str('registrar.name','registrar_name','registrar','registrarName'),
                registrar_url: str('registrar.referral_url','registrar_url'),
                admin_contact: str('admin_contact','admin-contact','admin_email','adminContact'),
                created:  normalizeDate(str('dates.created','created_date','creation_date','createdDate','created','registered','reg_date')),
                updated:  normalizeDate(str('dates.updated','updated_date','updatedDate','changed','last_changed')),
                expires:  normalizeDate(str('dates.expires','expiration_date','expires_date','expiresDate','paid-till','paid_till','expiry','free-date','registry_expiry_date')),
                status: getSt(), nameservers: getNs(),
                dnssec: str('dnssec') || 'unsigned',
            };
        };

        // ── Публичный адаптер: sourceName → стандартная схема ─────────────────
        const normalizeWhoisData = (sourceName, rawData) => {
            try {
                let parsed = null;
                if (sourceName === 'hackertarget') parsed = adaptText(rawData);
                else if (sourceName === 'who-dat')       parsed = adaptWhoDat(rawData);
                else if (sourceName === 'rdap')          parsed = adaptRdap(rawData);
                else if (sourceName === 'securitytrails')parsed = adaptSecurityTrails(rawData);
                else                                     parsed = adaptGeneric(rawData);
                if (!parsed) return null;
                return toSchema(parsed);
            } catch (e) {
                console.warn(`[WHOIS] adapter(${sourceName}) error:`, e.message);
                return null;
            }
        };

        const hasData = (s) => !!(s?.registrar || s?.created || s?.expires || s?.nameservers?.length);
        const RDAP_MAP = {
            com: 'https://rdap.verisign.com/com/v1/domain/',
            net: 'https://rdap.verisign.com/net/v1/domain/',
            org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
        };

        // ── Цепочка источников — каждый проходит через normalizeWhoisData ────────
        (async () => {
            const errors = [];
            let data = null;
            let rawText = null; // сырой WHOIS-текст для показа под карточкой
            let rawObj  = null; // первый «сырой» JSON-ответ источника (фолбэк, если текста нет)

            // 0) Для .ru/.su — tcinet RDAP напрямую (background worker не имеет CORS)
            if (!data && (tld === 'ru' || tld === 'su')) try {
                const r = await fetchT(`https://rdap.tcinet.ru/domain/${encodeURIComponent(domain)}`,
                    { headers: { Accept: 'application/rdap+json, application/json' } }, 10000);
                if (r.ok) {
                    const j = await r.json(); rawObj = rawObj || j;
                    const n = normalizeWhoisData('rdap', j);
                    if (n && hasData(n)) data = n;
                    else errors.push('tcinet RDAP: пусто');
                } else errors.push(`tcinet RDAP: HTTP ${r.status}`);
            } catch (e) { errors.push(`tcinet RDAP: ${e.message}`); }

            // 1) HackerTarget — plain-text
            try {
                const r    = await fetchT(`https://api.hackertarget.com/whois/?q=${encodeURIComponent(domain)}`, {}, 12000);
                const text = await r.text();
                if (text && text.length > 50 && !/error|query limit/i.test(text.slice(0, 100))) rawText = text;
                const n    = normalizeWhoisData('hackertarget', text);
                if (n && hasData(n)) {
                    // Если уже есть данные из tcinet — объединяем, берём admin_contact
                    if (data && !data.admin_contact && n.admin_contact) {
                        data.admin_contact = n.admin_contact;
                    } else if (!data) {
                        data = n;
                    }
                } else errors.push(`HackerTarget: пустой ответ | ${text.slice(0, 60)}`);
            } catch (e) { errors.push(`HackerTarget: ${e.message}`); }

            // 2) whoisjson.com
            if (!data) try {
                const r = await fetchT(`https://whoisjson.com/api/v1/whois?domain=${encodeURIComponent(domain)}`, {}, 10000);
                const j = await r.json(); rawObj = rawObj || j;
                const n = normalizeWhoisData('generic', j);
                if (n && hasData(n)) data = n;
                else errors.push('whoisjson: пусто');
            } catch (e) { errors.push(`whoisjson: ${e.message}`); }

            // 3) SecurityTrails
            if (!data) try {
                const r   = await fetchT(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}`, { headers: ST_HDR() });
                const raw = await r.json(); rawObj = rawObj || raw;
                const n   = normalizeWhoisData('securitytrails', raw.whois || raw);
                if (n && hasData(n)) data = n;
                else errors.push(`ST: ${r.status}`);
            } catch (e) { errors.push(`ST: ${e.message}`); }

            // 4) RDAP
            if (!data) {
                const rdapUrls = [
                    RDAP_MAP[tld] && RDAP_MAP[tld] + encodeURIComponent(domain),
                    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
                ].filter(Boolean);
                for (const url of rdapUrls) {
                    if (data) break;
                    try {
                        const r = await fetchT(url, { headers: { Accept: 'application/rdap+json, application/json' } }, 10000);
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        const j = await r.json(); rawObj = rawObj || j;
                        const n = normalizeWhoisData('rdap', j);
                        if (n && hasData(n)) data = n;
                        else errors.push(`RDAP(${url.slice(0, 40)}): пусто`);
                    } catch (e) { errors.push(`RDAP: ${e.message}`); }
                }
            }

            // 5) who-dat
            if (!data) try {
                const r = await fetchT(`https://who-dat.as93.net/${encodeURIComponent(domain)}`, {}, 12000);
                const j = await r.json(); rawObj = rawObj || j;
                const n = normalizeWhoisData('who-dat', j);
                if (n && hasData(n)) data = n;
                else errors.push('who-dat: пусто');
            } catch (e) { errors.push(`who-dat: ${e.message}`); }

            // 6) networkcalc
            if (!data) try {
                const r = await fetchT(`https://networkcalc.com/api/dns/whois/${encodeURIComponent(domain)}`, {}, 10000);
                const j = await r.json(); rawObj = rawObj || j;
                const n = normalizeWhoisData('generic', j);
                if (n && hasData(n)) data = n;
                else errors.push('networkcalc: пусто');
            } catch (e) { errors.push(`networkcalc: ${e.message}`); }

            // 7) Обогащение admin_contact — запускается для ЛЮБОГО домена если поле пустое
            if (data && !data.admin_contact) {

                // 7a) who-dat — быстрый и бесплатный, содержит abuseEmail регистратора
                try {
                    const r  = await fetchT(`https://who-dat.as93.net/${encodeURIComponent(domain)}`, {}, 10000);
                    const j  = await r.json();
                    const ac =
                        j.contacts?.admin?.url   ||
                        j.contacts?.admin?.email ||
                        j.registrar?.abuseEmail  ||
                        j['admin-contact']        || '';
                    if (ac) data.admin_contact = ac;
                } catch (_) {}

                // 7b) Для .ru — напрямую к tcinet RDAP (без CORS в service worker)
                if (!data.admin_contact && tld === 'ru') try {
                    const r = await fetchT(
                        `https://rdap.tcinet.ru/domain/${encodeURIComponent(domain)}`,
                        { headers: { Accept: 'application/rdap+json, application/json' } },
                        8000
                    );
                    if (r.ok) {
                        const j     = await r.json();
                        const admin = j.entities?.find(e => e.roles?.includes('administrative'));
                        const url   = admin?.links?.find(l => /^https?:\/\//i.test(l.href || ''))?.href;
                        if (url) data.admin_contact = url;
                    }
                } catch (_) {}

                // 7c) Для .ru — HackerTarget текстовый WHOIS (регулярка)
                if (!data.admin_contact && tld === 'ru') try {
                    const r    = await fetchT(`https://api.hackertarget.com/whois/?q=${encodeURIComponent(domain)}`, {}, 8000);
                    const text = await r.text();
                    const m    = text.match(/admin-contact:\s*(\S+)/i);
                    if (m && /^https?:\/\//i.test(m[1])) data.admin_contact = m[1].trim();
                } catch (_) {}
            }

            // 8) Всегда добавляем NS из DNS если отсутствуют
            try {
                const r   = await fetchT(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`);
                const dns = await r.json();
                const ns  = (dns.Answer || []).map(a => a.data.replace(/\.$/, '').toLowerCase()).filter(Boolean);
                if (ns.length) {
                    if (!data) data = toSchema({ domain, registrar:'', registrar_url:'', created:null, updated:null, expires:null, status:[], nameservers:ns, dnssec:'unsigned' });
                    else if (!data.nameservers.length) data.nameservers = ns;
                }
            } catch (_) { /* необязательно */ }

            // Всегда отправляем стандартную схему
            const fallback = toSchema({ domain, registrar:'', registrar_url:'', created:null, updated:null, expires:null, status:[], nameservers:[], dnssec:'unsigned' });
            // RAW: предпочитаем классический whois-текст; если его нет — отдаём
            // сырой JSON первого сработавшего источника, чтобы сотрудник всегда
            // мог посмотреть исходные данные (особенно для нестандартных доменов).
            let rawOut = rawText;
            if (!rawOut && rawObj) {
                try { rawOut = JSON.stringify(rawObj, null, 2); } catch { rawOut = null; }
            }
            const result = { success: true, data: data || fallback, _errors: errors, _raw: rawOut || null };
            // Сохраняем в session storage — popup найдёт даже если закрылся во время загрузки
            try {
                chrome.storage.session.set({
                    [`whois_result_${domain}`]: result  // результат для recovery
                });
            } catch {}
            sendResponse(result);
        })();
        return true;
    }

    // --- SecurityTrails DNS ---
    if (request.action === 'stDns') {
        const { domain } = request;
        if (!ST_KEY_CUR) { sendResponse({ success: false, error: 'Не указан API-ключ SecurityTrails. Добавьте свой ключ в разделе ST → «⚙ Свой API-ключ».' }); return true; }
        fetchT(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/details`, { headers: ST_HDR() })
            .then(r => r.json())
            .then(d => sendResponse({ success: true, data: d }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    // --- SecurityTrails Поддомены ---
    if (request.action === 'stSubdomains') {
        const { domain } = request;
        if (!ST_KEY_CUR) { sendResponse({ success: false, error: 'Не указан API-ключ SecurityTrails. Добавьте свой ключ в разделе ST → «⚙ Свой API-ключ».' }); return true; }
        fetchT(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains?children_only=false&include_inactive=true`, { headers: ST_HDR() })
            .then(r => r.json())
            .then(d => {
                const subs = Array.isArray(d.subdomains) ? d.subdomains : [];
                const full = subs.map(s => `${s}.${domain}`).sort();
                sendResponse({ success: true, data: { count: full.length, subdomains: full } });
            })
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    // --- SecurityTrails История DNS ---
    if (request.action === 'stHistory') {
        const { domain, type } = request;
        const fmtDate = (ms) => { try { return new Date(ms).toISOString().slice(0, 10); } catch (e) { return '?'; } };

        // Бесплатный пассивный DNS (mnemonic) — без ключа, с историей
        const fromMnemonic = () =>
            fetchT(`https://api.mnemonic.no/pdns/v3/${encodeURIComponent(domain)}?limit=500`, { headers: { Accept: 'application/json' } }, 15000)
                .then(r => r.json())
                .then(j => {
                    const rows = (j && Array.isArray(j.data)) ? j.data : [];
                    const want = String(type).toLowerCase();
                    const recs = rows
                        .filter(x => String(x.rrtype || '').toLowerCase() === want)
                        .sort((a, b) => (b.lastSeenTimestamp || 0) - (a.lastSeenTimestamp || 0))
                        .map(x => ({
                            first_seen: fmtDate(x.firstSeenTimestamp),
                            last_seen: fmtDate(x.lastSeenTimestamp),
                            values: [{ value: x.answer }]
                        }));
                    return { records: recs };
                });

        // SecurityTrails — только если задан ключ (платный, более полная история)
        const fromST = () =>
            fetchT(`https://api.securitytrails.com/v1/history/${encodeURIComponent(domain)}/dns/${type}`, { headers: ST_HDR() })
                .then(r => r.json());

        // Текущие живые записи (DoH) — чтобы показать актуальные значения для любого типа
        const fromLive = () =>
            fetchT(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`, { headers: { Accept: 'application/json' } }, 8000)
                .then(r => r.json())
                .then(j => (j && Array.isArray(j.Answer) ? j.Answer : [])
                    .map(a => String(a.data || '').replace(/^"|"$/g, '').replace(/\.$/, ''))
                    .filter(Boolean))
                .catch(() => []);

        // Историческая база: SecurityTrails (если есть ключ) иначе mnemonic
        const histSource = ST_KEY_CUR
            ? fromST().then(d => (d && d.records) ? d : { records: [] }).catch(() => fromMnemonic())
            : fromMnemonic().catch(() => ({ records: [] }));

        const valOf = (v) => v && (v.nameserver || v.ip || v.ipv6 || v.host || v.hostname || v.value || v.name || v.rdata || v.email || '');

        Promise.all([histSource, fromLive()])
            .then(([hist, liveVals]) => {
                const records = (hist && hist.records) ? hist.records.slice() : [];
                const norm = (s) => String(s || '').replace(/\.$/, '').toLowerCase();
                const liveSet = new Set(liveVals.map(norm));
                // помечаем исторические записи, которые активны сейчас
                records.forEach(rec => {
                    const has = (rec.values || []).some(v => liveSet.has(norm(valOf(v))));
                    if (has) rec.last_seen = 'сейчас';
                });
                // добавляем текущие значения, которых нет ни в одной исторической записи
                const known = new Set();
                records.forEach(rec => (rec.values || []).forEach(v => known.add(norm(valOf(v)))));
                const missing = liveVals.filter(v => !known.has(norm(v)));
                if (missing.length) {
                    records.unshift({ first_seen: 'сейчас', last_seen: 'сейчас', values: missing.map(v => ({ value: v })) });
                }
                sendResponse({ success: true, data: { records } });
            })
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    // --- IP-информация ---
    if (request.action === 'ipInfo') {
        const target = request.target;
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(target);
        // Собираем ISP/Org из НЕСКОЛЬКИХ источников — как на check-host.net/ip-info,
        // чтобы видеть все варианты названий организации (нужно для опознания хостера/конструктора).
        const gather = async (ip) => {
            // val → Set<src> — одно и то же название может прийти из нескольких источников
            const valSources = new Map();
            const asns = new Set();
            let base = null;
            const add = (src, ...vs) => vs.forEach(v => {
                v = (v || '').toString().trim();
                if (!v) return;
                if (!valSources.has(v)) valSources.set(v, new Set());
                valSources.get(v).add(src);
            });

            // 1) ip-api.com — основной источник геоданных
            try {
                const r = await fetchT(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,zip,timezone,isp,org,as,asname,reverse,hosting,query`);
                const d = await r.json();
                if (d.status === 'success') { base = d; add('ip-api.com', d.isp, d.org, d.asname); if (d.as) asns.add(d.as); }
            } catch (e) {}

            // 2) ipwho.is — отдельная база (free, без ключа)
            try {
                const r = await fetchT(`https://ipwho.is/${encodeURIComponent(ip)}`, {}, 7000);
                const d = await r.json();
                if (d && d.success !== false) {
                    add('ipwho.is', d.connection?.isp, d.connection?.org, d.connection?.domain);
                    if (d.connection?.asn) asns.add('AS' + d.connection.asn + (d.connection.org ? ' ' + d.connection.org : ''));
                    if (!base) base = { status: 'success', query: ip, country: d.country, countryCode: d.country_code, regionName: d.region, city: d.city, zip: d.postal, timezone: d.timezone?.id, isp: d.connection?.isp, org: d.connection?.org, as: d.connection?.asn ? 'AS' + d.connection.asn : '', reverse: '' };
                }
            } catch (e) {}

            // 3) ipinfo.io (без токена) — org вида "AS12345 Имя", иногда hostname
            try {
                const r = await fetchT(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {}, 7000);
                const d = await r.json();
                if (d && !d.error) {
                    if (d.org) { add('ipinfo.io', d.org.replace(/^AS\d+\s+/i, '')); asns.add(d.org); }
                    if (d.hostname && base && !base.reverse) base.reverse = d.hostname;
                }
            } catch (e) {}

            if (!base) { sendResponse({ success: false, error: 'Не удалось получить данные об IP' }); return; }
            // orgVariants — плоский список строк для detectHosters
            base.orgVariants = [...valSources.keys()];
            // orgSourced — [{val, srcs:[]}] для отображения с подписью источника
            base.orgSourced = [...valSources.entries()].map(([val, srcs]) => ({ val, srcs: [...srcs] }));
            base.asns = [...asns];
            sendResponse({ success: true, data: base });
        };
        if (isIp) { gather(target); }
        else {
            fetchT(`https://dns.google/resolve?name=${encodeURIComponent(target)}&type=A`)
                .then(r => r.json())
                .then(d => { const ip = d.Answer?.find(a => a.type === 1)?.data || d.Answer?.[0]?.data; if (!ip) throw new Error('DNS не разрешён'); gather(ip); })
                .catch(e => sendResponse({ success: false, error: e.message }));
        }
        return true;
    }

    // --- DNS Propagation ---
    // A/AAAA → check-host.net (30 реальных гео-узлов, возвращает только A/AAAA)
    // NS/MX/TXT/CNAME/… → DoH-резолверы (умеют все типы)
    if (request.action === 'dnsPropagation') {
        const { domain, type } = request;
        const enc = encodeURIComponent(domain);
        const ccFlag = cc => (cc || '').toUpperCase().replace(/./g, c =>
            String.fromCodePoint(c.charCodeAt(0) + 127397));

        const useCheckHost = (type === 'A' || type === 'AAAA');

        if (useCheckHost) {
            (async () => {
                try {
                    const initR = await fetchT(
                        `https://check-host.net/check-dns?host=${enc}&max_nodes=30`,
                        { headers: { Accept: 'application/json' } }, 8000
                    );
                    const init = await initR.json();
                    const reqId = init.request_id || init.request_token;
                    if (!init.ok || !reqId) {
                        sendResponse({ success: false, error: init.error || 'check-host не принял запрос' });
                        return;
                    }
                    const nodes = init.nodes || {};
                    const ids = Object.keys(nodes);
                    let results = {};
                    for (let attempt = 0; attempt < 12; attempt++) {
                        await new Promise(res => setTimeout(res, 2000));
                        try {
                            const rr = await fetchT(`https://check-host.net/check-result/${reqId}`, { headers: { Accept: 'application/json' } });
                            results = await rr.json();
                        } catch (_) { continue; }
                        const pending = ids.filter(id => results[id] === null || results[id] === undefined);
                        if (ids.length && pending.length === 0) break;
                    }
                    // node format: ["cc", "CountryName", "City", "IP", "ASN"]
                    const servers = ids.map(id => {
                        const n = nodes[id] || [];
                        const cc   = (n[0] || '').toUpperCase();
                        const city = n[2] || n[1] || id;
                        const flag = ccFlag(cc);
                        const raw  = results[id];
                        let ips = [], ok = false, err = false;
                        if (Array.isArray(raw) && raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
                            // result format: [{"A":[...],"AAAA":[...],"TTL":N}]
                            ips = raw[0][type] || [];
                            ok  = ips.length > 0;
                        } else if (raw === null) {
                            err = true;
                        }
                        return { name: city, loc: cc, flag, ips, ok, err };
                    });
                    sendResponse({ success: true, servers });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
        } else {
            // DoH для NS, MX, TXT, CNAME, SOA, DMARC и т.д.
            const jh = { Accept: 'application/dns-json' };
            const DOH = [
                { name: 'Google',        city: 'Mountain View', cc: 'US', url: `https://dns.google/resolve?name=${enc}&type=${type}` },
                { name: 'Cloudflare',    city: 'San Francisco', cc: 'US', url: `https://cloudflare-dns.com/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'OpenDNS',       city: 'San Jose',      cc: 'US', url: `https://doh.opendns.com/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'Quad9',         city: 'Zürich',        cc: 'CH', url: `https://dns.quad9.net:5053/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'dns0.eu',       city: 'Frankfurt',     cc: 'DE', url: `https://dns0.eu/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'DNS.Watch',     city: 'Frankfurt',     cc: 'DE', url: `https://resolver1.dns.watch/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'Mullvad',       city: 'Stockholm',     cc: 'SE', url: `https://doh.mullvad.net/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'AdGuard',       city: 'Limassol',      cc: 'CY', url: `https://dns.adguard.com/resolve?name=${enc}&type=${type}` },
                { name: 'Yandex',        city: 'Moscow',        cc: 'RU', url: `https://dns.yandex.ru/resolve?name=${enc}&type=${type}` },
                { name: 'AliDNS',        city: 'Hangzhou',      cc: 'CN', url: `https://dns.alidns.com/resolve?name=${enc}&type=${type}` },
                { name: 'TWNIC',         city: 'Taipei',        cc: 'TW', url: `https://dns.twnic.tw/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'IIJ',           city: 'Tokyo',         cc: 'JP', url: `https://public.dns.iij.jp/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'DNS.SB',        city: 'Singapore',     cc: 'SG', url: `https://doh.dns.sb/dns-query?name=${enc}&type=${type}`, h: jh },
                { name: 'CleanBrowsing', city: 'Anycast',       cc: '',   url: `https://doh.cleanbrowsing.org/doh/security-filter/?name=${enc}&type=${type}`, h: jh },
                { name: 'NextDNS',       city: 'Anycast',       cc: '',   url: `https://anycast.dns.nextdns.io?name=${enc}&type=${type}` },
            ];
            Promise.allSettled(
                DOH.map(s =>
                    fetchT(s.url, { headers: s.h || {} }, 6000)
                        .then(r => r.json())
                        .then(d => ({
                            name: s.name, loc: s.cc, flag: ccFlag(s.cc),
                            ips: d.Answer?.map(a => a.data) || [],
                            ok: !!(d.Answer?.length), err: false
                        }))
                        .catch(() => ({ name: s.name, loc: s.cc, flag: ccFlag(s.cc), ips: [], ok: false, err: true }))
                )
            ).then(res => sendResponse({ success: true, servers: res.map(r => r.value) }));
        }
        return true;
    }

    // --- Check-Host ---
    if (request.action === 'checkHost') {
        const { host, type } = request;
        const ct = type === 'ping' ? 'check-ping' : type === 'tcp' ? 'check-tcp' : 'check-http';
        (async () => {
            try {
                const initR = await fetchT(`https://check-host.net/${ct}?host=${encodeURIComponent(host)}&max_nodes=10`, { headers: { Accept: 'application/json' } });
                const init  = await initR.json();
                // check-host.net возвращает request_id (а не request_token!) — раньше из-за
                // этого результат запрашивался по /check-result/undefined и висело «ожидание».
                const reqId = init.request_id || init.request_token;
                if (!init.ok || !reqId) {
                    sendResponse({ success: false, error: init.error || 'check-host не принял запрос' });
                    return;
                }
                const nodes = init.nodes || {};
                const ids   = Object.keys(nodes);
                let results = {};
                // Опрашиваем результат, пока все узлы не отчитаются (или не выйдет таймаут ~12с).
                for (let attempt = 0; attempt < 8; attempt++) {
                    await new Promise(res => setTimeout(res, 1500));
                    try {
                        const rr = await fetchT(`https://check-host.net/check-result/${reqId}`, { headers: { Accept: 'application/json' } });
                        results  = await rr.json();
                    } catch (_) { continue; }
                    const pending = ids.filter(id => results[id] === null || results[id] === undefined);
                    if (ids.length && pending.length === 0) break;
                }
                sendResponse({ success: true, nodes, results });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // --- Mixed content: тянем HTML страницы по HTTPS для анализа в попапе ---
    if (request.action === 'mixedFetch') {
        let url = String(request.url || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (!url) { sendResponse({ success: false, error: 'Пустой домен' }); return true; }
        const full = 'https://' + url + (url.includes('/') ? '' : '/');
        fetchT(full, { method: 'GET', credentials: 'omit', redirect: 'follow' }, 12000)
            .then(async r => {
                const html = await r.text();
                sendResponse({ success: true, html, finalUrl: r.url || full });
            })
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    // --- Автосохранение копий в «Буфер» ---
    if (request.action === 'clipAdd') {
        const data = (request.data || '').slice(0, 20000);
        if (!data.trim()) { sendResponse && sendResponse({ ok: false }); return true; }
        saveClipItem({ id: clipGenId(), type: 'text', data, ts: Date.now(), pinned: false });
        sendResponse && sendResponse({ ok: true });
        return true;
    }

    // --- Снимок видимой вкладки (для буфера) ---
    if (request.action === 'captureTab') {
        try {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) { sendResponse({ success: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'capture failed' }); return; }
                sendResponse({ success: true, dataUrl });
            });
        } catch (e) { sendResponse({ success: false, error: e.message }); }
        return true;
    }

    // --- Переводчик (бесплатно, без ключа) ---
    if (request.action === 'translate') {
        (async () => {
            const text = (request.text || '').slice(0, 5000);
            const from = request.from || 'auto';
            const to = request.to || 'ru';
            if (!text.trim()) { sendResponse({ success: false, error: 'Пустой текст' }); return; }

            // 1) Google Translate (публичный gtx-endpoint)
            try {
                const url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
                    + '&sl=' + encodeURIComponent(from) + '&tl=' + encodeURIComponent(to)
                    + '&dt=t&q=' + encodeURIComponent(text);
                const r = await fetchT(url, { method: 'GET', credentials: 'omit' }, 12000);
                if (r.ok) {
                    const data = await r.json();
                    if (Array.isArray(data) && Array.isArray(data[0])) {
                        const translated = data[0].map(seg => (seg && seg[0]) ? seg[0] : '').join('');
                        const detected = data[2] || (Array.isArray(data[8]) && data[8][0] && data[8][0][0]) || null;
                        if (translated.trim()) { sendResponse({ success: true, text: translated, detected, engine: 'Google' }); return; }
                    }
                }
            } catch (e) { /* пробуем фолбэк */ }

            // 2) MyMemory (запасной вариант)
            try {
                const pair = (from === 'auto' ? 'en' : from) + '|' + to;
                const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
                    + '&langpair=' + encodeURIComponent(pair);
                const r = await fetchT(url, { method: 'GET', credentials: 'omit' }, 12000);
                const data = await r.json();
                const t = data && data.responseData && data.responseData.translatedText;
                if (t) { sendResponse({ success: true, text: t, detected: null, engine: 'MyMemory' }); return; }
            } catch (e) {}

            sendResponse({ success: false, error: 'Сервисы перевода недоступны' });
        })();
        return true;
    }

    // --- Заголовки ответа для детектора технологий (Стек) ---
    if (request.action === 'techHeaders') {
        const url = request.url;
        if (!url) { sendResponse({ success: false }); return true; }
        fetchT(url, { method: 'GET', credentials: 'omit', redirect: 'follow' }, 9000)
            .then(r => {
                const h = {};
                r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
                sendResponse({ success: true, headers: h });
            })
            .catch(() => sendResponse({ success: false }));
        return true;
    }

    // --- Проверка домена на почтовую аутентификацию (аналог mail-tester без отправки письма) ---
    if (request.action === 'mailCheck') {
        const domain = String(request.domain || '').trim().toLowerCase()
            .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0].replace(/\.$/, '');
        const userSelector = String(request.selector || '').trim().toLowerCase();
        if (!domain) { sendResponse({ success: false, error: 'Пустой домен' }); return true; }

        const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(domain);

        const doh = (name, type) =>
            fetchT(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { headers: { Accept: 'application/json' } }, 8000)
                .then(r => r.json()).catch(() => ({}));
        const txtOf = (j) => (j.Answer || []).filter(a => a.type === 16)
            .map(a => String(a.data || '').replace(/^"|"$/g, '').replace(/" "/g, '').replace(/\\"/g, '"'));

        (async () => {
            const res = { domain, isIp };

            // Собираем IP для PTR/blacklist
            const ips = new Set();

            if (isIp) {
                ips.add(domain);
            } else {
                // A
                const a = await doh(domain, 'A');
                res.a = (a.Answer || []).filter(x => x.type === 1).map(x => x.data);
                res.a.forEach(ip => ips.add(ip));

                // MX
                const mx = await doh(domain, 'MX');
                res.mx = (mx.Answer || []).filter(x => x.type === 15)
                    .map(x => x.data).sort((p, q) => parseInt(p) - parseInt(q));

                // SPF
                const spfList = txtOf(await doh(domain, 'TXT'));
                res.spf = spfList.find(t => /^v=spf1/i.test(t)) || null;

                // DMARC
                const dmarcList = txtOf(await doh(`_dmarc.${domain}`, 'TXT'));
                res.dmarc = dmarcList.find(t => /^v=DMARC1/i.test(t)) || null;

                // DKIM — перебор популярных селекторов (+ заданный пользователем)
                const selectors = [...new Set([userSelector, 'dkim', 'default', 'mail', 'google',
                    'selector1', 'selector2', 'k1', 's1', 's2', 'mxvault', 'dkim1'].filter(Boolean))];
                res.dkim = null; res.dkimSelector = null;
                for (const sel of selectors) {
                    const d = txtOf(await doh(`${sel}._domainkey.${domain}`, 'TXT'));
                    const rec = d.find(t => /(^|;)\s*(v=DKIM1|k=rsa|p=)/i.test(t));
                    if (rec) { res.dkim = rec; res.dkimSelector = sel; break; }
                }

                // IP MX-хостов — тоже для PTR/blacklist
                for (const m of (res.mx || [])) {
                    const host = m.split(/\s+/)[1]?.replace(/\.$/, '');
                    if (host) {
                        const ma = await doh(host, 'A');
                        (ma.Answer || []).filter(x => x.type === 1).forEach(x => ips.add(x.data));
                    }
                }
            }

            // PTR (rDNS)
            res.ptr = [];
            for (const ip of ips) {
                if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
                const rev = ip.split('.').reverse().join('.') + '.in-addr.arpa';
                const p = await doh(rev, 'PTR');
                const names = (p.Answer || []).filter(x => x.type === 12).map(x => x.data.replace(/\.$/, ''));
                res.ptr.push({ ip, names });
            }

            // DNSBL — проверка IP по чёрным спискам
            const zones = [
                { zone: 'zen.spamhaus.org',       name: 'Spamhaus ZEN' },
                { zone: 'bl.spamcop.net',         name: 'SpamCop' },
                { zone: 'b.barracudacentral.org', name: 'Barracuda' },
                { zone: 'dnsbl.sorbs.net',        name: 'SORBS' },
                { zone: 'psbl.surriel.com',       name: 'PSBL' },
                { zone: 'all.s5h.net',            name: 's5h' },
                { zone: 'dnsbl-1.uceprotect.net', name: 'UCEPROTECT-1' },
            ];
            res.blacklists = [];
            for (const ip of ips) {
                if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
                const rev = ip.split('.').reverse().join('.');
                for (const z of zones) {
                    const q = await doh(`${rev}.${z.zone}`, 'A');
                    const answers = (q.Answer || []).filter(x => x.type === 1).map(x => x.data);
                    // 127.255.255.x = код ошибки/блокировки публичного резолвера → проверка недоступна
                    const blocked = answers.some(a => /^127\.255\.255\./.test(a));
                    const listed  = answers.some(a => /^127\.0\.0\./.test(a));
                    res.blacklists.push({ ip, zone: z.name, status: blocked ? 'unknown' : (listed ? 'listed' : 'clean') });
                }
            }

            sendResponse({ success: true, data: res });
        })().catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }

    // --- Переоткрыть попап после выбора области сканирования на странице ---
    // (попап закрывается, когда пользователь кликает по странице в режиме выбора)
    if (request.action === 'areaPickDone') {
        try {
            const p = chrome.action.openPopup();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) { /* openPopup недоступен/без жеста — попап откроют вручную */ }
        return false;
    }

    // --- Захват экрана ---
    if (request.action === 'captureScreenClean') {
        // Получаем активную вкладку текущего окна и захватываем её окно явно
        const tryCapture = (attempt) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs && tabs[0];
                const winId = tab ? tab.windowId : null;
                const cb = (dataUrl) => {
                    if (chrome.runtime.lastError || !dataUrl) {
                        const msg = (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'нет данных';
                        // одна повторная попытка (часто помогает при transient-ошибках)
                        if (attempt < 1) { setTimeout(() => tryCapture(attempt + 1), 250); return; }
                        sendResponse({ success: false, error: msg });
                        return;
                    }
                    chrome.storage.local.set({ capturedImage: dataUrl }, () => sendResponse({ success: true }));
                };
                if (winId != null) chrome.tabs.captureVisibleTab(winId, { format: 'png' }, cb);
                else chrome.tabs.captureVisibleTab({ format: 'png' }, cb);
            });
        };
        tryCapture(0);
        return true;
    }
});
