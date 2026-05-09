/* global React */

// Format number with commas
const fmt = (n) => {
  const num = Number(n) || 0;
  return num.toLocaleString('ko-KR');
};

const safe = (value, fallback = '') => {
  const v = value == null ? '' : String(value).trim();
  return v || fallback;
};

const hexToRgb = (hex) => {
  const clean = String(hex || '#0a0a0a').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { r: 10, g: 10, b: 10 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const readableOn = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#0a0a0a' : '#ffffff';
};

const themeVars = (data) => {
  const theme = data.themeColor || '#0a0a0a';
  return { '--theme': theme, '--on-theme': readableOn(theme) };
};

function LogoMark({ data, className = '', onDark = false }) {
  const [processedLogo, setProcessedLogo] = React.useState(data.logoDataUrl || '');

  React.useEffect(() => {
    if (!data.logoDataUrl || !onDark) {
      setProcessedLogo(data.logoDataUrl || '');
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 0) {
          pixels[i] = 255;
          pixels[i + 1] = 255;
          pixels[i + 2] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      if (!cancelled) setProcessedLogo(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      if (!cancelled) setProcessedLogo(data.logoDataUrl || '');
    };
    image.src = data.logoDataUrl;

    return () => { cancelled = true; };
  }, [data.logoDataUrl, onDark]);

  if (data.logoDataUrl) {
    return <img className={'uploaded-logo ' + className} src={processedLogo || data.logoDataUrl} alt="logo" />;
  }
  return <div className={'logo-fallback ' + className}>{safe(data.companyName, 'LOGO')}</div>;
}

function BankBlock({ data, compact = false }) {
  return (
    <div className={compact ? 'bank compact-bank' : 'bank'}>
      <div className="col-head">입금계좌</div>
      <div><strong>{safe(data.bankName, '은행명')}</strong></div>
      <div>{safe(data.bankAccount, '계좌번호')}</div>
      <div style={{marginTop: compact ? 6 : 10}}><strong>예금주</strong> {safe(data.depositor, '예금주')}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Template 1 — CLASSIC
// ───────────────────────────────────────────────────────
function ClassicTemplate({ data, totals }) {
  const { items, supply, tax, total } = totals;
  const emptyCount = Math.max(0, 11 - items.length);

  return (
    <div className="invoice tpl-classic" style={themeVars(data)}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <LogoMark data={data} onDark />
        </div>
        <div className="sidebar-bank">
          <div className="bk-label">입금계좌</div>
          <div className="bk-block">
            <strong>{safe(data.bankName, '은행명')}</strong>
            <div>{safe(data.bankAccount, '계좌번호')}</div>
          </div>
          <div className="bk-block">
            <strong>예금주</strong>
            <div>{safe(data.depositor, '예금주')}</div>
          </div>
        </div>
      </aside>

      <main className="body">
        <div className="title-row">
          <h1>INVOICE</h1>
          <div className="date">
            <strong>Date.</strong>
            {data.date}
          </div>
        </div>

        <div className="info-block">
          <h3 className="info-head">사업장 소재지</h3>
          <div className="info-grid classic-business-grid">
            <div className="classic-business-copy">
              <div>{safe(data.address, '사업장 주소')}</div>
              <div className="classic-business-line">
                <span>{safe(data.phone, '전화번호')}</span>
              </div>
              <div className="classic-business-line compact">
                <span><b style={{fontWeight:800}}>사업자등록번호</b> {safe(data.bizNumber, '사업자등록번호')}</span>
                <span><b style={{fontWeight:800}}>이메일</b> {safe(data.email, '이메일')}</span>
              </div>
            </div>
            <div className="classic-stamp-slot" aria-label="직인 영역">
              <div className="classic-stamp-label">직인</div>
              {data.showStamp ? <div className="classic-stamp-mark">{safe(data.stampText, '직인')}</div> : null}
            </div>
          </div>
        </div>

        <div className="info-block classic-work-block">
          <h3 className="info-head">작업내용 및 담당자</h3>
          <div className="info-grid">
            <div className="row"><span className="lab">작업명</span><span>{safe(data.workName, '작업명')}</span></div>
            <div className="row"><span className="lab">수신</span><span>{safe(data.recipient, '수신처')}</span></div>
            <div className="row"><span className="lab">담당</span><span>{safe(data.contact, '담당자 / 연락처')}</span></div>
          </div>
        </div>

        <table className="items">
          <thead>
            <tr>
              <th>품명</th>
              <th className="num" style={{width:90}}>단가</th>
              <th className="num" style={{width:60}}>수량</th>
              <th className="num" style={{width:110}}>합계</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className={i % 2 === 1 ? 'alt' : ''}>
                <td>{safe(it.name, '품목')}</td>
                <td className="num">{it.unitPrice ? fmt(it.unitPrice) : ''}</td>
                <td className="num">{it.qty || ''}</td>
                <td className="num">{it.total ? fmt(it.total) : ''}</td>
              </tr>
            ))}
            {Array.from({length: emptyCount}).map((_, i) => (
              <tr key={'e'+i} className={(items.length + i) % 2 === 1 ? 'alt' : ''}>
                <td colSpan={4} className="empty"></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="total-rule"></div>

        <div className="totals">
          <div className="tr"><span className="lab">합계</span><span className="val">{fmt(supply)}</span></div>
          <div className="tr"><span className="lab">부가세</span><span className="val">{fmt(tax)}</span></div>
          <div className="tr grand">
            <span className="lab">공급가액<br/><span style={{fontSize:11}}>(부가세포함)</span></span>
            <span className="val" style={{fontSize:14,fontWeight:800,alignSelf:'flex-start'}}>{fmt(total)}</span>
          </div>
        </div>

        <div className="footnote">
          {(data.notes || []).filter(n => String(n).trim()).map((n, i) => <p key={i}>※ {n}</p>)}
        </div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Template 2 — MINIMAL
// ───────────────────────────────────────────────────────
function MinimalTemplate({ data, totals }) {
  const { items, supply, tax, total } = totals;
  return (
    <div className="invoice tpl-minimal" style={themeVars(data)}>
      <div className="head">
        <LogoMark data={data} />
        <h1>Invoice</h1>
      </div>

      <div className="meta">
        <div>
          <div className="col-head">사업장 정보</div>
          <div className="row" style={{fontWeight:700}}>{safe(data.companyName, '상호 / 회사명')}</div>
          <div className="row">{safe(data.address, '사업장 주소')}</div>
          <div className="row">{safe(data.phone, '전화번호')}<br/>{safe(data.email, '이메일')}</div>
          <div className="row"><strong>사업자등록번호</strong>{safe(data.bizNumber, '사업자등록번호')}</div>
        </div>
        <div>
          <div className="col-head">수신</div>
          <div className="row" style={{fontSize:13,fontWeight:600,marginBottom:4}}>{safe(data.recipient, '수신처')}</div>
          <div className="row" style={{color:'#6b6b6b'}}>{safe(data.contact, '담당자 / 연락처')}</div>
        </div>
        <div>
          <div className="col-head">발행일</div>
          <div className="row" style={{fontSize:18,fontFamily:'Archivo, sans-serif',letterSpacing:'0.04em',fontWeight:500,marginBottom:14}}>{data.date}</div>
          <div className="col-head" style={{marginTop:8}}>유효기간</div>
          <div className="row">발행일로부터 15일</div>
        </div>
      </div>

      <div className="work">
        <div className="col-head">작업 내용</div>
        <div className="work-grid">
          <span className="lab">작업명</span><span>{safe(data.workName, '작업명')}</span>
          <span className="lab">담당</span><span>{safe(data.contact, '담당자 / 연락처')}</span>
        </div>
      </div>

      <table className="items">
        <thead>
          <tr>
            <th>품명 / Description</th>
            <th className="num" style={{width:110}}>단가</th>
            <th className="num" style={{width:70}}>수량</th>
            <th className="num" style={{width:130}}>합계 (KRW)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{safe(it.name, '품목')}</td>
              <td className="num">{it.unitPrice ? fmt(it.unitPrice) : '—'}</td>
              <td className="num">{it.qty || '—'}</td>
              <td className="num">{it.total ? fmt(it.total) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bottom" style={{gridTemplateColumns:'1fr 320px'}}>
        <BankBlock data={data} compact />
        <div className="totals">
          <div className="tr"><span>합계 Subtotal</span><span className="val">₩ {fmt(supply)}</span></div>
          <div className="tr"><span>부가세 VAT (10%)</span><span className="val">₩ {fmt(tax)}</span></div>
          <div className="tr grand"><span>공급가액 (부가세포함)</span><span className="val">₩ {fmt(total)}</span></div>
        </div>
      </div>

      <div className="footnote">
        {(data.notes || []).filter(n => String(n).trim()).map((n, i) => <p key={i}>※ {n}</p>)}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Template 3 — BOLD HEADER
// ───────────────────────────────────────────────────────
function BoldTemplate({ data, totals }) {
  const { items, supply, tax, total } = totals;
  return (
    <div className="invoice tpl-bold" style={themeVars(data)}>
      <div className="topbar">
        <LogoMark data={data} />
        <div className="title">
          <h1>INVOICE</h1>
          <div className="date">{data.date}</div>
        </div>
      </div>

      <div className="body">
        <div className="row-2">
          <div className="card">
            <div className="col-head">사업장 정보</div>
            <div className="body-text">
              <strong>상호</strong>{safe(data.companyName, '상호 / 회사명')}<br/>
              <strong>주소</strong>{safe(data.address, '사업장 주소')}<br/>
              <strong>전화</strong>{safe(data.phone, '전화번호')}<br/>
              <strong>사업자번호</strong>{safe(data.bizNumber, '사업자등록번호')}<br/>
              <strong>이메일</strong>{safe(data.email, '이메일')}
            </div>
          </div>
          <div className="card">
            <div className="col-head">수신 / 담당</div>
            <div className="body-text">
              <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{safe(data.recipient, '수신처')}</div>
              <div style={{color:'#3a3a3a'}}>{safe(data.contact, '담당자 / 연락처')}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{marginBottom:18}}>
          <div className="col-head">작업 내용</div>
          <div className="work-grid" style={{marginTop:4}}>
            <span className="lab">작업명</span><span>{safe(data.workName, '작업명')}</span>
          </div>
        </div>

        <table className="items">
          <thead>
            <tr>
              <th>품명</th>
              <th className="num" style={{width:120}}>단가</th>
              <th className="num" style={{width:70}}>수량</th>
              <th className="num" style={{width:130}}>합계</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{safe(it.name, '품목')}</td>
                <td className="num">{it.unitPrice ? fmt(it.unitPrice) : '—'}</td>
                <td className="num">{it.qty || '—'}</td>
                <td className="num">{it.total ? fmt(it.total) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bottom" style={{gridTemplateColumns:'1fr 360px'}}>
          <BankBlock data={data} />
          <div className="totals-card">
            <div className="tr"><span>합계</span><span className="val">{fmt(supply)}</span></div>
            <div className="tr"><span>부가세</span><span className="val">{fmt(tax)}</span></div>
            <div className="tr grand"><span>공급가액 (부가세포함)</span><span className="val">₩ {fmt(total)}</span></div>
          </div>
        </div>

        <div className="footnote">
          {(data.notes || []).filter(n => String(n).trim()).map((n, i) => <p key={i}>※ {n}</p>)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ClassicTemplate, MinimalTemplate, BoldTemplate, fmt });
