(() => {
  "use strict";

  const STORAGE_KEY = "serbianTrainer.lesson1.progress.v2";
  const SETTINGS_KEY = "serbianTrainer.lesson1.settings.v2";
  const WORDS = Array.isArray(window.WORDS) ? window.WORDS : [];
  const DAY = 24 * 60 * 60 * 1000;

  const deckNames = { main: "Основное", grammar: "Грамматика", reading: "Чтение" };
  const typeNames = {
    word: "Слово", expression: "Выражение", phrase: "Фраза", question: "Вопрос",
    answer: "Ответ", dialogue: "Диалог", grammar: "Грамматика", letter: "Буква"
  };

  const els = {
    trainer: document.querySelector(".trainer"), empty: document.querySelector("#emptyState"),
    flashcard: document.querySelector("#flashcard"), answerSide: document.querySelector("#answerSide"),
    reveal: document.querySelector("#revealButton"), ratings: document.querySelector("#ratingButtons"),
    promptText: document.querySelector("#promptText"), answerText: document.querySelector("#answerText"),
    promptLabel: document.querySelector("#promptLabel"), answerLabel: document.querySelector("#answerLabel"),
    variants: document.querySelector("#variants"), note: document.querySelector("#note"),
    cardType: document.querySelector("#cardType"), cardSection: document.querySelector("#cardSection"),
    cardPage: document.querySelector("#cardPage"), speak: document.querySelector("#speakButton"),
    studyMode: document.querySelector("#studyMode"), typeFilter: document.querySelector("#typeFilter"),
    direction: document.querySelector("#direction"), progressFill: document.querySelector("#progressFill"),
    reset: document.querySelector("#resetButton"), showAll: document.querySelector("#showAllButton"),
    statNew: document.querySelector("#statNew"), statDue: document.querySelector("#statDue"),
    statHard: document.querySelector("#statHard"), statLearned: document.querySelector("#statLearned"),
    todayMessage: document.querySelector("#todayMessage")
  };

  let progress = loadJSON(STORAGE_KEY, {});
  let settings = Object.assign({ deck: "main", mode: "all", type: "all", direction: "mix" }, loadJSON(SETTINGS_KEY, {}));
  let queue = [];
  let queueIndex = 0;
  let current = null;
  let currentDirection = "sr-ru";
  let revealed = false;

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function statusOf(card) {
    const item = progress[card.id];
    if (!item) return "new";
    if ((item.level || 0) >= 3) return "learned";
    if ((item.lapses || 0) > 0) return "hard";
    if ((item.due || 0) <= Date.now()) return "due";
    return "learning";
  }

  function matchesMode(card) {
    const item = progress[card.id];
    const status = statusOf(card);
    if (settings.mode === "all") return true;
    if (settings.mode === "new") return !item;
    if (settings.mode === "due") return Boolean(item) && (item.due || 0) <= Date.now();
    if (settings.mode === "hard") return status === "hard";
    if (settings.mode === "learned") return status === "learned";
    return true;
  }

  function filteredCards() {
    return WORDS.filter(card => card.lesson === 1 && card.deck === settings.deck)
      .filter(card => settings.type === "all" || card.type === settings.type)
      .filter(matchesMode);
  }

  function buildQueue() {
    queue = shuffle(filteredCards());
    queueIndex = 0;
    renderCurrent();
    renderStats();
  }

  function chooseDirection(card) {
    if (card.deck === "reading" && settings.direction === "mix") return "sr-ru";
    if (settings.direction !== "mix") return settings.direction;
    return Math.random() < .5 ? "sr-ru" : "ru-sr";
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
      return;
    }

    els.trainer.hidden = false;
    els.empty.hidden = true;
    currentDirection = chooseDirection(current);
    const forward = currentDirection === "sr-ru";
    els.promptText.textContent = forward ? current.sr : current.ru;
    els.answerText.textContent = forward ? current.ru : current.sr;
    els.promptLabel.textContent = forward ? "По-сербски" : "По-русски";
    els.answerLabel.textContent = forward ? "По-русски" : "По-сербски";
    els.cardType.textContent = typeNames[current.type] || current.type;
    els.cardSection.textContent = current.section;
    els.cardPage.textContent = `стр. ${current.page}`;
    setOptional(els.variants, current.variants ? `Также: ${current.variants}` : "");
    setOptional(els.note, current.note || "");
    els.speak.hidden = false;
    els.progressFill.style.width = `${queue.length ? ((queueIndex + 1) / queue.length) * 100 : 0}%`;
    els.flashcard.setAttribute("aria-label", "Учебная карточка. Нажмите, чтобы показать ответ");
  }

  function setOptional(element, value) {
    element.textContent = value;
    element.hidden = !value;
  }

  function revealAnswer() {
    if (!current || revealed) return;
    revealed = true;
    els.answerSide.hidden = false;
    els.reveal.hidden = true;
    els.ratings.hidden = false;
    els.flashcard.setAttribute("aria-label", "Ответ показан");
  }

  function rate(value) {
    if (!current || !revealed) return;
    const old = progress[current.id] || { level: 0, lapses: 0 };
    const now = Date.now();
    let level = old.level || 0;
    let due = now;
    let lapses = old.lapses || 0;

    if (value === "again") {
      level = Math.max(0, level - 1);
      lapses += 1;
      due = now + 5 * 60 * 1000;
    } else if (value === "hard") {
      level = Math.max(1, level);
      due = now + 12 * 60 * 60 * 1000;
    } else {
      const intervals = [1, 3, 7, 14, 30, 90];
      level += 1;
      due = now + intervals[Math.min(level - 1, intervals.length - 1)] * DAY;
    }

    progress[current.id] = { level, lapses, due, last: now };
    save();
    queueIndex += 1;
    if (queueIndex >= queue.length) queue = [];
    renderCurrent();
    renderStats();
  }

  function speak() {
    if (!current || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const text = current.tts || current.sr.replace(/\s*[—–].*$/, "").replace(/\s*\/\s*/g, ", ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sr-RS";
    utterance.rate = .82;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(v => /^sr([-_]|$)/i.test(v.lang)) || null;
    window.speechSynthesis.speak(utterance);
  }

  function renderStats() {
    const all = WORDS.filter(card => card.lesson === 1);
    const counts = { new: 0, due: 0, hard: 0, learned: 0 };
    all.forEach(card => {
      const item = progress[card.id];
      if (!item) counts.new += 1;
      else {
        if ((item.due || 0) <= Date.now()) counts.due += 1;
        if ((item.lapses || 0) > 0 && (item.level || 0) < 3) counts.hard += 1;
        if ((item.level || 0) >= 3) counts.learned += 1;
      }
    });
    els.statNew.textContent = counts.new;
    els.statDue.textContent = counts.due;
    els.statHard.textContent = counts.hard;
    els.statLearned.textContent = counts.learned;
    els.todayMessage.textContent = counts.due ? `${counts.due} карточек ждут повторения` : counts.new ? "Можно взять несколько новых карточек" : "На сегодня всё повторено";
  }

  function refreshTypeOptions() {
    const types = [...new Set(WORDS.filter(card => card.deck === settings.deck).map(card => card.type))];
    const previous = settings.type;
    els.typeFilter.innerHTML = '<option value="all">Все типы</option>' + types.map(type => `<option value="${type}">${typeNames[type] || type}</option>`).join("");
    settings.type = types.includes(previous) ? previous : "all";
    els.typeFilter.value = settings.type;
  }

  function setDeck(deck) {
    settings.deck = deck;
    document.querySelectorAll(".deck-tab").forEach(button => button.classList.toggle("is-active", button.dataset.deck === deck));
    refreshTypeOptions();
    save();
    buildQueue();
  }

  function resetProgress() {
    if (!confirm("Сбросить весь прогресс урока 1? Карточки снова станут новыми.")) return;
    progress = {};
    save();
    buildQueue();
  }

  document.querySelectorAll(".deck-tab").forEach(button => button.addEventListener("click", () => setDeck(button.dataset.deck)));
  els.studyMode.addEventListener("change", () => { settings.mode = els.studyMode.value; save(); buildQueue(); });
  els.typeFilter.addEventListener("change", () => { settings.type = els.typeFilter.value; save(); buildQueue(); });
  els.direction.addEventListener("change", () => { settings.direction = els.direction.value; save(); buildQueue(); });
  els.reveal.addEventListener("click", revealAnswer);
  els.flashcard.addEventListener("click", revealAnswer);
  els.flashcard.addEventListener("keydown", event => { if (event.key === "Enter") revealAnswer(); });
  els.speak.addEventListener("click", event => { event.stopPropagation(); speak(); });
  els.ratings.querySelectorAll("button").forEach(button => button.addEventListener("click", () => rate(button.dataset.rating)));
  els.reset.addEventListener("click", resetProgress);
  els.showAll.addEventListener("click", () => { settings.mode = "all"; els.studyMode.value = "all"; save(); buildQueue(); });

  document.addEventListener("keydown", event => {
    if (["SELECT", "INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.code === "Space") { event.preventDefault(); revealAnswer(); }
    if (revealed && event.key === "1") rate("again");
    if (revealed && event.key === "2") rate("hard");
    if (revealed && event.key === "3") rate("know");
  });

  document.querySelector("#countMain").textContent = WORDS.filter(x => x.deck === "main").length;
  document.querySelector("#countGrammar").textContent = WORDS.filter(x => x.deck === "grammar").length;
  document.querySelector("#countReading").textContent = WORDS.filter(x => x.deck === "reading").length;
  els.studyMode.value = settings.mode;
  els.direction.value = settings.direction;
  refreshTypeOptions();
  setDeck(settings.deck);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
