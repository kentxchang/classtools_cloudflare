// 剛好學 組合程式：把 modules/ 內的各功能模組組合成 public/index.html（實際部署的單一網頁檔）。
// 執行 npx wrangler deploy 或 npx wrangler dev 時會自動先執行本程式（見 wrangler.jsonc 的 build 設定），
// 也可以手動執行：node build.js
//
// 組合規則：從 modules/main/index.html 開始，獨佔一行的
//   <!-- @include 路徑 -->　　/* @include 路徑 */　　// @include 路徑
// 會被換成該檔案的內容（路徑以 modules/ 為起點，被引入的檔案內也可以再 @include）。
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'modules');
const OUTPUT = path.join(__dirname, 'public', 'index.html');
const INCLUDE = /^[ \t]*(?:<!-- @include (\S+) -->|\/\* @include (\S+) \*\/|\/\/ @include (\S+))[ \t]*\r?\n/gm;

function assemble(file, stack = []) {
    if (stack.includes(file)) throw new Error('循環 @include：' + [...stack, file].join(' → '));
    const text = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8');
    return text.replace(INCLUDE, (_, a, b, c) => assemble(a || b || c, [...stack, file]));
}

fs.writeFileSync(OUTPUT, assemble('main/index.html'));
console.log('已組合 public/index.html');
