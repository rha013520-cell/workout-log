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

function render() {
  const entries = loadEntries();

  updateSuggestions(entries);
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

  loadThumbnails(entries);
}

function deleteEntry(id) {
  const entries = loadEntries();
  const target = entries.find((e) => e.id === id);
  const remaining = entries.filter((e) => e.id !== id);
  saveEntries(remaining);
  if (target && target.hasPhoto) {
    deletePhoto(id).catch(() => {});
  }
  render();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const photoFile = photoInput.files[0];

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: dateInput.value,
    exercise: exerciseInput.value.trim(),
    reps: repsInput.value ? Number(repsInput.value) : null,
    duration: durationInput.value ? Number(durationInput.value) : null,
    createdAt: Date.now(),
    hasPhoto: !!photoFile,
  };

  if (!entry.exercise) return;

  const entries = loadEntries();
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

// 오프라인 지원을 위한 서비스워커 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
