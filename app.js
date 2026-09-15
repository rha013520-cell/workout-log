const STORAGE_KEY = 'workout-log-entries';

const form = document.getElementById('logForm');
const dateInput = document.getElementById('date');
const exerciseInput = document.getElementById('exercise');
const repsInput = document.getElementById('reps');
const durationInput = document.getElementById('duration');
const listEl = document.getElementById('list');
const countEl = document.getElementById('entryCount');

// 오늘 날짜를 기본값으로
dateInput.value = new Date().toISOString().slice(0, 10);

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDateHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function render() {
  const entries = loadEntries();

  countEl.textContent = entries.length > 0 ? `총 ${entries.length}개 기록` : '';

  if (entries.length === 0) {
    listEl.innerHTML = '<p class="empty">아직 기록이 없어요. 오늘 운동을 기록해보세요.</p>';
    return;
  }

  // 최신 날짜 먼저, 같은 날짜 안에서는 입력 순서 유지(최근 입력이 위)
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });

  const groups = new Map();
  for (const entry of sorted) {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
  }

  listEl.innerHTML = '';
  for (const [date, items] of groups) {
    const group = document.createElement('div');
    group.className = 'date-group';

    const heading = document.createElement('div');
    heading.className = 'date-heading';
    heading.textContent = formatDateHeading(date);
    group.appendChild(heading);

    for (const entry of items) {
      const row = document.createElement('div');
      row.className = 'entry';

      const main = document.createElement('div');
      main.className = 'entry-main';

      const exerciseEl = document.createElement('div');
      exerciseEl.className = 'entry-exercise';
      exerciseEl.textContent = entry.exercise;

      const detailParts = [];
      if (entry.reps) detailParts.push(`${entry.reps}회`);
      if (entry.duration) detailParts.push(`${entry.duration}분`);

      const detailEl = document.createElement('div');
      detailEl.className = 'entry-detail';
      detailEl.textContent = detailParts.length ? detailParts.join(' · ') : '기록 없음';

      main.appendChild(exerciseEl);
      main.appendChild(detailEl);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'entry-delete';
      deleteBtn.setAttribute('aria-label', '기록 삭제');
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', () => deleteEntry(entry.id));

      row.appendChild(main);
      row.appendChild(deleteBtn);
      group.appendChild(row);
    }

    listEl.appendChild(group);
  }
}

function deleteEntry(id) {
  const entries = loadEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  render();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: dateInput.value,
    exercise: exerciseInput.value.trim(),
    reps: repsInput.value ? Number(repsInput.value) : null,
    duration: durationInput.value ? Number(durationInput.value) : null,
    createdAt: Date.now(),
  };

  if (!entry.exercise) return;

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  exerciseInput.value = '';
  repsInput.value = '';
  durationInput.value = '';
  exerciseInput.focus();

  render();
});

render();

// 오프라인 지원을 위한 서비스워커 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
