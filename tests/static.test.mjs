import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.jsx');
const templates = read('templates.jsx');
const index = read('index.html');
const readme = read('README.md');

const sourceFiles = {
  'app.jsx': app,
  'templates.jsx': templates,
  'index.html': index,
  'README.md': readme,
};

const extractDefaultDataBody = () => {
  const match = app.match(/const DEFAULT_DATA = \{([\s\S]*?)\n\};/);
  assert.ok(match, 'DEFAULT_DATA object must exist');
  return match[1];
};

describe('privacy and repository hygiene', () => {
  it('keeps business identity/account fields empty in DEFAULT_DATA', () => {
    const defaults = extractDefaultDataBody();
    const privateFields = [
      'companyName',
      'address',
      'phone',
      'bizNumber',
      'email',
      'bankName',
      'bankAccount',
      'depositor',
      'logoDataUrl',
      'stampText',
      'stampImageDataUrl',
      'workName',
      'recipient',
      'contact',
    ];

    for (const field of privateFields) {
      assert.match(defaults, new RegExp(`${field}: ''`), `${field} should default to an empty string`);
    }
    assert.match(app, /showStamp: false/, 'stamp visibility should default off');
  });

  it('defaults footer notes to four caution lines and migrates the old three-line default', () => {
    assert.match(app, /const DEFAULT_NOTES = \[/);
    assert.match(app, /'공정용수는 갑측이 제공합니다\.'/);
    assert.match(app, /const LEGACY_THREE_NOTES = \[DEFAULT_NOTES\[0\], DEFAULT_NOTES\[2\], DEFAULT_NOTES\[3\]\];/);
    assert.match(app, /const normalizeData = \(input = \{\}\) => \(\{/);
    assert.match(app, /notes: normalizeNotes\(input\.notes\)/);
    assert.match(app, /return \[notes\[0\], DEFAULT_NOTES\[1\], notes\[1\], notes\[2\]\];/);
  });

  it('does not reference bundled business logo assets', () => {
    for (const [file, content] of Object.entries(sourceFiles)) {
      assert.doesNotMatch(content, /assets\/logo-[\w-]+\.png/, `${file} should not reference deleted logo assets`);
    }
    assert.equal(fs.existsSync(path.join(root, 'assets', 'logo-horizontal.png')), false);
    assert.equal(fs.existsSync(path.join(root, 'assets', 'logo-inline.png')), false);
    assert.equal(fs.existsSync(path.join(root, 'assets', 'logo-stacked.png')), false);
  });

  it('uses a new localStorage key so old sensitive defaults are not reloaded', () => {
    assert.match(app, /const STORAGE_KEY = 'invoice-data-v2';/);
    assert.doesNotMatch(app, /invoice-data-v1/);
  });

  it('uses browser-local document storage for multiple saved invoices', () => {
    assert.match(app, /const DOCUMENTS_STORAGE_KEY = 'invoice-documents-v1';/);
    assert.match(app, /const ACTIVE_DOCUMENT_KEY = 'invoice-active-id-v1';/);
    assert.match(app, /function loadWorkspace\(\)/);
    assert.match(app, /const \[documents, setDocuments\] = useState\(initialWorkspace\.documents\);/);
    assert.match(app, /const \[activeDocId, setActiveDocId\] = useState\(initialWorkspace\.activeDocId\);/);
    assert.match(app, /localStorage\.setItem\(DOCUMENTS_STORAGE_KEY, JSON\.stringify\(nextDocuments\)\);/);
    assert.match(app, /localStorage\.setItem\(ACTIVE_DOCUMENT_KEY, activeDocId\);/);
    assert.match(app, /const createNewDocument = \(\) =>/);
    assert.match(app, /const renameDocument = \(docId\) =>/);
    assert.match(app, /const duplicateDocument = \(\) =>/);
    assert.match(app, /const deleteCurrentDocument = \(\) =>/);
    assert.match(app, /저장된 견적서/);
    assert.match(app, /새 견적서 이름을 입력하세요\./);
    assert.match(app, /이름 변경/);
    assert.match(app, /복제/);
    assert.match(app, /이 브라우저에 자동 저장/);
    assert.match(index, /\.document-library/);
    assert.match(index, /\.document-list/);
    assert.match(index, /\.document-list-item\.active/);
    assert.match(index, /\.new-document-btn/);
  });

  it('does not hardcode email or Korean business registration numbers in app data/templates/readme', () => {
    for (const [file, content] of Object.entries({ 'app.jsx': app, 'templates.jsx': templates, 'README.md': readme })) {
      assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${file} should not contain a concrete email address`);
      assert.doesNotMatch(content, /\b\d{3}\s*-\s*\d{2}\s*-\s*\d{5}\b/, `${file} should not contain a concrete business registration number`);
    }
  });
});

describe('shared logo, theme, and template behavior', () => {
  it('offers Classic as the primary PNG template', () => {
    assert.match(app, /const TEMPLATES = \[/);
    assert.match(app, /id: 'classic'/);
    assert.doesNotMatch(app, /id: 'invoify1'/);
    assert.doesNotMatch(app, /4개 비교 PNG/);
    assert.match(templates, /function ClassicTemplate/);
    assert.match(index, /\.tpl-classic\{/);
  });

  it('uploads one browser-local PNG image and renders it through the shared LogoMark component', () => {
    assert.match(app, /accept="image\/png"/, 'file picker should constrain uploads to PNG files');
    assert.match(app, /file\.type !== 'image\/png'/, 'runtime validation should reject non-PNG images');
    assert.match(app, /readAsDataURL\(file\)/, 'logo upload should preserve PNG alpha by storing the original Data URL');
    assert.match(app, /logoDataUrl: reader\.result/, 'uploaded logo should be stored in app state/localStorage');
    assert.match(app, /stampImageDataUrl: reader\.result/, 'uploaded stamp should be stored in app state/localStorage');
    assert.match(templates, /function LogoMark\(/, 'templates should share a single logo renderer');
    assert.match(templates, /<LogoMark data=\{data\} onDark \/>/, 'classic template should render the uploaded logo');
  });

  it('guards against oversized logos and localStorage quota failures', () => {
    assert.match(app, /const MAX_LOGO_BYTES = 1024 \* 1024;/, 'logo upload size should be capped for localStorage safety');
    assert.match(app, /const PNG_SIGNATURE = \[137, 80, 78, 71, 13, 10, 26, 10\];/, 'PNG magic bytes should be declared for content validation');
    assert.match(app, /file\.size > MAX_LOGO_BYTES/, 'oversized logo files should be rejected before FileReader/localStorage');
    assert.match(app, /file\.slice\(0, PNG_SIGNATURE\.length\)\.arrayBuffer\(\)/, 'uploaded files should be checked for a real PNG signature');
    assert.match(app, /PNG_SIGNATURE\.every\(\(byte, idx\) => header\[idx\] === byte\)/, 'PNG signature check should compare all expected bytes');
    assert.match(app, /if \(logoInputRef\.current\) logoInputRef\.current\.value = '';/, 'rejected logo uploads should clear the file input');
    assert.match(app, /try \{\s*localStorage\.setItem\(DOCUMENTS_STORAGE_KEY, JSON\.stringify\(nextDocuments\)\);/s, 'document localStorage persistence should be guarded');
    assert.match(app, /catch \{\s*setToast\(\{ type: 'err', msg: '브라우저 저장 공간이 부족합니다\.[^']*' \}\);/s, 'quota failures should show a user-visible error');
  });

  it('applies one shared theme color through CSS variables in all invoice templates', () => {
    assert.match(app, /themeColor: '#0a0a0a'/);
    assert.match(app, /onClick=\{\(\) => setValue\('themeColor', p\.color\)\}/);
    assert.match(templates, /'--theme': theme/);
    assert.match(templates, /'--on-theme': readableOn\(theme\)/);
    assert.match(templates, /style=\{themeVars\(data\)\}/, 'classic template should receive the shared theme variables');
  });

  it('keeps the UI focused on share and modal preview actions only', () => {
    assert.match(app, /const \[tplId\] = useState\('classic'\)/);
    assert.match(app, /<h1>견적서<\/h1>/);
    assert.match(app, /견적서를 공유하세요\./);
    assert.match(app, /저장 전 미리보기/);
    assert.match(app, /저장 전 미리보기 열기/);
    assert.match(app, /🔍 미리보기/);
    assert.match(app, /PNG 공유하기/);
    assert.match(app, /📤 공유/);
    assert.match(app, /navigator\.share/);
    assert.match(app, /navigator\.canShare/);
    assert.match(app, /currentInvoiceNodes/);
    assert.match(app, /exportRefs\.current\[page\.id\]/);
    assert.match(app, /navigator\.canShare\(\{ files \}\)/);
    assert.match(index, /\.action-row\{display:grid;grid-template-columns:1fr 1fr/);
    assert.match(index, /\.preview-action-btn,\.share-action-btn/);
    assert.match(index, /\.preview-modal/);
    assert.doesNotMatch(app, /<main className="stage multi-stage">/);
    assert.doesNotMatch(app, /Classic 미리보기 · A4 PNG/);
    assert.doesNotMatch(app, /Classic 견적서/);
    assert.doesNotMatch(app, /오른쪽 미리보기가 그대로 PNG로 저장됩니다\./);
    assert.doesNotMatch(app, /PNG 저장/);
    assert.doesNotMatch(app, /save-preview-card/);
    assert.doesNotMatch(index, /\.save-preview-card/);
    assert.doesNotMatch(index, /\.mini-preview-frame/);
    assert.doesNotMatch(app, /window\.print\(\)/, 'print button should not be confused with PNG sharing');
    assert.doesNotMatch(app, /4개 디자인 비교 PNG를 저장했습니다\./);
  });

  it('opens directly to the editor while keeping intro styles safe if re-enabled', () => {
    assert.match(app, /const \[showIntro, setShowIntro\] = useState\(false\);/);
    assert.match(index, /\.intro-overlay\{[\s\S]*overflow-y:auto;[\s\S]*-webkit-overflow-scrolling:touch;[\s\S]*touch-action:pan-y/);
    assert.match(index, /@media \(max-width: 600px\)\{[\s\S]*\.intro-overlay\{[\s\S]*place-items:start center;[\s\S]*\}/);
    assert.match(index, /@media \(max-width: 600px\)\{[\s\S]*button,input,textarea\{touch-action:manipulation\}/);
  });

  it('supports logo and stamp crop controls without distorting uploaded pixels', () => {
    for (const field of ['logoScale', 'logoX', 'logoY', 'stampScale', 'stampX', 'stampY']) {
      assert.match(app, new RegExp(`${field}: `), `${field} should be persisted in DEFAULT_DATA`);
    }
    assert.match(app, /const mediaStyle = \(kind\) =>/);
    assert.match(app, /resetMediaCrop/);
    assert.match(app, /로고 크기/);
    assert.match(app, /직인 크기/);
    assert.match(templates, /const mediaCropStyle = \(data, kind\) =>/);
    assert.match(templates, /className=\{'logo-crop-wrap '/);
    assert.match(templates, /className=\{'stamp-crop-wrap '/);
    assert.match(index, /\.logo-crop-wrap\{display:inline-grid;place-items:center;overflow:hidden/);
    assert.match(index, /\.stamp-crop-wrap \.stamp-image\{[\s\S]*mix-blend-mode:normal;[\s\S]*image-rendering:auto/);
  });

  it('renders high-resolution export PNGs and can split a long classic invoice into two files', () => {
    assert.match(app, /const EXPORT_SCALE = 4;/);
    assert.match(app, /scale: EXPORT_SCALE/);
    assert.match(app, /const CLASSIC_SINGLE_PAGE_ITEM_LIMIT = 11;/);
    assert.match(app, /const CLASSIC_SPLIT_PAGE_ONE_ITEM_LIMIT = 14;/);
    assert.match(app, /const makeClassicPages = \(totals\) =>/);
    assert.match(app, /const firstPageCount = Math\.min\(CLASSIC_SPLIT_PAGE_ONE_ITEM_LIMIT, items\.length\);/);
    assert.match(app, /items\.slice\(0, firstPageCount\)/);
    assert.match(app, /items\.slice\(firstPageCount\)/);
    assert.match(app, /showTotals: false/);
    assert.match(app, /showTotals: true/);
    assert.match(app, /showFooter: true/);
    assert.doesNotMatch(app, /showFooter: false/);
    assert.match(app, /invoice_\$\{datePart\}_p\$\{pageNumber\}\.png/);
    assert.match(app, /for \(const \[idx, node\] of nodes\.entries\(\)\)/);
    assert.match(app, /PNG \$\{files\.length\}장/);
    assert.match(app, /preview-page-stack/);
    assert.match(templates, /classic-footer-page-number/);
    assert.match(templates, /\{pageNumber\} \/ \{totalPages\}/);
    assert.doesNotMatch(templates, /classic-page-number/);
    assert.doesNotMatch(templates, /품목 계속/);
    assert.doesNotMatch(templates, /다음 페이지에 품목과 합계가 이어집니다\./);
    assert.doesNotMatch(index, /classic-continuation-head/);
    assert.doesNotMatch(index, /classic-continuation-note/);
    assert.match(index, /\.tpl-classic\.tpl-classic-continuation \.body/);
    assert.match(index, /\.tpl-classic \.classic-footer-page-number\{[\s\S]*position:absolute;[\s\S]*right:0;[\s\S]*top:14px;[\s\S]*\}/);
    assert.doesNotMatch(index, /\.classic-page-number/);
    assert.match(index, /\.preview-page-stack/);
  });

  it('lets users reorder line items in the editor', () => {
    assert.match(app, /const moveItem = \(idx, direction\) =>/);
    assert.match(app, /\[items\[idx\], items\[target\]\] = \[items\[target\], items\[idx\]\];/);
    assert.match(app, /aria-label="위로 이동"/);
    assert.match(app, /aria-label="아래로 이동"/);
    assert.match(index, /\.reorder-controls/);
    assert.match(index, /\.mini-icon-btn/);
    assert.match(index, /\.item-row\{[\s\S]*grid-template-columns: 1fr 80px 60px 90px 52px 28px/);
  });

  it('loads templates before the app bundle on GitHub Pages', () => {
    const templatesScriptIndex = index.indexOf('templates.jsx');
    const appScriptIndex = index.indexOf('app.jsx');
    assert.ok(templatesScriptIndex > -1, 'templates.jsx script tag should exist');
    assert.ok(appScriptIndex > -1, 'app.jsx script tag should exist');
    assert.ok(templatesScriptIndex < appScriptIndex, 'templates must load before app.jsx');
  });
});

describe('classic template visual refinements', () => {
  it('keeps eleven line-item body rows by filling blank rows', () => {
    assert.match(templates, /Math\.max\(0, 11 - items\.length\)/);
  });

  it('matches the requested classic rules and item indent styling', () => {
    assert.match(index, /\.tpl-classic \.totals \.grand\{[\s\S]*border-top:3px solid var\(--theme\);[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.items tbody td\{[\s\S]*height:38px;[\s\S]*padding:0;[\s\S]*vertical-align:middle;[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.items thead th\.num\{text-align:center\}/);
    assert.match(index, /\.tpl-classic \.items tbody td\.num\{text-align:center;/);
    assert.match(index, /\.tpl-classic \.items tbody td:first-child\{padding-left:8px\}/);
    assert.match(index, /\.tpl-classic \.items tbody tr:last-child td\.empty\{[\s\S]*background:#fff;[\s\S]*border-bottom:0;[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.total-rule\{[\s\S]*margin-top:0;[\s\S]*border-top:3px solid var\(--theme\);[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.sidebar-bank \.bk-label\{[\s\S]*width:132px;[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.info-block\{margin-bottom:10px\}/);
    assert.match(index, /\.tpl-classic \.items\{[\s\S]*margin-top:2px;[\s\S]*\}/);
  });

  it('supports an optional classic stamp area without hardcoded stamp data', () => {
    assert.match(app, /stampText: ''/);
    assert.match(app, /stampImageDataUrl: ''/);
    assert.match(app, /showStamp: false/);
    assert.match(app, /onClick=\{\(\) => setValue\('showStamp', !data\.showStamp\)\}/);
    assert.match(templates, /className="classic-stamp-slot"/);
    assert.match(templates, /function StampMark\(/);
    assert.match(templates, /stampImageDataUrl/);
    assert.match(templates, /<StampMark data=\{data\} className="classic-stamp-mark" \/>/);
    assert.match(index, /\.tpl-classic \.classic-stamp-slot\{[\s\S]*min-height:86px;/);
    assert.match(index, /\.tpl-classic \.classic-stamp-mark\{width:86px;height:86px;/);
  });
});
