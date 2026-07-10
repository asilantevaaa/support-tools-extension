/**
 * domain-watch.js — следит за выделением текста на странице.
 * Если выделен домен — сохраняет его в chrome.storage, чтобы попап
 * автоматически подставил его в поля Whois / DNS / IP-Check / Punycode / ST.
 */
(function () {
    'use strict';

    const DOMAIN_RE = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9а-яё](?:[a-zA-Z0-9а-яё_-]{0,61}[a-zA-Z0-9а-яё])?\.)+[a-zA-Zа-яё]{2,}(?::\d+)?/i;

    function normalizeDomain(domain) {
        let d = domain.toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0]
            .split(':')[0];
        if (/[а-яё]/.test(d)) {
            try { d = new URL(`http://${d}`).hostname; } catch (e) {}
        }
        return d;
    }

    const TECH_EXCLUDE = /(?:^|\.)(?:infra1.ru|infra1.su|infra1\.ru|webtm\.ru)$/i;

    function isValidDomain(d) {
        if (d.length < 4 || d.length > 253) return false;
        const parts = d.split('.');
        if (parts.length < 2) return false;
        const tld = parts[parts.length - 1];
        if (TECH_EXCLUDE.test(d)) return false;
        return tld.length >= 2;
    }

    function domainFromSelection() {
        const sel = (window.getSelection && window.getSelection().toString() || '').trim();
        if (!sel || sel.length > 200) return null;
        const m = sel.match(DOMAIN_RE);
        if (!m) return null;
        const d = normalizeDomain(m[0]);
        return isValidDomain(d) ? d : null;
    }

    // Ищем домен в самом выделении, а если там обрывок (двойной клик по «potolki»
    // выделяет только слово) — в тексте родительского элемента
    function domainFromContext() {
        const sel = window.getSelection && window.getSelection();
        const selText = (sel && sel.toString() || '').trim();
        // 1) пробуем прямо выделение
        let d = domainFromSelection();
        if (d) return d;
        // 2) ищем домен в родительском элементе, содержащий выделенное слово
        if (selText && sel && sel.anchorNode) {
            const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
            const ctx = (el && el.textContent || '').slice(0, 300);
            const matches = ctx.match(new RegExp(DOMAIN_RE.source, 'gi')) || [];
            for (const m of matches) {
                const nd = normalizeDomain(m);
                if (isValidDomain(nd) && nd.includes(selText.toLowerCase().replace(/\.$/, ''))) return nd;
            }
            if (matches.length) {
                const nd = normalizeDomain(matches[0]);
                if (isValidDomain(nd)) return nd;
            }
        }
        return null;
    }

    let lastSaved = '';
    function check() {
        try {
            const d = domainFromContext();
            if (d && d !== lastSaved) {
                lastSaved = d;
                if (chrome.runtime && chrome.runtime.id) {
                    chrome.storage.local.set({ lastSelectedDomain: d, lastSelectedTs: Date.now() });
                }
            }
        } catch (e) {}
    }

    document.addEventListener('mouseup', check);
    document.addEventListener('dblclick', check);
    document.addEventListener('copy', check);   // ловим Ctrl+C и кнопки «копировать» на сайте
})();
