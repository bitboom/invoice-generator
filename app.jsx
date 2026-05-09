/* global React, ReactDOM, html2canvas, ClassicTemplate, MinimalTemplate, BoldTemplate, fmt */
const { useState, useMemo, useRef, useEffect, useCallback } = React;

const STORAGE_KEY = 'invoice-data-v2';
const MAX_LOGO_BYTES = 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: '사이드바형',  comp: ClassicTemplate },
  { id: 'minimal', name: 'Minimal', desc: '여백·라인 중심', comp: MinimalTemplate },
  { id: 'bold',    name: 'Bold',    desc: '헤더 강조 카드', comp: BoldTemplate    },
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
  showStamp: false,

  workName: '',
  recipient: '',
  contact: '',

  notes: [
    '시공 및 비용에 관한 일정은 사전에 협의 후 진행합니다.',
    '설계나 시공 내용이 변경될 경우, 견적 금액은 변동될 수 있습니다.',
    '본 견적은 견적일로부터 15일 동안 유효합니다.',
  ],

  items: [
    { name: '', unitPrice: 0, qty: 1, total: 0 },
  ],
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA, ...parsed };
  } catch { return DEFAULT_DATA; }
}

function App() {
  const [data, setData] = useState(loadData);
  const [tplId, setTplId] = useState('classic');
  const [zoom, setZoom] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const invoiceRef = useRef(null);
  const logoInputRef = useRef(null);

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
      const w = stage.clientWidth - 96;
      const z = Math.min(1, Math.max(0.4, w / 794));
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

  const reset = () => {
    if (!confirm('모든 입력값을 기본값으로 초기화할까요?')) return;
    setData(DEFAULT_DATA);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  // Download as PNG
  const download = useCallback(async () => {
    const node = invoiceRef.current?.querySelector('.invoice');
    if (!node) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: 794,
        windowHeight: 1123,
        width: 794,
        height: 1123,
        onclone: (doc) => {
          const frame = doc.querySelector('.invoice-frame');
          if (frame) {
            frame.style.transform = 'none';
            frame.style.position = 'static';
          }
        },
      });
      const link = document.createElement('a');
      const fname = `invoice_${data.date.replace(/[^0-9]/g,'').slice(0,8) || 'untitled'}.png`;
      link.download = fname;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setToast({ type: 'ok', msg: '이미지 다운로드 완료' });
    } catch (err) {
      console.error(err);
      setToast({ type: 'err', msg: '저장 실패: ' + err.message });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2400);
    }
  }, [data.date]);

  const TplComp = TEMPLATES.find(t => t.id === tplId).comp;

  return (
    <div className="app">
      {/* ───────── Left panel (form) ───────── */}
      <aside className="panel">
        <div className="brand">
          <div className="brand-mark">IG</div>
          <div className="brand-name">Invoice Generator</div>
        </div>
        <h1>견적서 만들기</h1>
        <p className="panel-sub">사업자 정보를 브라우저에만 저장하고 PNG로 출력하세요.</p>

        {/* templates */}
        <div className="section">
          <div className="section-title">템플릿 <span style={{color:'#9a9a96',fontWeight:500,textTransform:'none',letterSpacing:0}}>{TEMPLATES.find(t=>t.id===tplId).name}</span></div>
          <div className="templates">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                className={'tpl ' + (tplId === t.id ? 'active' : '')}
                onClick={() => setTplId(t.id)}
              >
                <div className="tpl-thumb">
                  <div className={'thumb-' + t.id} style={{'--thumb-theme': data.themeColor}}>
                    <div className="thumb-lines"><span></span><span></span><span></span></div>
                  </div>
                </div>
                <p className="tpl-name">{t.name}</p>
                <p className="tpl-desc">{t.desc}</p>
              </button>
            ))}
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
            <label>직인 문구</label>
            <input type="text" value={data.stampText || ''} onChange={setField('stampText')} placeholder="직인에 들어갈 문구" />
            <p className="help-text">직인 표시를 누르면 사업장 소재지 우측에 찍히고, 끄면 같은 자리가 빈 공간으로 출력됩니다.</p>
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
        <button className="btn btn-primary" onClick={download} disabled={busy}>
          {busy ? '저장 중...' : '⬇ PNG 이미지 저장'}
        </button>
      </div>

      {/* ───────── Stage (preview) ───────── */}
      <main className="stage">
        <div className="stage-toolbar">
          <span><span className="dot"></span>실시간 미리보기 · A4 (794 × 1123)</span>
          <div className="zoom-controls">
            <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(2)))} aria-label="zoom out">−</button>
            <span className="zoom-label">{Math.round(zoom*100)}%</span>
            <button onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)))} aria-label="zoom in">+</button>
            <button onClick={() => setZoom(1)} aria-label="100%" style={{width:'auto',padding:'0 8px',fontSize:11,fontWeight:600}}>100%</button>
          </div>
        </div>

        {/* Wrapper for scaling — keeps document flow correct */}
        <div style={{
          width: 794 * zoom,
          height: 1123 * zoom,
          position:'relative',
        }}>
          <div
            ref={invoiceRef}
            className="invoice-frame"
            style={{ transform: `scale(${zoom})`, position:'absolute', top:0, left:0 }}
          >
            <TplComp data={data} totals={totals} />
          </div>
        </div>
      </main>

      {toast && (
        <div className="toast" style={toast.type === 'err' ? {background:'#dc2626'} : null}>
          {toast.type === 'ok' ? '✓' : '!'} {toast.msg}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
