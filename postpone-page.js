/* Выполняется в контексте страницы staff.example.com (не в isolated world),
   чтобы иметь доступ к kendo/jQuery. Загружается postpone-quick.js как внешний
   <script src=runtime.getURL(...)> — так обходится CSP, запрещающий inline-скрипты. */
(function () {
    console.log('%c[Postpone-page] v3.2 слушатель установлен', 'color:#7cc4ff');
    document.addEventListener('stSetDelay', function (e) {
        try {
            var inp = document.querySelector('input[name="delay_date"]');
            if (!inp) return;
            // Значение передаём через DOM-атрибут (e.detail не проходит из isolated
            // world контент-скрипта в контекст страницы — приходит null).
            var str = inp.getAttribute('data-st-delay') || e.detail;
            var $ = window.jQuery || window.$;
            var w = ($ && $(inp).data) ? $(inp).data('kendoDateTimePicker') : null;
            if (w) {
                var d = (window.kendo && kendo.parseDate) ? kendo.parseDate(str, 'dd.MM.yyyy HH:mm') : null;
                w.value(d || str);
                if (w.trigger) w.trigger('change');
            } else {
                inp.value = str;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (err) {}
    });
})();
