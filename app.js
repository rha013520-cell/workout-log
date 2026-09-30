const STORAGE_KEY = 'workout-log-entries';
const DB_NAME = 'workout-log-photos-db';
const PHOTO_STORE = 'photos';

const form = document.getElementById('logForm');
const dateInput = document.getElementById('date');
const exerciseInput = document.getElementById('exercise');
const repsInput = document.getElementById('reps');
const durationInput = document.getElementById('duration');
const photoInput = document.getElementById('photo');
const listEl = document.getElementById('list');
const countEl = document.getElementById('entryCount');
const suggestionsEl = document.getElementById('exerciseSuggestions');
const photoModal = document.getElementById('photoModal');
const photoModalImg = document.getElementById('photoModalImg');
const photoModalClose = document.getElementById('photoModalClose');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

let editingId = null;

// 오늘 날짜를 기본값으로
dateInput.value = new Date().toISOString().slice(0, 10);

// ---------- 기본 기록 저장 (localStorage) ----------

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

// ---------- 사진 저장 (IndexedDB) ----------

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PHOTO_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhoto(id, blob) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 큰 사진을 적당한 크기로 줄여서 저장 용량을 아낌
function compressImage(file, maxDim = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function openPhotoModal(url) {
  photoModalImg.src = url;
  photoModal.classList.remove('hidden');
}

function closePhotoModal() {
  photoModal.classList.add('hidden');
  photoModalImg.src = '';
}

photoModalClose.addEventListener('click', closePhotoModal);
photoModal.addEventListener('click', (e) => {
  if (e.target === photoModal) closePhotoModal();
});

async function loadThumbnails(entries) {
  const withPhotos = entries.filter((e) => e.hasPhoto);
  for (const entry of withPhotos) {
    try {
      const blob = await getPhoto(entry.id);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      const imgEl = document.getElementById(`photo-${entry.id}`);
      if (imgEl) {
        imgEl.src = url;
        imgEl.addEventListener('click', () => openPhotoModal(url));
      }
    } catch (e) {
      // 사진 로드 실패 시 조용히 넘어감
    }
  }
}

// ---------- 렌더링 ----------

function formatDateHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function updateSuggestions(entries) {
  const names = [...new Set(entries.map((e) => e.exercise))];
  suggestionsEl.innerHTML = names
    .map((name) => `<option value="${name.replace(/"/g, '&quot;')}"></option>`)
    .join('');
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderStats(entries) {
  const statsEl = document.getElementById('stats');

  if (entries.length === 0) {
    statsEl.innerHTML = '';
    return;
  }

  const counts = {};
  for (const e of entries) {
    counts[e.exercise] = (counts[e.exercise] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0][1];

  const rows = sorted.map(([name, count]) => `
    <div class="stats-row">
      <div class="stats-label">${escapeHtml(name)}</div>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <div class="stats-count">${count}회</div>
    </div>
  `).join('');

  statsEl.innerHTML = `<div class="stats-title">많이 한 운동 TOP ${sorted.length}</div>${rows}`;
}

function render() {
  const entries = loadEntries();

  updateSuggestions(entries);
  renderStats(entries);
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

      if (entry.hasPhoto) {
        const thumb = document.createElement('img');
        thumb.className = 'entry-photo-thumb';
        thumb.id = `photo-${entry.id}`;
        thumb.alt = '인증사진';
        row.appendChild(thumb);
      }

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

      const editBtn = document.createElement('button');
      editBtn.className = 'entry-edit';
      editBtn.setAttribute('aria-label', '기록 수정');
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => startEdit(entry));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'entry-delete';
      deleteBtn.setAttribute('aria-label', '기록 삭제');
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', () => deleteEntry(entry.id));

      const actions = document.createElement('div');
      actions.className = 'entry-actions';
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(main);
      row.appendChild(actions);
      group.appendChild(row);
    }

    listEl.appendChild(group);
  }

  loadThumbnails(entries);
}

function startEdit(entry) {
  editingId = entry.id;
  dateInput.value = entry.date;
  exerciseInput.value = entry.exercise;
  repsInput.value = entry.reps || '';
  durationInput.value = entry.duration || '';
  photoInput.value = '';
  submitBtn.textContent = '수정 완료';
  cancelEditBtn.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  exerciseInput.focus();
}

function cancelEdit() {
  editingId = null;
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  submitBtn.textContent = '기록하기';
  cancelEditBtn.hidden = true;
}

cancelEditBtn.addEventListener('click', cancelEdit);

function deleteEntry(id) {
  const entries = loadEntries();
  const target = entries.find((e) => e.id === id);
  const remaining = entries.filter((e) => e.id !== id);
  saveEntries(remaining);
  if (target && target.hasPhoto) {
    deletePhoto(id).catch(() => {});
  }
  if (editingId === id) cancelEdit();
  render();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const photoFile = photoInput.files[0];
  const exerciseValue = exerciseInput.value.trim();
  if (!exerciseValue) return;

  const entries = loadEntries();

  if (editingId) {
    const idx = entries.findIndex((en) => en.id === editingId);
    if (idx !== -1) {
      entries[idx] = {
        ...entries[idx],
        date: dateInput.value,
        exercise: exerciseValue,
        reps: repsInput.value ? Number(repsInput.value) : null,
        duration: durationInput.value ? Number(durationInput.value) : null,
        hasPhoto: photoFile ? true : entries[idx].hasPhoto,
      };
      saveEntries(entries);

      if (photoFile) {
        try {
          const blob = await compressImage(photoFile);
          await savePhoto(editingId, blob);
        } catch (err) {
          // 사진 저장 실패해도 기록 자체는 유지
        }
      }
    }
    cancelEdit();
    render();
    return;
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: dateInput.value,
    exercise: exerciseValue,
    reps: repsInput.value ? Number(repsInput.value) : null,
    duration: durationInput.value ? Number(durationInput.value) : null,
    createdAt: Date.now(),
    hasPhoto: !!photoFile,
  };

  entries.push(entry);
  saveEntries(entries);

  if (photoFile) {
    try {
      const blob = await compressImage(photoFile);
      await savePhoto(entry.id, blob);
    } catch (err) {
      // 사진 저장 실패해도 기록 자체는 유지
    }
  }

  exerciseInput.value = '';
  repsInput.value = '';
  durationInput.value = '';
  photoInput.value = '';
  exerciseInput.focus();

  render();
});

render();

// ---------- 백업(내보내기) / 복원(가져오기) ----------
// 참고: 사진은 용량이 커서 이 백업에는 포함되지 않고, 텍스트 기록만 저장돼요.

exportBtn.addEventListener('click', () => {
  const entries = loadEntries();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `운동기록_백업_${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('invalid format');

      const existing = loadEntries();
      const existingIds = new Set(existing.map((en) => en.id));
      const merged = [...existing, ...imported.filter((en) => !existingIds.has(en.id))];

      saveEntries(merged);
      render();
      alert(`${imported.length}개 기록을 불러왔어요.`);
    } catch (err) {
      alert('파일을 읽을 수 없어요. 올바른 백업 파일인지 확인해주세요.');
    }
    importFile.value = '';
  };
  reader.readAsText(file);
});

// 오프라인 지원을 위한 서비스워커 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
