(async () => {
  const client = window.knaSupabase;
  const files = window.KNA_FILE_SERVICE;
  const form = document.querySelector('#contentEditorForm');
  const body = document.querySelector('#richBody');
  const toolbar = document.querySelector('#richToolbar');
  const message = document.querySelector('#editorMessage');
  const status = document.querySelector('#editorStatus');
  const saveButton = document.querySelector('#saveDraftButton');
  const submitButton = document.querySelector('#submitReviewButton');
  const publishButton = document.querySelector('#publishButton');
  const back = document.querySelector('#editorBack');
  const bodyImageInput = document.querySelector('#bodyImageInput');
  const attachmentDropzone = document.querySelector('#attachmentDropzone');
  const attachmentInput = document.querySelector('#attachmentFileInput');
  const attachmentList = document.querySelector('#attachmentList');
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const requestedCategory = params.get('category');
  const returnUrl = params.get('return') || 'content-manager.html';
  const managerRoles = ['policy_director','director','policy_general_manager','general_manager','senior_manager_div1','senior_manager_div2','senior_manager'];
  const activityCategories = ['activity_report','business_plan','project_plan'];

  let access = null;
  let currentStatus = 'draft';
  let attachments = [];
  const uploadedIds = new Set();

  const show = (text, type = 'info') => {
    message.className = `auth-message show ${type}`;
    message.textContent = text;
  };
  const canApprove = () => managerRoles.includes(access?.system_role) || access?.permissions?.includes('content_approve');
  const canWriteActivity = () => managerRoles.includes(access?.system_role);
  const isActivity = () => activityCategories.includes(form.elements.category.value);
  const audience = () => files.audienceFromVisibility(form.elements.visibility.value);

  back.href = returnUrl;

  if (!window.SUPABASE_CONFIG_READY || !client || !files) {
    show('파일 및 리더 서비스 연결 설정을 확인해 주세요.', 'error');
    return disableAll();
  }

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) return location.replace('login.html');
    const { data, error } = await client.rpc('get_my_access');
    if (error) throw error;
    access = data;
    if (access?.approval_status !== 'approved' || access?.system_role === 'external_admin') return location.replace('dashboard.html');

    if (!canWriteActivity()) {
      activityCategories.forEach(value => {
        const option = form.elements.category.querySelector(`option[value="${value}"]`);
        if (option) option.disabled = true;
      });
    }
    if (requestedCategory) form.elements.category.value = requestedCategory;
    configureCategory(false);
    if (id) await loadPost(id);
    configureActionButtons();
  } catch (error) {
    console.error(error);
    show(error.message || '글쓰기 화면을 불러오지 못했습니다.', 'error');
    disableAll();
  }

  form.elements.category.addEventListener('change', () => configureCategory(false));
  form.elements.visibility.addEventListener('change', () => {
    if (isActivity() && form.elements.visibility.value === 'public') form.elements.visibility.value = 'leaders';
  });

  toolbar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    event.preventDefault();
    body.focus();
    if (button.dataset.command) return document.execCommand(button.dataset.command, false, null);
    if (button.dataset.special === 'link') {
      const url = prompt('연결할 주소를 입력해 주세요.', 'https://');
      if (url) document.execCommand('createLink', false, url);
    }
    if (button.dataset.special === 'image') {
      bodyImageInput.value = '';
      bodyImageInput.click();
    }
    if (button.dataset.special === 'table') insertTable();
  });

  toolbar.querySelector('select[data-command="formatBlock"]')?.addEventListener('change', event => {
    body.focus();
    document.execCommand('formatBlock', false, event.target.value);
    event.target.value = 'p';
  });

  bodyImageInput.addEventListener('change', async () => {
    const file = bodyImageInput.files?.[0];
    if (file) await uploadBodyImage(file);
  });

  body.addEventListener('dragover', event => {
    if ([...event.dataTransfer.items].some(item => item.kind === 'file')) {
      event.preventDefault();
      body.classList.add('is-dragover');
    }
  });
  body.addEventListener('dragleave', () => body.classList.remove('is-dragover'));
  body.addEventListener('drop', async event => {
    const file = [...event.dataTransfer.files].find(item => item.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    body.classList.remove('is-dragover');
    await uploadBodyImage(file);
  });

  bindDropzone(attachmentDropzone, attachmentInput, uploadAttachments);

  attachmentList.addEventListener('change', async event => {
    const input = event.target.closest('[data-download-toggle]');
    if (!input) return;
    const item = attachments.find(file => file.id === input.dataset.downloadToggle);
    if (!item) return;
    input.disabled = true;
    try {
      const updated = await files.update(item.id, { downloadEnabled: input.checked });
      item.downloadEnabled = updated.downloadEnabled;
      item.download_enabled = updated.downloadEnabled;
      show('다운로드 허용 설정을 변경했습니다.', 'success');
    } catch (error) {
      input.checked = item.downloadEnabled !== false;
      show(error.message, 'error');
    } finally {
      input.disabled = false;
    }
  });

  attachmentList.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-attachment]');
    if (!button) return;
    attachments = attachments.filter(file => file.id !== button.dataset.removeAttachment);
    renderAttachments();
  });

  saveButton.addEventListener('click', () => save('draft'));
  submitButton.addEventListener('click', async () => {
    const saved = await save('draft', false);
    if (!saved) return;
    const { error } = await client.rpc('submit_content', { p_post_id: form.elements.id.value });
    if (error) return show(error.message, 'error');
    location.href = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}submitted=1`;
  });
  publishButton.addEventListener('click', async () => {
    const saved = await save('draft', false);
    if (!saved) return;
    const { error } = await client.rpc('publish_content', { p_post_id: form.elements.id.value });
    if (error) return show(error.message, 'error');
    location.href = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}published=1`;
  });

  function configureCategory(preserveVisibility = false) {
    const activity = isActivity();
    document.querySelector('#scopeField').hidden = !activity;
    if (!preserveVisibility) form.elements.visibility.value = activity ? 'leaders' : 'public';
    form.elements.visibility.querySelector('option[value="public"]').disabled = activity;
    if (activity && !canWriteActivity()) {
      show('활동보고서와 사업계획 자료는 수석부장·정책총괄부장·정책국장만 작성할 수 있습니다.', 'warning');
      saveButton.disabled = true;
      submitButton.disabled = true;
    } else {
      saveButton.disabled = false;
      submitButton.disabled = false;
    }
    if (activity) {
      if (access?.system_role === 'senior_manager_div1') form.elements.scope.value = 'div1';
      if (access?.system_role === 'senior_manager_div2') form.elements.scope.value = 'div2';
    }
  }

  async function loadPost(postId) {
    const { data, error } = await client.rpc('get_content_for_edit', { p_post_id: postId });
    if (error) throw error;
    if (!data) throw new Error('콘텐츠를 찾을 수 없습니다.');
    form.elements.id.value = data.id;
    form.elements.category.value = data.category;
    form.elements.scope.value = data.scope || 'policy_office';
    form.elements.visibility.value = data.visibility || 'public';
    form.elements.title.value = data.title || '';
    form.elements.summary.value = data.summary || '';
    form.elements.cover_url.value = data.cover_url || '';
    body.innerHTML = data.body_format === 'html' ? sanitize(data.body || '') : plainToHtml(data.body || '');
    attachments = Array.isArray(data.attachments) ? data.attachments.map(normalizeAttachment) : [];
    currentStatus = data.status || 'draft';
    status.textContent = `${data.title || '콘텐츠'} · ${labelStatus(currentStatus)}`;
    configureCategory(true);
    renderAttachments();
  }

  async function uploadBodyImage(file) {
    if (!file.type.startsWith('image/')) return show('본문에는 이미지 파일만 올릴 수 있습니다.', 'error');
    toggleBusy(true);
    show('본문 이미지를 업로드하고 있습니다.', 'info');
    try {
      const uploaded = await files.upload(file, { purpose: 'body-image', audience: audience(), downloadEnabled: false });
      uploadedIds.add(uploaded.id);
      setAutomaticCardCover(uploaded);
      body.focus();
      document.execCommand('insertHTML', false,
        `<img src="${escapeAttribute(uploaded.viewUrl)}" alt="${escapeAttribute(uploaded.originalName)}" data-file-id="${uploaded.id}"><p><br></p>`
      );
      show('본문에 이미지를 넣었습니다.', 'success');
    } catch (error) {
      show(error.message, 'error');
    } finally {
      toggleBusy(false);
    }
  }

  async function uploadAttachments(selected) {
    const items = [...selected];
    if (!items.length) return;
    toggleBusy(true);
    let success = 0;
    for (const file of items) {
      show(`${file.name} 파일을 업로드하고 있습니다.`, 'info');
      try {
        const uploaded = await files.upload(file, { purpose: 'attachment', audience: audience(), downloadEnabled: true });
        attachments.push(normalizeAttachment(uploaded));
        uploadedIds.add(uploaded.id);
        setAutomaticCardCover(uploaded);
        success += 1;
        renderAttachments();
      } catch (error) {
        show(`${file.name}: ${error.message}`, 'error');
      }
    }
    toggleBusy(false);
    if (success) show(`${success}개 첨부파일을 업로드했습니다.`, 'success');
  }

  async function save(mode = 'draft', redirect = true) {
    const title = form.elements.title.value.trim();
    const html = sanitize(body.innerHTML);
    if (!title) return show('제목을 입력해 주세요.', 'error'), false;
    if (!html.replace(/<[^>]+>/g, '').trim() && !html.includes('<img')) return show('본문을 입력해 주세요.', 'error'), false;
    if (isActivity() && !canWriteActivity()) return show('사업자료 작성 권한이 없습니다.', 'error'), false;

    toggleBusy(true);
    try {
      await syncUploadedSettings();
      const payload = {
        id: form.elements.id.value || '',
        category: form.elements.category.value,
        title,
        summary: form.elements.summary.value.trim(),
        body: html,
        body_format: 'html',
        cover_url: resolveCoverUrl(html),
        scope: isActivity() ? form.elements.scope.value : 'policy_office',
        visibility: form.elements.visibility.value,
        attachments: attachments.map(item => ({
          id: item.id,
          originalName: item.originalName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          downloadEnabled: item.downloadEnabled !== false,
          downloadUrl: item.downloadUrl,
          viewUrl: item.viewUrl || ''
        }))
      };
      const { data, error } = await client.rpc('save_content_draft', { p_payload: payload });
      if (error) throw error;
      form.elements.id.value = data;
      await linkUploadedFiles(data);
      show('초안을 저장했습니다.', 'success');
      if (redirect) location.href = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}saved=1`;
      return true;
    } catch (error) {
      show(error.message, 'error');
      return false;
    } finally {
      toggleBusy(false);
    }
  }

  async function syncUploadedSettings() {
    const targetAudience = audience();
    const ids = new Set(uploadedIds);
    body.querySelectorAll('img[data-file-id]').forEach(image => ids.add(image.dataset.fileId));
    attachments.forEach(item => ids.add(item.id));
    await Promise.all([...ids].map(async fileId => {
      const attachment = attachments.find(item => item.id === fileId);
      try {
        await files.update(fileId, {
          audience: targetAudience,
          ...(attachment ? { downloadEnabled: attachment.downloadEnabled !== false } : {})
        });
      } catch (error) {
        console.warn('파일 공개 범위 동기화 실패', fileId, error);
      }
    }));
  }

  async function linkUploadedFiles(postId) {
    const ids = new Set(uploadedIds);
    body.querySelectorAll('img[data-file-id]').forEach(image => ids.add(image.dataset.fileId));
    attachments.forEach(item => ids.add(item.id));
    await Promise.all([...ids].map(fileId => files.update(fileId, { linkedContentId: postId }).catch(() => null)));
  }

  function setAutomaticCardCover(uploaded) {
    if (form.elements.category.value !== 'card') return;
    const mimeType = uploaded.mimeType || uploaded.mime_type || '';
    if (!mimeType.startsWith('image/')) return;
    if (!form.elements.cover_url.value.trim() && uploaded.viewUrl) {
      form.elements.cover_url.value = uploaded.viewUrl;
      show('첫 번째 이미지가 카드뉴스 목록 이미지로 자동 지정됐습니다.', 'success');
    }
  }

  function resolveCoverUrl(html) {
    const existing = form.elements.cover_url.value.trim();
    if (form.elements.category.value !== 'card') return existing;
    if (existing) return existing;

    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const bodyImage = doc.querySelector('img[src]')?.getAttribute('src')?.trim();
    if (bodyImage) {
      form.elements.cover_url.value = bodyImage;
      return bodyImage;
    }

    const attachmentImage = attachments.find(item => String(item.mimeType || '').startsWith('image/') && item.viewUrl);
    if (attachmentImage?.viewUrl) {
      form.elements.cover_url.value = attachmentImage.viewUrl;
      return attachmentImage.viewUrl;
    }
    return '';
  }

  function renderAttachments() {
    if (!attachments.length) {
      attachmentList.innerHTML = '<div class="file-list-empty">첨부된 파일이 없습니다.</div>';
      return;
    }
    attachmentList.innerHTML = attachments.map(item => `
      <article class="uploaded-file-item">
        <div class="uploaded-file-main">
          <strong>${escapeHtml(item.originalName)}</strong>
          <span>${files.formatBytes(item.sizeBytes)} · ${escapeHtml(item.mimeType || '파일')}</span>
        </div>
        <label class="download-toggle">
          <input type="checkbox" data-download-toggle="${item.id}" ${item.downloadEnabled !== false ? 'checked' : ''}>
          <span>다른 리더 다운로드 허용</span>
        </label>
        <button type="button" class="file-remove" data-remove-attachment="${item.id}">목록에서 제거</button>
      </article>`).join('');
  }

  function normalizeAttachment(item) {
    return {
      id: item.id,
      originalName: item.originalName || item.original_name || item.name || '첨부파일',
      mimeType: item.mimeType || item.mime_type || 'application/octet-stream',
      sizeBytes: Number(item.sizeBytes ?? item.size_bytes ?? 0),
      downloadEnabled: item.downloadEnabled ?? item.download_enabled ?? true,
      downloadUrl: item.downloadUrl || item.download_url || '',
      viewUrl: item.viewUrl || item.view_url || ''
    };
  }

  function bindDropzone(zone, input, onFiles) {
    const open = () => { input.value = ''; input.click(); };
    zone.addEventListener('click', event => { if (!event.target.closest('button,input,label')) open(); });
    zone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    input.addEventListener('change', () => onFiles(input.files || []));
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
    zone.addEventListener('drop', event => {
      event.preventDefault();
      zone.classList.remove('is-dragover');
      onFiles(event.dataTransfer.files || []);
    });
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const allowed = new Set(['DIV','P','BR','H2','H3','STRONG','B','EM','I','U','S','UL','OL','LI','BLOCKQUOTE','A','IMG','HR','TABLE','THEAD','TBODY','TR','TH','TD','SPAN']);
    [...doc.body.querySelectorAll('*')].forEach(element => {
      if (!allowed.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }
      [...element.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (element.tagName === 'A' && name === 'href') {
          if (!/^(https?:|mailto:|#)/i.test(attribute.value)) element.removeAttribute(attribute.name);
          else element.setAttribute('target', '_blank');
          return;
        }
        if (element.tagName === 'IMG' && ['src','alt','data-file-id'].includes(name)) {
          if (name === 'src' && !/^https?:/i.test(attribute.value)) element.removeAttribute(attribute.name);
          return;
        }
        if (name === 'style') {
          const align = (attribute.value.match(/text-align\s*:\s*(left|center|right)/i) || [])[1];
          if (align) element.setAttribute('style', `text-align:${align}`);
          else element.removeAttribute('style');
          return;
        }
        element.removeAttribute(attribute.name);
      });
    });
    return doc.body.firstElementChild.innerHTML.trim();
  }

  function plainToHtml(value) {
    const normalized = String(value || '').replace(/\\n/g, '\n').replace(/\r/g, '');
    return normalized.split('\n').map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>').join('');
  }

  function insertTable() {
    const rows = Math.min(Math.max(Number(prompt('행 개수', '3')) || 3, 1), 10);
    const columns = Math.min(Math.max(Number(prompt('열 개수', '3')) || 3, 1), 8);
    let html = '<table><tbody>';
    for (let row = 0; row < rows; row += 1) {
      html += '<tr>';
      for (let column = 0; column < columns; column += 1) html += row === 0 ? '<th>제목</th>' : '<td>내용</td>';
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }
  function escapeAttribute(value) { return escapeHtml(value); }
  function labelStatus(value) { return ({draft:'작성 중',review:'승인 요청',published:'게시 완료',rejected:'반려',hidden:'숨김'}[value] || value); }
  function configureActionButtons() {
    const hasPublishPermission = canApprove();
    saveButton.hidden = !hasPublishPermission;
    publishButton.hidden = !hasPublishPermission;
    submitButton.hidden = hasPublishPermission;
  }
  function toggleBusy(busy) {
    saveButton.disabled = busy;
    submitButton.disabled = busy;
    publishButton.disabled = busy;
  }
  function disableAll() { [saveButton,submitButton,publishButton].forEach(button => { button.disabled = true; }); }
})();
