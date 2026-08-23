(() => {
  'use strict';

  const inkColors = ['#171718', '#ee513d', '#5c8ee6', '#ffd43b'];
  const puppetColors = ['#ee513d', '#5c8ee6', '#ffd43b', '#66c79a'];
  const state = {
    tab: 'stage', tool: 'pencil', ink: inkColors[0], strokes: [], boxes: [], notes: [], puppets: [],
    isRecording: false, recordTime: 0, takes: [], timeline: [], selectedTake: null
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
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const formatTime = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

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
    $('#modeLabel').textContent = `${tool.toUpperCase()} MODE`;
    $('#paper').classList.toggle('grab-mode', tool === 'puppet');
    $('#canvasCallout').textContent = tool === 'puppet' ? 'GRAB + WIGGLE YOUR PUPPETS' : 'DRAW YOUR WORLD HERE';
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

  function paint() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(rect.width * dpr), height = Math.floor(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    context.fillStyle = '#fffdf4'; context.fillRect(0, 0, w, h);
    context.strokeStyle = '#ede8dc'; context.lineWidth = 1;
    for (let x = 0; x < w; x += 24) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, h); context.stroke(); }
    for (let y = 0; y < h; y += 24) { context.beginPath(); context.moveTo(0, y); context.lineTo(w, y); context.stroke(); }
    context.fillStyle = '#ffd43b'; context.strokeStyle = '#171718'; context.lineWidth = 4; context.beginPath(); context.arc(w - 70, 62, 30, 0, 7); context.fill(); context.stroke();
    context.fillStyle = '#f29d77'; context.fillRect(w * .25, h * .39, w * .46, h * .43); context.strokeRect(w * .25, h * .39, w * .46, h * .43);
    context.fillStyle = '#ffd43b'; context.fillRect(w * .34, h * .45, w * .28, 42); context.strokeRect(w * .34, h * .45, w * .28, 42);
    context.fillStyle = '#171718'; context.font = '900 24px Arial Black'; context.textAlign = 'center'; context.fillText('MART', w * .48, h * .45 + 30);
    context.fillStyle = '#78a9df'; context.fillRect(w * .31, h * .64, w * .1, h * .18); context.strokeRect(w * .31, h * .64, w * .1, h * .18);
    context.fillStyle = '#bde9f4'; context.fillRect(w * .54, h * .66, w * .13, h * .1); context.strokeRect(w * .54, h * .66, w * .13, h * .1);
    context.fillStyle = '#bbb5a9'; context.beginPath(); context.moveTo(0, h * .84); context.lineTo(w, h * .8); context.lineTo(w, h); context.lineTo(0, h); context.closePath(); context.fill(); context.stroke();
    state.boxes.forEach(box => { context.strokeStyle = box.color; context.lineWidth = 5; context.strokeRect(box.x, box.y, box.w, box.h); });
    state.notes.forEach(note => { context.fillStyle = note.color; context.font = '900 22px Comic Sans MS'; context.textAlign = 'left'; context.fillText(note.text, note.x, note.y); });
    [...state.strokes, activeStroke].filter(Boolean).forEach(stroke => {
      if (stroke.points.length < 2) return;
      context.save(); context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'; context.strokeStyle = stroke.color; context.lineWidth = stroke.width; context.lineCap = 'round'; context.lineJoin = 'round';
      context.beginPath(); context.moveTo(stroke.points[0].x, stroke.points[0].y); stroke.points.slice(1).forEach(point => context.lineTo(point.x, point.y)); context.stroke(); context.restore();
    });
    state.puppets.forEach((puppet, index) => drawPuppet(context, puppet, index));
    if (state.isRecording) { context.fillStyle = '#ee513d'; context.beginPath(); context.arc(24, 26, 9, 0, 7); context.fill(); context.strokeStyle = '#171718'; context.lineWidth = 2; context.stroke(); context.fillStyle = '#171718'; context.font = '900 12px Arial'; context.textAlign = 'left'; context.fillText(`REC  ${formatTime(state.recordTime)}`, 42, 30); }
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', event => {
    const point = canvasPoint(event);
    canvas.setPointerCapture(event.pointerId);
    if (state.tool === 'puppet') { const hit = [...state.puppets].reverse().find(p => Math.hypot(p.x - point.x, p.y - point.y) < 80); if (hit) draggingPuppet = hit.id; return; }
    if (state.tool === 'text') { const text = window.prompt('What should the note say?', 'PLOT TWIST!'); if (text) { state.notes.push({ ...point, text, color: state.ink }); paint(); } return; }
    if (state.tool === 'shape') { shapeStart = point; return; }
    if (state.tool === 'eraser') { state.strokes = state.strokes.filter(stroke => !stroke.points.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 24)); paint(); return; }
    activeStroke = { points: [point], color: state.ink, width: 5 };
    paint();
  });

  canvas.addEventListener('pointermove', event => {
    const point = canvasPoint(event);
    if (draggingPuppet !== null) { const puppet = state.puppets.find(item => item.id === draggingPuppet); if (puppet) Object.assign(puppet, point); paint(); return; }
    if (activeStroke) { activeStroke.points.push(point); paint(); }
  });

  function finishPointer(event) {
    const point = canvasPoint(event);
    if (activeStroke) { state.strokes.push(activeStroke); activeStroke = null; }
    if (shapeStart) { state.boxes.push({ x: shapeStart.x, y: shapeStart.y, w: point.x - shapeStart.x, h: point.y - shapeStart.y, color: state.ink }); shapeStart = null; }
    draggingPuppet = null; paint();
  }
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);

  function updateDesk() {
    $('#takeCount').textContent = state.takes.length;
    $('#currentTake').textContent = `Take ${String(state.takes.length + 1).padStart(2, '0')}`;
    $('#castList').textContent = state.puppets.length ? state.puppets.map(p => p.name).join(' • ') : 'nobody yet :(';
  }

  function summonPuppet() {
    const number = state.puppets.length + 1;
    state.puppets.push({ id: Date.now(), x: 160 + number * 45, y: 250 + (number % 2) * 30, color: puppetColors[(number - 1) % puppetColors.length], name: ['BABS', 'DINK', 'CAPTAIN', 'MOP'][number - 1] || `PAL ${number}` });
    setTool('puppet'); updateDesk(); paint(); flash('A new dramatic talent has arrived!');
  }

  function saveTake(url) {
    const take = { id: Date.now(), name: `Take ${String(state.takes.length + 1).padStart(2, '0')}`, duration: formatTime(state.recordTime), thumb: canvas.toDataURL('image/png'), url, date: 'just now' };
    state.takes.unshift(take); updateDesk(); flash(`${take.name} tossed into Takes!`);
  }

  function startRecording() {
    state.recordTime = 0; mediaChunks = [];
    try {
      const stream = canvas.captureStream(30);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType: type });
      mediaRecorder.addEventListener('dataavailable', event => { if (event.data.size) mediaChunks.push(event.data); });
      mediaRecorder.addEventListener('stop', () => saveTake(URL.createObjectURL(new Blob(mediaChunks, { type: 'video/webm' }))));
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
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); else saveTake();
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

  function sendToTimeline() {
    const take = state.selectedTake;
    if (!take) return;
    if (!state.timeline.some(item => item.takeId === take.id)) state.timeline.push({ id: `take-${take.id}`, kind: 'take', takeId: take.id });
    $('#takeModal').classList.add('hidden'); flash(`${take.name} sent to the timeline!`); state.selectedTake = null;
  }

  function renderTimeline() {
    const first = state.timeline[0];
    const firstTake = first && state.takes.find(take => take.id === first.takeId);
    $('#timelinePreview').innerHTML = first ? `<span class="preview-play">▶</span><strong>${first.kind === 'text' ? first.text : firstTake?.name || 'MISSING TAKE'}</strong>` : '<div class="empty-face small">:|</div><strong>NOTHING TO SCREEN, CHIEF</strong>';
    $('#pieceCount').textContent = `${state.timeline.length} PIECES`;
    $('#timelineTrack').innerHTML = state.timeline.map((item, index) => {
      const take = state.takes.find(entry => entry.id === item.takeId);
      return item.kind === 'take'
        ? `<div class="clip take" draggable="true" data-index="${index}"><button class="clip-remove" data-remove="${item.id}" aria-label="Remove clip">×</button><div style="background-image:url('${take?.thumb || ''}')"></div><strong>${take?.name || 'Missing take'}</strong><span>${take?.duration || ''}</span></div>`
        : `<div class="clip text" draggable="true" data-index="${index}"><button class="clip-remove" data-remove="${item.id}" aria-label="Remove title card">×</button><b>T</b><strong>${item.text}</strong><span>TITLE CARD</span></div>`;
    }).join('') + '<button class="add-clip" data-go="takes">+<span>ADD CLIP</span></button>';
  }

  function closeModal(id) { $(`#${id}`).classList.add('hidden'); if (id === 'takeModal') state.selectedTake = null; }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]'); if (tab) setTab(tab.dataset.tab);
    const go = event.target.closest('[data-go]'); if (go) setTab(go.dataset.go);
    const tool = event.target.closest('[data-tool]'); if (tool) setTool(tool.dataset.tool);
    const takeTile = event.target.closest('[data-take-id]'); if (takeTile) openTake(state.takes.find(take => take.id === Number(takeTile.dataset.takeId)));
    const close = event.target.closest('[data-close]'); if (close) closeModal(close.dataset.close);
    const remove = event.target.closest('[data-remove]'); if (remove) { state.timeline = state.timeline.filter(item => item.id !== remove.dataset.remove); renderTimeline(); }
  });

  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal('takeModal'); closeModal('helpModal'); } });
  $$('.modal-backdrop').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
  $('#brandButton').addEventListener('click', () => setTab('stage'));
  $('#helpButton').addEventListener('click', () => $('#helpModal').classList.remove('hidden'));
  $('#undoButton').addEventListener('click', () => { if (state.strokes.length) state.strokes.pop(); else if (state.notes.length) state.notes.pop(); else if (state.boxes.length) state.boxes.pop(); paint(); });
  $('#summonButton').addEventListener('click', summonPuppet);
  $('#recordButton').addEventListener('click', () => state.isRecording ? stopRecording() : startRecording());
  $('#sendTimelineButton').addEventListener('click', sendToTimeline);
  $('#addTitleButton').addEventListener('click', () => { const text = window.prompt('Title card text', 'MEANWHILE...'); if (text) { state.timeline.push({ id: `text-${Date.now()}`, kind: 'text', text }); renderTimeline(); } });
  $('#timelineTrack').addEventListener('dragstart', event => { const clip = event.target.closest('[data-index]'); if (clip) draggedClip = Number(clip.dataset.index); });
  $('#timelineTrack').addEventListener('dragover', event => event.preventDefault());
  $('#timelineTrack').addEventListener('drop', event => { const clip = event.target.closest('[data-index]'); if (!clip || draggedClip === null) return; const [item] = state.timeline.splice(draggedClip, 1); state.timeline.splice(Number(clip.dataset.index), 0, item); draggedClip = null; renderTimeline(); });

  const swatches = $('#swatches');
  inkColors.forEach((color, index) => { const button = document.createElement('button'); button.className = `swatch${index === 0 ? ' chosen' : ''}`; button.style.background = color; button.setAttribute('aria-label', `Color ${index + 1}`); button.addEventListener('click', () => { state.ink = color; $$('.swatch').forEach(item => item.classList.toggle('chosen', item === button)); }); swatches.append(button); });
  window.addEventListener('resize', paint);
  updateDesk(); renderTakes(); renderTimeline(); requestAnimationFrame(paint);
})();
