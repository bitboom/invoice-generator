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

const mediaCropStyle = (data, kind) => {
  const scale = Number(data?.[`${kind}Scale`] || 100) / 100;
  const x = Number(data?.[`${kind}X`] || 0);
  const y = Number(data?.[`${kind}Y`] || 0);
  return { transform: `translate(${x}px, ${y}px) scale(${scale})` };
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
    return (
      <span className={'logo-crop-wrap ' + className}>
        <img className="uploaded-logo" src={processedLogo || data.logoDataUrl} alt="logo" style={mediaCropStyle(data, 'logo')} />
      </span>
    );
  }
  return <div className={'logo-fallback ' + className}>{safe(data.companyName, 'LOGO')}</div>;
}


function StampMark({ data, className = '' }) {
  if (!data.showStamp) return null;
  if (data.stampImageDataUrl) {
    return (
      <span className={'stamp-crop-wrap ' + className}>
        <img className="stamp-image" src={data.stampImageDataUrl} alt="stamp" style={mediaCropStyle(data, 'stamp')} />
      </span>
    );
  }
  return <div className={'stamp-text-mark ' + className}>{safe(data.stampText, '직인')}</div>;
}

function FooterNotesSignature({ data, className = '' }) {
  return (
    <footer className={'shared-doc-footer ' + className}>
      <div className="shared-footer-notes">
        <h3>참고 사항</h3>
        {(data.notes || []).filter(n => String(n).trim()).map((n, i) => <p key={i}>※ {n}</p>)}
      </div>
      <div className="shared-footer-signature">
        <span>직인</span>
        <StampMark data={data} className="footer-stamp" />
        {!data.showStamp ? <strong>{safe(data.stampText || data.companyName, '직인')}</strong> : null}
      </div>
    </footer>
  );
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
function ClassicTemplate({
  data,
  totals,
  items: pageItems,
  pageNumber = 1,
  totalPages = 1,
  showTotals = true,
  showFooter = true,
  longShare = false,
}) {
  const { supply, tax, total } = totals;
  const items = pageItems || totals.items;
  const isContinuation = totalPages > 1 && pageNumber > 1;
  const emptyCount = longShare && items.length > 11 ? 0 : (showTotals && items.length === 0 ? 0 : Math.max(0, 11 - items.length));
  const rowHeight = longShare
    ? 38
    : (isContinuation && items.length > 14
      ? Math.max(20, Math.floor(600 / items.length))
      : 38);

  return (
    <div className={'invoice tpl-classic ' + (longShare ? 'tpl-classic-long-share ' : '') + (isContinuation ? 'tpl-classic-continuation ' : '') + (!showTotals ? 'tpl-classic-no-totals' : '')} style={{ ...themeVars(data), '--classic-row-height': `${rowHeight}px` }}>
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

        {!isContinuation && (
          <>
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
                  <StampMark data={data} className="classic-stamp-mark" />
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
          </>
        )}

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

        {showTotals && <div className="total-rule"></div>}

        {showTotals && (
          <div className="totals">
            <div className="tr"><span className="lab">합계</span><span className="val">{fmt(supply)}</span></div>
            <div className="tr"><span className="lab">부가세</span><span className="val">{fmt(tax)}</span></div>
            <div className="tr grand">
              <span className="lab">공급가액<br/><span style={{fontSize:11}}>(부가세포함)</span></span>
              <span className="val" style={{fontSize:14,fontWeight:800,alignSelf:'flex-start'}}>{fmt(total)}</span>
            </div>
          </div>
        )}

        {showFooter && (
          <div className="footnote">
            <div className="classic-footer-notes">
              {(data.notes || []).filter(n => String(n).trim()).map((n, i) => <p key={i}>※ {n}</p>)}
            </div>
            {totalPages > 1 && <span className="classic-footer-page-number">{pageNumber} / {totalPages}</span>}
          </div>
        )}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Invoify Template 1 — clean business layout
// ───────────────────────────────────────────────────────
function InvoifyTemplate1({ data, totals }) {
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

      <FooterNotesSignature data={data} className="minimal-footer" />
    </div>
  );
}

// ───────────────────────────────────────────────────────
// Invoify Template 2 — bold header layout
// ───────────────────────────────────────────────────────
function InvoifyTemplate2({ data, totals }) {
  const { items, supply, tax, total } = totals;
  return (
    <div className="invoice tpl-bold" style={themeVars(data)}>
      <div className="topbar">
        <LogoMark data={data} onDark />
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

        <FooterNotesSignature data={data} className="bold-footer" />
      </div>
    </div>
  );
}


// ───────────────────────────────────────────────────────
// Invoify Template 3 — accent document layout
// ───────────────────────────────────────────────────────
function InvoifyTemplate3({ data, totals }) {
  const { items, supply, tax, total } = totals;
  return (
    <div className="invoice tpl-invoify3" style={themeVars(data)}>
      <header className="inv3-hero">
        <div>
          <div className="inv3-kicker">INVOICE</div>
          <h1>{safe(data.companyName, '상호 / 회사명')}</h1>
          <p>{safe(data.address, '사업장 주소')}</p>
        </div>
        <div className="inv3-logo"><LogoMark data={data} /></div>
      </header>

      <section className="inv3-meta">
        <div><span>발행일</span><strong>{data.date}</strong></div>
        <div><span>수신</span><strong>{safe(data.recipient, '수신처')}</strong></div>
        <div><span>담당</span><strong>{safe(data.contact, '담당자 / 연락처')}</strong></div>
      </section>

      <section className="inv3-info">
        <div>
          <h3>사업장 정보</h3>
          <p><b>전화</b>{safe(data.phone, '전화번호')}</p>
          <p><b>이메일</b>{safe(data.email, '이메일')}</p>
          <p><b>사업자등록번호</b>{safe(data.bizNumber, '사업자등록번호')}</p>
        </div>
        <div>
          <h3>작업 내용</h3>
          <p>{safe(data.workName, '작업명')}</p>
        </div>
      </section>

      <table className="items">
        <thead>
          <tr><th>품목</th><th className="num">단가</th><th className="num">수량</th><th className="num">합계</th></tr>
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

      <section className="inv3-lower">
        <BankBlock data={data} compact />
        <div className="inv3-totals">
          <div><span>합계</span><strong>{fmt(supply)}</strong></div>
          <div><span>부가세</span><strong>{fmt(tax)}</strong></div>
          <div className="grand"><span>공급가액</span><strong>₩ {fmt(total)}</strong></div>
        </div>
      </section>

      <FooterNotesSignature data={data} className="inv3-footer" />
    </div>
  );
}

Object.assign(window, { ClassicTemplate, InvoifyTemplate1, InvoifyTemplate2, InvoifyTemplate3, fmt });
