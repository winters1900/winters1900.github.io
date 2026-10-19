#!/usr/bin/env node
/**
 * 从 guitar_sheet 仓库同步吉他谱到 Hexo 博客。
 *
 * 用法：
 *   node scripts/sync-guitar.mjs <guitar_sheet 仓库的本地路径>
 *
 * 行为：
 *   1. 读取源仓库的 sheets.json 清单（权威元数据）；
 *   2. 把清单中列出的 PDF 复制到 source/guitar/sheets/（目标目录会先清空，保证重命名/删除生效）；
 *   3. 生成 Hexo 数据文件 source/_data/guitar_sheets.json，供主题 guitar 布局渲染。
 *
 * 该脚本只依赖 Node 内置模块，CI 与本地均可直接运行。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(ROOT, '..', 'guitar_sheet');

const SHEETS_DIR = path.join(ROOT, 'source', 'guitar', 'sheets');
const DATA_DIR = path.join(ROOT, 'source', '_data');
const MANIFEST = path.join(SRC, 'sheets.json');

function fail(msg) {
  console.error(`[sync-guitar] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) {
  fail(`未找到清单文件：${MANIFEST}\n请先克隆 guitar_sheet 仓库并把路径作为参数传入。`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (!Array.isArray(manifest.sheets)) fail('sheets.json 中缺少 sheets 数组。');

// 目标目录先清空（只放从源仓库同步的 PDF），避免遗留旧文件
fs.rmSync(SHEETS_DIR, { recursive: true, force: true });
fs.mkdirSync(SHEETS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const seen = new Set();
const sheets = [];
for (const entry of manifest.sheets) {
  if (!entry || !entry.file) {
    console.warn('[sync-guitar] 跳过缺少 file 字段的记录：', JSON.stringify(entry));
    continue;
  }
  const file = entry.file;
  if (seen.has(file)) fail(`sheets.json 中文件名重复：${file}`);
  seen.add(file);

  const srcFile = path.join(SRC, file);
  if (!fs.existsSync(srcFile)) {
    console.warn(`[sync-guitar] 清单引用了不存在的文件，跳过：${file}`);
    continue;
  }
  fs.copyFileSync(srcFile, path.join(SHEETS_DIR, file));

  sheets.push({
    id: entry.id || Buffer.from(file).toString('base64url').slice(0, 10),
    title: entry.title || file.replace(/\.pdf$/i, ''),
    work: entry.work || '',
    tabber: entry.tabber || '',
    type: entry.type || 'fingerstyle',
    tuning: entry.tuning || '',
    capo: entry.capo || '',
    tempo: entry.tempo || '',
    pages: Number.isInteger(entry.pages) ? entry.pages : 0,
    difficulty: entry.difficulty || '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    file,
    url: '/guitar/sheets/' + encodeURIComponent(file),
    note: entry.note || '',
    createdAt: entry.createdAt || ''
  });
}

const data = {
  updated: manifest.updated || '',
  generatedAt: new Date().toISOString(),
  count: sheets.length,
  sheets
};

fs.writeFileSync(
  path.join(DATA_DIR, 'guitar_sheets.json'),
  JSON.stringify(data, null, 2) + '\n',
  'utf8'
);

console.log(`[sync-guitar] 已同步 ${sheets.length} 份吉他谱 → source/guitar/sheets/`);
console.log('[sync-guitar] 数据文件 → source/_data/guitar_sheets.json');
