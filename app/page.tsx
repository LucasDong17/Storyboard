'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Point = { x:number; y:number };
type Stroke = { points:Point[]; color:string; width:number; erase?:boolean };
type Box = { x:number; y:number; w:number; h:number; color:string };
type Note = { x:number; y:number; text:string; color:string };
type Puppet = { id:number; x:number; y:number; color:string; name:string };
type Take = { id:number; name:string; duration:string; thumb:string; url?:string; date:string };
type TimelineItem = { id:string; kind:'take'|'text'; takeId?:number; text?:string };

const inkColors = ['#171718','#ee513d','#5c8ee6','#ffd43b'];
const puppetColors = ['#ee513d','#5c8ee6','#ffd43b','#66c79a'];

export default function Home() {
  const [tab,setTab] = useState<'stage'|'takes'|'timeline'>('stage');
  const [tool,setTool] = useState<'pencil'|'eraser'|'text'|'shape'|'puppet'>('pencil');
  const [ink,setInk] = useState(inkColors[0]);
  const [strokes,setStrokes] = useState<Stroke[]>([]);
  const [boxes,setBoxes] = useState<Box[]>([]);
  const [notes,setNotes] = useState<Note[]>([]);
  const [puppets,setPuppets] = useState<Puppet[]>([]);
  const [isRecording,setIsRecording] = useState(false);
  const [recordTime,setRecordTime] = useState(0);
  const [takes,setTakes] = useState<Take[]>([]);
  const [timeline,setTimeline] = useState<TimelineItem[]>([]);
  const [selectedTake,setSelectedTake] = useState<Take|null>(null);
  const [toast,setToast] = useState('');
  const [isHelp,setIsHelp] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<Stroke|null>(null);
  const shapeStart = useRef<Point|null>(null);
  const draggingPuppet = useRef<number|null>(null);
  const mediaRecorder = useRef<MediaRecorder|null>(null);
  const mediaChunks = useRef<Blob[]>([]);
  const recordedTime = useRef(0);
  const dragTimeline = useRef<number|null>(null);

  const flash = (message:string) => { setToast(message); window.setTimeout(()=>setToast(''),2200); };

  const drawPuppet = useCallback((ctx:CanvasRenderingContext2D,p:Puppet,index:number)=>{
    ctx.save(); ctx.translate(p.x,p.y); ctx.lineWidth=5; ctx.lineCap='round'; ctx.strokeStyle='#171718';
    ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(0,-42,22,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#171718'; ctx.beginPath(); ctx.arc(-7,-46,2.5,0,7); ctx.arc(7,-46,2.5,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-38,8,.2,Math.PI-.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-19); ctx.lineTo(0,38); ctx.moveTo(0,-2); ctx.lineTo(-34,14+(index%2)*9); ctx.moveTo(0,-2); ctx.lineTo(34,5-(index%2)*7); ctx.moveTo(0,38); ctx.lineTo(-25,76); ctx.moveTo(0,38); ctx.lineTo(27,72); ctx.stroke();
    ctx.fillStyle='#fffdf4'; ctx.strokeStyle='#171718'; ctx.lineWidth=2; ctx.font='900 9px Arial'; const w=ctx.measureText(p.name).width+14; ctx.fillRect(-w/2,82,w,18); ctx.strokeRect(-w/2,82,w,18); ctx.fillStyle='#171718';ctx.textAlign='center';ctx.fillText(p.name,0,95); ctx.restore();
  },[]);

  const paint = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return; const rect=canvas.getBoundingClientRect(); const dpr=Math.min(window.devicePixelRatio||1,2);
    if(canvas.width!==Math.floor(rect.width*dpr)||canvas.height!==Math.floor(rect.height*dpr)){canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr)}
    const ctx=canvas.getContext('2d'); if(!ctx) return; ctx.setTransform(dpr,0,0,dpr,0,0); const w=rect.width,h=rect.height;
    ctx.fillStyle='#fffdf4';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ede8dc';ctx.lineWidth=1;
    for(let x=0;x<w;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()} for(let y=0;y<h;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    ctx.fillStyle='#ffd43b';ctx.strokeStyle='#171718';ctx.lineWidth=4;ctx.beginPath();ctx.arc(w-70,62,30,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f29d77';ctx.fillRect(w*.25,h*.39,w*.46,h*.43);ctx.strokeRect(w*.25,h*.39,w*.46,h*.43);
    ctx.fillStyle='#ffd43b';ctx.fillRect(w*.34,h*.45,w*.28,42);ctx.strokeRect(w*.34,h*.45,w*.28,42);ctx.fillStyle='#171718';ctx.font='900 24px Arial Black';ctx.textAlign='center';ctx.fillText('MART',w*.48,h*.45+30);
    ctx.fillStyle='#78a9df';ctx.fillRect(w*.31,h*.64,w*.1,h*.18);ctx.strokeRect(w*.31,h*.64,w*.1,h*.18);ctx.fillStyle='#bde9f4';ctx.fillRect(w*.54,h*.66,w*.13,h*.1);ctx.strokeRect(w*.54,h*.66,w*.13,h*.1);
    ctx.fillStyle='#bbb5a9';ctx.beginPath();ctx.moveTo(0,h*.84);ctx.lineTo(w,h*.8);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();ctx.stroke();
    boxes.forEach(b=>{ctx.strokeStyle=b.color;ctx.lineWidth=5;ctx.strokeRect(b.x,b.y,b.w,b.h)});
    notes.forEach(n=>{ctx.fillStyle=n.color;ctx.font='900 22px Comic Sans MS';ctx.textAlign='left';ctx.fillText(n.text,n.x,n.y)});
    [...strokes, activeStroke.current].filter((s):s is Stroke=>Boolean(s)).forEach(s=>{if(s.points.length<2)return;ctx.save();ctx.globalCompositeOperation=s.erase?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(s.points[0].x,s.points[0].y);s.points.slice(1).forEach(pt=>ctx.lineTo(pt.x,pt.y));ctx.stroke();ctx.restore()});
    puppets.forEach((p,i)=>drawPuppet(ctx,p,i));
    if(isRecording){ctx.fillStyle='#ee513d';ctx.beginPath();ctx.arc(24,26,9,0,7);ctx.fill();ctx.strokeStyle='#171718';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#171718';ctx.font='900 12px Arial';ctx.textAlign='left';ctx.fillText(`REC  ${formatTime(recordTime)}`,42,30)}
  },[boxes,notes,strokes,puppets,isRecording,recordTime,drawPuppet]);

  useEffect(()=>{paint()},[paint]);
  useEffect(()=>{const resize=()=>paint();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[paint]);
  useEffect(()=>{if(!isRecording)return;const timer=window.setInterval(()=>setRecordTime(v=>{recordedTime.current=v+1;return v+1}),1000);return()=>clearInterval(timer)},[isRecording]);

  const point = (e:React.PointerEvent<HTMLCanvasElement>) => { const r=e.currentTarget.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top} };
  const pointerDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const p=point(e);e.currentTarget.setPointerCapture(e.pointerId);
    if(tool==='puppet'){const hit=[...puppets].reverse().find(q=>Math.hypot(q.x-p.x,q.y-p.y)<80);if(hit)draggingPuppet.current=hit.id;return}
    if(tool==='text'){const text=window.prompt('What should the note say?','PLOT TWIST!');if(text)setNotes(v=>[...v,{...p,text,color:ink}]);return}
    if(tool==='shape'){shapeStart.current=p;return}
    if(tool==='eraser'){setStrokes(v=>v.filter(s=>!s.points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<24)));return}
    activeStroke.current={points:[p],color:ink,width:5};paint();
  };
  const pointerMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{const p=point(e);if(draggingPuppet.current!==null){setPuppets(v=>v.map(q=>q.id===draggingPuppet.current?{...q,...p}:q));return}if(activeStroke.current){activeStroke.current={...activeStroke.current,points:[...activeStroke.current.points,p]};paint()}};
  const pointerUp=(e:React.PointerEvent<HTMLCanvasElement>)=>{const p=point(e);if(activeStroke.current){setStrokes(v=>[...v,activeStroke.current!]);activeStroke.current=null}if(shapeStart.current){setBoxes(v=>[...v,{x:shapeStart.current!.x,y:shapeStart.current!.y,w:p.x-shapeStart.current!.x,h:p.y-shapeStart.current!.y,color:ink}]);shapeStart.current=null}draggingPuppet.current=null};

  const summon=()=>{const id=Date.now();const n=puppets.length+1;setPuppets(v=>[...v,{id,x:160+n*45,y:250+(n%2)*30,color:puppetColors[(n-1)%puppetColors.length],name:['BABS','DINK','CAPTAIN','MOP'][n-1]||`PAL ${n}`}]);setTool('puppet');flash('A new dramatic talent has arrived!')};
  const undo=()=>{if(strokes.length)setStrokes(v=>v.slice(0,-1));else if(notes.length)setNotes(v=>v.slice(0,-1));else if(boxes.length)setBoxes(v=>v.slice(0,-1))};

  const startRecording=()=>{
    const canvas=canvasRef.current;if(!canvas)return;setRecordTime(0);recordedTime.current=0;mediaChunks.current=[];
    try{const stream=canvas.captureStream(30);const rec=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm'});rec.ondataavailable=e=>{if(e.data.size)mediaChunks.current.push(e.data)};rec.onstop=()=>{const blob=new Blob(mediaChunks.current,{type:'video/webm'});const take:Take={id:Date.now(),name:`Take ${String(takes.length+1).padStart(2,'0')}`,duration:formatTime(recordedTime.current),thumb:canvas.toDataURL('image/png'),url:URL.createObjectURL(blob),date:'just now'};setTakes(v=>[take,...v]);flash(`${take.name} tossed into Takes!`)};mediaRecorder.current=rec;rec.start();setIsRecording(true)}catch{setIsRecording(true)}
  };
  const stopRecording=()=>{setIsRecording(false);if(mediaRecorder.current?.state==='recording')mediaRecorder.current.stop();else{const canvas=canvasRef.current;if(canvas)setTakes(v=>[{id:Date.now(),name:`Take ${String(v.length+1).padStart(2,'0')}`,duration:formatTime(recordedTime.current),thumb:canvas.toDataURL(),date:'just now'},...v])}};
  const sendToTimeline=(take:Take)=>{if(!timeline.some(i=>i.takeId===take.id))setTimeline(v=>[...v,{id:`take-${take.id}`,kind:'take',takeId:take.id}]);flash(`${take.name} sent to the timeline!`);setSelectedTake(null)};
  const addTitleCard=()=>{const text=window.prompt('Title card text','MEANWHILE...');if(text)setTimeline(v=>[...v,{id:`text-${Date.now()}`,kind:'text',text}])};
  const moveTimeline=(from:number,to:number)=>{setTimeline(v=>{const a=[...v];const [item]=a.splice(from,1);a.splice(to,0,item);return a})};

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand-button" onClick={()=>setTab('stage')} aria-label="Go to stage"><div className="brand-mark" aria-hidden="true"><span/><span/><span/></div><div className="brand-copy"><h1>STICKY TAKES</h1><p>make a scene. literally.</p></div></button>
      <nav className="tabs" aria-label="Main navigation"><button className={`tab ${tab==='stage'?'active':''}`} onClick={()=>setTab('stage')}>STAGE</button><button className={`tab ${tab==='takes'?'active':''}`} onClick={()=>setTab('takes')}>TAKES <b>{takes.length}</b></button><button className={`tab ${tab==='timeline'?'active':''}`} onClick={()=>setTab('timeline')}>TIMELINE</button></nav>
      <button className="help-button" aria-label="Help" onClick={()=>setIsHelp(true)}>?</button>
    </header>

    {tab==='stage' && <section className="studio">
      <aside className="tool-rail" aria-label="Drawing tools"><div className="scene-label"><span>SCENE 01</span><strong>The Great<br/>Snack Heist</strong></div>
        <div className="tool-stack">{([['pencil','✎','PENCIL'],['eraser','▱','ERASER'],['text','T','TEXT'],['shape','□','SHAPE'],['puppet','♙','PUPPET']] as const).map(([id,icon,label])=><button key={id} className={`tool ${tool===id?'active':''}`} onClick={()=>setTool(id)} aria-label={label}><span>{icon}</span>{label}</button>)}</div>
        <div className="color-box"><span>INK COLOR</span><div className="swatches">{inkColors.map((c,i)=><button key={c} className={`swatch ${ink===c?'chosen':''}`} style={{background:c}} onClick={()=>setInk(c)} aria-label={`Color ${i+1}`}/>)}</div></div>
        <button className="undo-button" onClick={undo}>↶ UNDO</button>
      </aside>
      <section className="canvas-wrap"><div className="paper-tabs" aria-hidden="true"><span>BACKDROP</span><span>LIVE STAGE</span></div><div className={`paper ${tool==='puppet'?'grab-mode':''}`}><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="Draw your scene and move puppets here"/><div className="canvas-callout">{tool==='puppet'?'GRAB + WIGGLE YOUR PUPPETS':'DRAW YOUR WORLD HERE'}</div></div><div className="paper-footer"><span>720p-ish</span><span>{tool.toUpperCase()} MODE</span><span>{isRecording?formatTime(recordTime):'00:00:00'}</span></div></section>
      <aside className="record-panel"><div className="panel-title"><span>DIRECTOR'S<br/>MESSY DESK</span><i>✦</i></div><div className="take-card"><span className="eyebrow">CURRENT TAKE</span><strong>Take {String(takes.length+1).padStart(2,'0')}</strong><p>{isRecording?'Action! Wiggle somebody!':'Ready when you are, boss.'}</p></div>
        <button className={`record-button ${isRecording?'recording':''}`} onClick={isRecording?stopRecording:startRecording}><span className="record-dot"/>{isRecording?'STOP + SAVE TAKE':'RECORD TAKE'}</button><button className="puppet-button" onClick={summon}><span>+</span> SUMMON A PUPPET</button><div className="tip-note"><b>PRO TIP!</b><br/>Hit record, grab your puppet, and wiggle like nobody's watching.</div><div className="cast-preview"><span>CAST ON STAGE</span><em>{puppets.length?puppets.map(p=>p.name).join(' • '):'nobody yet :('}</em></div>
      </aside>
    </section>}

    {tab==='takes' && <section className="library-view"><div className="view-heading"><div><span className="kicker">THE INVENTORY</span><h2>YOUR BEAUTIFUL MESSES</h2><p>Every take lives here. Even the weird ones.</p></div><button className="chunky yellow" onClick={()=>setTab('stage')}>+ SHOOT ANOTHER</button></div>{takes.length===0?<div className="empty-state"><div className="empty-face">:P</div><h3>THE SHELF IS TRAGICALLY EMPTY</h3><p>Record a take on the Stage and it’ll land right here.</p><button className="chunky red" onClick={()=>setTab('stage')}>GO MAKE A SCENE</button></div>:<div className="take-grid">{takes.map((take,i)=><button className="take-tile" key={take.id} onClick={()=>setSelectedTake(take)}><div className="take-thumb" style={{backgroundImage:`url(${take.thumb})`}}><span>▶</span><b>{take.duration}</b></div><div className="take-meta"><span>SCENE 01 • TAKE {takes.length-i}</span><strong>{take.name}</strong><em>{take.date}</em></div></button>)}</div>}</section>}

    {tab==='timeline' && <section className="timeline-view"><div className="view-heading"><div><span className="kicker">THE CUTTING TABLE</span><h2>SMUSH IT TOGETHER</h2><p>Drag scenes around. Add words. Become cinema.</p></div><div className="heading-actions"><button className="chunky cream" onClick={addTitleCard}>+ TEXT CARD</button><button className="chunky yellow" onClick={()=>setTab('takes')}>+ ADD TAKES</button></div></div><div className="timeline-workspace"><div className="preview-monitor"><div className="preview-inner">{timeline.length?<><span className="preview-play">▶</span><strong>{timeline[0].kind==='text'?timeline[0].text:takes.find(t=>t.id===timeline[0].takeId)?.name}</strong></>:<><div className="empty-face small">:|</div><strong>NOTHING TO SCREEN, CHIEF</strong></>}</div><div className="monitor-label"><span>ROUGH CUT PREVIEW</span><span>{timeline.length} PIECES</span></div></div><div className="track-area"><div className="track-label">VIDEO + WORDS</div><div className="track">{timeline.map((item,i)=>{const take=takes.find(t=>t.id===item.takeId);return <div key={item.id} draggable onDragStart={()=>dragTimeline.current=i} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragTimeline.current!==null)moveTimeline(dragTimeline.current,i);dragTimeline.current=null}} className={`clip ${item.kind}`}><button className="clip-remove" onClick={()=>setTimeline(v=>v.filter(x=>x.id!==item.id))}>×</button>{item.kind==='take'?<><div style={{backgroundImage:`url(${take?.thumb})`}}/><strong>{take?.name}</strong><span>{take?.duration}</span></>:<><b>T</b><strong>{item.text}</strong><span>TITLE CARD</span></>}</div>})}<button className="add-clip" onClick={()=>setTab('takes')}>+<span>ADD CLIP</span></button></div><div className="ruler">{[0,1,2,3,4,5,6,7].map(n=><span key={n}>{n*5}s</span>)}</div></div></div></section>}

    {selectedTake&&<div className="modal-backdrop" onClick={()=>setSelectedTake(null)}><section className="take-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedTake(null)}>×</button><span className="kicker">NOW SCREENING</span><h2>{selectedTake.name}</h2>{selectedTake.url?<video src={selectedTake.url} controls autoPlay/>:<img src={selectedTake.thumb} alt={`${selectedTake.name} preview`}/>}<div className="modal-actions"><button className="chunky cream" onClick={()=>setSelectedTake(null)}>BACK TO SHELF</button><button className="chunky yellow" onClick={()=>sendToTimeline(selectedTake)}>SEND TO TIMELINE →</button></div></section></div>}
    {isHelp&&<div className="modal-backdrop" onClick={()=>setIsHelp(false)}><section className="help-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setIsHelp(false)}>×</button><span className="kicker">TINY MANUAL</span><h2>HOW TO MAKE A MESS</h2><ol><li>Draw a backdrop with the tools on the left.</li><li>Summon a puppet (or three).</li><li>Record, then drag the puppets around the stage.</li><li>Find your take in Takes and send it to the Timeline.</li><li>Reorder the clips until it feels like cinema.</li></ol></section></div>}
    {toast&&<div className="toast" role="status">✦ {toast}</div>}
  </main>;
}

function formatTime(seconds:number){return `00:${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
