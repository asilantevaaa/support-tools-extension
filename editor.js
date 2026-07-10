document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const cropX = parseInt(urlParams.get('x')) || 0;
    const cropY = parseInt(urlParams.get('y')) || 0;
    const cropW = Math.max(parseInt(urlParams.get('w')) || 100, 10);
    const cropH = Math.max(parseInt(urlParams.get('h')) || 100, 10);
    const dpr   = parseFloat(urlParams.get('dpr')) || 1;

    const wrapper  = document.getElementById('canvas-wrapper');
    const toolbar  = document.getElementById('toolbar');
    const sizeHint = document.getElementById('size-hint');

    if (!wrapper || !toolbar || !sizeHint) {
        console.error('[Editor] Не найдены ключевые элементы интерфейса (canvas-wrapper / toolbar / size-hint) — редактор не запущен.');
        return;
    }

    wrapper.style.left = cropX + 'px';
    wrapper.style.top  = cropY + 'px';

    // Затемняющая маска (отдельный слой — фикс «хвостов» при перетаскивании)
    const dimMask = document.getElementById('dim-mask');
    if (dimMask) {
        dimMask.style.left   = cropX + 'px';
        dimMask.style.top    = cropY + 'px';
        dimMask.style.width  = cropW + 'px';
        dimMask.style.height = cropH + 'px';
    }
    sizeHint.textContent = `${cropW} × ${cropH}`;
    sizeHint.classList.add('show');

    const canvas = new fabric.Canvas('c', { width: cropW, height: cropH, selection: true, enableRetinaScaling: false });

    // Убеждаемся что iframe получит клавиатурные события
    document.body.setAttribute('tabindex', '0');
    document.body.focus();

    // ─────────────────────────────────────────
    //  История (Ctrl+Z / Ctrl+Y)
    //  Фоновое изображение хранится отдельно,
    //  чтобы не дублировать тяжёлый data URL
    // ─────────────────────────────────────────
    let history = [], historyIndex = -1, isHistoryWorking = false;
    let bgDataUrl = null; // фоновый скриншот

    const saveHistory = () => {
        if (isHistoryWorking) return;
        if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
        // Сохраняем только объекты (без фона); кастомные свойства кружков-цифр тоже
        history.push(JSON.stringify(canvas.toJSON(['isNumber', 'numberValue'])));
        historyIndex++;
    };

    // Пересоздаёт заблюренную версию фона из текущего bgDataUrl.
    // bgDataUrl всегда хранится 1:1 с координатами холста (как при загрузке,
    // так и после обрезки), поэтому координаты блюра совпадают с холстом.
    const rebuildBlur = () => {
        if (!bgDataUrl) { blurredBgImage = null; return; }
        const src = new Image();
        src.onload = () => {
            const blur = document.createElement('canvas');
            blur.width = src.width; blur.height = src.height;
            const bCtx = blur.getContext('2d');
            bCtx.filter = 'blur(10px)';
            bCtx.drawImage(src, 0, 0);
            blurredBgImage = blur.toDataURL();
        };
        src.src = bgDataUrl;
    };

    const restoreBg = (callback) => {
        if (!bgDataUrl) { callback(); return; }
        fabric.Image.fromURL(bgDataUrl, (fabImg) => {
            canvas.setBackgroundImage(fabImg, callback);
        });
    };

    const undo = () => {
        if (historyIndex <= 0) return;
        isHistoryWorking = true;
        historyIndex--;
        canvas.loadFromJSON(history[historyIndex], () => {
            restoreBg(() => { canvas.renderAll(); isHistoryWorking = false; });
        });
    };

    const redo = () => {
        if (historyIndex >= history.length - 1) return;
        isHistoryWorking = true;
        historyIndex++;
        canvas.loadFromJSON(history[historyIndex], () => {
            restoreBg(() => { canvas.renderAll(); isHistoryWorking = false; });
        });
    };

    // Историю сохраняем только по завершении действия (finishWith / path:created /
    // удаление / обрезка), а не на каждый промежуточный object:added — иначе в undo
    // попадают недорисованные временные фигуры. object:modified (перетаскивание/
    // масштабирование готового объекта) сохраняем как полноценный шаг.
    canvas.on('object:modified', saveHistory);

    // ─────────────────────────────────────────
    //  Состояние инструментов
    // ─────────────────────────────────────────
    let currentColor    = '#ff0000';
    let currentMode     = 'cursor';
    let strokeWidth     = 2;
    let currentFont     = 'Arial';
    let textWhiteBg     = false;
    let isDrawingAction = false;
    let activeShape     = null;
    let arrowLine       = null, arrowHead = null;
    let blurredBgImage  = null;
    let startPointer    = null;
    let numberCounter   = 1;   // счётчик для кружков-цифр (1..5)

    // ─────────────────────────────────────────
    //  Загрузка изображения
    // ─────────────────────────────────────────
    chrome.storage.local.get(['capturedImage'], (result) => {
        if (!result.capturedImage) return;

        const img = new Image();
        img.onload = () => {
            const off = document.createElement('canvas');
            off.width = cropW; off.height = cropH;
            off.getContext('2d').drawImage(img, cropX * dpr, cropY * dpr, cropW * dpr, cropH * dpr, 0, 0, cropW, cropH);
            bgDataUrl = off.toDataURL();

            fabric.Image.fromURL(bgDataUrl, (fabImg) => {
                canvas.setBackgroundImage(fabImg, () => {
                    canvas.renderAll();
                    // Сохраняем начальное состояние (без объектов, с фоном)
                    saveHistory();
                });
            });

            // Заблюренная версия (из того же bgDataUrl, 1:1 с холстом)
            rebuildBlur();

            setTimeout(() => toolbar.classList.add('show'), 100);
        };
        img.src = result.capturedImage;
    });

    // ─────────────────────────────────────────
    //  Смена режима
    // ─────────────────────────────────────────
    const setMode = (mode) => {
        currentMode = mode;
        canvas.isDrawingMode = (mode === 'draw');
        canvas.selection    = (mode === 'cursor');
        canvas.getObjects().forEach(o => { o.selectable = mode === 'cursor'; o.evented = mode === 'cursor'; });

        document.querySelectorAll('.tb-btn[id^="btn-"]').forEach(b => b.classList.remove('active'));
        const map = { cursor:'btn-cursor', draw:'btn-draw', line:'btn-line', arrow:'btn-arrow', rect:'btn-rect', blur:'btn-blur', text:'btn-text', number:'btn-number', crop:'btn-crop' };
        if (map[mode]) document.getElementById(map[mode])?.classList.add('active');

        if (mode === 'draw') {
            canvas.freeDrawingBrush.color = currentColor;
            canvas.freeDrawingBrush.width = strokeWidth;
        }
        // При выборе текста — автоматически ставим чёрный цвет
        if (mode === 'text') applyColor('#1a1a1a');
        // Параметры текста (шрифт/фон) видны только в режиме «Текст»
        const textOpts = document.getElementById('text-opts');
        if (textOpts) textOpts.style.display = (mode === 'text') ? 'flex' : 'none';
        // Селектор номера виден в режиме «Кружок-цифра»
        const numberOpts = document.getElementById('number-opts');
        if (numberOpts && mode !== 'cursor') numberOpts.style.display = (mode === 'number') ? 'flex' : 'none';
        if (mode === 'number') { const ns = document.getElementById('number-select'); if (ns) ns.value = String(numberCounter); }
    };

    // ─────────────────────────────────────────
    //  Цвет
    // ─────────────────────────────────────────
    const applyColor = (color) => {
        currentColor = color;
        document.getElementById('color-dot').style.background = color;
        document.getElementById('color-picker').value = color;
        document.querySelectorAll('.color-preset').forEach(p => p.classList.toggle('active', p.dataset.color === color));
        if (canvas.isDrawingMode) canvas.freeDrawingBrush.color = color;
    };

    document.querySelectorAll('.color-preset').forEach(p =>
        p.addEventListener('click', () => applyColor(p.dataset.color)));
    document.getElementById('color-picker').addEventListener('input', (e) => {
        applyColor(e.target.value);
        document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
    });

    // ─────────────────────────────────────────
    //  Толщина штриха
    // ─────────────────────────────────────────
    document.querySelectorAll('.sz-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sz-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            strokeWidth = parseInt(btn.dataset.size);
            if (canvas.isDrawingMode) canvas.freeDrawingBrush.width = strokeWidth;
            // если выделен текст — меняем его размер
            const ao = canvas.getActiveObject();
            if (ao && ao.type === 'i-text') {
                ao.set('fontSize', Math.max(strokeWidth * 5 + 12, 14));
                canvas.renderAll();
            }
        });
    });

    // ─────────────────────────────────────────
    //  Шрифт и фон текста
    // ─────────────────────────────────────────
    const fontSel = document.getElementById('font-select');
    if (fontSel) fontSel.addEventListener('change', () => {
        currentFont = fontSel.value;
        const ao = canvas.getActiveObject();
        if (ao && ao.type === 'i-text') { ao.set('fontFamily', currentFont); canvas.renderAll(); }
    });
    const bgBtn = document.getElementById('btn-text-bg');
    if (bgBtn) bgBtn.addEventListener('click', () => {
        textWhiteBg = !textWhiteBg;
        bgBtn.classList.toggle('active', textWhiteBg);
        const ao = canvas.getActiveObject();
        if (ao && ao.type === 'i-text') {
            ao.set('textBackgroundColor', textWhiteBg ? '#ffffff' : '');
            if (textWhiteBg && (ao.fill === '#ffffff' || ao.fill === '#fff')) ao.set('fill', '#1a1a1a');
            canvas.renderAll();
        }
    });
    // При выборе текста — синхронизируем тулбар с его свойствами
    canvas.on('selection:created', syncTextToolbar);
    canvas.on('selection:updated', syncTextToolbar);
    canvas.on('selection:cleared', () => {
        const textOpts = document.getElementById('text-opts');
        if (textOpts && currentMode !== 'text') textOpts.style.display = 'none';
    });
    function syncTextToolbar() {
        const ao = canvas.getActiveObject();
        const textOpts = document.getElementById('text-opts');
        const isText = ao && ao.type === 'i-text';
        if (textOpts) textOpts.style.display = (isText || currentMode === 'text') ? 'flex' : 'none';
        if (!isText) return;
        if (fontSel && ao.fontFamily) { fontSel.value = ao.fontFamily; currentFont = ao.fontFamily; }
        if (bgBtn) { textWhiteBg = !!ao.textBackgroundColor; bgBtn.classList.toggle('active', textWhiteBg); }
    }

    // ─────────────────────────────────────────
    //  Клики по тулбару
    // ─────────────────────────────────────────
    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('button[id^="btn-"]');
        if (!btn) return;
        const modes = { 'btn-cursor':'cursor','btn-draw':'draw','btn-line':'line','btn-arrow':'arrow','btn-rect':'rect','btn-blur':'blur','btn-text':'text','btn-number':'number','btn-crop':'crop' };
        if (modes[btn.id]) { setMode(modes[btn.id]); return; }
        if (btn.id === 'btn-undo')   { undo(); return; }
        if (btn.id === 'btn-redo')   { redo(); return; }
        if (btn.id === 'btn-delete') { deleteSelected(); return; }
        if (btn.id === 'btn-copy')   { copyToClipboard(); return; }
        if (btn.id === 'btn-save')   { savePng(); return; }
        if (btn.id === 'btn-close')  { closeEditor(); return; }
    });

    const deleteSelected = () => {
        const objs = canvas.getActiveObjects();
        if (objs.length) { canvas.discardActiveObject(); objs.forEach(o => canvas.remove(o)); canvas.renderAll(); saveHistory(); }
    };

    const copyToClipboard = () => {
        fetch(canvas.toDataURL('image/png')).then(r => r.blob()).then(blob => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
                const btn = document.getElementById('btn-copy');
                const orig = btn.innerHTML;
                btn.style.background = '#22c55e';
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!`;
                setTimeout(() => {
                    btn.style.background = '';
                    btn.innerHTML = orig;
                    closeEditor();
                }, 900);
            }).catch(() => alert('Ошибка буфера обмена.'));
        });
    };

    const savePng = () => {
        // Дата и время в имени файла: screenshot_2026-06-17_14-30-05.png
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
        const a = document.createElement('a');
        a.download = `screenshot_${stamp}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    };

    const closeEditor = () => {
        toolbar.classList.remove('show');
        setTimeout(() => window.parent.postMessage({ action: 'closeSupportEditor' }, '*'), 200);
    };

    // ─────────────────────────────────────────
    //  Распознавание фигур при свободном рисовании
    // ─────────────────────────────────────────
    const ptsDist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const maxDevFromLine = (pts, a, b) => {
        const len = ptsDist(a, b);
        if (len < 1) return 0;
        return Math.max(...pts.map(p =>
            Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / len
        ));
    };

    const getBbox = (pts) => ({
        minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
        minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
    });

    const extractPts = (path) => {
        const pts = [];
        (path.path || []).forEach(cmd => {
            if (cmd[0] === 'M' || cmd[0] === 'L') pts.push({ x: cmd[1], y: cmd[2] });
            else if (cmd[0] === 'Q') pts.push({ x: cmd[3], y: cmd[4] });
            else if (cmd[0] === 'C') pts.push({ x: cmd[5], y: cmd[6] });
        });
        return pts;
    };

    canvas.on('path:created', ({ path }) => {
        if (currentMode !== 'draw') return;
        const pts = extractPts(path);
        if (pts.length < 5) return;

        const first = pts[0], last = pts[pts.length - 1];
        const isClosed = ptsDist(first, last) < Math.max(30, ptsDist(first, last) * 0.15);
        const stroke = path.stroke, sw = path.strokeWidth;

        // ── Линия ──
        if (!isClosed) {
            const totalLen = ptsDist(first, last);
            const maxDev   = maxDevFromLine(pts, first, last);
            if (totalLen > 15 && maxDev < totalLen * 0.13) {
                canvas.remove(path);
                canvas.add(new fabric.Line([first.x, first.y, last.x, last.y], {
                    stroke, strokeWidth: sw, selectable: true, evented: true
                }));
                canvas.renderAll(); saveHistory(); return;
            }
        }

        // ── Закрытые фигуры ──
        if (isClosed) {
            const bb  = getBbox(pts);
            const w   = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
            if (w < 5 || h < 5) return;
            const cx  = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
            const rx  = w / 2, ry = h / 2;

            // Ошибка для прямоугольника (среднее расстояние точек до ближайшей стороны)
            const rectErr = pts.reduce((s, p) =>
                s + Math.min(Math.abs(p.x - bb.minX), Math.abs(p.x - bb.maxX),
                    Math.abs(p.y - bb.minY), Math.abs(p.y - bb.maxY)), 0) / pts.length / Math.max(w, h);

            // Ошибка для эллипса (отклонение от единичной нормированной окружности)
            const ellErr = pts.reduce((s, p) =>
                s + Math.abs(Math.sqrt(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2) - 1), 0) / pts.length;

            canvas.remove(path);

            // Прямоугольник имеет приоритет: если rectErr < ellErr ИЛИ ellErr > 0.18
            if (rectErr < ellErr || ellErr > 0.18) {
                canvas.add(new fabric.Rect({
                    left: bb.minX, top: bb.minY, width: w, height: h,
                    fill: 'transparent', stroke, strokeWidth: sw, selectable: true, evented: true
                }));
            } else {
                // Эллипс/круг (только если явно округлая форма)
                const isCircle = Math.min(w, h) / Math.max(w, h) > 0.88;
                const r = (rx + ry) / 2;
                canvas.add(new fabric.Ellipse({
                    left: isCircle ? cx - r : bb.minX, top: isCircle ? cy - r : bb.minY,
                    rx: isCircle ? r : rx, ry: isCircle ? r : ry,
                    fill: 'transparent', stroke, strokeWidth: sw, selectable: true, evented: true
                }));
            }
            canvas.renderAll();
            saveHistory();
        }
    });

    // ─────────────────────────────────────────
    //  Обрезка: редактируемая рамка + подтверждение
    // ─────────────────────────────────────────
    let cropRect = null, cropBar = null;

    function startCropAdjust(cx, cy, cw, ch) {
        cropRect = new fabric.Rect({
            left: cx, top: cy, width: cw, height: ch,
            fill: 'rgba(79,106,255,0.12)', stroke: '#4f6aff',
            strokeWidth: 1, strokeDashArray: [5, 4],
            selectable: true, evented: true, hasRotatingPoint: false, lockRotation: true,
            cornerColor: '#4f6aff', cornerSize: 10, transparentCorners: false, objectCaching: false
        });
        cropRect.setControlsVisibility({ mtr: false }); // без поворота, остальные края/углы тянутся
        canvas.add(cropRect);
        canvas.setActiveObject(cropRect);
        canvas.renderAll();

        // Панель «Применить / Отмена»
        cropBar = document.createElement('div');
        cropBar.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:8px;background:rgba(10,13,26,0.97);padding:8px 10px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6)';
        cropBar.innerHTML = `
            <button id="crop-apply" style="background:#4f6aff;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">Применить обрезку</button>
            <button id="crop-cancel" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer">Отмена</button>`;
        document.body.appendChild(cropBar);
        document.getElementById('crop-apply').onclick = applyCrop;
        document.getElementById('crop-cancel').onclick = cancelCrop;
    }

    function clearCropUI() {
        if (cropBar) { cropBar.remove(); cropBar = null; }
        if (cropRect) { canvas.remove(cropRect); cropRect = null; }
    }
    function cancelCrop() { clearCropUI(); setMode('cursor'); canvas.renderAll(); }
    function applyCrop() {
        if (!cropRect) return;
        // точные пиксельные границы рамки (учитывает масштабирование при перетаскивании краёв)
        const br = cropRect.getBoundingRect(true, true);
        let cx = Math.round(br.left), cy = Math.round(br.top);
        let cw = Math.round(br.width), ch = Math.round(br.height);
        // обрезаем по границам холста
        cx = Math.max(0, cx); cy = Math.max(0, cy);
        cw = Math.min(cw, canvas.getWidth() - cx);
        ch = Math.min(ch, canvas.getHeight() - cy);
        canvas.remove(cropRect); cropRect = null;
        if (cropBar) { cropBar.remove(); cropBar = null; }
        canvas.discardActiveObject();
        canvas.renderAll();
        if (cw > 5 && ch > 5) cropCanvas(cx, cy, cw, ch);
        else { setMode('cursor'); canvas.renderAll(); }
    }

    // ─────────────────────────────────────────
    //  Обрезка холста (crop)
    // ─────────────────────────────────────────
    function cropCanvas(cx, cy, cw, ch) {
        // Рендерим выбранную область (фон + объекты) в картинку
        const dataUrl = canvas.toDataURL({ format: 'png', left: cx, top: cy, width: cw, height: ch, multiplier: 1 });
        // Сбрасываем холст и делаем обрезанное изображение новым фоном
        canvas.clear();
        canvas.setWidth(cw);
        canvas.setHeight(ch);
        bgDataUrl = dataUrl;
        fabric.Image.fromURL(dataUrl, (fabImg) => {
            canvas.setBackgroundImage(fabImg, () => {
                canvas.renderAll();
                // обновляем размеры обёртки и затемнения
                wrapper.style.width = cw + 'px';
                wrapper.style.height = ch + 'px';
                if (dimMask) { dimMask.style.width = cw + 'px'; dimMask.style.height = ch + 'px'; }
                sizeHint.textContent = `${cw} × ${ch}`;
                rebuildBlur();   // обрезанный фон → новая блюр-версия с правильными координатами
                saveHistory();
                setMode('cursor');
            });
        });
    }

    // ─────────────────────────────────────────
    //  События мыши на холсте
    // ─────────────────────────────────────────
    canvas.on('mouse:down', (opt) => {
        if (currentMode === 'cursor' || currentMode === 'draw') return;
        // правую кнопку не используем для рисования/установки (она — для выбора номера)
        if (opt.button === 3 || (opt.e && opt.e.button === 2)) return;

        // Кружок-цифра: ставим по клику (1..9, затем снова с 1)
        if (currentMode === 'number') {
            const p = canvas.getPointer(opt.e);
            const r = 14;
            const circle = new fabric.Circle({
                radius: r, fill: currentColor, originX: 'center', originY: 'center', left: 0, top: 0
            });
            const label = new fabric.Text(String(numberCounter), {
                fontSize: 16, fontWeight: 'bold', fill: '#fff', fontFamily: 'Arial',
                originX: 'center', originY: 'center', left: 0, top: 0
            });
            const group = new fabric.Group([circle, label], {
                left: p.x, top: p.y, originX: 'center', originY: 'center',
                selectable: true, evented: true
            });
            group.isNumber = true;
            group.numberValue = numberCounter;
            canvas.add(group);
            canvas.setActiveObject(group);
            canvas.renderAll();
            saveHistory();
            numberCounter = numberCounter >= 9 ? 1 : numberCounter + 1;
            setMode('cursor');
            return;
        }

        isDrawingAction = true;
        const p = canvas.getPointer(opt.e);
        startPointer = { x: p.x, y: p.y };

        if (currentMode === 'line') {
            arrowLine = new fabric.Line([p.x, p.y, p.x, p.y], {
                stroke: currentColor, strokeWidth, selectable: false, evented: false,
                originX: 'center', originY: 'center'
            });
            canvas.add(arrowLine);

        } else if (currentMode === 'arrow') {
            arrowLine = new fabric.Line([p.x, p.y, p.x, p.y], {
                stroke: currentColor, strokeWidth, selectable: false, evented: false,
                originX: 'center', originY: 'center'
            });
            arrowHead = new fabric.Triangle({
                width: strokeWidth * 5, height: strokeWidth * 5, fill: currentColor,
                left: p.x, top: p.y, angle: 0, selectable: false, evented: false,
                originX: 'center', originY: 'center'
            });
            canvas.add(arrowLine, arrowHead);

        } else if (currentMode === 'rect') {
            activeShape = new fabric.Rect({
                left: p.x, top: p.y, width: 1, height: 1,
                fill: 'transparent', stroke: currentColor, strokeWidth,
                selectable: false, evented: false
            });
            canvas.add(activeShape);

        } else if (currentMode === 'blur') {
            activeShape = new fabric.Rect({
                left: p.x, top: p.y, width: 1, height: 1,
                fill: 'rgba(255,255,255,0.1)', stroke: 'rgba(255,255,255,0.5)',
                strokeWidth: 1, strokeDashArray: [4, 4], selectable: false, evented: false
            });
            canvas.add(activeShape);

        } else if (currentMode === 'text') {
            // Показываем пунктирный прямоугольник пока тянем
            activeShape = new fabric.Rect({
                left: p.x, top: p.y, width: 1, height: 1,
                fill: 'rgba(79,106,255,0.05)',
                stroke: 'rgba(79,106,255,0.6)', strokeWidth: 1, strokeDashArray: [4, 3],
                selectable: false, evented: false
            });
            canvas.add(activeShape);

        } else if (currentMode === 'crop') {
            activeShape = new fabric.Rect({
                left: p.x, top: p.y, width: 1, height: 1,
                fill: 'rgba(79,106,255,0.12)', stroke: '#4f6aff',
                strokeWidth: 1, strokeDashArray: [5, 4], selectable: false, evented: false
            });
            canvas.add(activeShape);
        }
    });

    canvas.on('mouse:move', (opt) => {
        if (!isDrawingAction) return;
        const p = canvas.getPointer(opt.e);

        if (currentMode === 'line' && arrowLine) {
            arrowLine.set({ x2: p.x, y2: p.y });
            arrowLine.setCoords();

        } else if (currentMode === 'arrow' && arrowLine && arrowHead) {
            arrowLine.set({ x2: p.x, y2: p.y });
            arrowLine.setCoords();
            arrowHead.set({ left: p.x, top: p.y, angle: Math.atan2(p.y - startPointer.y, p.x - startPointer.x) * (180 / Math.PI) + 90 });
            arrowHead.setCoords();

        } else if ((currentMode === 'rect' || currentMode === 'blur' || currentMode === 'text' || currentMode === 'crop') && activeShape) {
            activeShape.set({
                left:   Math.min(p.x, startPointer.x),
                top:    Math.min(p.y, startPointer.y),
                width:  Math.abs(p.x - startPointer.x),
                height: Math.abs(p.y - startPointer.y)
            });
            activeShape.setCoords();
        }
        canvas.renderAll();
    });

    canvas.on('mouse:up', (opt) => {
        if (!isDrawingAction) return;
        isDrawingAction = false;
        const p = canvas.getPointer(opt.e);

        // после завершения рисования переключаемся на курсор и выделяем фигуру —
        // чтобы её можно было сразу двигать (а не рисовать поверх новую)
        const finishWith = (obj) => {
            setMode('cursor');
            if (obj) { canvas.setActiveObject(obj); }
            canvas.renderAll();
            saveHistory();
        };

        if (currentMode === 'crop' && activeShape) {
            const cw = activeShape.width, ch = activeShape.height;
            const cx = activeShape.left, cy = activeShape.top;
            canvas.remove(activeShape); activeShape = null;
            if (cw > 5 && ch > 5) {
                startCropAdjust(cx, cy, cw, ch);  // даём подвигать края, затем «Применить»
            } else {
                setMode('cursor'); canvas.renderAll();
            }
            return;
        }

        if (currentMode === 'line' && arrowLine) {
            arrowLine.set({ selectable: true, evented: true });
            const o = arrowLine; arrowLine = null;
            finishWith(o);

        } else if (currentMode === 'arrow' && arrowLine && arrowHead) {
            const group = new fabric.Group([arrowLine, arrowHead], { selectable: true, evented: true });
            canvas.remove(arrowLine, arrowHead);
            canvas.add(group);
            arrowLine = null; arrowHead = null;
            finishWith(group);

        } else if (currentMode === 'rect' && activeShape) {
            // случайный клик без протягивания — не оставляем крошечный объект
            if (activeShape.width < 3 || activeShape.height < 3) {
                canvas.remove(activeShape);
                activeShape = null;
                canvas.renderAll();
            } else {
                activeShape.set({ selectable: true, evented: true });
                const o = activeShape; activeShape = null;
                finishWith(o);
            }

        } else if (currentMode === 'blur' && activeShape) {
            const { left: bL, top: bT, width: bW, height: bH } = activeShape;
            canvas.remove(activeShape); activeShape = null;
            if (bW > 4 && bH > 4 && blurredBgImage) {
                const bi = new Image();
                bi.onload = () => {
                    const pc = document.createElement('canvas');
                    pc.width = bW; pc.height = bH;
                    pc.getContext('2d').drawImage(bi, bL, bT, bW, bH, 0, 0, bW, bH);
                    fabric.Image.fromURL(pc.toDataURL(), (fab) => {
                        fab.set({ left: bL, top: bT, selectable: true, evented: true });
                        canvas.add(fab);
                        finishWith(fab);
                    });
                };
                bi.src = blurredBgImage;
            } else {
                canvas.renderAll();
            }

        } else if (currentMode === 'text' && activeShape) {
            const tL = activeShape.left, tT = activeShape.top;
            const tW = Math.max(activeShape.width, 40);
            canvas.remove(activeShape); activeShape = null;

            const fontSize = Math.max(strokeWidth * 5 + 12, 14);
            const text = new fabric.IText('', {
                left: tL, top: tT,
                fill: textWhiteBg ? '#1a1a1a' : currentColor,
                fontSize, fontFamily: currentFont,
                textBackgroundColor: textWhiteBg ? '#ffffff' : '',
                width: tW > 60 ? tW : undefined,
                selectable: true, evented: true
            });
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
        }
        canvas.renderAll();
    });

    // ─────────────────────────────────────────
    //  Кружки-цифры: выбор номера (ПКМ) + подсказка (наведение)
    // ─────────────────────────────────────────
    const numLabelOf = (group) => group.getObjects?.().find(o => o.type === 'text') || null;

    function setNumberValue(group, val) {
        const lbl = numLabelOf(group);
        if (!lbl) return;
        lbl.set('text', String(val));
        group.numberValue = val;
        group.dirty = true;
        canvas.renderAll();
        saveHistory();
    }

    // Всплывающий выбор номера 1..9
    let numPicker = null;
    // «закрыватель» вешаем на следующий тик, иначе то же событие (mousedown/контекстное
    // меню/двойной клик), которым пикер открыт, тут же его и закроет.
    const onDocDown = (e) => { if (numPicker && !numPicker.contains(e.target)) closeNumPicker(); };
    function closeNumPicker() {
        if (numPicker) { numPicker.remove(); numPicker = null; }
        document.removeEventListener('mousedown', onDocDown, true);
    }
    function openNumPicker(group, clientX, clientY) {
        closeNumPicker();
        numPicker = document.createElement('div');
        numPicker.style.cssText =
            'position:fixed;z-index:99999;background:#23252b;border:1px solid rgba(255,255,255,0.12);' +
            'border-radius:10px;padding:8px;box-shadow:0 8px 28px rgba(0,0,0,0.5);' +
            'display:grid;grid-template-columns:repeat(5,1fr);gap:5px;';
        for (let i = 1; i <= 9; i++) {
            const b = document.createElement('button');
            b.textContent = i;
            const isCur = group.numberValue === i;
            b.style.cssText =
                'width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;' +
                'font-family:Arial;border:1px solid ' + (isCur ? '#4f6aff' : 'rgba(255,255,255,0.12)') + ';' +
                'background:' + (isCur ? 'rgba(79,106,255,0.3)' : 'rgba(255,255,255,0.06)') + ';color:#fff;';
            b.addEventListener('click', () => { setNumberValue(group, i); numberCounter = i >= 9 ? 1 : i + 1; closeNumPicker(); });
            numPicker.appendChild(b);
        }
        document.body.appendChild(numPicker);
        // позиционируем в пределах экрана
        const w = numPicker.offsetWidth, h = numPicker.offsetHeight;
        let x = clientX, y = clientY;
        if (x + w > window.innerWidth - 6) x = window.innerWidth - w - 6;
        if (y + h > window.innerHeight - 6) y = window.innerHeight - h - 6;
        numPicker.style.left = Math.max(6, x) + 'px';
        numPicker.style.top = Math.max(6, y) + 'px';
        // вешаем закрыватель на следующий тик (capture), чтобы открывающее событие не закрыло пикер
        setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
    }

    // Выбор номера: двойной клик ИЛИ правая кнопка по кружку-цифре.
    // Используем события самого fabric (opt.target надёжнее, чем findTarget).
    canvas.fireRightClick = true;     // fabric начнёт отдавать ПКМ в mouse:down
    canvas.stopContextMenu = true;    // и подавит нативное контекстное меню
    const openPickerFor = (opt) => {
        const t = opt && opt.target;
        if (t && t.isNumber && opt.e) { opt.e.preventDefault?.(); openNumPicker(t, opt.e.clientX, opt.e.clientY); }
    };
    canvas.on('mouse:dblclick', openPickerFor);                 // двойной клик — основной способ
    canvas.on('mouse:down', (opt) => {                          // ПКМ через события fabric
        if ((opt.button === 3 || (opt.e && opt.e.button === 2))) openPickerFor(opt);
    });
    // ПКМ: глушим нативное меню браузера во ВСЁМ окне редактора и открываем пикер,
    // если клик пришёлся по кружку-цифре на холсте.
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // нативное меню браузера в редакторе не нужно
        let t = null;
        try { t = canvas.findTarget(e, false); } catch (_) {}
        if (!t || !t.isNumber) { const a = canvas.getActiveObject(); if (a && a.isNumber) t = a; }
        if (t && t.isNumber) openNumPicker(t, e.clientX, e.clientY);
    });

    // ── Надёжный способ: селектор номера в панели ──
    // Меняет номер выбранного кружка; если ничего не выбрано — задаёт номер для новых.
    const numberSelect = document.getElementById('number-select');
    const numberOptsEl = document.getElementById('number-opts');
    const syncNumberSelect = (val) => { if (numberSelect) numberSelect.value = String(val); };
    if (numberSelect) {
        numberSelect.addEventListener('change', () => {
            const v = parseInt(numberSelect.value) || 1;
            const a = canvas.getActiveObject();
            if (a && a.isNumber) setNumberValue(a, v);
            else numberCounter = v;
        });
    }
    // Когда выбран кружок-цифра — показываем селектор и подставляем его номер
    const onSelectNumber = () => {
        const a = canvas.getActiveObject();
        if (a && a.isNumber) { if (numberOptsEl) numberOptsEl.style.display = 'flex'; syncNumberSelect(a.numberValue); }
        else if (currentMode !== 'number' && numberOptsEl) numberOptsEl.style.display = 'none';
    };
    canvas.on('selection:created', onSelectNumber);
    canvas.on('selection:updated', onSelectNumber);
    canvas.on('selection:cleared', () => { if (currentMode !== 'number' && numberOptsEl) numberOptsEl.style.display = 'none'; });

    // Подсказка при наведении
    let numTip = null;
    function showTip(text, clientX, clientY) {
        if (!numTip) {
            numTip = document.createElement('div');
            numTip.style.cssText =
                'position:fixed;z-index:99998;pointer-events:none;background:#1a1c22;color:#e6e6e6;' +
                'font-size:11px;padding:5px 9px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);' +
                'box-shadow:0 4px 14px rgba(0,0,0,0.4);white-space:nowrap;';
            document.body.appendChild(numTip);
        }
        numTip.textContent = text;
        numTip.style.left = (clientX + 14) + 'px';
        numTip.style.top = (clientY + 14) + 'px';
        numTip.style.display = 'block';
    }
    function hideTip() { if (numTip) numTip.style.display = 'none'; }
    canvas.on('mouse:over', (opt) => {
        if (opt.target && opt.target.isNumber && opt.e) {
            showTip(`Номер ${opt.target.numberValue} · 2× клик или ПКМ — изменить`, opt.e.clientX, opt.e.clientY);
        }
    });
    canvas.on('mouse:move', (opt) => {
        if (numTip && numTip.style.display === 'block' && opt.target && opt.target.isNumber && opt.e) {
            numTip.style.left = (opt.e.clientX + 14) + 'px';
            numTip.style.top = (opt.e.clientY + 14) + 'px';
        }
    });
    canvas.on('mouse:out', (opt) => { if (opt.target && opt.target.isNumber) hideTip(); });

    // ─────────────────────────────────────────
    //  Клавиатура
    // ─────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        const editing = canvas.getActiveObject()?.isEditing;
        if (tag === 'INPUT' || editing) return;

        if (e.ctrlKey && e.key === 'z')     { e.preventDefault(); undo(); return; }
        if (e.ctrlKey && e.key === 'y')     { e.preventDefault(); redo(); return; }
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); copyToClipboard(); return; }
        if (e.key === 'Escape')             { closeEditor(); return; }

        if (!e.ctrlKey && !e.altKey) {
            const keyMap = { v:'cursor', p:'draw', l:'line', a:'arrow', r:'rect', b:'blur', t:'text', c:'crop' };
            if (keyMap[e.key.toLowerCase()]) { setMode(keyMap[e.key.toLowerCase()]); return; }
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            const active = canvas.getActiveObject();
            if (active && !active.isEditing) { canvas.remove(active); canvas.renderAll(); }
        }
    });
});
