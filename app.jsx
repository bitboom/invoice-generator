/* global React, ReactDOM, html2canvas, ClassicTemplate, InvoifyTemplate1, InvoifyTemplate2, InvoifyTemplate3, fmt */
const { useState, useMemo, useRef, useEffect, useCallback } = React;

const STORAGE_KEY = 'invoice-data-v2';
const DOCUMENTS_STORAGE_KEY = 'invoice-documents-v1';
const ACTIVE_DOCUMENT_KEY = 'invoice-active-id-v1';
const BACKUP_TYPE = 'invoice-generator-backup';
const BACKUP_CODE_BLOCK = 'invoice-generator-backup-v1';
const MAX_LOGO_BYTES = 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const EXPORT_SCALE = 4;
const CLASSIC_SINGLE_PAGE_ITEM_LIMIT = 11;
const CLASSIC_SPLIT_PAGE_ONE_ITEM_LIMIT = 14;

const TEMPLATES = [
  { id: 'classic', name: '견적서', desc: '기본 견적서', badge: '기본', thumb: 'classic', comp: ClassicTemplate },
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

const normalizeData = (input = {}) => ({
  ...DEFAULT_DATA,
  ...input,
  notes: normalizeNotes(input.notes),
  items: Array.isArray(input.items) && input.items.length ? input.items : DEFAULT_DATA.items,
});

const makeDocumentTitle = (data) => {
  const parts = [data.recipient, data.workName].map(v => String(v || '').trim()).filter(Boolean);
  return parts.join(' · ') || '새 견적서';
};

const sanitizeDocumentTitle = (title) => String(title || '').trim().slice(0, 80);

const createDocument = (data = DEFAULT_DATA, overrides = {}) => {
  const normalized = normalizeData(data);
  const now = new Date().toISOString();
  const providedTitle = sanitizeDocumentTitle(overrides.title);
  return {
    id: overrides.id || `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: providedTitle || makeDocumentTitle(normalized),
    manualTitle: Boolean(providedTitle || overrides.manualTitle),
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    data: normalized,
  };
};

const formatDocumentLabel = (doc) => {
  const date = new Date(doc.updatedAt || doc.createdAt || Date.now());
  const stamp = date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${doc.title || '새 견적서'} · ${stamp}`;
};

const formatDocumentSubtitle = (doc) => {
  const normalized = normalizeData(doc.data);
  const parts = [normalized.recipient, normalized.workName].map(v => String(v || '').trim()).filter(Boolean);
  return parts.join(' · ') || '내용 미입력';
};

function loadWorkspace() {
  try {
    const rawDocs = localStorage.getItem(DOCUMENTS_STORAGE_KEY);
    if (rawDocs) {
      const parsedDocs = JSON.parse(rawDocs);
      if (Array.isArray(parsedDocs) && parsedDocs.length) {
        const documents = parsedDocs.map(doc => {
          const normalized = normalizeData(doc.data);
          return {
            ...doc,
            title: sanitizeDocumentTitle(doc.title) || makeDocumentTitle(normalized),
            manualTitle: Boolean(doc.manualTitle),
            data: normalized,
          };
        });
        const storedActiveId = localStorage.getItem(ACTIVE_DOCUMENT_KEY);
        const active = documents.find(doc => doc.id === storedActiveId) || documents[0];
        return { documents, activeDocId: active.id, data: active.data };
      }
    }

    const rawLegacy = localStorage.getItem(STORAGE_KEY);
    const legacyData = rawLegacy ? normalizeData(JSON.parse(rawLegacy)) : normalizeData(DEFAULT_DATA);
    const legacyDocument = createDocument(legacyData);
    return { documents: [legacyDocument], activeDocId: legacyDocument.id, data: legacyDocument.data };
  } catch {
    const fallbackDocument = createDocument(DEFAULT_DATA);
    return { documents: [fallbackDocument], activeDocId: fallbackDocument.id, data: fallbackDocument.data };
  }
}

const parseBackupText = (text) => {
  const source = String(text || '').trim();
  if (!source) throw new Error('백업 데이터가 비어 있습니다.');

  const fenceStartMarker = '```' + BACKUP_CODE_BLOCK;
  const codeBlockMatch = source.match(new RegExp(fenceStartMarker + '\\s*([\\s\\S]*?)```', 'm'));
  const fenceStart = source.indexOf(fenceStartMarker);
  const jsonText = codeBlockMatch
    ? codeBlockMatch[1].trim()
    : (fenceStart >= 0 ? source.slice(fenceStart + fenceStartMarker.length).trim() : source);

  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    if (fenceStart >= 0 && !codeBlockMatch) {
      throw new Error('백업 데이터가 끝까지 복사되지 않았습니다. 코드블록 마지막 ```까지 전체 내용을 다시 붙여넣어 주세요.');
    }
    throw new Error('백업 데이터의 JSON을 읽을 수 없습니다. 전체 내용을 다시 확인해 주세요.');
  }

  if (payload?.type !== BACKUP_TYPE || payload?.version !== 1 || !Array.isArray(payload.documents)) {
    throw new Error('지원하지 않는 백업 형식입니다.');
  }
  if (!payload.documents.length) throw new Error('불러올 견적서가 없습니다.');

  return payload.documents.map(doc => {
    const normalized = normalizeData(doc.data);
    const title = sanitizeDocumentTitle(doc.title) || makeDocumentTitle(normalized);
    return createDocument(normalized, {
      title,
      manualTitle: true,
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
    });
  });
};

const makeClassicPages = (totals) => {
  const items = totals.items || [];
  if (items.length <= CLASSIC_SINGLE_PAGE_ITEM_LIMIT) {
    return [{
      id: 'classic-page-1',
      pageNumber: 1,
      totalPages: 1,
      items,
      showTotals: true,
      showFooter: true,
    }];
  }

  const firstPageCount = Math.min(CLASSIC_SPLIT_PAGE_ONE_ITEM_LIMIT, items.length);

  return [
    {
      id: 'classic-page-1',
      pageNumber: 1,
      totalPages: 2,
      items: items.slice(0, firstPageCount),
      showTotals: false,
      showFooter: true,
    },
    {
      id: 'classic-page-2',
      pageNumber: 2,
      totalPages: 2,
      items: items.slice(firstPageCount),
      showTotals: true,
      showFooter: true,
    },
  ];
};

function App() {
  const initialWorkspace = useMemo(loadWorkspace, []);
  const [documents, setDocuments] = useState(initialWorkspace.documents);
  const [activeDocId, setActiveDocId] = useState(initialWorkspace.activeDocId);
  const [data, setData] = useState(initialWorkspace.data);
  const [tplId] = useState('classic');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [showIntro, setShowIntro] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [backupCopyText, setBackupCopyText] = useState('');
  const exportRefs = useRef({});
  const longShareRef = useRef(null);
  const logoInputRef = useRef(null);
  const stampInputRef = useRef(null);

  // persist current document in this browser
  useEffect(() => {
    setDocuments(prevDocuments => {
      const now = new Date().toISOString();
      const nextDocuments = prevDocuments.map(doc => doc.id === activeDocId
        ? {
            ...doc,
            title: doc.manualTitle ? doc.title : makeDocumentTitle(data),
            updatedAt: now,
            data,
          }
        : doc
      );
      try {
        localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(nextDocuments));
        localStorage.setItem(ACTIVE_DOCUMENT_KEY, activeDocId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        setToast({ type: 'err', msg: '브라우저 저장 공간이 부족합니다. 로고 용량을 줄이거나 입력값을 정리해 주세요.' });
        setTimeout(() => setToast(null), 3200);
      }
      return nextDocuments;
    });
  }, [data, activeDocId]);

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
  const invoicePages = useMemo(() => makeClassicPages(totals), [totals]);

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
  const calculateLineTotal = (unitPrice, qty) => {
    const price = Number(unitPrice || 0);
    const count = Number(qty || 0);
    return price && count ? price * count : 0;
  };
  const setItem = (idx, key, value) => setData(d => ({
    ...d,
    items: d.items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [key]: value };
      if (key === 'unitPrice' || key === 'qty') {
        next.total = calculateLineTotal(next.unitPrice, next.qty);
      }
      return next;
    }),
  }));
  const addItem = () => setData(d => ({ ...d, items: [...d.items, { name: '', unitPrice: 0, qty: 1, total: 0 }]}));
  const removeItem = (idx) => setData(d => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, i) => i !== idx) : [{ name: '', unitPrice: 0, qty: 1, total: 0 }] }));
  const moveItem = (idx, direction) => setData(d => {
    const target = idx + direction;
    if (target < 0 || target >= d.items.length) return d;
    const items = [...d.items];
    [items[idx], items[target]] = [items[target], items[idx]];
    return { ...d, items };
  });
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
    if (!confirm('현재 견적서의 입력값을 기본값으로 초기화할까요?')) return;
    setData(normalizeData(DEFAULT_DATA));
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (stampInputRef.current) stampInputRef.current.value = '';
  };

  const persistDocuments = (nextDocuments, nextActiveDocId = activeDocId) => {
    try {
      localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(nextDocuments));
      localStorage.setItem(ACTIVE_DOCUMENT_KEY, nextActiveDocId);
    } catch {
      setToast({ type: 'err', msg: '브라우저 저장 공간이 부족합니다. 로고 용량을 줄이거나 입력값을 정리해 주세요.' });
      setTimeout(() => setToast(null), 3200);
    }
  };

  const switchDocument = (docId) => {
    const doc = documents.find(item => item.id === docId);
    if (!doc || doc.id === activeDocId) return;
    setActiveDocId(doc.id);
    setData(normalizeData(doc.data));
    persistDocuments(documents, doc.id);
  };

  const askDocumentTitle = (message, initialValue = '') => {
    const value = prompt(message, initialValue);
    if (value === null) return null;
    const title = sanitizeDocumentTitle(value);
    if (!title) {
      setToast({ type: 'err', msg: '견적서 이름을 입력해 주세요.' });
      setTimeout(() => setToast(null), 2200);
      return null;
    }
    return title;
  };

  const createNewDocument = () => {
    const title = askDocumentTitle('새 견적서 이름을 입력하세요.', '');
    if (!title) return;
    const doc = createDocument({ ...DEFAULT_DATA, date: todayKR() }, { title, manualTitle: true });
    const nextDocuments = [doc, ...documents];
    setDocuments(nextDocuments);
    setActiveDocId(doc.id);
    setData(doc.data);
    persistDocuments(nextDocuments, doc.id);
    setToast({ type: 'ok', msg: `‘${title}’ 견적서를 만들었습니다.` });
    setTimeout(() => setToast(null), 2200);
  };

  const renameDocument = (docId) => {
    const doc = documents.find(item => item.id === docId);
    if (!doc) return;
    const title = askDocumentTitle('견적서 이름을 변경하세요.', doc.title || '새 견적서');
    if (!title) return;
    const now = new Date().toISOString();
    const nextDocuments = documents.map(item => item.id === docId
      ? { ...item, title, manualTitle: true, updatedAt: now }
      : item
    );
    setDocuments(nextDocuments);
    persistDocuments(nextDocuments, activeDocId);
    setToast({ type: 'ok', msg: '견적서 이름을 변경했습니다.' });
    setTimeout(() => setToast(null), 2200);
  };

  const duplicateDocument = () => {
    const source = normalizeData(data);
    const currentDoc = documents.find(doc => doc.id === activeDocId);
    const title = `${currentDoc?.title || makeDocumentTitle(source)} 복사본`;
    const doc = createDocument({ ...source, date: todayKR() }, { title, manualTitle: true });
    const nextDocuments = [doc, ...documents];
    setDocuments(nextDocuments);
    setActiveDocId(doc.id);
    setData(doc.data);
    persistDocuments(nextDocuments, doc.id);
    setToast({ type: 'ok', msg: '현재 견적서를 복제했습니다.' });
    setTimeout(() => setToast(null), 2200);
  };

  const deleteDocument = (docId) => {
    if (documents.length <= 1) {
      reset();
      return;
    }
    if (!confirm('이 견적서를 삭제할까요? 이 브라우저 저장 목록에서만 삭제됩니다.')) return;
    const nextDocuments = documents.filter(doc => doc.id !== docId);
    const nextActive = activeDocId === docId ? nextDocuments[0] : documents.find(doc => doc.id === activeDocId);
    setDocuments(nextDocuments);
    setActiveDocId(nextActive.id);
    setData(normalizeData(nextActive.data));
    persistDocuments(nextDocuments, nextActive.id);
  };

  const deleteCurrentDocument = () => deleteDocument(activeDocId);

  const buildBackupMarkdown = () => {
    const exportedAt = new Date();
    const activeDocument = documents.find(doc => doc.id === activeDocId) || documents[0];
    const payload = {
      type: BACKUP_TYPE,
      version: 1,
      exportedAt: exportedAt.toISOString(),
      activeDocId,
      documents,
    };

    return [
      '# 견적서 백업',
      '',
      '- 앱: Invoice Generator',
      `- 백업일시: ${exportedAt.toLocaleString('ko-KR')}`,
      `- 견적서 수: ${documents.length}개`,
      `- 현재 선택된 견적서: ${activeDocument?.title || '새 견적서'}`,
      '',
      '이 백업 데이터에는 견적서의 개인정보와 계좌 정보, 로고/직인 이미지가 포함될 수 있습니다.',
      '신뢰할 수 있는 곳에만 보관하고, 아래 코드블록은 지우거나 수정하지 마세요.',
      '',
      `\`\`\`${BACKUP_CODE_BLOCK}`,
      JSON.stringify(payload, null, 2),
      '```',
      '',
    ].join('\n');
  };

  const makeBackupFilename = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    return `invoice-generator-backup-${stamp}.txt`;
  };

  const saveBackupFile = async () => {
    const backupText = buildBackupMarkdown();
    const blob = new Blob([backupText], { type: 'text/plain;charset=utf-8' });
    await saveBlob(blob, makeBackupFilename());
    setToast({ type: 'ok', msg: '백업 파일을 저장했습니다. 이 파일을 보관하거나 전송하세요.' });
    setTimeout(() => setToast(null), 3200);
  };

  const exportBackupText = async () => {
    const backupText = buildBackupMarkdown();
    try {
      await navigator.clipboard.writeText(backupText);
      setToast({ type: 'ok', msg: '백업 데이터가 복사되었습니다. 메모장이나 카톡에 붙여넣어 보관하세요.' });
      setTimeout(() => setToast(null), 3200);
    } catch {
      setBackupCopyText(backupText);
      setToast({ type: 'err', msg: '자동 복사에 실패했습니다. 아래 백업 데이터를 직접 복사해 주세요.' });
      setTimeout(() => setToast(null), 3200);
    }
  };

  const openImportBackup = () => {
    setImportText('');
    setImportOpen(true);
  };

  const importBackupText = () => {
    try {
      const importedDocuments = parseBackupText(importText);
      const firstImported = importedDocuments[0];
      setDocuments([...importedDocuments, ...documents]);
      setActiveDocId(firstImported.id);
      setData(normalizeData(firstImported.data));
      persistDocuments([...importedDocuments, ...documents], firstImported.id);
      setImportOpen(false);
      setImportText('');
      setToast({ type: 'ok', msg: `견적서 ${importedDocuments.length}개를 불러왔습니다.` });
      setTimeout(() => setToast(null), 2600);
    } catch (error) {
      setToast({ type: 'err', msg: error?.message || '백업 데이터를 읽을 수 없습니다. 전체 내용을 다시 붙여넣어 주세요.' });
      setTimeout(() => setToast(null), 4200);
    }
  };

  // Download as PNG
  const renderCanvas = useCallback((node) => {
    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width || node.scrollWidth || 794);
    const height = Math.ceil(Math.max(rect.height || 0, node.scrollHeight || 0, 1123));

    return html2canvas(node, {
      scale: EXPORT_SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: width,
      windowHeight: height,
      width,
      height,
      onclone: (doc) => {
        doc.querySelectorAll('.invoice-frame').forEach(frame => {
          frame.style.transform = 'none';
          frame.style.position = 'static';
        });
      },
    });
  }, []);

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

  const currentInvoiceNodes = () => invoicePages
    .map(page => exportRefs.current[page.id]?.querySelector('.invoice'))
    .filter(Boolean);
  const currentFilename = (pageNumber = 1, totalPages = 1) => {
    const datePart = data.date.replace(/[^0-9]/g,'').slice(0,8) || 'untitled';
    return totalPages > 1 ? `invoice_${datePart}_p${pageNumber}.png` : `invoice_${datePart}.png`;
  };
  const currentCombinedFilename = () => {
    const datePart = data.date.replace(/[^0-9]/g,'').slice(0,8) || 'untitled';
    return `invoice_${datePart}_all.png`;
  };

  const sharePng = useCallback(async () => {
    const nodes = currentInvoiceNodes();
    if (!nodes.length) return;
    setBusy(true);
    try {
      const exports = nodes.map((node, idx) => {
        const page = invoicePages[idx] || { pageNumber: idx + 1, totalPages: nodes.length };
        return {
          node,
          filename: currentFilename(page.pageNumber, page.totalPages),
        };
      });
      const shareNode = exports.length > 1 ? longShareRef.current?.querySelector('.invoice') : nodes[0];
      if (!shareNode) throw new Error('공유할 견적서를 준비하지 못했습니다. 다시 시도해 주세요.');

      const canvas = await renderCanvas(shareNode);
      const blob = await canvasToBlob(canvas);
      const sharedExport = {
        blob,
        filename: exports.length > 1 ? currentCombinedFilename() : exports[0].filename,
      };
      const files = [new File([sharedExport.blob], sharedExport.filename, { type: 'image/png' })];
      const shareData = { title: 'Invoice PNG', text: exports.length > 1 ? `인보이스 PNG ${exports.length}페이지 긴 견적서` : '인보이스 PNG', files };
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
        await navigator.share(shareData);
        setToast({ type: 'ok', msg: exports.length > 1 ? `${exports.length}페이지를 한 장의 긴 견적서로 공유창을 열었습니다.` : '공유창을 열었습니다.' });
      } else {
        await saveBlob(sharedExport.blob, sharedExport.filename);
        setToast({ type: 'ok', msg: exports.length > 1 ? `공유 미지원 브라우저라 ${exports.length}페이지를 한 장의 긴 견적서로 저장했습니다.` : '공유 미지원 브라우저라 PNG로 저장했습니다.' });
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
  }, [renderCanvas, data.date, tplId, invoicePages]);

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
            <h2>견적서를 공유하세요.</h2>
            <p>정보를 입력하고 로고·직인을 맞춘 뒤 공유합니다. 입력값은 이 브라우저에만 저장됩니다.</p>
            <div className="intro-steps">
              <div><strong>1</strong><span>정보 입력</span></div>
              <div><strong>2</strong><span>미리보기 확인</span></div>
              <div><strong>3</strong><span>공유</span></div>
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
        <h1>견적서</h1>
        <p className="panel-sub">입력 후 공유하거나 미리보기로 확인하세요. 데이터는 브라우저에만 남습니다.</p>

        <div className="section document-library">
          <div className="section-title">
            저장된 견적서
            <span style={{color:'#9a9a96',fontWeight:500,textTransform:'none',letterSpacing:0}}>
              {documents.length}개
            </span>
          </div>
          <button type="button" className="add-btn new-document-btn" onClick={createNewDocument}>＋ 새 견적서</button>
          <div className="document-list" aria-label="저장된 견적서 목록">
            {documents.map(doc => (
              <div key={doc.id} className={'document-list-item ' + (doc.id === activeDocId ? 'active' : '')}>
                <button type="button" className="document-open-btn" onClick={() => switchDocument(doc.id)} aria-current={doc.id === activeDocId ? 'true' : undefined}>
                  <strong>{doc.title || '새 견적서'}</strong>
                  <span>{formatDocumentSubtitle(doc)}</span>
                  <small>{formatDocumentLabel(doc).split(' · ').slice(-1)[0]}</small>
                </button>
                <div className="document-row-actions">
                  <button type="button" className="mini-doc-btn" onClick={() => renameDocument(doc.id)}>이름 변경</button>
                  <button type="button" className="mini-doc-btn danger" onClick={() => deleteDocument(doc.id)}>{documents.length <= 1 ? '비우기' : '삭제'}</button>
                </div>
              </div>
            ))}
          </div>
          <div className="document-meta">
            저장된 견적서가 목록으로 보이고, 선택한 견적서는 이 브라우저에 자동 저장됩니다.
          </div>
          <div className="document-actions">
            <button type="button" className="add-btn compact" onClick={() => renameDocument(activeDocId)}>현재 이름 변경</button>
            <button type="button" className="add-btn compact" onClick={duplicateDocument}>복제</button>
            <button type="button" className="add-btn compact danger" onClick={deleteCurrentDocument}>{documents.length <= 1 ? '비우기' : '현재 삭제'}</button>
          </div>
          <div className="backup-actions" aria-label="백업 및 복원">
            <div className="backup-title">백업 및 복원</div>
            <button type="button" className="add-btn compact" onClick={saveBackupFile}>백업 파일 저장</button>
            <button type="button" className="add-btn compact" onClick={exportBackupText}>백업 데이터 복사</button>
            <button type="button" className="add-btn compact" onClick={openImportBackup}>백업 데이터 불러오기</button>
          </div>
          <p className="backup-privacy">로고/직인이 포함되면 백업 데이터가 길어질 수 있습니다. 전송할 때는 복사보다 파일 저장을 권장합니다.</p>
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
          </div>
          <div className="item-summary" aria-label="견적 합계 요약">
            <div><span>합계</span><strong>₩{fmt(totals.supply)}</strong></div>
            <div><span>부가세</span><strong>₩{fmt(totals.tax)}</strong></div>
            <div><span>총액</span><strong>₩{fmt(totals.total)}</strong></div>
          </div>
          <div className="item-head">
            <span>품명</span><span>단가</span><span>수량</span><span>합계</span><span>순서</span><span></span>
          </div>
          <div className="items-editor">
            {data.items.map((it, idx) => (
              <div className="item-row" key={idx}>
                <input type="text" value={it.name} onChange={e => setItem(idx, 'name', e.target.value)} placeholder="품명" />
                <input type="number" value={it.unitPrice || ''} onChange={e => setItem(idx, 'unitPrice', e.target.value)} placeholder="0" />
                <input type="number" value={it.qty || ''} onChange={e => setItem(idx, 'qty', e.target.value)} placeholder="1" />
                <input type="number" value={it.total || ''} onChange={e => setItem(idx, 'total', e.target.value)} placeholder="0" />
                <div className="reorder-controls" aria-label={`${idx + 1}번째 품목 순서 변경`}>
                  <button type="button" className="mini-icon-btn" onClick={() => moveItem(idx, -1)} disabled={idx === 0} aria-label="위로 이동">↑</button>
                  <button type="button" className="mini-icon-btn" onClick={() => moveItem(idx, 1)} disabled={idx === data.items.length - 1} aria-label="아래로 이동">↓</button>
                </div>
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
          <button type="button" className="btn btn-ghost preview-action-btn" onClick={() => setPreviewOpen(true)} aria-label="저장 전 미리보기 열기" disabled={busy}>
            🔍 미리보기
          </button>
          <button type="button" className="btn btn-primary share-action-btn" onClick={sharePng} disabled={busy} aria-label="PNG 공유하기">
            {busy ? '처리 중...' : '📤 공유'}
          </button>
        </div>
      </div>

      <div className="export-stack" aria-hidden="true">
        {invoicePages.map(page => (
          <div key={page.id} ref={el => { exportRefs.current[page.id] = el; }} className="export-frame">
            <TplComp data={data} totals={totals} {...page} />
          </div>
        ))}
        {invoicePages.length > 1 && (
          <div ref={longShareRef} className="export-frame export-long-frame">
            <TplComp data={data} totals={totals} items={totals.items} pageNumber={1} totalPages={1} showTotals={true} showFooter={true} longShare={true} />
          </div>
        )}
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
              <div className="preview-page-stack">
                {invoicePages.map(page => (
                  <div className="modal-preview-page" key={page.id}>
                    <div className="modal-preview-shell" style={{width: 794 * modalPreviewZoom, height: 1123 * modalPreviewZoom}}>
                      <div className="invoice-frame modal-preview-frame" style={{ transform: `scale(${modalPreviewZoom})`, position:'absolute', top:0, left:0 }}>
                        <TplComp data={data} totals={totals} {...page} />
                      </div>
                    </div>
                    {page.totalPages > 1 && <span className="modal-page-label">{page.pageNumber} / {page.totalPages}</span>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {importOpen && (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label="백업 데이터 붙여넣기" onClick={() => setImportOpen(false)}>
          <section className="preview-modal-card backup-modal-card" onClick={e => e.stopPropagation()}>
            <div className="preview-modal-head">
              <div>
                <b>백업 데이터 붙여넣기</b>
                <span>이전에 복사해 둔 견적서 백업 데이터를 아래에 붙여넣으세요. 기존 목록은 지우지 않고 앞쪽에 추가됩니다.</span>
              </div>
              <button type="button" className="preview-close" onClick={() => setImportOpen(false)} aria-label="닫기">×</button>
            </div>
            <div className="backup-modal-body">
              <textarea
                className="backup-textarea"
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="마크다운 백업 데이터 전체를 붙여넣으세요."
              />
              <p className="backup-privacy">불러오기 데이터에는 개인정보와 계좌 정보가 포함될 수 있습니다. 신뢰할 수 있는 백업만 사용하세요.</p>
              <div className="backup-modal-actions">
                <button type="button" className="add-btn compact" onClick={() => setImportOpen(false)}>취소</button>
                <button type="button" className="add-btn compact" onClick={importBackupText}>불러오기</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {backupCopyText && (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label="백업 데이터 직접 복사" onClick={() => setBackupCopyText('')}>
          <section className="preview-modal-card backup-modal-card" onClick={e => e.stopPropagation()}>
            <div className="preview-modal-head">
              <div>
                <b>백업 데이터 직접 복사</b>
                <span>자동 복사가 막힌 브라우저입니다. 아래 백업 데이터를 전체 선택해서 복사하세요.</span>
              </div>
              <button type="button" className="preview-close" onClick={() => setBackupCopyText('')} aria-label="닫기">×</button>
            </div>
            <div className="backup-modal-body">
              <textarea className="backup-textarea" value={backupCopyText} readOnly onFocus={e => e.target.select()} />
              <div className="backup-modal-actions">
                <button type="button" className="add-btn compact" onClick={() => setBackupCopyText('')}>닫기</button>
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
