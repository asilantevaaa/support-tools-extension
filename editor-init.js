// editor-init.js — выполняется до editor.js.
// Вынесено из инлайн-<script> в editor.html: MV3 (и CSP страниц, где открывается
// редактор) запрещают инлайн-скрипты, поэтому код лежит отдельным файлом.
(function () {
    // Заглушка chrome.storage на случай, если редактор открыт вне расширения.
    if (!window.chrome || !window.chrome.storage) {
        window.chrome = {
            storage: { local: { get: (k, cb) => cb && cb({}), set: () => {} } },
            runtime: {}
        };
    }
    // Хук, через который editor.js отдаёт ссылку на свой fabric-canvas.
    window.__edhook = (c) => { window.__edcanvas = c; };
})();
