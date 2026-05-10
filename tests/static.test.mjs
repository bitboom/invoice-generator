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
    assert.match(app, /return \{ \.\.\.DEFAULT_DATA, \.\.\.parsed, notes: normalizeNotes\(parsed\.notes\) \};/);
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
    assert.match(app, /try \{\s*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(data\)\);/s, 'localStorage persistence should be guarded');
    assert.match(app, /catch \{\s*setToast\(\{ type: 'err', msg: '브라우저 저장 공간이 부족합니다\.[^']*' \}\);/s, 'quota failures should show a user-visible error');
  });

  it('applies one shared theme color through CSS variables in all invoice templates', () => {
    assert.match(app, /themeColor: '#0a0a0a'/);
    assert.match(app, /onClick=\{\(\) => setValue\('themeColor', p\.color\)\}/);
    assert.match(templates, /'--theme': theme/);
    assert.match(templates, /'--on-theme': readableOn\(theme\)/);
    assert.match(templates, /style=\{themeVars\(data\)\}/, 'classic template should receive the shared theme variables');
  });

  it('keeps the UI focused on one Classic preview and one PNG save action', () => {
    assert.match(app, /const \[tplId, setTplId\] = useState\('classic'\)/);
    assert.match(app, /Classic 미리보기 · A4 PNG/);
    assert.match(app, /오른쪽 미리보기가 그대로 PNG로 저장됩니다\./);
    assert.match(app, /PNG 저장/);
    assert.match(app, /저장 전 미리보기/);
    assert.match(app, /미리보기 크게 보기/);
    assert.match(app, /수정하면 이 미리보기도 바로 바뀝니다\./);
    assert.match(index, /\.save-preview-card/);
    assert.match(index, /\.preview-modal/);
    assert.match(index, /\.mini-preview-frame/);
    assert.doesNotMatch(app, /window\.print\(\)/, 'print button should not be confused with PNG saving');
    assert.doesNotMatch(app, /4개 디자인 비교 PNG를 저장했습니다\./);
  });

  it('keeps the intro usable on mobile touch browsers', () => {
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
    assert.match(index, /\.tpl-classic \.items tbody tr:last-child td\{[\s\S]*background:#fff;[\s\S]*border-bottom:0;[\s\S]*\}/);
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
