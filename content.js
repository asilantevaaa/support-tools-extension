if (typeof window.startSupportToolsOverlay === 'undefined') {
    window.startSupportToolsOverlay = function() {
        console.log('[Support Tools] Starting overlay...');
        const oldOverlay = document.getElementById('support-tools-overlay');
        if (oldOverlay) oldOverlay.remove();
        const oldIframe = document.getElementById('support-tools-editor-iframe');
        if (oldIframe) oldIframe.remove();

        const overlay = document.createElement('div');
        overlay.id = 'support-tools-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: '2147483646', cursor: 'crosshair',
            display: 'block', margin: '0', padding: '0', border: 'none'
        });

        const selection = document.createElement('div');
        Object.assign(selection.style, {
            position: 'absolute', border: '1px dashed #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
            background: 'transparent', display: 'none', pointerEvents: 'none'
        });

        overlay.style.backgroundColor = 'transparent';
        overlay.appendChild(selection);
        document.documentElement.appendChild(overlay);

        let startX, startY, isSelecting = false;

        const onMouseDown = (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            selection.style.left = startX + 'px';
            selection.style.top = startY + 'px';
            selection.style.width = '0px';
            selection.style.height = '0px';
            selection.style.display = 'block';
        };

        const onMouseMove = (e) => {
            if (!isSelecting) return;
            selection.style.width = Math.abs(e.clientX - startX) + 'px';
            selection.style.height = Math.abs(e.clientY - startY) + 'px';
            selection.style.left = Math.min(e.clientX, startX) + 'px';
            selection.style.top = Math.min(e.clientY, startY) + 'px';
        };

        const onMouseUp = (e) => {
            isSelecting = false;
            const rect = {
                x: Math.min(e.clientX, startX), y: Math.min(e.clientY, startY),
                w: Math.abs(e.clientX - startX), h: Math.abs(e.clientY - startY)
            };

            overlay.remove(); 
            if (rect.w < 10 || rect.h < 10) return; 

            setTimeout(() => {
                chrome.runtime.sendMessage({ action: "captureScreenClean" }, (response) => {
                    if (response && response.success) {
                        const iframe = document.createElement('iframe');
                        iframe.id = 'support-tools-editor-iframe';
                        
                        // Разрешение на запись в буфер обмена
                        iframe.allow = "clipboard-write"; 
                        
                        const dpr = window.devicePixelRatio || 1;
                        iframe.src = chrome.runtime.getURL(`editor.html?x=${rect.x}&y=${rect.y}&w=${rect.w}&h=${rect.h}&dpr=${dpr}`);
                        
                        Object.assign(iframe.style, {
                            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                            zIndex: '2147483647', border: 'none', background: 'transparent'
                        });
                        document.documentElement.appendChild(iframe);
                    } else {
                        const err = (response && response.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'неизвестная ошибка';
                        alert("Ошибка создания скриншота: " + err);
                    }
                });
            }, 150); 
        };

        overlay.addEventListener('mousedown', onMouseDown);
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('message', (e) => {
        if (e.data && e.data.action === 'closeSupportEditor') {
            const iframe = document.getElementById('support-tools-editor-iframe');
            if (iframe) iframe.remove();
        }
    });

    chrome.runtime.onMessage.addListener((req) => {
        if (req && req.action === 'closeAllPanels') {
            const iframe = document.getElementById('support-tools-editor-iframe');
            if (iframe) iframe.remove();
            const overlay = document.getElementById('support-tools-overlay');
            if (overlay) overlay.remove();
        }
    });
}
window.startSupportToolsOverlay();