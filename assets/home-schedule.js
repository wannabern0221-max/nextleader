(async () => {
  const card = document.querySelector('#homeUpcomingSchedule');
  if (!card) return;

  const client = window.knaSupabase;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[ch]));
  const pad = value => String(value).padStart(2, '0');
  const toDateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const scopeLabel = scope => ({
    policy_office: '정책국',
    div1: '정책1부',
    div2: '정책2부'
  }[scope] || '정책국');

  if (!window.SUPABASE_CONFIG_READY || !client) {
    renderUnavailable();
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);

  const { data, error } = await client.rpc('list_public_policy_schedules_v2', {
    p_start_date: toDateKey(today),
    p_end_date: toDateKey(end)
  });

  if (error) {
    renderUnavailable();
    return;
  }

  const upcoming = (data || [])
    .filter(item => String(item.event_date || '') >= toDateKey(today))
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)) || String(a.start_time || '').localeCompare(String(b.start_time || '')));

  if (!upcoming.length) {
    card.innerHTML = `
      <span class="schedule-date">UPCOMING SCHEDULE</span>
      <h3>예정된 공개 일정이 없습니다.</h3>
      <p>새 일정이 등록되면 이곳에 자동으로 표시됩니다.</p>
      <div class="schedule-meta">
        <div><span>일시</span><strong>일정 없음</strong></div>
        <div><span>구분</span><strong>-</strong></div>
        <div><span>장소</span><strong>-</strong></div>
      </div>`;
    return;
  }

  const item = upcoming[0];
  const eventDate = new Date(`${item.event_date}T00:00:00`);
  const dateText = eventDate.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  const start = item.start_time ? String(item.start_time).slice(0, 5) : '';
  const endTime = item.end_time ? String(item.end_time).slice(0, 5) : '';
  const timeText = start && endTime ? `${start}~${endTime}` : start || '시간 추후 안내';
  const scheduleText = `${dateText} · ${timeText}`;

  card.innerHTML = `
    <span class="schedule-date">UPCOMING SCHEDULE</span>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.note || '세부 내용은 일정에 맞춰 안내합니다.')}</p>
    <div class="schedule-meta">
      <div><span>일시</span><strong>${escapeHtml(scheduleText)}</strong></div>
      <div><span>구분</span><strong>${escapeHtml(scopeLabel(item.scope))}</strong></div>
      <div><span>장소</span><strong>${escapeHtml(item.location || '장소 추후 안내')}</strong></div>
    </div>`;

  function renderUnavailable() {
    card.innerHTML = `
      <span class="schedule-date">UPCOMING SCHEDULE</span>
      <h3>일정을 불러오지 못했습니다.</h3>
      <p>전체 일정 페이지에서 다시 확인해 주세요.</p>
      <div class="schedule-meta">
        <div><span>일시</span><strong>확인 필요</strong></div>
        <div><span>구분</span><strong>-</strong></div>
        <div><span>장소</span><strong>-</strong></div>
      </div>`;
  }
})();
