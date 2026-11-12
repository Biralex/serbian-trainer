(() => {
  "use strict";

  // ---------- Хранилище ----------
  const PREFIX = "govoriSrpski.";
  const STORAGE_KEY = PREFIX + "progress.v1";
  const SETTINGS_KEY = PREFIX + "settings.v1";
  const OLD_KEY_PREFIX = "serbianTrainer."; // прежнее приложение по учебнику Чарского
  const EXPORT_FORMAT = "govori-srpski-progress";
  const EXPORT_VERSION = 1;

  const CARDS = (Array.isArray(window.CARDS) ? window.CARDS : []).filter(card => !card.retired);
  const LESSONS = window.LESSONS || {};
  const LESSON_IDS = [...new Set(CARDS.map(card => card.lesson))].sort((a, b) => a - b);
  const DAY = 24 * 60 * 60 * 1000;
  const INTERVALS = [1, 3, 7, 14, 30, 90];

  const deckNames = { words: "Слова", phrases: "Фразы", grammar: "Грамматика", reading: "Чтение" };
  const typeNames = {
    word: "Слово", phrase: "Фраза", expression: "Выражение", question: "Вопрос", answer: "Ответ",
    dialogue: "Диалог", proverb: "Пословица", grammar: "Грамматика", form: "Форма",
    example: "Пример", letter: "Буква", pronunciation: "Произношение", text: "Текст",
    latin: "Латиница", verse: "Стихи"
  };
  const genderNames = { m: "м. р.", f: "ж. р.", n: "ср. р.", pl: "мн. ч." };
  const defaultSettings = {
    lesson: LESSON_IDS.includes(1) ? 1 : (LESSON_IDS[0] ?? 0),
    deck: "words",
    mode: "smart",
    type: "all",
    direction: "mix",
    script: "cyr",
    newLimit: 20
  };

  const $ = selector => document.querySelector(selector);
  const els = {
    trainer: $(".trainer"), empty: $("#emptyState"), emptyTitle: $("#emptyTitle"), emptyText: $("#emptyText"),
    flashcard: $("#flashcard"), answerSide: $("#answerSide"), reveal: $("#revealButton"), ratings: $("#ratingButtons"),
    promptText: $("#promptText"), promptAlt: $("#promptAlt"), answerText: $("#answerText"), answerAlt: $("#answerAlt"),
    promptLabel: $("#promptLabel"), answerLabel: $("#answerLabel"),
    forms: $("#forms"), variants: $("#variants"), note: $("#note"),
    cardType: $("#cardType"), cardSection: $("#cardSection"), cardPage: $("#cardPage"), speak: $("#speakButton"),
    lessonSelect: $("#lessonSelect"), appTitle: $("#appTitle"), sourceNote: $("#sourceNote"),
    studyMode: $("#studyMode"), typeFilter: $("#typeFilter"), direction: $("#direction"), progressFill: $("#progressFill"),
    statNew: $("#statNew"), statDue: $("#statDue"), statHard: $("#statHard"), statLearned: $("#statLearned"),
    todayMessage: $("#todayMessage"), showAll: $("#showAllButton"),
    menuButton: $("#menuButton"), menuPanel: $("#menuPanel"), scriptButton: $("#scriptButton"),
    newLimit: $("#newLimit"), exportButton: $("#exportButton"), importButton: $("#importButton"),
    importFile: $("#importFile"), reset: $("#resetButton")
  };

  // ---------- Кириллица → латиница ----------
  const CYR_TO_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ", "е": "e", "ж": "ž", "з": "z", "и": "i",
    "ј": "j", "к": "k", "л": "l", "љ": "lj", "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "ћ": "ć", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č", "џ": "dž", "ш": "š"
  };
  function toLatin(text) {
    if (!text) return "";
    const chars = [...text];
    return chars.map((ch, i) => {
      const lower = ch.toLowerCase();
      const lat = CYR_TO_LAT[lower];
      if (lat === undefined) return ch;
      if (ch === lower) return lat;
      // Заглавная: Љ → Lj, но ЉУБАВ → LJUBAV
      const next = chars[i + 1] || "";
      const nextUpper = next !== next.toLowerCase();
      return lat.length > 1 && !nextUpper ? lat[0].toUpperCase() + lat.slice(1) : lat.toUpperCase();
    }).join("");
  }

  // ---------- Чтение и запись ----------
  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  function removeOldAppData() {
    try {
      const old = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(OLD_KEY_PREFIX)) old.push(key);
      }
      old.forEach(key => localStorage.removeItem(key));
    } catch { /* хранилище недоступно */ }
  }

  function sanitizeProgress(value) {
    const clean = {};
    if (!isRecord(value)) return clean;
    Object.entries(value).forEach(([id, item]) => {
      if (!isRecord(item)) return;
      clean[id] = {
        level: Number(item.level) || 0,
        lapses: Number(item.lapses) || 0,
        due: Number(item.due) || 0,
        last: Number(item.last) || 0
      };
    });
    return clean;
  }

  function normalizeLesson(value) {
    if (value === "all") return "all";
    const lesson = Number(value);
    return LESSON_IDS.includes(lesson) ? lesson : defaultSettings.lesson;
  }
  function normalizeSettings(raw) {
    const s = Object.assign({}, defaultSettings, isRecord(raw) ? raw : {});
    s.lesson = normalizeLesson(s.lesson);
    if (!Object.hasOwn(deckNames, s.deck)) s.deck = defaultSettings.deck;
    if (!["smart", "all", "new", "due", "hard", "learned"].includes(s.mode)) s.mode = defaultSettings.mode;
    if (!["mix", "sr-ru", "ru-sr"].includes(s.direction)) s.direction = "mix";
    if (!["cyr", "lat", "both"].includes(s.script)) s.script = "cyr";
    s.newLimit = [0, 10, 20, 30, 50].includes(Number(s.newLimit)) ? Number(s.newLimit) : 20;
    if (typeof s.type !== "string") s.type = "all";
    return s;
  }

  removeOldAppData();
  let progress = sanitizeProgress(readJSON(STORAGE_KEY, {}));
  let settings = normalizeSettings(readJSON(SETTINGS_KEY, {}));
  let queue = [];
  let queueIndex = 0;
  let current = null;
  let currentDirection = "sr-ru";
  let revealed = false;

  function save() {
    writeJSON(STORAGE_KEY, progress);
    writeJSON(SETTINGS_KEY, settings);
  }

  // ---------- Отбор карточек ----------
  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  const lessonMatches = card => settings.lesson === "all" || card.lesson === settings.lesson;
  const cardsForLesson = () => CARDS.filter(lessonMatches);
  const cardsForDeck = () => cardsForLesson().filter(card => card.deck === settings.deck);

  function isDue(item, now) { return Boolean(item) && (item.due || 0) <= now; }
  function isLearned(item) { return Boolean(item) && (item.level || 0) >= 3; }
  function isHard(item) { return Boolean(item) && (item.lapses || 0) > 0 && !isLearned(item); }

  function filteredCards() {
    const now = Date.now();
    const pool = cardsForDeck().filter(card => settings.type === "all" || card.type === settings.type);
    const p = card => progress[card.id];
    switch (settings.mode) {
      case "new": return pool.filter(card => !p(card));
      case "due": return shuffle(pool.filter(card => isDue(p(card), now)));
      case "hard": return shuffle(pool.filter(card => isHard(p(card))));
      case "learned": return shuffle(pool.filter(card => isLearned(p(card))));
      case "all": return shuffle(pool);
      default: {
        const due = shuffle(pool.filter(card => isDue(p(card), now)));
        const fresh = pool.filter(card => !p(card)); // новые — в порядке учебника
        return due.concat(settings.newLimit ? fresh.slice(0, settings.newLimit) : fresh);
      }
    }
  }

  function buildQueue() {
    queue = filteredCards();
    queueIndex = 0;
    renderCurrent();
    renderStats();
  }

  // ---------- Показ карточки ----------
  const isForm = card => typeof card.ans === "string";
  const keepsCyrillic = card => card.type === "letter" || card.script === "cyr";

  function chooseDirection(card) {
    if (isForm(card)) return "form";
    if (card.deck === "reading" || !card.ru) return "sr-ru";
    if (settings.direction !== "mix") return settings.direction;
    return Math.random() < .5 ? "sr-ru" : "ru-sr";
  }

  // Сербский текст в выбранном письме: [основной, дополнительный]
  function serbian(card, text) {
    if (!text) return ["", ""];
    if (keepsCyrillic(card)) return [text, ""];
    if (card.script === "lat") return [toLatin(text), settings.script === "both" ? text : ""];
    if (settings.script === "lat") return [toLatin(text), ""];
    if (settings.script === "both") {
      const lat = toLatin(text);
      return [text, lat !== text ? lat : ""];
    }
    return [text, ""];
  }

  function setText(main, alt, [text, altText]) {
    main.textContent = text;
    alt.textContent = altText;
    alt.hidden = !altText;
  }
  function setOptional(element, value) {
    element.textContent = value || "";
    element.hidden = !value;
  }

  function renderCurrent() {
    current = queue[queueIndex] || null;
    revealed = false;
    els.answerSide.hidden = true;
    els.ratings.hidden = true;
    els.reveal.hidden = false;

    if (!current) {
      els.trainer.hidden = true;
      els.empty.hidden = false;
      const total = cardsForDeck().length;
      els.emptyTitle.textContent = total ? "В этой подборке всё готово" : "В этом уроке нет карточек этой колоды";
      els.emptyText.textContent = total
        ? (settings.mode === "smart" ? "На сегодня повторение закончено. Можно взять ещё новые карточки или выбрать другую колоду." : "Выберите другой режим или колоду.")
        : "Выберите другую колоду или урок.";
      els.showAll.hidden = !total;
      return;
    }

    els.trainer.hidden = false;
    els.empty.hidden = true;
    currentDirection = chooseDirection(current);
    const card = current;

    if (currentDirection === "form") {
      els.promptLabel.textContent = card.hint || card.section;
      setText(els.promptText, els.promptAlt, serbian(card, card.sr));
      els.answerLabel.textContent = "Ответ";
      setText(els.answerText, els.answerAlt, serbian(card, card.ans));
    } else if (currentDirection === "sr-ru") {
      els.promptLabel.textContent = card.type === "letter" ? "Кириллица" : "По-сербски";
      setText(els.promptText, els.promptAlt, serbian(card, card.sr));
      els.answerLabel.textContent = card.type === "letter" ? "Латиница и произношение" : "По-русски";
      setText(els.answerText, els.answerAlt, [card.ru || "", ""]);
    } else {
      els.promptLabel.textContent = "По-русски";
      setText(els.promptText, els.promptAlt, [card.ru, ""]);
      els.answerLabel.textContent = "По-сербски";
      setText(els.answerText, els.answerAlt, serbian(card, card.sr));
    }

    const formsParts = [];
    if (card.g) formsParts.push(genderNames[card.g] || card.g);
    if (card.forms) formsParts.push(serbian(card, card.forms)[0]);
    setOptional(els.forms, formsParts.join(" · "));
    const extraRu = currentDirection === "form" && card.ru ? `Перевод: ${card.ru}` : "";
    setOptional(els.variants, card.variants ? `Также: ${serbian(card, card.variants)[0]}` : extraRu);
    setOptional(els.note, card.note || "");

    els.cardType.textContent = typeNames[card.type] || card.type;
    els.cardSection.textContent = card.section;
    els.cardPage.textContent = `урок ${card.lesson} · стр. ${card.page}`;
    els.speak.hidden = currentDirection === "ru-sr";
    els.progressFill.style.width = `${queue.length ? ((queueIndex + 1) / queue.length) * 100 : 0}%`;
    els.flashcard.setAttribute("aria-label", "Учебная карточка. Нажмите, чтобы показать ответ");
  }

  function revealAnswer() {
    if (!current || revealed) return;
    revealed = true;
    els.answerSide.hidden = false;
    els.reveal.hidden = true;
    els.ratings.hidden = false;
    els.speak.hidden = false;
    els.flashcard.setAttribute("aria-label", "Ответ показан");
  }

  // ---------- Интервальное повторение ----------
  function rate(value) {
    if (!current || !revealed) return;
    const old = progress[current.id] || { level: 0, lapses: 0 };
    const now = Date.now();
    let level = old.level || 0;
    let lapses = old.lapses || 0;
    let due;

    if (value === "again") {
      level = Math.max(0, level - 1);
      lapses += 1;
      due = now + 5 * 60 * 1000;
      // ещё раз показать в этой же тренировке, через несколько карточек
      const pos = Math.min(queue.length, queueIndex + 1 + 5);
      queue.splice(pos, 0, current);
    } else if (value === "hard") {
      level = Math.max(1, level);
      due = now + 12 * 60 * 60 * 1000;
    } else {
      level += 1;
      due = now + INTERVALS[Math.min(level - 1, INTERVALS.length - 1)] * DAY;
    }

    progress[current.id] = { level, lapses, due, last: now };
    save();
    queueIndex += 1;
    renderCurrent();
    renderStats();
  }

  // ---------- Произношение ----------
  let voices = [];
  function loadVoices() {
    if (window.speechSynthesis) voices = window.speechSynthesis.getVoices();
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
  }
  function cleanForSpeech(text) {
    return text
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/\s*\/\s*/g, ", ")
      .replace(/[()„“”"«»*]/g, "")
      .replace(/_{2,}/g, " ");
  }
  function speak() {
    if (!current || !window.speechSynthesis) return;
    let text = current.tts;
    if (!text) {
      if (currentDirection === "form") text = revealed ? current.ans : current.sr;
      else text = current.sr;
    }
    if (current.type === "letter") text = current.tts || current.sr;
    window.speechSynthesis.cancel();
    const sr = voices.find(v => /^sr([-_]|$)/i.test(v.lang));
    const near = voices.find(v => /^(hr|bs)([-_]|$)/i.test(v.lang));
    const utterance = new SpeechSynthesisUtterance(cleanForSpeech(sr || !near ? text : toLatin(text)));
    utterance.lang = sr ? sr.lang : near ? near.lang : "sr-RS";
    utterance.voice = sr || near || null;
    utterance.rate = .85;
    window.speechSynthesis.speak(utterance);
  }

  // ---------- Статистика и интерфейс ----------
  function renderStats() {
    const now = Date.now();
    const counts = { new: 0, due: 0, hard: 0, learned: 0 };
    cardsForDeck().forEach(card => {
      const item = progress[card.id];
      if (!item) { counts.new += 1; return; }
      if (isDue(item, now)) counts.due += 1;
      if (isHard(item)) counts.hard += 1;
      if (isLearned(item)) counts.learned += 1;
    });
    els.statNew.textContent = counts.new;
    els.statDue.textContent = counts.due;
    els.statHard.textContent = counts.hard;
    els.statLearned.textContent = counts.learned;
    els.todayMessage.textContent = counts.due
      ? `${counts.due} ${plural(counts.due, "карточка ждёт", "карточки ждут", "карточек ждут")} повторения`
      : counts.new ? "Можно взять новые карточки" : "На сегодня всё повторено";
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function refreshDeckCounts() {
    const selected = cardsForLesson();
    document.querySelectorAll("[data-count]").forEach(el => {
      el.textContent = selected.filter(card => card.deck === el.dataset.count).length;
    });
  }

  function refreshTypeOptions() {
    const types = [...new Set(cardsForDeck().map(card => card.type))];
    els.typeFilter.innerHTML = '<option value="all">Все типы</option>' +
      types.map(type => `<option value="${type}">${typeNames[type] || type}</option>`).join("");
    if (!types.includes(settings.type)) settings.type = "all";
    els.typeFilter.value = settings.type;
  }

  function lessonLabel(lesson) {
    return lesson === 0 ? "Вводный урок" : `Урок ${lesson}`;
  }

  function updateLessonUI() {
    if (settings.lesson === "all") {
      els.appTitle.textContent = "Все уроки · общее повторение";
      els.sourceNote.textContent = `Ю. Шапич, «Говори српски да те цео свет разуме» (2022), уроки ${LESSON_IDS[0]}–${LESSON_IDS.at(-1)}. Переводы на русский составлены для тренажёра. Прогресс хранится на этом устройстве.`;
      els.reset.textContent = "Сбросить прогресс всех уроков";
      document.title = "Говори српски — все уроки";
      return;
    }
    const lesson = LESSONS[settings.lesson] || {};
    const [title] = serbian({}, lesson.title || "");
    els.appTitle.textContent = `${lessonLabel(settings.lesson)} · ${title}`;
    els.sourceNote.textContent = `${lesson.topic || ""}. Страницы учебника ${lesson.pages || "—"}. Переводы на русский составлены для тренажёра. Прогресс хранится на этом устройстве.`;
    els.reset.textContent = `Сбросить прогресс: ${lessonLabel(settings.lesson).toLowerCase()}`;
    document.title = `Говори српски — ${lessonLabel(settings.lesson).toLowerCase()}`;
  }

  function populateLessons() {
    const options = LESSON_IDS.map(lesson => {
      const [title] = serbian({}, LESSONS[lesson]?.title || "");
      return `<option value="${lesson}">${lessonLabel(lesson)} · ${title}</option>`;
    });
    if (LESSON_IDS.length > 1) options.push('<option value="all">Все уроки</option>');
    els.lessonSelect.innerHTML = options.join("");
    els.lessonSelect.value = String(settings.lesson);
  }

  function updateScriptUI() {
    document.querySelectorAll("[data-script]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.script === settings.script);
    });
    els.scriptButton.textContent = settings.script === "lat" ? "Ć" : settings.script === "both" ? "Ћ/Ć" : "Ћ";
  }

  function setLesson(value) {
    settings.lesson = normalizeLesson(value);
    els.lessonSelect.value = String(settings.lesson);
    updateLessonUI();
    refreshDeckCounts();
    refreshTypeOptions();
    save();
    buildQueue();
  }
  function setDeck(deck) {
    settings.deck = Object.hasOwn(deckNames, deck) ? deck : "words";
    document.querySelectorAll(".deck-tab").forEach(button => {
      button.classList.toggle("is-active", button.dataset.deck === settings.deck);
    });
    refreshTypeOptions();
    save();
    buildQueue();
  }
  function setScript(script) {
    settings.script = ["cyr", "lat", "both"].includes(script) ? script : "cyr";
    save();
    updateScriptUI();
    populateLessons();
    updateLessonUI();
    if (current) {
      const keepRevealed = revealed;
      queueIndex = Math.max(0, queue.indexOf(current));
      renderCurrent();
      if (keepRevealed) revealAnswer();
    }
  }

  function resetProgress() {
    const scope = settings.lesson === "all" ? "по всем урокам" : `«${lessonLabel(settings.lesson)}» (все колоды)`;
    if (!confirm(`Сбросить прогресс ${scope}? Эти карточки снова станут новыми.`)) return;
    cardsForLesson().forEach(card => delete progress[card.id]);
    save();
    buildQueue();
  }

  // ---------- Экспорт / импорт ----------
  function exportProgress() {
    const data = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      progress,
      settings
    };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `govori-srpski-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch {
        alert("Не удалось прочитать файл: это не JSON.");
        return;
      }
      if (!isRecord(data) || data.format !== EXPORT_FORMAT || !isRecord(data.progress)) {
        alert("Это не файл прогресса тренажёра «Говори српски».");
        return;
      }
      const incoming = sanitizeProgress(data.progress);
      const known = new Set(CARDS.map(card => card.id));
      const count = Object.keys(incoming).filter(id => known.has(id)).length;
      const date = data.exportedAt ? new Date(data.exportedAt).toLocaleString("ru-RU") : "неизвестно";
      const ok = confirm(`Файл от ${date}: ${count} карточек с прогрессом.\n\nЗаменить текущий прогресс на этом устройстве прогрессом из файла?`);
      if (!ok) return;
      progress = incoming;
      if (isRecord(data.settings)) {
        settings = normalizeSettings(Object.assign({}, data.settings, { lesson: settings.lesson, deck: settings.deck }));
      }
      save();
      startUI();
      alert("Прогресс загружен.");
    };
    reader.readAsText(file);
  }

  // ---------- События ----------
  document.querySelectorAll(".deck-tab").forEach(button => {
    button.addEventListener("click", () => setDeck(button.dataset.deck));
  });
  els.lessonSelect.addEventListener("change", () => setLesson(els.lessonSelect.value));
  els.studyMode.addEventListener("change", () => { settings.mode = els.studyMode.value; save(); buildQueue(); });
  els.typeFilter.addEventListener("change", () => { settings.type = els.typeFilter.value; save(); buildQueue(); });
  els.direction.addEventListener("change", () => { settings.direction = els.direction.value; save(); buildQueue(); });
  els.newLimit.addEventListener("change", () => { settings.newLimit = Number(els.newLimit.value); save(); buildQueue(); });
  els.reveal.addEventListener("click", revealAnswer);
  els.flashcard.addEventListener("click", revealAnswer);
  els.flashcard.addEventListener("keydown", event => { if (event.key === "Enter") revealAnswer(); });
  els.speak.addEventListener("click", event => { event.stopPropagation(); speak(); });
  els.ratings.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => rate(button.dataset.rating));
  });
  els.showAll.addEventListener("click", () => {
    settings.mode = "all";
    els.studyMode.value = "all";
    save();
    buildQueue();
  });
  els.menuButton.addEventListener("click", () => {
    const open = els.menuPanel.hidden;
    els.menuPanel.hidden = !open;
    els.menuButton.setAttribute("aria-expanded", String(open));
  });
  els.scriptButton.addEventListener("click", () => {
    setScript({ cyr: "lat", lat: "both", both: "cyr" }[settings.script]);
  });
  document.querySelectorAll("[data-script]").forEach(button => {
    button.addEventListener("click", () => setScript(button.dataset.script));
  });
  els.exportButton.addEventListener("click", exportProgress);
  els.importButton.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", () => {
    const file = els.importFile.files?.[0];
    if (file) importProgress(file);
    els.importFile.value = "";
  });
  els.reset.addEventListener("click", resetProgress);

  document.addEventListener("keydown", event => {
    if (["SELECT", "INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (!els.menuPanel.hidden && els.menuPanel.contains(document.activeElement)) return;
    if (event.code === "Space") {
      event.preventDefault();
      revealAnswer();
    }
    if (revealed && event.key === "1") rate("again");
    if (revealed && event.key === "2") rate("hard");
    if (revealed && event.key === "3") rate("know");
  });

  function startUI() {
    populateLessons();
    els.studyMode.value = settings.mode;
    els.direction.value = settings.direction;
    els.newLimit.value = String(settings.newLimit);
    updateScriptUI();
    updateLessonUI();
    refreshDeckCounts();
    setDeck(settings.deck);
  }
  startUI();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
    });
  }

  // Для отладки и тестов
  window.__gs = { toLatin, CARDS };
})();
