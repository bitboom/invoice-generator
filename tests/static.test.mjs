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
      'workName',
      'recipient',
      'contact',
    ];

    for (const field of privateFields) {
      assert.match(defaults, new RegExp(`${field}: ''`), `${field} should default to an empty string`);
    }
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
  it('offers exactly three shared templates with stable ids', () => {
    for (const id of ['classic', 'minimal', 'bold']) {
      assert.match(app, new RegExp(`id: '${id}'`));
      assert.match(templates, new RegExp(`tpl-${id}`));
    }
  });

  it('uploads one browser-local PNG image and renders it through the shared LogoMark component', () => {
    assert.match(app, /accept="image\/png"/, 'file picker should constrain uploads to PNG files');
    assert.match(app, /file\.type !== 'image\/png'/, 'runtime validation should reject non-PNG images');
    assert.match(app, /readAsDataURL\(file\)/, 'logo upload should preserve PNG alpha by storing the original Data URL');
    assert.match(app, /logoDataUrl: reader\.result/, 'uploaded logo should be stored in app state/localStorage');
    assert.match(templates, /function LogoMark\(/, 'templates should share a single logo renderer');
    assert.equal((templates.match(/<LogoMark data=\{data\}/g) || []).length, 3, 'each template should render the same uploaded logo');
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
    assert.equal((templates.match(/style=\{themeVars\(data\)\}/g) || []).length, 3, 'each template should receive the shared theme variables');
  });

  it('updates the selected template through React state rather than per-template data forks', () => {
    assert.match(app, /const \[tplId, setTplId\] = useState\('classic'\)/);
    assert.match(app, /onClick=\{\(\) => setTplId\(t\.id\)\}/);
    assert.match(app, /const TplComp = TEMPLATES\.find\(t => t\.id === tplId\)\.comp;/);
    assert.match(app, /<TplComp data=\{data\} totals=\{totals\} \/>/);
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
  it('keeps nine line-item body rows by filling blank rows', () => {
    assert.match(templates, /Math\.max\(0, 9 - items\.length\)/);
  });

  it('matches the requested classic rules and item indent styling', () => {
    assert.match(index, /\.tpl-classic \.totals \.grand\{[\s\S]*border-top:3px solid var\(--theme\);[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.items tbody td:first-child\{padding-left:8px\}/);
    assert.match(index, /\.tpl-classic \.items tbody tr:last-child td\{[\s\S]*background:#fff;[\s\S]*border-bottom:0;[\s\S]*\}/);
    assert.match(index, /\.tpl-classic \.sidebar-bank \.bk-label\{[\s\S]*width:132px;[\s\S]*\}/);
  });
});
