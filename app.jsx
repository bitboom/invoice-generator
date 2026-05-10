/* global React, ReactDOM, html2canvas, ClassicTemplate, InvoifyTemplate1, InvoifyTemplate2, InvoifyTemplate3, fmt */
const { useState, useMemo, useRef, useEffect, useCallback } = React;

const STORAGE_KEY = 'invoice-data-v2';
const MAX_LOGO_BYTES = 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: '한국형 추천', badge: '추천', thumb: 'classic', comp: ClassicTemplate },
  { id: 'invoify1', name: 'Invoify 1', desc: '기본형 비즈니스', badge: '기본형', thumb: 'minimal', comp: InvoifyTemplate1 },
  { id: 'invoify2', name: 'Invoify 2', desc: '문서형 상세', badge: '문서형', thumb: 'bold', comp: InvoifyTemplate2 },
  { id: 'invoify3', name: 'Invoify 3', desc: '확장 강조형', badge: '확장형', thumb: 'invoify3', comp: InvoifyTemplate3 },
];

const PALETTE = [
  { name: 'Black', color: '#0a0a0a' },
  { name: 'Charcoal', color: '#2f3437' },
  { name: 'Navy', color: '#1e3a8a' },
  { name: 'Green', color: '#166534' },
  { name: 'Brown', color: '#7c2d12' },
  { name: 'Burgundy', color: '#7f1d1d' },
  { name: 'Sand', color: '#d6c7a1' },
  { name: 'Gray', color: '#6b7280' },
];

// Today as 'YYYY. MM. DD.'
function todayKR() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${p(d.getMonth()+1)}. ${p(d.getDate())}.`;
}

const DEFAULT_NOTES = [
  '시공 및 비용에 관한 일정은 사전에 협의 후 진행합니다.',
  '공정용수는 갑측이 제공합니다.',
  '설계나 시공 내용이 변경될 경우, 견적 금액은 변동될 수 있습니다.',
  '본 견적은 견적일로부터 15일 동안 유효합니다.',
];
const LEGACY_THREE_NOTES = [DEFAULT_NOTES[0], DEFAULT_NOTES[2], DEFAULT_NOTES[3]];

const normalizeNotes = (notes) => {
  if (!Array.isArray(notes)) return DEFAULT_NOTES;
  const hasWaterNote = notes.includes(DEFAULT_NOTES[1]);
  const wasLegacyDefault = LEGACY_THREE_NOTES.every((note, idx) => notes[idx] === note) && notes.length === 3;
  if (!hasWaterNote && wasLegacyDefault) {
    return [notes[0], DEFAULT_NOTES[1], notes[1], notes[2]];
  }
  return notes;
};

const DEFAULT_DATA = {
  date: todayKR(),
  companyName: '',
  address: '',
  phone: '',
  bizNumber: '',
  email: '',
  bankName: '',
  bankAccount: '',
  depositor: '',
  logoDataUrl: '',
  themeColor: '#0a0a0a',
  stampText: '',
  stampImageDataUrl: '',
  showStamp: false,

  workName: '',
  recipient: '',
  contact: '',

  notes: DEFAULT_NOTES,

  items: [
    { name: '', unitPrice: 0, qty: 1, total: 0 },
  ],
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA, ...parsed, notes: normalizeNotes(parsed.notes) };
  } catch { return DEFAULT_DATA; }
}

function App() {
  const [data, setData] = useState(loadData);
  const [tplId, setTplId] = useState('classic');
  const [zoom, setZoom] = useState(0.48);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem('invoice-intro-seen') !== 'yes'; } catch { return true; }
  });
  const invoiceRef = useRef(null);
  const previewRefs = useRef({});
  const exportRefs = useRef({});
  const logoInputRef = useRef(null);
  const stampInputRef = useRef(null);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      setToast({ type: 'err', msg: '브라우저 저장 공간이 부족합니다. 로고 용량을 줄이거나 입력값을 정리해 주세요.' });
      setTimeout(() => setToast(null), 3200);
    }
  }, [data]);

  // auto-fit zoom
  useEffect(() => {
    const calc = () => {
      const stage = document.querySelector('.stage');
      if (!stage) return;
      const w = (stage.clientWidth - 132) / 2;
      const z = Math.min(0.52, Math.max(0.28, w / 794));
      setZoom(Number(z.toFixed(2)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // computed totals
  const totals = useMemo(() => {
    const items = data.items.map(i => {
      let t = Number(i.total);
      if (!t && i.unitPrice && i.qty) t = Number(i.unitPrice) * Number(i.qty);
      return { ...i, total: t || 0 };
    });
    const supply = items.reduce((s, i) => s + i.total, 0);
    const tax = Math.round(supply * 0.1);
    const total = supply + tax;
    return { items, supply, tax, total };
  }, [data.items]);

  // field setters
  const setField = (key) => (e) => setData(d => ({ ...d, [key]: e.target.value }));
  const setValue = (key, value) => setData(d => ({ ...d, [key]: value }));
  const setItem = (idx, key, value) => setData(d => ({
    ...d,
    items: d.items.map((it, i) => i === idx ? { ...it, [key]: value } : it),
  }));
  const addItem = () => setData(d => ({ ...d, items: [...d.items, { name: '', unitPrice: 0, qty: 1, total: 0 }]}));
  const removeItem = (idx) => setData(d => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, i) => i !== idx) : [{ name: '', unitPrice: 0, qty: 1, total: 0 }] }));
  const setNote = (idx, value) => setData(d => ({
    ...d,
    notes: d.notes.map((n, i) => i === idx ? value : n),
  }));
  const addNote = () => setData(d => ({ ...d, notes: [...d.notes, '']}));
  const removeNote = (idx) => setData(d => ({ ...d, notes: d.notes.filter((_, i) => i !== idx) }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const rejectLogo = (msg) => {
      setToast({ type: 'err', msg });
      setTimeout(() => setToast(null), 2400);
      if (logoInputRef.current) logoInputRef.current.value = '';
    };

    if (file.type !== 'image/png') {
      rejectLogo('PNG 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      rejectLogo('로고 파일은 1MB 이하 PNG만 사용할 수 있습니다.');
      return;
    }

    try {
      const header = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
      const hasPngSignature = PNG_SIGNATURE.every((byte, idx) => header[idx] === byte);
      if (!hasPngSignature) {
        rejectLogo('PNG 파일 형식이 올바르지 않습니다.');
        return;
      }
    } catch {
      rejectLogo('로고 파일을 확인하지 못했습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setData(d => ({ ...d, logoDataUrl: reader.result }));
      setToast({ type: 'ok', msg: '로고가 적용되었습니다.' });
      setTimeout(() => setToast(null), 2400);
    };
    reader.onerror = () => {
      rejectLogo('로고를 읽지 못했습니다.');
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setData(d => ({ ...d, logoDataUrl: '' }));
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleStampUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rejectStamp = (msg) => {
      setToast({ type: 'err', msg });
      setTimeout(() => setToast(null), 2400);
      if (stampInputRef.current) stampInputRef.current.value = '';
    };
    if (file.type !== 'image/png') { rejectStamp('직인은 PNG 파일만 업로드할 수 있습니다.'); return; }
    if (file.size > MAX_LOGO_BYTES) { rejectStamp('직인 파일은 1MB 이하 PNG만 사용할 수 있습니다.'); return; }
    try {
      const header = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
      const hasPngSignature = PNG_SIGNATURE.every((byte, idx) => header[idx] === byte);
      if (!hasPngSignature) { rejectStamp('직인 PNG 파일 형식이 올바르지 않습니다.'); return; }
    } catch { rejectStamp('직인 파일을 확인하지 못했습니다.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setData(d => ({ ...d, stampImageDataUrl: reader.result, showStamp: true }));
      setToast({ type: 'ok', msg: '직인 이미지가 적용되었습니다.' });
      setTimeout(() => setToast(null), 2400);
    };
    reader.onerror = () => rejectStamp('직인 이미지를 읽지 못했습니다.');
    reader.readAsDataURL(file);
  };

  const removeStampImage = () => {
    setData(d => ({ ...d, stampImageDataUrl: '' }));
    if (stampInputRef.current) stampInputRef.current.value = '';
  };

  const reset = () => {
    if (!confirm('모든 입력값을 기본값으로 초기화할까요?')) return;
    setData(DEFAULT_DATA);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  // Download as PNG
  const renderCanvas = useCallback((node) => html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: 794,
    windowHeight: 1123,
    width: 794,
    height: 1123,
    onclone: (doc) => {
      doc.querySelectorAll('.invoice-frame').forEach(frame => {
        frame.style.transform = 'none';
        frame.style.position = 'static';
      });
    },
  }), []);

  const saveCanvas = (canvas, filename) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('PNG 변환에 실패했습니다.')); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 400);
    }, 'image/png');
  });

  const capturePng = useCallback(async (node, filename) => {
    const canvas = await renderCanvas(node);
    await saveCanvas(canvas, filename);
  }, [renderCanvas]);

  const download = useCallback(async () => {
    const node = previewRefs.current[tplId]?.querySelector('.invoice') || invoiceRef.current?.querySelector('.invoice');
    if (!node) return;
    setBusy(true);
    try {
      const datePart = data.date.replace(/[^0-9]/g,'').slice(0,8) || 'untitled';
      await capturePng(node, `invoice_${tplId}_${datePart}.png`);
      setToast({ type: 'ok', msg: '현재 디자인 PNG 다운로드 완료' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'err', msg: '저장 실패: ' + err.message });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2400);
    }
  }, [capturePng, data.date, tplId]);

  const downloadAll = useCallback(async () => {
    setBusy(true);
    try {
      const datePart = data.date.replace(/[^0-9]/g,'').slice(0,8) || 'untitled';
      const canvases = [];
      for (const t of TEMPLATES) {
        const node = exportRefs.current[t.id]?.querySelector('.invoice');
        if (node) canvases.push(await renderCanvas(node));
      }
      const sheet = document.createElement('canvas');
      sheet.width = 1588;
      sheet.height = 2246;
      const ctx = sheet.getContext('2d');
      ctx.fillStyle = '#f3f0ea';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      const cellW = 794;
      const cellH = 1123;
      canvases.forEach((canvas, idx) => {
        const x = (idx % 2) * cellW;
        const y = Math.floor(idx / 2) * cellH;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.drawImage(canvas, x, y, cellW, cellH);
      });
      await saveCanvas(sheet, `invoice_all_4_versions_${datePart}.png`);
      setToast({ type: 'ok', msg: '4개 디자인 비교 PNG를 저장했습니다.' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'err', msg: '전체 저장 실패: ' + err.message });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2600);
    }
  }, [data.date, renderCanvas]);

  const TplComp = TEMPLATES.find(t => t.id === tplId).comp;
  const closeIntro = () => {
    try { localStorage.setItem('invoice-intro-seen', 'yes'); } catch {}
    setShowIntro(false);
  };

  return (
    <div className="app">
      {showIntro && (
        <div className="intro-overlay">
          <section className="intro-card">
            <div className="intro-kicker">Invoice Studio</div>
            <h2>입력은 한 번만, 결과는 4가지 디자인으로 한 번에 보세요.</h2>
            <p>사업장, 수신처, 품목, 계좌 정보를 입력하면 Classic과 Invoify 1/2/3 미리보기가 자동으로 펼쳐지고 PNG로 저장할 수 있습니다.</p>
            <div className="intro-steps">
              <div><strong>1</strong><span>정보 입력</span></div>
              <div><strong>2</strong><span>4가지 자동 비교</span></div>
              <div><strong>3</strong><span>PNG 저장</span></div>
            </div>
            <div className="intro-result-strip">
              {TEMPLATES.map(t => <div key={t.id}><span className="mini-badge">{t.badge}</span><b>{t.name}</b><small>{t.desc}</small></div>)}
            </div>
            <p className="intro-privacy">입력한 정보와 로고는 이 브라우저에만 저장되고 GitHub Pages 서버로 전송되지 않습니다.</p>
            <button type="button" className="intro-start" onClick={closeIntro}>인보이스 만들기 시작</button>
          </section>
        </div>
      )}
      {/* ───────── Left panel (form) ───────── */}
      <aside className="panel">
        <div className="brand">
          <div className="brand-mark">IG</div>
          <div className="brand-name">Invoice Generator</div>
        </div>
        <h1>견적서 만들기</h1>
        <p className="panel-sub">사업자 정보를 브라우저에만 저장하고 PNG로 출력하세요.</p>

        <div className="section flow-hint">
          <div className="section-title">진행 방식</div>
          <div className="flow-card">
            <strong>정보 입력 후 오른쪽에서 4가지 디자인을 한 번에 비교하세요.</strong>
            <p>처음에 템플릿을 고르지 않아도 됩니다. 마음에 드는 미리보기를 클릭하면 그 디자인이 현재 PNG 저장 대상으로 선택됩니다.</p>
          </div>
        </div>

        {/* date */}
        <div className="section">
          <div className="section-title">발행일</div>
          <div className="field">
            <input type="text" value={data.date} onChange={setField('date')} placeholder="2026. 03. 06." />
          </div>
        </div>

        {/* brand/design */}
        <div className="section">
          <div className="section-title">브랜드 / 디자인</div>
          <div className="field">
            <label>로고 업로드</label>
            <input ref={logoInputRef} type="file" accept="image/png" onChange={handleLogoUpload} />
            <p className="help-text">PNG 투명 배경은 그대로 적용됩니다. 업로드한 로고는 이 브라우저에만 저장되고 GitHub에는 올라가지 않습니다.</p>
          </div>
          <div className="logo-control-row">
            <div className="logo-preview-box">
              {data.logoDataUrl ? <img src={data.logoDataUrl} alt="업로드 로고 미리보기" /> : <span>로고 없음</span>}
            </div>
            <button type="button" className="add-btn compact" onClick={removeLogo} disabled={!data.logoDataUrl}>로고 제거</button>
          </div>
          <div className="field">
            <label>배경색 / 테마색</label>
            <div className="palette">
              {PALETTE.map(p => (
                <button
                  key={p.color}
                  type="button"
                  className={'swatch ' + (data.themeColor.toLowerCase() === p.color ? 'active' : '')}
                  style={{background:p.color}}
                  title={p.name}
                  aria-label={p.name}
                  onClick={() => setValue('themeColor', p.color)}
                />
              ))}
              <input type="color" value={data.themeColor} onChange={setField('themeColor')} aria-label="직접 색상 선택" />
            </div>
          </div>
        </div>

        {/* business */}
        <div className="section">
          <div className="section-title">사업장 정보</div>
          <div className="field">
            <label>상호 / 회사명</label>
            <input type="text" value={data.companyName} onChange={setField('companyName')} placeholder="상호를 입력하세요" />
          </div>
          <div className="field">
            <label>주소</label>
            <input type="text" value={data.address} onChange={setField('address')} placeholder="사업장 주소" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>전화</label>
              <input type="text" value={data.phone} onChange={setField('phone')} placeholder="전화번호" />
            </div>
            <div className="field">
              <label>이메일</label>
              <input type="text" value={data.email} onChange={setField('email')} placeholder="이메일" />
            </div>
          </div>
          <div className="field">
            <label>사업자등록번호</label>
            <input type="text" value={data.bizNumber} onChange={setField('bizNumber')} placeholder="사업자등록번호" />
          </div>
          <div className="field">
            <label>직인 이미지 업로드</label>
            <input ref={stampInputRef} type="file" accept="image/png" onChange={handleStampUpload} />
            <p className="help-text">PNG 직인 이미지를 브라우저에만 저장합니다. 투명 배경 PNG를 권장합니다.</p>
          </div>
          <div className="logo-control-row">
            <div className="stamp-preview-box">
              {data.stampImageDataUrl ? <img src={data.stampImageDataUrl} alt="업로드 직인 미리보기" /> : <span>직인 이미지 없음</span>}
            </div>
            <button type="button" className="add-btn compact" onClick={removeStampImage} disabled={!data.stampImageDataUrl}>직인 이미지 제거</button>
          </div>
          <div className="field">
            <label>직인 문구</label>
            <input type="text" value={data.stampText || ''} onChange={setField('stampText')} placeholder="이미지가 없을 때 표시할 직인 문구" />
            <p className="help-text">직인 표시를 누르면 출력되고, 끄면 같은 자리가 빈 공간으로 유지됩니다.</p>
          </div>
          <button type="button" className="add-btn compact" onClick={() => setValue('showStamp', !data.showStamp)}>
            {data.showStamp ? '직인 숨기기' : '직인 표시'}
          </button>
        </div>

        {/* bank */}
        <div className="section">
          <div className="section-title">입금 계좌</div>
          <div className="field-row">
            <div className="field">
              <label>은행명</label>
              <input type="text" value={data.bankName || ''} onChange={setField('bankName')} placeholder="은행명" />
            </div>
            <div className="field">
              <label>계좌번호</label>
              <input type="text" value={data.bankAccount || ''} onChange={setField('bankAccount')} placeholder="계좌번호" />
            </div>
          </div>
          <div className="field">
            <label>예금주</label>
            <input type="text" value={data.depositor || ''} onChange={setField('depositor')} placeholder="예금주" />
          </div>
        </div>

        {/* work */}
        <div className="section">
          <div className="section-title">작업 내용</div>
          <div className="field">
            <label>작업명</label>
            <input type="text" value={data.workName} onChange={setField('workName')} placeholder="작업명" />
          </div>
          <div className="field">
            <label>수신</label>
            <input type="text" value={data.recipient} onChange={setField('recipient')} placeholder="수신처" />
          </div>
          <div className="field">
            <label>담당</label>
            <input type="text" value={data.contact} onChange={setField('contact')} placeholder="담당자 / 연락처" />
          </div>
        </div>

        {/* items */}
        <div className="section">
          <div className="section-title">
            품목
            <span style={{color:'#9a9a96',fontWeight:500,textTransform:'none',letterSpacing:0}}>
              합계 ₩{fmt(totals.supply)}
            </span>
          </div>
          <div className="item-head">
            <span>품명</span><span>단가</span><span>수량</span><span>합계</span><span></span>
          </div>
          <div className="items-editor">
            {data.items.map((it, idx) => (
              <div className="item-row" key={idx}>
                <input type="text" value={it.name} onChange={e => setItem(idx, 'name', e.target.value)} placeholder="품명" />
                <input type="number" value={it.unitPrice || ''} onChange={e => setItem(idx, 'unitPrice', e.target.value)} placeholder="0" />
                <input type="number" value={it.qty || ''} onChange={e => setItem(idx, 'qty', e.target.value)} placeholder="1" />
                <input type="number" value={it.total || ''} onChange={e => setItem(idx, 'total', e.target.value)} placeholder="0" />
                <button className="icon-btn" onClick={() => removeItem(idx)} aria-label="삭제">×</button>
              </div>
            ))}
          </div>
          <button className="add-btn" onClick={addItem}>＋ 품목 추가</button>
        </div>

        {/* notes */}
        <div className="section">
          <div className="section-title">참고 사항</div>
          <div className="items-editor">
            {data.notes.map((n, idx) => (
              <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 24px',gap:6,alignItems:'flex-start'}}>
                <textarea
                  rows={2}
                  value={n}
                  onChange={e => setNote(idx, e.target.value)}
                  style={{fontFamily:'inherit',fontSize:12,minHeight:48,padding:'7px 8px',border:'1px solid var(--line)',borderRadius:4,resize:'vertical'}}
                />
                <button className="icon-btn" onClick={() => removeNote(idx)}>×</button>
              </div>
            ))}
          </div>
          <button className="add-btn" onClick={addNote}>＋ 항목 추가</button>
        </div>

        <div className="section" style={{paddingBottom:20}}>
          <button className="add-btn" onClick={reset} style={{borderStyle:'solid',borderColor:'var(--line)'}}>↺ 기본값으로 초기화</button>
        </div>
      </aside>

      {/* ───────── Sticky bottom action bar ───────── */}
      <div className="actionbar">
        <button className="btn btn-ghost" onClick={() => window.print()} title="인쇄">인쇄</button>
        <button className="btn btn-ghost" onClick={downloadAll} disabled={busy}>4개 비교 PNG</button>
        <button className="btn btn-primary" onClick={download} disabled={busy}>
          {busy ? '저장 중...' : '⬇ 현재 디자인 PNG 저장'}
        </button>
      </div>

      {/* ───────── Stage (preview) ───────── */}
      <main className="stage multi-stage">
        <div className="stage-toolbar">
          <div>
            <span><span className="dot"></span>4가지 디자인 자동 미리보기 · A4 (794 × 1123)</span>
            <p className="stage-subcopy">입력을 마치면 네 가지 결과를 한 화면에서 비교하세요. 클릭한 디자인이 현재 PNG 저장 대상입니다.</p>
          </div>
          <div className="zoom-controls">
            <button onClick={() => setZoom(z => Math.max(0.22, +(z - 0.05).toFixed(2)))} aria-label="zoom out">−</button>
            <span className="zoom-label">{Math.round(zoom*100)}%</span>
            <button onClick={() => setZoom(z => Math.min(0.9, +(z + 0.05).toFixed(2)))} aria-label="zoom in">+</button>
            <button onClick={() => setZoom(0.48)} aria-label="fit" style={{width:'auto',padding:'0 8px',fontSize:11,fontWeight:600}}>FIT</button>
          </div>
        </div>

        <div className="preview-grid">
          {TEMPLATES.map(t => {
            const PreviewComp = t.comp;
            return (
              <section key={t.id} className={'preview-card ' + (tplId === t.id ? 'active' : '')} onClick={() => setTplId(t.id)}>
                <div className="preview-card-head">
                  <div><b>{t.name}</b><span>{t.desc}</span></div>
                  <em>{tplId === t.id ? '현재 저장 대상' : t.badge}</em>
                </div>
                <div className="preview-scale-shell" style={{width: 794 * zoom, height: 1123 * zoom}}>
                  <div
                    ref={el => { previewRefs.current[t.id] = el; if (t.id === tplId) invoiceRef.current = el; }}
                    className="invoice-frame"
                    style={{ transform: `scale(${zoom})`, position:'absolute', top:0, left:0 }}
                  >
                    <PreviewComp data={data} totals={totals} />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </main>

      <div className="export-stack" aria-hidden="true">
        {TEMPLATES.map(t => {
          const ExportComp = t.comp;
          return <div key={t.id} ref={el => { exportRefs.current[t.id] = el; }} className="export-frame"><ExportComp data={data} totals={totals} /></div>;
        })}
      </div>

      {toast && (
        <div className="toast" style={toast.type === 'err' ? {background:'#dc2626'} : null}>
          {toast.type === 'ok' ? '✓' : '!'} {toast.msg}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
