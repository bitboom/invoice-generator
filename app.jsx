/* global React, ReactDOM, html2canvas, ClassicTemplate, InvoifyTemplate1, InvoifyTemplate2, InvoifyTemplate3, fmt */
const { useState, useMemo, useRef, useEffect, useCallback } = React;

const STORAGE_KEY = 'invoice-data-v2';
const MAX_LOGO_BYTES = 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: '기본 견적서', badge: '기본', thumb: 'classic', comp: ClassicTemplate },
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
  logoScale: 100,
  logoX: 0,
  logoY: 0,
  themeColor: '#0a0a0a',
  stampText: '',
  stampImageDataUrl: '',
  stampScale: 100,
  stampX: 0,
  stampY: 0,
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
  const [showIntro, setShowIntro] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const mediaStyle = (kind) => {
    const scale = Number(data[`${kind}Scale`] || 100) / 100;
    const x = Number(data[`${kind}X`] || 0);
    const y = Number(data[`${kind}Y`] || 0);
    return { transform: `translate(${x}px, ${y}px) scale(${scale})` };
  };
  const resetMediaCrop = (kind) => setData(d => ({ ...d, [`${kind}Scale`]: 100, [`${kind}X`]: 0, [`${kind}Y`]: 0 }));
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
      setData(d => ({ ...d, logoDataUrl: reader.result, logoScale: d.logoScale || 100, logoX: d.logoX || 0, logoY: d.logoY || 0 }));
      setToast({ type: 'ok', msg: '로고가 적용되었습니다.' });
      setTimeout(() => setToast(null), 2400);
    };
    reader.onerror = () => {
      rejectLogo('로고를 읽지 못했습니다.');
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setData(d => ({ ...d, logoDataUrl: '', logoScale: 100, logoX: 0, logoY: 0 }));
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
      setData(d => ({ ...d, stampImageDataUrl: reader.result, stampScale: d.stampScale || 100, stampX: d.stampX || 0, stampY: d.stampY || 0, showStamp: true }));
      setToast({ type: 'ok', msg: '직인 이미지가 적용되었습니다.' });
      setTimeout(() => setToast(null), 2400);
    };
    reader.onerror = () => rejectStamp('직인 이미지를 읽지 못했습니다.');
    reader.readAsDataURL(file);
  };

  const removeStampImage = () => {
    setData(d => ({ ...d, stampImageDataUrl: '', stampScale: 100, stampX: 0, stampY: 0 }));
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

  const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('PNG 변환에 실패했습니다.')); return; }
      resolve(blob);
    }, 'image/png');
  });

  const saveBlob = (blob, filename) => new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 400);
  });

  const makePngBlob = useCallback(async (node) => {
    const canvas = await renderCanvas(node);
    return canvasToBlob(canvas);
  }, [renderCanvas]);

  const capturePng = useCallback(async (node, filename) => {
    const blob = await makePngBlob(node);
    await saveBlob(blob, filename);
  }, [makePngBlob]);

  const currentInvoiceNode = () => previewRefs.current[tplId]?.querySelector('.invoice') || invoiceRef.current?.querySelector('.invoice');
  const currentFilename = () => {
    const datePart = data.date.replace(/[^0-9]/g,'').slice(0,8) || 'untitled';
    return `invoice_classic_${datePart}.png`;
  };

  const download = useCallback(async () => {
    const node = currentInvoiceNode();
    if (!node) return;
    setBusy(true);
    try {
      await capturePng(node, currentFilename());
      setToast({ type: 'ok', msg: 'PNG 저장 완료' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'err', msg: '저장 실패: ' + err.message });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2400);
    }
  }, [capturePng, data.date, tplId]);

  const sharePng = useCallback(async () => {
    const node = currentInvoiceNode();
    if (!node) return;
    setBusy(true);
    try {
      const filename = currentFilename();
      const blob = await makePngBlob(node);
      const file = new File([blob], filename, { type: 'image/png' });
      const shareData = { title: 'Invoice PNG', text: '인보이스 PNG', files: [file] };
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share(shareData);
        setToast({ type: 'ok', msg: '공유창을 열었습니다.' });
      } else {
        await saveBlob(blob, filename);
        setToast({ type: 'ok', msg: '공유 미지원 브라우저라 PNG로 저장했습니다.' });
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setToast({ type: 'ok', msg: '공유를 취소했습니다.' });
      } else {
        console.error(err);
        setToast({ type: 'err', msg: '공유 실패: ' + err.message });
      }
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2400);
    }
  }, [makePngBlob, data.date, tplId]);

  const TplComp = TEMPLATES.find(t => t.id === tplId).comp;
  const modalPreviewZoom = 0.6;
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
            <h2>Classic 견적서를 PNG로 저장하세요.</h2>
            <p>정보를 입력하고 로고·직인을 맞춘 뒤 PNG로 저장합니다. 입력값은 이 브라우저에만 저장됩니다.</p>
            <div className="intro-steps">
              <div><strong>1</strong><span>정보 입력</span></div>
              <div><strong>2</strong><span>미리보기 확인</span></div>
              <div><strong>3</strong><span>PNG 저장</span></div>
            </div>
            <div className="intro-result-strip">
              {TEMPLATES.map(t => <div key={t.id}><span className="mini-badge">{t.badge}</span><b>{t.name}</b><small>{t.desc}</small></div>)}
            </div>
            <p className="intro-privacy">로고와 직인은 서버로 업로드되지 않습니다.</p>
            <button type="button" className="intro-start" onClick={closeIntro}>견적서 만들기</button>
          </section>
        </div>
      )}
      {/* ───────── Left panel (form) ───────── */}
      <aside className="panel">
        <div className="brand">
          <div className="brand-mark">IG</div>
          <div className="brand-name">Invoice Generator</div>
        </div>
        <h1>Classic 견적서</h1>
        <p className="panel-sub">입력 후 PNG로 저장하세요. 데이터는 브라우저에만 남습니다.</p>

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
            <p className="help-text">PNG만 가능. 업로드 후 크기와 위치를 맞출 수 있습니다.</p>
          </div>
          <div className="logo-control-row">
            <div className="logo-preview-box">
              {data.logoDataUrl ? <img src={data.logoDataUrl} alt="업로드 로고 미리보기" style={mediaStyle('logo')} /> : <span>로고 없음</span>}
            </div>
            <button type="button" className="add-btn compact" onClick={removeLogo} disabled={!data.logoDataUrl}>로고 제거</button>
          </div>
          {data.logoDataUrl && (
            <div className="crop-controls">
              <label>로고 크기 <input type="range" min="60" max="220" value={data.logoScale || 100} onChange={e => setValue('logoScale', Number(e.target.value))} /></label>
              <label>좌우 <input type="range" min="-80" max="80" value={data.logoX || 0} onChange={e => setValue('logoX', Number(e.target.value))} /></label>
              <label>상하 <input type="range" min="-80" max="80" value={data.logoY || 0} onChange={e => setValue('logoY', Number(e.target.value))} /></label>
              <button type="button" className="add-btn compact" onClick={() => resetMediaCrop('logo')}>로고 위치 초기화</button>
            </div>
          )}
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
            <p className="help-text">PNG만 가능. 업로드 후 크기와 위치를 맞출 수 있습니다.</p>
          </div>
          <div className="logo-control-row">
            <div className="stamp-preview-box">
              {data.stampImageDataUrl ? <img src={data.stampImageDataUrl} alt="업로드 직인 미리보기" style={mediaStyle('stamp')} /> : <span>직인 이미지 없음</span>}
            </div>
            <button type="button" className="add-btn compact" onClick={removeStampImage} disabled={!data.stampImageDataUrl}>직인 이미지 제거</button>
          </div>
          {data.stampImageDataUrl && (
            <div className="crop-controls">
              <label>직인 크기 <input type="range" min="60" max="220" value={data.stampScale || 100} onChange={e => setValue('stampScale', Number(e.target.value))} /></label>
              <label>좌우 <input type="range" min="-80" max="80" value={data.stampX || 0} onChange={e => setValue('stampX', Number(e.target.value))} /></label>
              <label>상하 <input type="range" min="-80" max="80" value={data.stampY || 0} onChange={e => setValue('stampY', Number(e.target.value))} /></label>
              <button type="button" className="add-btn compact" onClick={() => resetMediaCrop('stamp')}>직인 위치 초기화</button>
            </div>
          )}
          <div className="field">
            <label>직인 문구</label>
            <input type="text" value={data.stampText || ''} onChange={setField('stampText')} placeholder="이미지가 없을 때 표시할 직인 문구" />
            <p className="help-text">이미지가 없을 때만 문구 직인을 사용합니다.</p>
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
        <div className="action-row">
          <button className="btn btn-primary" onClick={download} disabled={busy}>
            {busy ? '처리 중...' : 'PNG 저장'}
          </button>
          <button type="button" className="btn btn-ghost preview-action-btn" onClick={() => setPreviewOpen(true)} aria-label="저장 전 미리보기 열기" disabled={busy}>
            🔍 미리보기
          </button>
          <button type="button" className="btn btn-ghost share-action-btn" onClick={sharePng} disabled={busy} aria-label="PNG 공유하기">
            📤 공유
          </button>
        </div>
      </div>

      {/* ───────── Stage (preview) ───────── */}
      <main className="stage multi-stage">
        <div className="stage-toolbar">
          <div>
            <span><span className="dot"></span>Classic 미리보기 · A4 PNG</span>
            <p className="stage-subcopy">오른쪽 미리보기가 그대로 PNG로 저장됩니다.</p>
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
                  <em>{tplId === t.id ? '저장 대상' : t.badge}</em>
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

      {previewOpen && (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label="저장 전 큰 미리보기" onClick={() => setPreviewOpen(false)}>
          <section className="preview-modal-card" onClick={e => e.stopPropagation()}>
            <div className="preview-modal-head">
              <div>
                <b>저장 전 큰 미리보기</b>
                <span>현재 입력값이 실시간으로 반영됩니다.</span>
              </div>
              <button type="button" className="preview-close" onClick={() => setPreviewOpen(false)} aria-label="닫기">×</button>
            </div>
            <div className="preview-modal-scroll">
              <div className="modal-preview-shell" style={{width: 794 * modalPreviewZoom, height: 1123 * modalPreviewZoom}}>
                <div className="invoice-frame modal-preview-frame" style={{ transform: `scale(${modalPreviewZoom})`, position:'absolute', top:0, left:0 }}>
                  <TplComp data={data} totals={totals} />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" style={toast.type === 'err' ? {background:'#dc2626'} : null}>
          {toast.type === 'ok' ? '✓' : '!'} {toast.msg}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
