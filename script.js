(() => {
  'use strict';

  const inkColors = ['#171718', '#ee513d', '#5c8ee6', '#ffd43b'];
  const puppetColors = ['#ee513d', '#5c8ee6', '#ffd43b', '#66c79a'];
  const builtInTemplates = [
    { id: 'mart', name: 'The Great Snack Heist', icon: '🏪', color: '#f29d77', background: '#fffdf4', elements: [
      { id: 'sun', kind: 'circle', x: .90, y: .12, w: .09, h: .12, color: '#ffd43b' },
      { id: 'mart', kind: 'rect', x: .25, y: .39, w: .46, h: .43, color: '#f29d77' },
      { id: 'sign', kind: 'textBox', x: .34, y: .45, w: .28, h: .09, color: '#ffd43b', text: 'MART' },
      { id: 'door', kind: 'rect', x: .31, y: .64, w: .10, h: .18, color: '#78a9df' },
      { id: 'window', kind: 'rect', x: .54, y: .66, w: .13, h: .10, color: '#bde9f4' },
      { id: 'road', kind: 'ground', x: 0, y: .82, w: 1, h: .18, color: '#bbb5a9' }
    ]},
    { id: 'space', name: 'Trouble in Space', icon: '🚀', color: '#252650', background: '#252650', elements: [
      { id: 'sky', kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#252650', noStroke: true },
      { id: 'moon', kind: 'circle', x: .78, y: .23, w: .20, h: .27, color: '#ddd9c9' },
      { id: 'rocket', kind: 'textBox', x: .20, y: .42, w: .24, h: .16, color: '#ee513d', text: 'ROCKET' },
      { id: 'planet', kind: 'circle', x: .50, y: .70, w: .24, h: .30, color: '#5c8ee6' }
    ]},
    { id: 'forest', name: 'The Very Weird Woods', icon: '🌲', color: '#66c79a', background: '#d9eff2', elements: [
      { id: 'sky', kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#d9eff2', noStroke: true },
      { id: 'sun', kind: 'circle', x: .82, y: .14, w: .12, h: .16, color: '#ffd43b' },
      { id: 'tree1', kind: 'textBox', x: .10, y: .30, w: .18, h: .48, color: '#66c79a', text: 'TREE' },
      { id: 'tree2', kind: 'textBox', x: .65, y: .24, w: .21, h: .54, color: '#438a68', text: 'TREE' },
      { id: 'grass', kind: 'ground', x: 0, y: .76, w: 1, h: .24, color: '#8fbd64' }
    ]}
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  let sceneTemplates = clone(builtInTemplates);
  const defaultScene = () => ({ templateId: 'mart', title: 'The Great Snack Heist', background: '#fffdf4', elements: clone(sceneTemplates[0].elements) });
  const state = {
    tab: 'stage', tool: 'pencil', ink: inkColors[0], strokes: [], boxes: [], notes: [], puppets: [],
    isRecording: false, recordTime: 0, takes: [], timeline: [], selectedTake: null,
    stageMode: 'live', selectedElement: null, scene: defaultScene()
  };

  const canvas = document.querySelector('#stageCanvas');
  const context = canvas.getContext('2d');
  let activeStroke = null;
  let shapeStart = null;
  let draggingPuppet = null;
  let mediaRecorder = null;
  let mediaChunks = [];
  let recordTimer = null;
  let draggedClip = null;
  let draggingElement = null;
  let elementDragOffset = null;
  let toastTimer = null;
  let isExporting = false;
  let isPreviewing = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const formatTime = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  function persistState() {
    const saved = { strokes: state.strokes, boxes: state.boxes, notes: state.notes, puppets: state.puppets, takes: state.takes.map(({ url, ...take }) => take), timeline: state.timeline, scene: state.scene, templates: sceneTemplates };
    try { localStorage.setItem('sticky-takes-project-v2', JSON.stringify(saved)); } catch { /* Storage can be unavailable in private browsing. */ }
  }

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem('sticky-takes-project-v2'));
      if (!saved) return;
      ['strokes', 'boxes', 'notes', 'puppets', 'takes', 'timeline'].forEach(key => { if (Array.isArray(saved[key])) state[key] = saved[key]; });
      if (Array.isArray(saved.templates) && saved.templates.length) sceneTemplates = saved.templates;
      if (saved.scene?.elements) state.scene = { background: '#fffdf4', ...saved.scene };
    } catch { /* Start with a fresh project if old data is malformed. */ }
  }

  function videoStore(mode, id, blob) {
    return new Promise(resolve => {
      if (!window.indexedDB) return resolve(null);
      const request = indexedDB.open('sticky-takes-media', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('videos');
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const tx = request.result.transaction('videos', mode === 'put' ? 'readwrite' : 'readonly');
        const operation = mode === 'put' ? tx.objectStore('videos').put(blob, id) : tx.objectStore('videos').get(id);
        operation.onsuccess = () => resolve(operation.result || null);
        operation.onerror = () => resolve(null);
      };
    });
  }

  function flash(message) {
    const toast = $('#toast');
    toast.textContent = `✦ ${message}`;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
  }

  function setTab(tab) {
    state.tab = tab;
    $('#stageView').classList.toggle('hidden', tab !== 'stage');
    $('#takesView').classList.toggle('hidden', tab !== 'takes');
    $('#timelineView').classList.toggle('hidden', tab !== 'timeline');
    $$('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    if (tab === 'stage') requestAnimationFrame(paint);
    if (tab === 'takes') renderTakes();
    if (tab === 'timeline') renderTimeline();
  }

  function setTool(tool) {
    state.tool = tool;
    $$('.tool').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
    $('#modeLabel').textContent = state.stageMode === 'backdrop' ? 'BACKDROP EDIT MODE' : `${tool.toUpperCase()} MODE`;
    $('#paper').classList.toggle('grab-mode', tool === 'puppet');
    if (state.stageMode !== 'backdrop') $('#canvasCallout').textContent = tool === 'puppet' ? 'GRAB + WIGGLE YOUR PUPPETS' : 'DRAW YOUR WORLD HERE';
  }

  function drawPuppet(ctx, puppet, index) {
    ctx.save();
    ctx.translate(puppet.x, puppet.y);
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = '#171718'; ctx.fillStyle = puppet.color;
    ctx.beginPath(); ctx.arc(0, -42, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#171718'; ctx.beginPath(); ctx.arc(-7, -46, 2.5, 0, 7); ctx.arc(7, -46, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -38, 8, .2, Math.PI - .2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(0, 38); ctx.moveTo(0, -2); ctx.lineTo(-34, 14 + (index % 2) * 9); ctx.moveTo(0, -2); ctx.lineTo(34, 5 - (index % 2) * 7); ctx.moveTo(0, 38); ctx.lineTo(-25, 76); ctx.moveTo(0, 38); ctx.lineTo(27, 72); ctx.stroke();
    ctx.fillStyle = '#fffdf4'; ctx.strokeStyle = '#171718'; ctx.lineWidth = 2; ctx.font = '900 9px Arial';
    const width = ctx.measureText(puppet.name).width + 14;
    ctx.fillRect(-width / 2, 82, width, 18); ctx.strokeRect(-width / 2, 82, width, 18);
    ctx.fillStyle = '#171718'; ctx.textAlign = 'center'; ctx.fillText(puppet.name, 0, 95);
    ctx.restore();
  }

  function elementBounds(element, w, h) {
    return { x: element.x * w, y: element.y * h, w: element.w * w, h: element.h * h };
  }

  function drawSceneElement(ctx, element, w, h) {
    const box = elementBounds(element, w, h);
    ctx.save();
    ctx.fillStyle = element.color;
    ctx.strokeStyle = '#171718';
    ctx.lineWidth = 4;
    if (element.kind === 'circle') {
      ctx.beginPath(); ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, Math.abs(box.w / 2), Math.abs(box.h / 2), 0, 0, Math.PI * 2); ctx.fill(); if (!element.noStroke) ctx.stroke();
    } else if (element.kind === 'ground') {
      ctx.beginPath(); ctx.moveTo(box.x, box.y + box.h * .15); ctx.lineTo(box.x + box.w, box.y); ctx.lineTo(box.x + box.w, box.y + box.h); ctx.lineTo(box.x, box.y + box.h); ctx.closePath(); ctx.fill(); if (!element.noStroke) ctx.stroke();
    } else {
      ctx.fillRect(box.x, box.y, box.w, box.h); if (!element.noStroke) ctx.strokeRect(box.x, box.y, box.w, box.h);
      if (element.kind === 'textBox') { ctx.fillStyle = '#171718'; ctx.font = `900 ${Math.max(11, Math.min(24, box.h * .55))}px Arial Black`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(element.text, box.x + box.w / 2, box.y + box.h / 2, Math.max(20, box.w - 8)); }
    }
    if (state.stageMode === 'backdrop' && state.selectedElement === element.id) {
      ctx.strokeStyle = '#ee513d'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.strokeRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10);
      ctx.setLineDash([]); ctx.fillStyle = '#ee513d'; ctx.fillRect(box.x - 8, box.y - 8, 12, 12);
    }
    ctx.restore();
  }

  function paint() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(rect.width * dpr), height = Math.floor(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    context.fillStyle = state.scene.background || '#fffdf4'; context.fillRect(0, 0, w, h);
    context.strokeStyle = state.stageMode === 'backdrop' ? 'rgba(23,23,24,.09)' : '#ede8dc'; context.lineWidth = 1;
    for (let x = 0; x < w; x += 24) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, h); context.stroke(); }
    for (let y = 0; y < h; y += 24) { context.beginPath(); context.moveTo(0, y); context.lineTo(w, y); context.stroke(); }
    state.scene.elements.forEach(element => drawSceneElement(context, element, w, h));
    state.boxes.forEach(box => { context.strokeStyle = box.color; context.lineWidth = 5; context.strokeRect(box.x, box.y, box.w, box.h); });
    state.notes.forEach(note => { context.fillStyle = note.color; context.font = '900 22px Comic Sans MS'; context.textAlign = 'left'; context.fillText(note.text, note.x, note.y); });
    [...state.strokes, activeStroke].filter(Boolean).forEach(stroke => {
      if (stroke.points.length < 2) return;
      context.save(); context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'; context.strokeStyle = stroke.color; context.lineWidth = stroke.width; context.lineCap = 'round'; context.lineJoin = 'round';
      context.beginPath(); context.moveTo(stroke.points[0].x, stroke.points[0].y); stroke.points.slice(1).forEach(point => context.lineTo(point.x, point.y)); context.stroke(); context.restore();
    });
    if (state.stageMode === 'live' || state.isRecording) state.puppets.forEach((puppet, index) => drawPuppet(context, puppet, index));
    if (state.isRecording) { context.fillStyle = '#ee513d'; context.beginPath(); context.arc(24, 26, 9, 0, 7); context.fill(); context.strokeStyle = '#171718'; context.lineWidth = 2; context.stroke(); context.fillStyle = '#171718'; context.font = '900 12px Arial'; context.textAlign = 'left'; context.fillText(`REC  ${formatTime(state.recordTime)}`, 42, 30); }
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', event => {
    const point = canvasPoint(event);
    canvas.setPointerCapture(event.pointerId);
    if (state.stageMode === 'backdrop') {
      const rect = canvas.getBoundingClientRect();
      const hit = [...state.scene.elements].reverse().find(element => {
        const box = elementBounds(element, rect.width, rect.height);
        return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
      });
      state.selectedElement = hit?.id || null;
      draggingElement = hit || null;
      elementDragOffset = hit ? { x: point.x / rect.width - hit.x, y: point.y / rect.height - hit.y } : null;
      $('#deletePropButton').classList.toggle('hidden', !hit);
      syncBackdropEditor();
      paint();
      return;
    }
    if (state.tool === 'puppet') { const hit = [...state.puppets].reverse().find(p => Math.hypot(p.x - point.x, p.y - point.y) < 80); if (hit) draggingPuppet = hit.id; return; }
    if (state.tool === 'text') { const text = window.prompt('What should the note say?', 'PLOT TWIST!'); if (text) { state.notes.push({ ...point, text, color: state.ink }); paint(); } return; }
    if (state.tool === 'shape') { shapeStart = point; return; }
    if (state.tool === 'eraser') { state.strokes = state.strokes.filter(stroke => !stroke.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 24)); paint(); return; }
    activeStroke = { points: [point], color: state.ink, width: 5 };
    paint();
  });

  canvas.addEventListener('pointermove', event => {
    const point = canvasPoint(event);
    if (draggingElement) {
      const rect = canvas.getBoundingClientRect();
      draggingElement.x = Math.max(0, Math.min(1 - draggingElement.w, point.x / rect.width - elementDragOffset.x));
      draggingElement.y = Math.max(0, Math.min(1 - draggingElement.h, point.y / rect.height - elementDragOffset.y));
      paint(); return;
    }
    if (draggingPuppet !== null) { const puppet = state.puppets.find(item => item.id === draggingPuppet); if (puppet) Object.assign(puppet, point); paint(); return; }
    if (activeStroke) { activeStroke.points.push(point); paint(); }
  });

  function finishPointer(event) {
    const point = canvasPoint(event);
    if (activeStroke) { state.strokes.push(activeStroke); activeStroke = null; }
    if (shapeStart) { state.boxes.push({ x: shapeStart.x, y: shapeStart.y, w: point.x - shapeStart.x, h: point.y - shapeStart.y, color: state.ink }); shapeStart = null; }
    draggingPuppet = null; draggingElement = null; elementDragOffset = null; persistState(); paint();
  }
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);

  function updateDesk() {
    $('#takeCount').textContent = state.takes.length;
    $('#currentTake').textContent = `Take ${String(state.takes.length + 1).padStart(2, '0')}`;
    $('#castList').textContent = state.puppets.length ? state.puppets.map(p => p.name).join(' • ') : 'nobody yet :(';
    $('#sceneTitle').innerHTML = escapeText(state.scene.title).replace(/ /, '<br>');
  }

  function setStageMode(mode) {
    state.stageMode = mode;
    if (mode === 'live') { state.selectedElement = null; $('#deletePropButton').classList.add('hidden'); }
    $$('[data-stage-mode]').forEach(button => { const active = button.dataset.stageMode === mode; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    $('#paper').classList.toggle('backdrop-mode', mode === 'backdrop');
    $('#canvasCallout').textContent = mode === 'backdrop' ? 'CLICK + DRAG ANY BACKDROP PROP' : state.tool === 'puppet' ? 'GRAB + WIGGLE YOUR PUPPETS' : 'DRAW YOUR WORLD HERE';
    $('#modeLabel').textContent = mode === 'backdrop' ? 'BACKDROP EDIT MODE' : `${state.tool.toUpperCase()} MODE`;
    paint();
  }

  function applyTemplate(templateId) {
    const template = sceneTemplates.find(item => item.id === templateId);
    if (!template) return;
    state.scene = { templateId: template.id, title: template.name, background: template.background || '#fffdf4', elements: clone(template.elements) };
    state.selectedElement = null;
    $('#templatesModal').classList.add('hidden');
    setStageMode('backdrop'); updateDesk(); persistState(); flash(`${template.name} is ready to remix!`);
  }

  function renderTemplates() {
    $('#templateGrid').innerHTML = sceneTemplates.map(template => `<article class="template-card"><span class="template-preview" style="--template-color:${template.color || template.background || '#5c8ee6'}">${template.icon || '✦'}</span><strong>${escapeText(template.name)}</strong><div><button data-template="${template.id}">USE</button><button data-edit-template="${template.id}">EDIT</button></div></article>`).join('');
  }

  function escapeText(value) {
    const node = document.createElement('span'); node.textContent = String(value || ''); return node.innerHTML;
  }

  function makeBlankBackdrop() {
    state.scene = { templateId: `custom-${Date.now()}`, title: 'My Backdrop', background: '#fffdf4', elements: [] };
    state.selectedElement = null; setStageMode('backdrop'); updateDesk(); persistState(); openBackdropEditor();
  }

  function addBackdropProp() {
    const count = state.scene.elements.length;
    const element = { id: `prop-${Date.now()}`, kind: 'rect', x: .18 + (count % 4) * .08, y: .22 + (count % 3) * .08, w: .24, h: .20, color: inkColors[(count + 1) % inkColors.length] };
    state.scene.elements.push(element); state.selectedElement = element.id; $('#deletePropButton').classList.remove('hidden'); syncBackdropEditor(); persistState(); paint();
  }

  function selectedBackdropElement() { return state.scene.elements.find(element => element.id === state.selectedElement) || null; }

  function syncBackdropEditor() {
    const element = selectedBackdropElement();
    const editorOpen = !$('#backdropEditorModal')?.classList.contains('hidden');
    if (!editorOpen) return;
    $('#propEmpty').classList.toggle('hidden', Boolean(element)); $('#propControls').classList.toggle('hidden', !element); $('#deleteEditorPropButton').disabled = !element;
    if (!element) return;
    $('#propKindInput').value = element.kind; $('#propColorInput').value = element.color || '#171718'; $('#propTextInput').value = element.text || 'LABEL';
    $('#propWidthInput').value = Math.round(element.w * 100); $('#propHeightInput').value = Math.round(element.h * 100); $('#propTextField').classList.toggle('hidden', element.kind !== 'textBox');
  }

  function openBackdropEditor() {
    setStageMode('backdrop'); $('#backdropNameInput').value = state.scene.title; $('#backdropColorInput').value = state.scene.background || '#fffdf4';
    $('#backdropEditorModal').classList.remove('hidden'); syncBackdropEditor();
  }

  function updateSelectedProp() {
    const element = selectedBackdropElement(); if (!element) return;
    element.kind = $('#propKindInput').value; element.color = $('#propColorInput').value; element.text = $('#propTextInput').value || 'LABEL';
    element.w = Number($('#propWidthInput').value) / 100; element.h = Number($('#propHeightInput').value) / 100;
    element.x = Math.min(element.x, 1 - element.w); element.y = Math.min(element.y, 1 - element.h);
    $('#propTextField').classList.toggle('hidden', element.kind !== 'textBox'); persistState(); paint();
  }

  function deleteSelectedProp() {
    if (!state.selectedElement) return;
    state.scene.elements = state.scene.elements.filter(element => element.id !== state.selectedElement); state.selectedElement = null;
    $('#deletePropButton').classList.add('hidden'); syncBackdropEditor(); persistState(); paint(); flash('Backdrop prop removed.');
  }

  function saveCurrentTemplate(asNew = false) {
    const name = $('#backdropNameInput').value.trim() || 'My Backdrop'; state.scene.title = name; updateDesk();
    let template = !asNew && sceneTemplates.find(item => item.id === state.scene.templateId);
    if (!template) {
      const id = `custom-${Date.now()}`; template = { id, icon: '✦' }; sceneTemplates.push(template); state.scene.templateId = id;
    } else if (asNew) {
      const id = `custom-${Date.now()}`; template = { id, icon: '✦' }; sceneTemplates.push(template); state.scene.templateId = id;
    }
    Object.assign(template, { name, background: state.scene.background, color: state.scene.background, elements: clone(state.scene.elements) });
    renderTemplates(); persistState(); flash(asNew ? 'Saved as a new template!' : 'Template changes saved!');
  }

  function summonPuppet() {
    const number = state.puppets.length + 1;
    state.puppets.push({ id: Date.now(), x: 160 + number * 45, y: 250 + (number % 2) * 30, color: puppetColors[(number - 1) % puppetColors.length], name: ['BABS', 'DINK', 'CAPTAIN', 'MOP'][number - 1] || `PAL ${number}` });
    setStageMode('live'); setTool('puppet'); updateDesk(); persistState(); paint(); flash('A new dramatic talent has arrived!');
  }

  async function saveTake(blob) {
    const take = { id: Date.now(), name: `Take ${String(state.takes.length + 1).padStart(2, '0')}`, duration: formatTime(state.recordTime), thumb: canvas.toDataURL('image/png'), url: blob ? URL.createObjectURL(blob) : null, hasVideo: Boolean(blob), date: 'just now' };
    state.takes.unshift(take);
    if (blob) await videoStore('put', take.id, blob);
    persistState(); updateDesk(); renderTakes(); flash(`${take.name} saved to Takes!`);
  }

  function startRecording() {
    state.recordTime = 0; mediaChunks = [];
    try {
      const stream = canvas.captureStream(30);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType: type });
      mediaRecorder.addEventListener('dataavailable', event => { if (event.data.size) mediaChunks.push(event.data); });
      mediaRecorder.addEventListener('stop', () => saveTake(new Blob(mediaChunks, { type: 'video/webm' })));
      mediaRecorder.start();
    } catch { mediaRecorder = null; }
    state.isRecording = true;
    $('#recordButton').classList.add('recording'); $('#recordButtonText').textContent = 'STOP + SAVE TAKE'; $('#recordStatus').textContent = 'Action! Wiggle somebody!';
    recordTimer = setInterval(() => { state.recordTime += 1; $('#timeLabel').textContent = formatTime(state.recordTime); paint(); }, 1000);
    paint();
  }

  function stopRecording() {
    state.isRecording = false; clearInterval(recordTimer);
    $('#recordButton').classList.remove('recording'); $('#recordButtonText').textContent = 'RECORD TAKE'; $('#recordStatus').textContent = 'Ready when you are, boss.';
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); else saveTake(null);
    mediaRecorder = null; paint();
  }

  function renderTakes() {
    const root = $('#takesContent');
    if (!state.takes.length) {
      root.innerHTML = '<div class="empty-state"><div class="empty-face">:P</div><h3>THE SHELF IS TRAGICALLY EMPTY</h3><p>Record a take on the Stage and it’ll land right here.</p><button class="chunky red" data-go="stage">GO MAKE A SCENE</button></div>';
    } else {
      root.innerHTML = `<div class="take-grid">${state.takes.map((take, index) => `<button class="take-tile" data-take-id="${take.id}"><div class="take-thumb" style="background-image:url('${take.thumb}')"><span>▶</span><b>${take.duration}</b></div><div class="take-meta"><span>SCENE 01 • TAKE ${state.takes.length - index}</span><strong>${take.name}</strong><em>${take.date}</em></div></button>`).join('')}</div>`;
    }
  }

  function openTake(take) {
    state.selectedTake = take;
    $('#takeModalTitle').textContent = take.name;
    $('#takeMedia').innerHTML = take.url ? `<video src="${take.url}" controls autoplay></video>` : `<img src="${take.thumb}" alt="${take.name} preview">`;
    $('#takeModal').classList.remove('hidden');
  }

  function downloadTake(take) {
    if (!take) return;
    const link = document.createElement('a');
    link.href = take.url || take.thumb;
    link.download = `${take.name.replace(/\s+/g, '-').toLowerCase()}.${take.url ? 'webm' : 'png'}`;
    document.body.append(link); link.click(); link.remove();
  }

  function saveAllTakes() {
    if (!state.takes.length) { flash('Record a take first, director!'); return; }
    state.takes.forEach((take, index) => setTimeout(() => downloadTake(take), index * 180));
    flash(`Saving ${state.takes.length} take${state.takes.length === 1 ? '' : 's'}!`);
  }

  function sendToTimeline() {
    const take = state.selectedTake;
    if (!take) return;
    if (!state.timeline.some(item => item.takeId === take.id)) state.timeline.push({ id: `take-${take.id}`, kind: 'take', takeId: take.id });
    $('#takeModal').classList.add('hidden'); flash(`${take.name} sent to the timeline!`); state.selectedTake = null; persistState();
  }

  function renderTimeline() {
    const first = state.timeline[0];
    const firstTake = first && state.takes.find(take => take.id === first.takeId);
    $('#timelinePreview').innerHTML = first ? `<span class="preview-play">▶</span><strong>${first.kind === 'text' ? first.text : firstTake?.name || 'MISSING TAKE'}</strong>` : '<div class="empty-face small">:|</div><strong>NOTHING TO SCREEN, CHIEF</strong>';
    $('#pieceCount').textContent = `${state.timeline.length} PIECES`;
    $('#exportVideoButton').disabled = !state.timeline.length || isExporting;
    $('#playTimelineButton').disabled = !state.timeline.length || isExporting;
    $('#timelineTrack').innerHTML = state.timeline.map((item, index) => {
      const take = state.takes.find(entry => entry.id === item.takeId);
      return item.kind === 'take'
        ? `<div class="clip take" draggable="true" data-index="${index}"><button class="clip-remove" data-remove="${item.id}" aria-label="Remove clip">×</button><div style="background-image:url('${take?.thumb || ''}')"></div><strong>${take?.name || 'Missing take'}</strong><span>${take?.duration || ''}</span></div>`
        : `<div class="clip text" draggable="true" data-index="${index}"><button class="clip-remove" data-remove="${item.id}" aria-label="Remove title card">×</button><b>T</b><strong>${item.text}</strong><span>TITLE CARD</span></div>`;
    }).join('') + '<button class="add-clip" data-go="takes">+<span>ADD CLIP</span></button>';
  }

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const titleCardDuration = 2;

  function secondsFromLabel(label) {
    const parts = String(label || '').split(':').map(Number);
    return Math.max(1, (parts.pop() || 0) + (parts.pop() || 0) * 60 + (parts.pop() || 0) * 3600);
  }

  function timelineItemDuration(item) {
    if (item.kind === 'text') return titleCardDuration;
    return secondsFromLabel(state.takes.find(take => take.id === item.takeId)?.duration);
  }

  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
      video.addEventListener('loadeddata', () => resolve(video), { once: true });
      video.addEventListener('error', () => reject(new Error('A take could not be opened.')), { once: true });
      video.load();
    });
  }

  async function playTimeline() {
    if (!state.timeline.length || isPreviewing || isExporting) return;
    isPreviewing = true;
    const button = $('#playTimelineButton');
    button.disabled = true; button.textContent = '■ PLAYING FULL CUT…';
    const preview = $('#timelinePreview');
    preview.classList.add('playing');
    try {
      for (const item of state.timeline) {
        if (item.kind === 'text') {
          preview.innerHTML = `<div class="preview-title-card">${item.text}</div>`;
          await wait(titleCardDuration * 1000);
          continue;
        }
        const take = state.takes.find(entry => entry.id === item.takeId);
        if (!take) continue;
        if (take.url) {
          const video = await loadVideo(take.url);
          preview.replaceChildren(video);
          await video.play();
          await new Promise(resolve => { video.addEventListener('ended', resolve, { once: true }); setTimeout(resolve, timelineItemDuration(item) * 1000 + 500); });
          video.pause();
        } else {
          preview.innerHTML = `<img src="${take.thumb}" alt="${take.name}">`;
          await wait(timelineItemDuration(item) * 1000);
        }
      }
    } catch { flash('Preview hit a snag. Your timeline is still safe.'); }
    isPreviewing = false; preview.classList.remove('playing'); renderTimeline();
    button.textContent = '▶ PLAY FULL CUT'; button.disabled = !state.timeline.length;
  }

  function drawExportTitle(ctx, canvasWidth, canvasHeight, text) {
    ctx.fillStyle = '#171718'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#ffd43b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 68px Arial Black, Arial';
    const words = text.trim().split(/\s+/); const lines = []; let line = '';
    words.forEach(word => { const candidate = `${line} ${word}`.trim(); if (ctx.measureText(candidate).width > canvasWidth * .78 && line) { lines.push(line); line = word; } else line = candidate; });
    if (line) lines.push(line);
    lines.forEach((part, index) => ctx.fillText(part, canvasWidth / 2, canvasHeight / 2 + (index - (lines.length - 1) / 2) * 82));
    ctx.strokeStyle = '#fffdf4'; ctx.lineWidth = 5; ctx.strokeRect(42, 42, canvasWidth - 84, canvasHeight - 84);
  }

  function drawContained(ctx, source, canvasWidth, canvasHeight) {
    ctx.fillStyle = '#171718'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const sourceWidth = source.videoWidth || source.naturalWidth || canvasWidth;
    const sourceHeight = source.videoHeight || source.naturalHeight || canvasHeight;
    const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
    const width = sourceWidth * scale, height = sourceHeight * scale;
    ctx.drawImage(source, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; });
  }

  function setExportProgress(percent, message) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    $('#exportProgress').value = value; $('#exportPercent').textContent = `${value}%`; $('#exportStatusText').textContent = message;
  }

  async function exportTimeline() {
    if (!state.timeline.length || isExporting) { if (!state.timeline.length) flash('Add a take or title card to the timeline first!'); return; }
    if (!window.VideoEncoder || !window.VideoFrame) { flash('MP4 export needs a current Chrome or Edge browser.'); return; }
    isExporting = true;
    const button = $('#exportVideoButton');
    button.disabled = true; button.classList.add('busy'); button.textContent = 'EXPORTING…';
    $('#playTimelineButton').disabled = true; $('#exportStatus').classList.remove('hidden');
    setExportProgress(1, 'PREPARING YOUR MOVIE…');
    try {
      const { Muxer, ArrayBufferTarget } = await import('./public/mp4-muxer.mjs');
      const width = 1280, height = 720, fps = 24;
      const support = await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width, height, bitrate: 4_000_000, framerate: fps });
      if (!support.supported) throw new Error('This browser cannot encode H.264 video.');
      const exportCanvas = document.createElement('canvas'); exportCanvas.width = width; exportCanvas.height = height;
      const exportContext = exportCanvas.getContext('2d', { alpha: false });
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({ target, video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
      let encoderError = null;
      const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: error => { encoderError = error; } });
      encoder.configure(support.config);
      const durations = state.timeline.map(timelineItemDuration);
      const totalFrames = Math.max(1, Math.ceil(durations.reduce((sum, value) => sum + value, 0) * fps));
      let encodedFrames = 0;
      const encodeFrame = () => {
        if (encoderError) throw encoderError;
        const frame = new VideoFrame(exportCanvas, { timestamp: Math.round(encodedFrames * 1_000_000 / fps), duration: Math.round(1_000_000 / fps) });
        encoder.encode(frame, { keyFrame: encodedFrames % (fps * 2) === 0 }); frame.close(); encodedFrames += 1;
        setExportProgress(4 + encodedFrames / totalFrames * 92, `BUILDING SCENE ${Math.min(state.timeline.length, state.timeline.findIndex((_, index) => encodedFrames <= durations.slice(0, index + 1).reduce((sum, value) => sum + Math.ceil(value * fps), 0)) + 1)} OF ${state.timeline.length}…`);
      };
      for (let itemIndex = 0; itemIndex < state.timeline.length; itemIndex += 1) {
        const item = state.timeline[itemIndex], duration = durations[itemIndex], frameCount = Math.ceil(duration * fps);
        if (item.kind === 'text') {
          drawExportTitle(exportContext, width, height, item.text);
          for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) encodeFrame();
          continue;
        }
        const take = state.takes.find(entry => entry.id === item.takeId);
        if (!take) continue;
        if (take.url) {
          const video = await loadVideo(take.url); video.currentTime = 0; await video.play();
          for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
            const targetTime = frameIndex / fps;
            while (!video.ended && video.currentTime + .012 < targetTime) await wait(8);
            drawContained(exportContext, video, width, height); encodeFrame();
          }
          video.pause();
        } else {
          const image = await loadImage(take.thumb); drawContained(exportContext, image, width, height);
          for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) encodeFrame();
        }
      }
      setExportProgress(97, 'FINISHING THE MP4…');
      await encoder.flush(); encoder.close(); muxer.finalize();
      if (encoderError) throw encoderError;
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `sticky-takes-full-cut-${new Date().toISOString().slice(0, 10)}.mp4`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportProgress(100, 'DONE! YOUR MOVIE IS DOWNLOADING.'); flash('Full timeline exported as an MP4!');
    } catch (error) {
      console.error(error); setExportProgress(0, 'EXPORT COULD NOT FINISH. TRY AGAIN.'); flash(error.message || 'Export could not finish. Try again.');
    } finally {
      isExporting = false; button.disabled = !state.timeline.length; button.classList.remove('busy'); button.textContent = '↓ EXPORT VIDEO'; $('#playTimelineButton').disabled = !state.timeline.length;
    }
  }

  function closeModal(id) { $(`#${id}`).classList.add('hidden'); if (id === 'takeModal') state.selectedTake = null; }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]'); if (tab) setTab(tab.dataset.tab);
    const go = event.target.closest('[data-go]'); if (go) setTab(go.dataset.go);
    const tool = event.target.closest('[data-tool]'); if (tool) setTool(tool.dataset.tool);
    const takeTile = event.target.closest('[data-take-id]'); if (takeTile) openTake(state.takes.find(take => take.id === Number(takeTile.dataset.takeId)));
    const close = event.target.closest('[data-close]'); if (close) closeModal(close.dataset.close);
    const remove = event.target.closest('[data-remove]'); if (remove) { state.timeline = state.timeline.filter(item => item.id !== remove.dataset.remove); persistState(); renderTimeline(); }
    const stageMode = event.target.closest('[data-stage-mode]'); if (stageMode) setStageMode(stageMode.dataset.stageMode);
    const template = event.target.closest('[data-template]'); if (template) applyTemplate(template.dataset.template);
    const editTemplate = event.target.closest('[data-edit-template]'); if (editTemplate) { applyTemplate(editTemplate.dataset.editTemplate); openBackdropEditor(); }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal('takeModal'); closeModal('helpModal'); closeModal('templatesModal'); closeModal('backdropEditorModal'); } if ((event.key === 'Delete' || event.key === 'Backspace') && state.stageMode === 'backdrop' && state.selectedElement && !event.target.closest('input, textarea, select, button')) deleteSelectedProp(); });
  $$('.modal-backdrop').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
  $('#brandButton').addEventListener('click', () => setTab('stage'));
  $('#helpButton').addEventListener('click', () => $('#helpModal').classList.remove('hidden'));
  $('#undoButton').addEventListener('click', () => { if (state.strokes.length) state.strokes.pop(); else if (state.notes.length) state.notes.pop(); else if (state.boxes.length) state.boxes.pop(); persistState(); paint(); });
  $('#templatesButton').addEventListener('click', () => $('#templatesModal').classList.remove('hidden'));
  $('#newBackdropButton').addEventListener('click', makeBlankBackdrop);
  $('#editBackdropButton').addEventListener('click', openBackdropEditor);
  $('#deletePropButton').addEventListener('click', deleteSelectedProp);
  $('#addBackdropPropButton').addEventListener('click', addBackdropProp);
  $('#deleteEditorPropButton').addEventListener('click', deleteSelectedProp);
  $('#backdropNameInput').addEventListener('input', event => { state.scene.title = event.target.value || 'My Backdrop'; updateDesk(); persistState(); });
  $('#backdropColorInput').addEventListener('input', event => { state.scene.background = event.target.value; persistState(); paint(); });
  ['propKindInput', 'propColorInput', 'propTextInput', 'propWidthInput', 'propHeightInput'].forEach(id => $(`#${id}`).addEventListener('input', updateSelectedProp));
  $('#saveTemplateChangesButton').addEventListener('click', () => saveCurrentTemplate(false));
  $('#saveAsTemplateButton').addEventListener('click', () => saveCurrentTemplate(true));
  $('#summonButton').addEventListener('click', summonPuppet);
  $('#recordButton').addEventListener('click', () => state.isRecording ? stopRecording() : startRecording());
  $('#sendTimelineButton').addEventListener('click', sendToTimeline);
  $('#saveTakeButton').addEventListener('click', () => downloadTake(state.selectedTake));
  $('#saveAllTakesButton').addEventListener('click', saveAllTakes);
  $('#addTitleButton').addEventListener('click', () => { const text = window.prompt('Title card text', 'MEANWHILE...'); if (text) { state.timeline.push({ id: `text-${Date.now()}`, kind: 'text', text }); persistState(); renderTimeline(); } });
  $('#playTimelineButton').addEventListener('click', playTimeline);
  $('#exportVideoButton').addEventListener('click', exportTimeline);
  $('#timelineTrack').addEventListener('dragstart', event => { const clip = event.target.closest('[data-index]'); if (clip) draggedClip = Number(clip.dataset.index); });
  $('#timelineTrack').addEventListener('dragover', event => event.preventDefault());
  $('#timelineTrack').addEventListener('drop', event => { const clip = event.target.closest('[data-index]'); if (!clip || draggedClip === null) return; const [item] = state.timeline.splice(draggedClip, 1); state.timeline.splice(Number(clip.dataset.index), 0, item); draggedClip = null; persistState(); renderTimeline(); });

  const swatches = $('#swatches');
  inkColors.forEach((color, index) => { const button = document.createElement('button'); button.className = `swatch${index === 0 ? ' chosen' : ''}`; button.style.background = color; button.setAttribute('aria-label', `Color ${index + 1}`); button.addEventListener('click', () => { state.ink = color; $$('.swatch').forEach(item => item.classList.toggle('chosen', item === button)); }); swatches.append(button); });
  window.addEventListener('resize', paint);
  restoreState(); renderTemplates(); updateDesk(); renderTakes(); renderTimeline(); requestAnimationFrame(paint);
  Promise.all(state.takes.filter(take => take.hasVideo).map(async take => { const blob = await videoStore('get', take.id); if (blob) take.url = URL.createObjectURL(blob); })).then(() => { if (state.tab === 'takes') renderTakes(); });
})();
