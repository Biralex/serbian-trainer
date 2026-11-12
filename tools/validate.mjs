#!/usr/bin/env node
// Проверка карточек. Запуск из корня репозитория:
//   node tools/validate.mjs            — проверить
//   node tools/validate.mjs --update   — проверить и дописать новые ID в tools/ids.lock.json
//   node tools/validate.mjs --csv      — дополнительно выгрузить cards.csv (для просмотра)
//
// tools/ids.lock.json хранит соответствие «ID → сербский текст» для всех опубликованных
// карточек. Если у существующего ID поменялся текст или ID пропал — значит, карточки
// вставили в середину колоды или удалили, и прогресс пользователя «съедет». Это ошибка.
// Если текст лишь исправлен (опечатка), запустите с --accept-changes.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const errors = [];
const warnings = [];

const DECKS = ["words", "phrases", "grammar", "reading"];
const TYPES = ["word", "phrase", "expression", "question", "answer", "dialogue", "proverb", "grammar", "form",
  "example", "letter", "pronunciation", "text", "latin", "verse"];

const context = {};
context.window = context;
vm.createContext(context);
const run = file => vm.runInContext(readFileSync(join(root, file), "utf8"), context, { filename: file });

run("data/meta.js");
const lessonFiles = readdirSync(join(root, "data")).filter(f => /^lesson-\d\d\.js$/.test(f)).sort();
const byFile = {};
for (const file of lessonFiles) {
  const before = context.window.CARDS.length;
  run(`data/${file}`);
  byFile[file] = context.window.CARDS.slice(before);
}
const cards = context.window.CARDS;
const lessons = context.window.LESSONS;

// Файлы подключены в index.html и закэшированы в sw.js
const html = readFileSync(join(root, "index.html"), "utf8");
for (const file of lessonFiles) {
  if (!html.includes(`data/${file}`)) errors.push(`index.html не подключает data/${file}`);
}
const swCount = Number((readFileSync(join(root, "sw.js"), "utf8").match(/length:\s*(\d+)/) || [])[1]);
if (swCount !== lessonFiles.length) errors.push(`sw.js кэширует ${swCount} файлов уроков, а их ${lessonFiles.length}`);

// Буквы, которых нет в сербской кириллице, и латиница внутри кириллического слова
const RUSSIAN_ONLY = /[ыэюяёщъьйЫЭЮЯЁЩЪЬЙ]/;
const MIXED = /(?=[^\s]*[а-шА-Шђјљњћџ])(?=[^\s]*[a-zA-Z])[^\s]+/;
function checkSerbian(card, field) {
  const text = card[field];
  if (!text) return;
  const m = text.match(RUSSIAN_ONLY);
  if (m) errors.push(`${card.id}: в поле ${field} русская буква «${m[0]}»: ${text}`);
  const mixed = text.match(MIXED);
  if (mixed) errors.push(`${card.id}: в поле ${field} смешаны кириллица и латиница: «${mixed[0]}»`);
}

const ids = new Set();
for (const [file, list] of Object.entries(byFile)) {
  const fileLesson = Number(file.match(/\d\d/)[0]);
  for (const card of list) {
    if (ids.has(card.id)) errors.push(`повтор ID ${card.id}`);
    ids.add(card.id);
    if (card.lesson !== fileLesson) errors.push(`${card.id}: урок ${card.lesson} в файле ${file}`);
    if (!lessons[card.lesson]) errors.push(`${card.id}: нет метаданных урока ${card.lesson}`);
    if (!DECKS.includes(card.deck)) errors.push(`${card.id}: неизвестная колода ${card.deck}`);
    if (!TYPES.includes(card.type)) errors.push(`${card.id}: неизвестный тип ${card.type}`);
    if (!card.section) errors.push(`${card.id}: нет раздела`);
    if (!Number.isInteger(card.page)) errors.push(`${card.id}: нет страницы`);
    if (!card.sr || !String(card.sr).trim()) errors.push(`${card.id}: пустой сербский текст`);
    if (card.type === "form") {
      if (!card.ans) errors.push(`${card.id}: у формы нет ответа`);
      if (!card.hint) warnings.push(`${card.id}: у формы нет подсказки (hint)`);
    } else if (!card.ru || !String(card.ru).trim()) {
      errors.push(`${card.id}: пустой перевод`);
    }
    if (card.type !== "letter") ["sr", "ans", "forms", "variants", "tts"].forEach(f => checkSerbian(card, f));
  }
}

// Замок ID
const lockPath = join(root, "tools", "ids.lock.json");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : {};
const current = Object.fromEntries(cards.map(card => [card.id, card.sr]));
let added = 0;
for (const [id, sr] of Object.entries(lock)) {
  if (!(id in current)) errors.push(`опубликованный ID ${id} пропал (было: ${sr}). Карточку нельзя удалять — пометьте retired: true`);
  else if (current[id] !== sr) {
    if (args.has("--accept-changes")) lock[id] = current[id];
    else errors.push(`у ID ${id} изменился текст: «${sr}» → «${current[id]}». Если это исправление опечатки — запустите с --accept-changes`);
  }
}
for (const [id, sr] of Object.entries(current)) {
  if (!(id in lock)) { added += 1; if (args.has("--update")) lock[id] = sr; }
}
if ((args.has("--update") || args.has("--accept-changes")) && !errors.length) {
  writeFileSync(lockPath, JSON.stringify(lock, null, 0).replace(/","/g, '",\n"') + "\n");
}

if (args.has("--csv")) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = ["id", "lesson", "deck", "type", "section", "page", "sr", "ru", "ans", "hint", "g", "forms", "variants", "note"];
  writeFileSync(join(root, "cards.csv"), "﻿" + [cols.join(",")].concat(cards.map(c => cols.map(k => esc(c[k])).join(","))).join("\n") + "\n");
}

// Отчёт
const stat = {};
for (const card of cards) {
  stat[card.lesson] ??= { words: 0, phrases: 0, grammar: 0, reading: 0 };
  stat[card.lesson][card.deck] += 1;
}
console.log("урок  слова фразы грамм. чтение  всего");
for (const [lesson, s] of Object.entries(stat)) {
  const total = s.words + s.phrases + s.grammar + s.reading;
  console.log(`${lesson.padStart(4)} ${String(s.words).padStart(6)} ${String(s.phrases).padStart(6)} ${String(s.grammar).padStart(6)} ${String(s.reading).padStart(6)} ${String(total).padStart(6)}`);
}
console.log(`Всего карточек: ${cards.length}. Новых ID относительно замка: ${added}${args.has("--update") ? " (записаны)" : ""}.`);
warnings.forEach(w => console.warn("Предупреждение:", w));
if (errors.length) {
  errors.forEach(e => console.error("ОШИБКА:", e));
  console.error(`Ошибок: ${errors.length}`);
  process.exit(1);
}
console.log("Проверка пройдена.");
