(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const slug = params.get('slug');
  const client = window.knaSupabase;
  const fileService = window.KNA_FILE_SERVICE;
  const attachmentSection = document.querySelector('#articleAttachments');
  const attachmentList = document.querySelector('#articleAttachmentList');
  const labels = {
    notice: '공지사항', card: '카드뉴스', policy: '정책 콘텐츠',
    activity_report: '활동보고서', business_plan: '사업계획서', project_plan: '사업계획'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const normalize = value => String(value || '').replace(/\\n/g, '\n').replace(/\r/g, '');
  const sanitizeHtml = html => {
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
          else { element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener'); }
          return;
        }
        if (element.tagName === 'IMG' && ['src','alt'].includes(name)) {
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
    return doc.body.firstElementChild.innerHTML;
  };
  const formatPlain = value => {
    const lines = normalize(value).split('\n');
    const html = [];
    let list = [];
    const flush = () => {
      if (list.length) {
        html.push(`<ul>${list.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`);
        list = [];
      }
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (line.startsWith('## ')) { flush(); html.push(`<h2>${esc(line.slice(3))}</h2>`); continue; }
      if (line.startsWith('### ')) { flush(); html.push(`<h3>${esc(line.slice(4))}</h3>`); continue; }
      if (line.startsWith('- ')) { list.push(line.slice(2)); continue; }
      flush();
      html.push(`<p>${esc(line)}</p>`);
    }
    flush();
    return html.join('');
  };

  const render = data => {
    document.title = `${data.title} | 대한간호학생회 부산 정책국`;
    document.querySelector('#articleTitle').textContent = data.title;
    document.querySelector('#articleCategory').textContent = labels[data.category] || data.category || '게시물';
    document.querySelector('#articleDate').textContent = data.published_at ? new Date(data.published_at).toLocaleDateString('ko-KR') : data.date || '';
    const target = document.querySelector('#articleBody');
    target.classList.add('rich-content');
    target.innerHTML = data.body_format === 'html' ? sanitizeHtml(data.body || '') : formatPlain(data.body || '');
    renderAttachments(Array.isArray(data.attachments) ? data.attachments : []);
  };

  const renderAttachments = items => {
    if (!items.length || !attachmentSection || !attachmentList) return;
    attachmentSection.hidden = false;
    attachmentList.innerHTML = items.map(item => {
      const enabled = item.downloadEnabled ?? item.download_enabled ?? true;
      const size = fileService?.formatBytes(item.sizeBytes ?? item.size_bytes ?? 0) || '';
      return `<article class="uploaded-file-item">
        <div class="uploaded-file-main"><strong>${esc(item.originalName || item.original_name || item.name || '첨부파일')}</strong><span>${esc(size)}</span></div>
        <span class="audience-pill">${enabled ? '다운로드 허용' : '열람 전용'}</span>
        <button type="button" class="btn btn-outline" data-article-download="${esc(item.id || '')}" ${enabled ? '' : 'disabled'}>${enabled ? '내려받기' : '다운로드 불가'}</button>
      </article>`;
    }).join('');
    attachmentList.querySelectorAll('[data-article-download]').forEach(button => button.addEventListener('click', async () => {
      const item = items.find(candidate => candidate.id === button.dataset.articleDownload);
      if (!item || !fileService) return;
      button.disabled = true;
      try { await fileService.download(item); }
      catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    }));
  };

  const showMissing = message => {
    document.querySelector('#articleTitle').textContent = '게시물을 찾을 수 없습니다';
    document.querySelector('#articleBody').innerHTML = `<p>${esc(message || '주소가 잘못되었거나 게시물이 이동되었습니다.')}</p>`;
  };

  if (id && window.SUPABASE_CONFIG_READY && client) {
    const { data, error } = await client.from('content_posts')
      .select('title,category,body,body_format,attachments,published_at,status')
      .eq('id', id)
      .maybeSingle();
    if (!error && data && data.status === 'published') { render(data); return; }
    if (error) console.warn(error);
  }

  if (slug && window.SUPABASE_CONFIG_READY && client) {
    const { data, error } = await client.from('content_posts')
      .select('title,category,body,body_format,attachments,published_at,status')
      .eq('seed_key', slug)
      .maybeSingle();
    if (!error && data && data.status === 'published') { render(data); return; }
  }

  if (slug && window.KNA_CONTENT?.[slug]) {
    const item = window.KNA_CONTENT[slug];
    render({ title: item.title, category: item.category, body: item.body, body_format: 'html', date: item.date, attachments: [] });
    return;
  }

  showMissing();
})();
