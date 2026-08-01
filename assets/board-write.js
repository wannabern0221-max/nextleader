(async () => {
  const client = window.knaSupabase;
  const files = window.KNA_FILE_SERVICE;
  const form = document.querySelector('#anonymousWriteForm');
  const message = document.querySelector('#boardWriteMessage');
  const zone = document.querySelector('#boardImageDropzone');
  const input = document.querySelector('#boardImageInput');
  const list = document.querySelector('#boardImageList');
  const submit = document.querySelector('button[form="anonymousWriteForm"]');
  let images = [];

  const show = (text, type = 'info') => {
    message.className = `auth-message show ${type}`;
    message.textContent = text;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

  if (!window.SUPABASE_CONFIG_READY || !client || !files) return show('리더 및 파일 서비스 연결 설정을 확인해 주세요.', 'error');

  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return location.replace('login.html');
    const { data, error } = await client.rpc('get_my_access');
    if (error) throw error;
    if (data?.approval_status !== 'approved') return location.replace('dashboard.html');
  } catch (error) {
    return show(error.message || '글쓰기 권한을 확인하지 못했습니다.', 'error');
  }

  const open = () => { input.value = ''; input.click(); };
  zone.addEventListener('click', event => { if (!event.target.closest('button,input')) open(); });
  zone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  input.addEventListener('change', () => uploadImages(input.files));
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('is-dragover');
    uploadImages(event.dataTransfer.files);
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-image]');
    if (!button) return;
    images = images.filter(image => image.id !== button.dataset.removeImage);
    render();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    submit.disabled = true;
    const { error } = await client.rpc('create_anonymous_post_v2', {
      p_title: String(data.get('title') || ''),
      p_body: String(data.get('body') || ''),
      p_attachments: images.map(image => ({ id: image.id, viewUrl: image.viewUrl, originalName: image.originalName }))
    });
    submit.disabled = false;
    if (error) return show(error.message, 'error');
    location.replace('board.html?created=1');
  });

  async function uploadImages(selected) {
    const available = Math.max(0, 5 - images.length);
    const candidates = [...(selected || [])].filter(file => file.type.startsWith('image/')).slice(0, available);
    if (!candidates.length) return show(available ? '이미지 파일을 선택해 주세요.' : '이미지는 최대 5개까지 올릴 수 있습니다.', 'warning');
    submit.disabled = true;
    for (const file of candidates) {
      show(`${file.name} 이미지를 업로드하고 있습니다.`, 'info');
      try {
        const uploaded = await files.upload(file, { purpose: 'board-image', audience: 'leaders', downloadEnabled: false });
        images.push(uploaded);
        render();
      } catch (error) {
        show(error.message, 'error');
      }
    }
    submit.disabled = false;
    show('이미지를 업로드했습니다.', 'success');
  }

  function render() {
    list.innerHTML = images.map(image => `<article class="uploaded-file-item"><div class="uploaded-file-main"><strong>${esc(image.originalName)}</strong><span>${files.formatBytes(image.sizeBytes)}</span></div><img src="${esc(image.viewUrl)}" alt="" style="width:72px;height:56px;object-fit:cover;border-radius:8px"><button type="button" class="file-remove" data-remove-image="${image.id}">제거</button></article>`).join('');
  }
})();
