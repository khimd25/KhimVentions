/* ============================================================
   KhimVentions — an ADHD-friendly tracker
   Vanilla JS, no build step, data lives in localStorage.
   ============================================================ */

const KV = (() => {
  const PREFIX = 'kv.';
  const get = (k, def) => {
    try { const v = localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : def; }
    catch { return def; }
  };
  const set = (k, v) => localStorage.setItem(PREFIX + k, JSON.stringify(v));
  const del = (k) => localStorage.removeItem(PREFIX + k);
  return { get, set, del, PREFIX };
})();

/* ---------- date helpers ---------- */
const fmtDay = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoWeek = (d = new Date()) => {
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  return t.getFullYear() + '-W' + String(1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)).padStart(2, '0');
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- default seed (built from Khim's own list) ---------- */
const DEFAULT_HABITS = [
  { id: uid(), name: 'Take meds',     emoji: '💊', freq: 'daily',  reminder: '09:00', category: 'health' },
  { id: uid(), name: 'Vitamins',      emoji: '🌿', freq: 'daily',  reminder: '09:00', category: 'health' },
  { id: uid(), name: 'Work out',      emoji: '🏋️', freq: 'daily',  reminder: '17:30', category: 'body' },
  { id: uid(), name: 'Cat bonding',   emoji: '🐱', freq: 'daily',  reminder: '20:00', category: 'connection' },
  { id: uid(), name: 'Tidy one thing',emoji: '🧹', freq: 'daily',  reminder: null,    category: 'home' },
  { id: uid(), name: 'Meal prep',     emoji: '🍱', freq: 'weekly', reminder: '11:00', category: 'home' },
];
const DEFAULT_TASKS = [
  { id: uid(), title: 'Message people back', type: 'errand', done: false, createdAt: Date.now() },
];

/* ---------- state ---------- */
let habits, tasks, logs, meta, people;

function load() {
  if (!KV.get('seeded')) {
    KV.set('habits', DEFAULT_HABITS);
    KV.set('tasks', DEFAULT_TASKS);
    KV.set('logs', {});
    KV.set('meta', { notifsEnabled: false });
    KV.set('people', []);
    KV.set('seeded', true);
  }
  habits = KV.get('habits', []);
  tasks = KV.get('tasks', []);
  logs = KV.get('logs', {});
  meta = KV.get('meta', { notifsEnabled: false });
  people = KV.get('people', []); // added after v1, so default safely for existing users
}
const saveHabits = () => KV.set('habits', habits);
const saveTasks = () => KV.set('tasks', tasks);
const saveLogs = () => KV.set('logs', logs);
const saveMeta = () => KV.set('meta', meta);
const savePeople = () => KV.set('people', people);

/* ---------- people / reply launcher ---------- */
const CHANNELS = {
  sms:      { label: 'Text',     icon: '💬', handleLabel: 'Phone number',     ph: '+1 555 123 4567' },
  call:     { label: 'Call',     icon: '📞', handleLabel: 'Phone number',     ph: '+1 555 123 4567' },
  whatsapp: { label: 'WhatsApp', icon: '🟢', handleLabel: 'Phone (with country code)', ph: '+1 555 123 4567' },
  email:    { label: 'Email',    icon: '✉️', handleLabel: 'Email address',    ph: 'name@email.com' },
  telegram: { label: 'Telegram', icon: '✈️', handleLabel: 'Username',         ph: '@username' },
};
function contactLink(p) {
  const h = (p.handle || '').trim();
  const digits = h.replace(/[^0-9+]/g, '');
  switch (p.channel) {
    case 'sms':      return 'sms:' + digits;
    case 'call':     return 'tel:' + digits;
    case 'whatsapp': return 'https://wa.me/' + digits.replace(/[^0-9]/g, '');
    case 'email':    return 'mailto:' + h;
    case 'telegram': return 'https://t.me/' + h.replace(/^@/, '');
    default:         return '#';
  }
}
function relTime(ts) {
  if (!ts) return 'never reached out';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 14) return 'last week';
  return Math.floor(days / 7) + ' weeks ago';
}
function openContact(p) {
  const link = contactLink(p);
  // mark as handled the moment you reach out — that's the win
  p.owe = false;
  p.lastContacted = Date.now();
  savePeople();
  // sms/tel/mailto navigate in place; web links open a new tab
  if (/^https?:/.test(link)) window.open(link, '_blank');
  else window.location.href = link;
  renderPeople(); renderToday();
  toast(`Opening ${CHANNELS[p.channel].label.toLowerCase()} to ${p.name} ✨`);
}

/* ---------- completion logic ---------- */
const todayKey = () => fmtDay();
function isDoneToday(habit) {
  if (habit.freq === 'weekly') {
    // done if completed any day in the current ISO week
    const wk = isoWeek();
    return Object.keys(logs).some(day =>
      isoWeek(parseDay(day)) === wk && (logs[day] || []).includes(habit.id));
  }
  return (logs[todayKey()] || []).includes(habit.id);
}
function toggleHabit(habit) {
  const k = todayKey();
  logs[k] = logs[k] || [];
  const wasDone = isDoneToday(habit);
  if (habit.freq === 'weekly') {
    // toggle off: remove from all days this week; on: add to today
    if (wasDone) {
      const wk = isoWeek();
      for (const day of Object.keys(logs)) {
        if (isoWeek(parseDay(day)) === wk) logs[day] = logs[day].filter(id => id !== habit.id);
      }
    } else { logs[k].push(habit.id); }
  } else {
    if (wasDone) logs[k] = logs[k].filter(id => id !== habit.id);
    else logs[k].push(habit.id);
  }
  saveLogs();
  return !wasDone; // returns true if now done
}

/* streak = consecutive days (ending today or yesterday) the daily habit was done */
function streakFor(habit) {
  if (habit.freq !== 'daily') return 0;
  let streak = 0;
  const d = new Date();
  // allow today to be incomplete without breaking yesterday's streak
  if (!(logs[fmtDay(d)] || []).includes(habit.id)) d.setDate(d.getDate() - 1);
  while ((logs[fmtDay(d)] || []).includes(habit.id)) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ---------- category color ---------- */
const CAT_COLOR = { health: 'var(--health)', body: 'var(--body)', home: 'var(--home)', connection: 'var(--connection)', other: 'var(--other)' };

/* ============================================================
   RENDERING
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function habitCard(habit) {
  const done = isDoneToday(habit);
  const streak = streakFor(habit);
  const el = document.createElement('div');
  el.className = 'card' + (done ? ' done' : '');
  const meta = [];
  if (habit.reminder) meta.push(`<span>⏰ ${habit.reminder}</span>`);
  if (streak > 0) meta.push(`<span class="streak">🔥 ${streak} day${streak > 1 ? 's' : ''}</span>`);
  el.innerHTML = `
    <span class="card-emoji">${habit.emoji || '•'}</span>
    <div class="card-body">
      <div class="card-name">${escapeHtml(habit.name)}</div>
      ${meta.length ? `<div class="card-meta">
        <span class="cat-dot" style="background:${CAT_COLOR[habit.category] || 'var(--other)'}"></span>
        ${meta.join('')}</div>` : ''}
    </div>
    <span class="check">✓</span>`;
  el.addEventListener('click', () => {
    const nowDone = toggleHabit(habit);
    if (nowDone) { burstConfetti(el); haptic(); }
    renderToday();
  });
  return el;
}

function taskCard(task) {
  const el = document.createElement('div');
  el.className = 'card' + (task.done ? ' done' : '');
  el.innerHTML = `
    <span class="check">✓</span>
    <div class="card-body"><div class="card-name">${escapeHtml(task.title)}</div></div>
    <button class="card-edit" title="Remove">🗑️</button>`;
  $('.check', el).parentElement.addEventListener('click', (e) => {
    if (e.target.closest('.card-edit')) return;
    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : null;
    saveTasks();
    if (task.done) { burstConfetti(el); haptic(); toast('Nice. One less thing. ✨'); }
    renderLists(); renderToday();
  });
  $('.card-edit', el).addEventListener('click', () => {
    tasks = tasks.filter(t => t.id !== task.id); saveTasks(); renderLists(); renderToday();
  });
  return el;
}

function personCard(p, compact = false) {
  const ch = CHANNELS[p.channel] || CHANNELS.sms;
  const el = document.createElement('div');
  el.className = 'card person-card' + (p.owe ? ' owe' : '');
  const sub = p.owe
    ? `<span class="owe-badge">needs a reply</span>`
    : `<span class="last-contact ${(!p.lastContacted || Date.now() - p.lastContacted > 6048e5) ? 'stale' : ''}">reached out ${relTime(p.lastContacted)}</span>`;
  el.innerHTML = `
    <span class="card-emoji">${p.emoji || '🙂'}</span>
    <div class="card-body">
      <div class="card-name">${escapeHtml(p.name)}</div>
      <div class="card-meta">${sub}${p.note ? `<span>📝 ${escapeHtml(p.note)}</span>` : ''}</div>
    </div>
    <div class="person-actions">
      ${compact ? '' : `<button class="owe-toggle" title="Toggle 'needs a reply'">${p.owe ? '🔕' : '🔔'}</button>`}
      <button class="contact-btn">${ch.icon} ${ch.label}</button>
    </div>`;
  $('.contact-btn', el).addEventListener('click', (e) => { e.stopPropagation(); openContact(p); });
  if (!compact) {
    $('.owe-toggle', el).addEventListener('click', (e) => {
      e.stopPropagation(); p.owe = !p.owe; savePeople(); renderPeople(); renderToday();
    });
    el.addEventListener('click', () => openPersonModal(p));
  }
  return el;
}

function renderPeople() {
  const list = $('#peopleList');
  if (!list) return;
  // owe-a-reply first, then by longest-since-contact
  const sorted = [...people].sort((a, b) =>
    (b.owe - a.owe) || ((a.lastContacted || 0) - (b.lastContacted || 0)));
  list.innerHTML = '';
  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty">Add the people you keep meaning to text back. One tap = chat opens, already addressed. 💬</div>';
  } else {
    sorted.forEach(p => list.appendChild(personCard(p)));
  }
}

function renderToday() {
  const dailies = habits.filter(h => h.freq === 'daily');
  const weeklies = habits.filter(h => h.freq === 'weekly');

  const dl = $('#dailyList'); dl.innerHTML = '';
  dailies.forEach(h => dl.appendChild(habitCard(h)));
  $('#dailyBlock').hidden = dailies.length === 0;

  const wl = $('#weeklyList'); wl.innerHTML = '';
  weeklies.forEach(h => wl.appendChild(habitCard(h)));
  $('#weeklyBlock').hidden = weeklies.length === 0;

  // people who need a reply
  const owed = people.filter(p => p.owe);
  const rl = $('#replyList'); rl.innerHTML = '';
  owed.forEach(p => rl.appendChild(personCard(p, true)));
  $('#replyBlock').hidden = owed.length === 0;
  $('#replyCount').textContent = owed.length;

  const openTasks = tasks.filter(t => !t.done);
  const tel = $('#todayErrandsList'); tel.innerHTML = '';
  if (openTasks.length === 0) {
    tel.innerHTML = '<div class="empty">Nothing pending. Inbox zero brain. 🧘</div>';
  } else {
    openTasks.slice(0, 5).forEach(t => tel.appendChild(taskCard(t)));
  }

  // progress = today's daily + weekly-due
  const total = dailies.length + weeklies.length;
  const done = dailies.filter(isDoneToday).length + weeklies.filter(isDoneToday).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  setRing(pct);
  $('#progressPct').textContent = pct + '%';
  $('#progressSub').textContent = `${done}/${total} today`;
  $('#dailyCount').textContent = `${dailies.filter(isDoneToday).length}/${dailies.length}`;
  $('#weeklyCount').textContent = `${weeklies.filter(isDoneToday).length}/${weeklies.length}`;
  $('#encouragement').textContent = encourage(pct, done, total);

  scheduleReminders();
}

function setRing(pct) {
  const C = 2 * Math.PI * 52; // ~327
  const ring = $('#ringFg');
  ring.style.strokeDashoffset = C * (1 - pct / 100);
  ring.style.stroke = pct >= 100 ? 'var(--good)' : pct >= 50 ? 'var(--accent)' : 'var(--accent-2)';
}

function encourage(pct, done, total) {
  if (total === 0) return 'Add a habit on the Me tab to get rolling.';
  if (pct === 100) return "Everything done. You showed up today. 🎉";
  if (pct === 0) return "Fresh start. Pick the easiest one and tap it. 💪";
  if (pct >= 66) return "So close — finish strong. 🔥";
  if (pct >= 33) return "Good momentum. Keep stacking.";
  return "One tap and you're moving. That's the whole trick.";
}

/* ---------- Lists view ---------- */
let activeList = 'errands';
function renderLists() {
  const errands = tasks.filter(t => t.type === 'errand');
  const projects = tasks.filter(t => t.type === 'project');
  const open = arr => arr.filter(t => !t.done);
  const done = arr => arr.filter(t => t.done);

  const fill = (elId, arr, emptyMsg) => {
    const el = $('#' + elId); el.innerHTML = '';
    const list = [...open(arr), ...done(arr)];
    if (list.length === 0) { el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
    list.forEach(t => el.appendChild(taskCard(t)));
  };
  fill('errandsList', errands, 'No to-dos. Add one above. ☝️');
  fill('projectsList', projects, 'No projects yet. What do you want to nudge forward?');
  renderPeople();
}

/* ---------- Me view ---------- */
function renderMe() {
  // stats
  const dailies = habits.filter(h => h.freq === 'daily');
  const best = dailies.reduce((m, h) => Math.max(m, streakFor(h)), 0);
  const doneTasks = tasks.filter(t => t.done).length;
  const activeDays = new Set(Object.keys(logs).filter(d => (logs[d] || []).length > 0)).size;
  $('#statsRow').innerHTML = `
    <div class="stat-card"><div class="stat-num">🔥 ${best}</div><div class="stat-label">best streak</div></div>
    <div class="stat-card"><div class="stat-num">${activeDays}</div><div class="stat-label">active days</div></div>
    <div class="stat-card"><div class="stat-num">${doneTasks}</div><div class="stat-label">to-dos cleared</div></div>`;

  // heatmap last 14 days
  const hm = $('#heatmap'); hm.innerHTML = '';
  const dailyCount = dailies.length || 1;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = fmtDay(d);
    const n = (logs[k] || []).filter(id => dailies.some(h => h.id === id)).length;
    const ratio = n / dailyCount;
    let lvl = 0;
    if (ratio > 0) lvl = ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.33 ? 2 : 1;
    const cell = document.createElement('div');
    cell.className = `heat-cell l${lvl}` + (i === 0 ? ' today' : '');
    cell.textContent = d.getDate();
    hm.appendChild(cell);
  }

  // manage habits
  const mh = $('#manageHabits'); mh.innerHTML = '';
  if (habits.length === 0) mh.innerHTML = '<div class="empty">No habits yet. Tap + Add.</div>';
  habits.forEach(h => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <span class="card-emoji">${h.emoji || '•'}</span>
      <div class="card-body">
        <div class="card-name">${escapeHtml(h.name)}</div>
        <div class="card-meta">
          <span class="cat-dot" style="background:${CAT_COLOR[h.category] || 'var(--other)'}"></span>
          <span>${h.freq === 'weekly' ? 'Weekly' : 'Daily'}</span>
          ${h.reminder ? `<span>⏰ ${h.reminder}</span>` : '<span>no reminder</span>'}
        </div>
      </div>
      <button class="card-edit">✏️</button>`;
    el.addEventListener('click', () => openHabitModal(h));
    mh.appendChild(el);
  });

  // notif state
  updateNotifUI();
}

/* ============================================================
   HABIT MODAL
   ============================================================ */
let editingHabit = null;
function openHabitModal(habit) {
  editingHabit = habit || null;
  $('#habitModalTitle').textContent = habit ? 'Edit habit' : 'New habit';
  $('#habitName').value = habit?.name || '';
  $('#habitEmoji').value = habit?.emoji || '';
  $('#habitFreq').value = habit?.freq || 'daily';
  $('#habitReminder').value = habit?.reminder || '';
  $('#habitCategory').value = habit?.category || 'other';
  $('#habitDeleteBtn').hidden = !habit;
  $('#habitModal').hidden = false;
}
function closeHabitModal() { $('#habitModal').hidden = true; editingHabit = null; }
function saveHabitFromModal() {
  const name = $('#habitName').value.trim();
  if (!name) { toast('Give it a name 🙂'); return; }
  const data = {
    name,
    emoji: $('#habitEmoji').value.trim() || '✅',
    freq: $('#habitFreq').value,
    reminder: $('#habitReminder').value || null,
    category: $('#habitCategory').value,
  };
  if (editingHabit) { Object.assign(editingHabit, data); }
  else { habits.push({ id: uid(), ...data }); }
  saveHabits(); closeHabitModal(); renderMe(); renderToday();
  toast('Saved ✨');
}
function deleteHabit() {
  if (!editingHabit) return;
  habits = habits.filter(h => h.id !== editingHabit.id);
  saveHabits(); closeHabitModal(); renderMe(); renderToday();
}

/* ============================================================
   PERSON MODAL
   ============================================================ */
let editingPerson = null;
function syncHandleLabel() {
  const ch = CHANNELS[$('#personChannel').value] || CHANNELS.sms;
  $('#personHandleLabel').textContent = ch.handleLabel;
  $('#personHandle').placeholder = ch.ph;
}
function openPersonModal(person) {
  editingPerson = person || null;
  $('#personModalTitle').textContent = person ? 'Edit person' : 'Add a person';
  $('#personName').value = person?.name || '';
  $('#personEmoji').value = person?.emoji || '';
  $('#personChannel').value = person?.channel || 'sms';
  $('#personHandle').value = person?.handle || '';
  $('#personNote').value = person?.note || '';
  $('#personDeleteBtn').hidden = !person;
  syncHandleLabel();
  $('#personModal').hidden = false;
}
function closePersonModal() { $('#personModal').hidden = true; editingPerson = null; }
function savePersonFromModal() {
  const name = $('#personName').value.trim();
  const handle = $('#personHandle').value.trim();
  if (!name) { toast('Who is it? Add a name 🙂'); return; }
  if (!handle) { toast('Add a number/email so one tap can reach them.'); return; }
  const data = {
    name, handle,
    emoji: $('#personEmoji').value.trim() || '🙂',
    channel: $('#personChannel').value,
    note: $('#personNote').value.trim(),
  };
  if (editingPerson) { Object.assign(editingPerson, data); }
  else { people.push({ id: uid(), owe: true, lastContacted: null, ...data }); }
  savePeople(); closePersonModal(); renderPeople(); renderToday();
  toast('Saved ✨');
}
function deletePerson() {
  if (!editingPerson) return;
  people = people.filter(p => p.id !== editingPerson.id);
  savePeople(); closePersonModal(); renderPeople(); renderToday();
}

/* ============================================================
   BRAIN DUMP — fast capture by voice or type, lands as to-dos
   ============================================================ */
let recog = null, recording = false, dumpBase = '';

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return; // unsupported (e.g. Firefox) — graceful fallback to typing
  recog = new SR();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = navigator.language || 'en-US';

  recog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const txt = e.results[i][0].transcript.trim();
      if (e.results[i].isFinal) { if (txt) dumpBase += txt + '\n'; } // pause => new line => new to-do
      else interim += txt;
    }
    $('#dumpText').value = dumpBase + interim;
    $('#dumpText').scrollTop = $('#dumpText').scrollHeight;
  };
  recog.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      setMic(false);
      $('#micStatus').textContent = 'Mic blocked — allow microphone access in your browser settings.';
    } else if (e.error === 'no-speech' || e.error === 'aborted') {
      /* ignore — onend will handle restart while still recording */
    } else {
      setMic(false);
    }
  };
  recog.onend = () => {
    // browsers stop after silence even in continuous mode; keep going if user is still recording
    if (recording) { try { recog.start(); } catch { setMic(false); } }
  };
}

function setMic(on) {
  recording = on;
  const btn = $('#micBtn'), status = $('#micStatus');
  btn.classList.toggle('recording', on);
  status.classList.toggle('live', on);
  status.textContent = on ? '● Listening… talk freely. Pause = new item.' : 'Tap the mic and just talk';
}
function toggleVoice() {
  if (!recog) { toast('Voice input isn’t supported in this browser — type instead.'); return; }
  if (recording) { setMic(false); try { recog.stop(); } catch {} return; }
  // start fresh from whatever is already in the box
  dumpBase = $('#dumpText').value;
  if (dumpBase && !dumpBase.endsWith('\n')) dumpBase += '\n';
  setMic(true);
  try { recog.start(); } catch { /* already started */ }
}
function stopVoice() { if (recording) { setMic(false); try { recog.stop(); } catch {} } }

function openDump() {
  $('#dumpText').value = '';
  dumpBase = '';
  setMic(false);
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  $('#micBtn').disabled = !supported;
  if (!supported) $('#micStatus').textContent = 'Voice not supported here — just type below.';
  $('#dumpModal').hidden = false;
}
function closeDump() { stopVoice(); $('#dumpModal').hidden = true; }
function saveDump() {
  stopVoice();
  const text = $('#dumpText').value.trim();
  if (!text) { closeDump(); return; }
  // split on newlines so a list (typed or spoken) dumps as multiple to-dos
  let n = 0;
  text.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
    tasks.unshift({ id: uid(), title: line, type: 'errand', done: false, createdAt: Date.now() });
    n++;
  });
  saveTasks(); closeDump(); renderLists(); renderToday();
  toast(`Out of your head — ${n} ${n === 1 ? 'thing' : 'things'} captured. 🧠➡️📋`);
}

/* ============================================================
   NOTIFICATIONS / REMINDERS
   ============================================================ */
async function enableNotifs() {
  if (!('Notification' in window)) { toast('This browser has no notifications.'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    meta.notifsEnabled = true; saveMeta();
    toast('Reminders on. I’ve got your back. 🔔');
    scheduleReminders();
  } else {
    toast('Reminders blocked — enable them in browser settings.');
  }
  updateNotifUI();
}
function updateNotifUI() {
  const btn = $('#enableNotifsBtn');
  const hint = $('#notifHint');
  const supported = 'Notification' in window;
  const granted = supported && Notification.permission === 'granted' && meta.notifsEnabled;
  btn.textContent = granted ? 'Reminders are on ✓' : 'Turn on reminders';
  btn.disabled = granted;
  if (!supported) hint.textContent = 'This browser/device does not support notifications.';
  else if (granted) hint.textContent = 'You’ll get a nudge at each habit’s reminder time while the app is installed. For rock-solid reminders, add the app to your home screen.';
  else hint.textContent = 'Add a reminder time to a habit, then turn this on to get nudged.';
}

/* Schedule reminders for today's not-yet-done habits.
   Uses Notification Triggers when available (fires even when closed on Android Chrome),
   and a live setTimeout fallback while the app is open. */
const liveTimers = [];
async function scheduleReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !meta.notifsEnabled) return;
  liveTimers.forEach(clearTimeout); liveTimers.length = 0;
  const now = new Date();
  const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.ready.catch(() => null) : null;

  for (const h of habits) {
    if (!h.reminder || isDoneToday(h)) continue;
    const [hh, mm] = h.reminder.split(':').map(Number);
    const when = new Date(); when.setHours(hh, mm, 0, 0);
    if (when <= now) continue; // already passed today
    const body = `Time for: ${h.emoji || ''} ${h.name}`.trim();

    // Triggered notification (background-capable where supported)
    if (reg && 'showTrigger' in Notification.prototype && window.TimestampTrigger) {
      try {
        await reg.showNotification('KhimVentions', {
          tag: 'kv-' + h.id, body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
          showTrigger: new TimestampTrigger(when.getTime()), data: { habitId: h.id },
        });
        continue;
      } catch { /* fall through to timer */ }
    }
    // Live fallback (only while app open)
    const ms = when - now;
    if (ms < 24 * 3600 * 1000) {
      liveTimers.push(setTimeout(() => {
        if (isDoneToday(h)) return;
        if (reg) reg.showNotification('KhimVentions', { body, icon: 'icons/icon-192.png', tag: 'kv-' + h.id });
        else new Notification('KhimVentions', { body });
      }, ms));
    }
  }
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function exportData() {
  const data = { habits, tasks, logs, meta, people, exportedAt: new Date().toISOString(), app: 'KhimVentions', v: 2 };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `khimventions-backup-${fmtDay()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded 💾');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.habits) throw new Error('not a KhimVentions backup');
      habits = data.habits; tasks = data.tasks || []; logs = data.logs || {}; meta = data.meta || meta; people = data.people || [];
      saveHabits(); saveTasks(); saveLogs(); saveMeta(); savePeople();
      renderAll(); toast('Backup restored ✅');
    } catch (e) { toast('Couldn’t read that file 😕'); }
  };
  reader.readAsText(file);
}

/* ============================================================
   UI BITS — toast, confetti, haptics, nav
   ============================================================ */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}
function haptic() { if (navigator.vibrate) navigator.vibrate(12); }

function burstConfetti(originEl) {
  const canvas = $('#confetti');
  canvas.hidden = false;
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const rect = originEl.getBoundingClientRect();
  const ox = rect.left + rect.width / 2, oy = rect.top + rect.height / 2;
  const colors = ['#7c9cff', '#b48cff', '#4ade80', '#fbbf24', '#f472b6'];
  const parts = Array.from({ length: 26 }, () => ({
    x: ox, y: oy,
    vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 1.1) * 9,
    s: 4 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0],
    life: 1, rot: Math.random() * 6,
  }));
  let frame = 0;
  (function anim() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.life -= 0.02; p.rot += 0.2;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    });
    frame++;
    if (frame < 70) requestAnimationFrame(anim);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.hidden = true; }
  })();
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function switchView(name) {
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + name);
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'today') renderToday();
  if (name === 'lists') renderLists();
  if (name === 'me') renderMe();
  window.scrollTo(0, 0);
}

function greeting() {
  const h = new Date().getHours();
  const word = h < 5 ? 'Still up' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  $('#greeting').textContent = `${word}, Khim`;
  $('#todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function renderAll() { greeting(); renderToday(); renderLists(); renderMe(); }

/* ============================================================
   WIRE UP
   ============================================================ */
function init() {
  load();
  renderAll();

  // nav
  $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  // lists segmented
  $$('.seg').forEach(s => s.addEventListener('click', () => {
    activeList = s.dataset.list;
    $$('.seg').forEach(x => x.classList.toggle('active', x === s));
    $('#errandsList').hidden = activeList !== 'errands';
    $('#projectsList').hidden = activeList !== 'projects';
    $('#peoplePane').hidden = activeList !== 'people';
    // the type-and-add box only makes sense for to-dos/projects
    $('.quick-add').style.display = activeList === 'people' ? 'none' : 'flex';
  }));

  // people
  $('#addPersonBtn').addEventListener('click', () => openPersonModal(null));
  $('#personChannel').addEventListener('change', syncHandleLabel);
  $('#personSaveBtn').addEventListener('click', savePersonFromModal);
  $('#personCancelBtn').addEventListener('click', closePersonModal);
  $('#personDeleteBtn').addEventListener('click', deletePerson);
  $('#personModal').addEventListener('click', e => { if (e.target.id === 'personModal') closePersonModal(); });

  // quick add errand
  const addErrand = () => {
    const input = $('#errandInput');
    const v = input.value.trim();
    if (!v) return;
    tasks.unshift({ id: uid(), title: v, type: activeList === 'projects' ? 'project' : 'errand', done: false, createdAt: Date.now() });
    saveTasks(); input.value = ''; renderLists(); renderToday();
  };
  $('#errandAddBtn').addEventListener('click', addErrand);
  $('#errandInput').addEventListener('keydown', e => { if (e.key === 'Enter') addErrand(); });

  // brain dump (voice + type)
  initSpeech();
  $('#brainDumpBtn').addEventListener('click', openDump);
  $('#micBtn').addEventListener('click', toggleVoice);
  $('#dumpCancelBtn').addEventListener('click', closeDump);
  $('#dumpSaveBtn').addEventListener('click', saveDump);
  $('#dumpModal').addEventListener('click', e => { if (e.target.id === 'dumpModal') closeDump(); });

  // habit modal
  $('#addHabitBtn').addEventListener('click', () => openHabitModal(null));
  $('#habitSaveBtn').addEventListener('click', saveHabitFromModal);
  $('#habitCancelBtn').addEventListener('click', closeHabitModal);
  $('#habitDeleteBtn').addEventListener('click', deleteHabit);
  $('#habitModal').addEventListener('click', e => { if (e.target.id === 'habitModal') closeHabitModal(); });

  // notifs + data
  $('#enableNotifsBtn').addEventListener('click', enableNotifs);
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); });

  // re-render when app comes back into focus (new day, missed reminders, etc.)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
