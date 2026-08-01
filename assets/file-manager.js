(async () => {
  const client = window.knaSupabase;
  const service = window.KNA_FILE_SERVICE;
  const root = document.querySelector('#fileManagerRoot');
  const list = document.querySelector('#managerFileList');
  const message = document.querySelector('#fileManagerMessage');
  const refreshButton = document.querySelector('#refreshFiles');
  const cleanupButton = document.querySelector('#cleanupFiles');
  let rows = [];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const show = (text, type = 'info') => { message.className = `auth-message show ${type}`; message.textContent = text; };
  const purposeLabel = value => ({cover:'대표 이미지','body-image':'본문 이미지',attachment:'첨부파일','board-image':'소통방 이미지','page-image':'페이지 이미지','popup-image':'팝업 이미지'}[value] || '파일');
  const audienceLabel = value => ({public:'전체 공개','leaders':'승인 리더','executives':'임원'}[value] || value);

  if (!window.SUPABASE_CONFIG_READY || !client || !service) return deny('파일 서비스 연결 설정을 확인해 주세요.');
  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return location.replace('login.html');
    const { data: access, error } = await client.rpc('get_my_access');
    if (error) throw error;
    if (access?.approval_status !== 'approved' || (!access.permissions?.includes('file_manage') && access.system_role !== 'policy_director')) {
      return deny('파일 관리 권한이 없습니다.');
    }
    await loadAll();
  } catch (error) {
    deny(error.message || '파일 관리 화면을 불러오지 못했습니다.');
  }

  refreshButton.addEventListener('click', loadAll);
  cleanupButton.addEventListener('click', async () => {
    if (!confirm('오래된 파일부터 7.5GB까지 정리합니다. 삭제된 파일은 복구할 수 없습니다. 계속할까요?')) return;
    cleanupButton.disabled = true;
    show('파일을 정리하고 있습니다.', 'info');
    try {
      const result = await service.cleanup();
      show(result.deletedCount ? `${result.deletedCount}개 파일을 정리했습니다.` : '현재 정리할 파일이 없습니다.', 'success');
      await loadAll();
    } catch (error) {
      show(error.message, 'error');
    } finally {
      cleanupButton.disabled = false;
    }
  });

  list.addEventListener('change', async event => {
    const toggle = event.target.closest('[data-manager-download]');
    if (!toggle) return;
    const row = rows.find(item => item.id === toggle.dataset.managerDownload);
    if (!row) return;
    toggle.disabled = true;
    try {
      const updated = await service.update(row.id, { downloadEnabled: toggle.checked });
      Object.assign(row, updated);
      show('다운로드 허용 설정을 변경했습니다.', 'success');
    } catch (error) {
      toggle.checked = row.downloadEnabled !== false;
      show(error.message, 'error');
    } finally {
      toggle.disabled = false;
    }
  });

  list.addEventListener('click', async event => {
    const download = event.target.closest('[data-manager-open]');
    if (download) {
      const row = rows.find(item => item.id === download.dataset.managerOpen);
      if (!row) return;
      try { await service.download(row); } catch (error) { show(error.message, 'error'); }
      return;
    }
    const remove = event.target.closest('[data-manager-delete]');
    if (!remove) return;
    const row = rows.find(item => item.id === remove.dataset.managerDelete);
    if (!row || !confirm(`${row.originalName} 파일을 완전히 삭제할까요?\n연결된 게시물의 이미지나 첨부파일이 표시되지 않을 수 있습니다.`)) return;
    remove.disabled = true;
    try {
      await service.remove(row.id);
      show('파일을 삭제했습니다.', 'success');
      await loadAll();
    } catch (error) {
      show(error.message, 'error');
      remove.disabled = false;
    }
  });

  async function loadAll() {
    refreshButton.disabled = true;
    try {
      const [storage, files] = await Promise.all([service.storage(), service.list(500)]);
      rows = files;
      renderStorage(storage);
      renderFiles();
    } catch (error) {
      show(error.message, 'error');
    } finally {
      refreshButton.disabled = false;
    }
  }

  function renderStorage(data) {
    const ratio = Math.min(100, (Number(data.usedBytes || 0) / Number(data.cleanupStartsAtBytes || 1)) * 100);
    document.querySelector('#storageMeter').style.width = `${ratio}%`;
    document.querySelector('#storageUsed').textContent = `${service.formatBytes(data.usedBytes)} 사용`;
    document.querySelector('#storageRemaining').textContent = `자동 정리까지 ${service.formatBytes(data.remainingUntilCleanupBytes)} 남음`;
    document.querySelector('#storageCount').textContent = `${Number(data.fileCount || 0).toLocaleString('ko-KR')}개 파일`;
  }

  function renderFiles() {
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">업로드된 파일이 없습니다.</div>';
      return;
    }
    list.innerHTML = rows.map(row => `<article class="manager-file-card">
      <div class="file-meta"><strong>${esc(row.originalName)}</strong><span>${purposeLabel(row.purpose)} · ${service.formatBytes(row.sizeBytes)} · ${new Date(row.createdAt).toLocaleString('ko-KR')}</span></div>
      <div><span class="audience-pill">${audienceLabel(row.audience)}</span><label class="download-toggle"><input type="checkbox" data-manager-download="${row.id}" ${row.downloadEnabled !== false ? 'checked' : ''}><span>다른 리더 다운로드</span></label></div>
      <div class="file-actions"><button class="btn btn-outline" type="button" data-manager-open="${row.id}">내려받기</button><button class="btn btn-danger" type="button" data-manager-delete="${row.id}">삭제</button></div>
    </article>`).join('');
  }

  function deny(text) {
    root.innerHTML = `<div class="member-panel access-denied"><h2>파일 관리에 접속할 수 없습니다</h2><p>${esc(text)}</p><a class="btn btn-primary" href="dashboard.html">리더 홈으로</a></div>`;
  }
})();
