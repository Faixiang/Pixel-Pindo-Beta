/**
 * 資源檢查（Node 直接執行）：node tests\resource-check.js
 * 解析 index.html 中所有本地 <script src>/<link href>，確認檔案存在。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const refs = [];
const re = /(?:src|href)="([^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) {
  const ref = m[1];
  if (/^(https?:|data:|#)/.test(ref)) continue;
  refs.push(ref);
}

let okCount = 0;
let failCount = 0;
refs.forEach(ref => {
  const p = path.join(root, ref);
  if (fs.existsSync(p)) {
    okCount++;
    console.log('  ✓ ' + ref);
  } else {
    failCount++;
    console.log('  ✗ 缺失 ' + ref);
  }
});

console.log('');
console.log('資源檢查：' + okCount + ' 存在 / ' + failCount + ' 缺失');
process.exit(failCount > 0 ? 1 : 0);
