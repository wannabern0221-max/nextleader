(async () => {
  const client = window.knaSupabase;
  const root = document.querySelector('#boardRoot');
  const message = document.querySelector('#boardMessage');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const show = (text, type = 'info') => { message.className = `auth-message show ${type}`; message.textContent = text; };
  const format = value => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  if (!window.SUPABASE_CONFIG_READY || !client) return show('리더 서비스 연결 설정을 확인해 주세요.', 'error');
  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return location.replace('login.html');
    const { data: access, error } = await client.rpc('get_my_access');
    if (error) throw error;
    if (access?.approval_status !== 'approved') return location.replace('dashboard.html');
    if (new URLSearchParams(location.search).get('created') === '1') show('익명 글을 등록했습니다.', 'success');
    await loadPosts();
  } catch (error) {
    show(error.message || '소통방을 불러오지 못했습니다.', 'error');
  }

  async function loadPosts() {
    root.innerHTML = '<div class="loading-state">익명 글을 불러오는 중입니다.</div>';
    let result = await client.rpc('list_anonymous_posts_v2');
    if (result.error) result = await client.rpc('list_anonymous_posts');
    const { data, error } = result;
    if (error) return show(error.message, 'error');
    if (!data?.length) {
      root.innerHTML = '<div class="empty-state">아직 등록된 글이 없습니다. 글쓰기에서 첫 의견을 남겨보세요.</div>';
      return;
    }
    root.innerHTML = data.map(post => {
      const images = Array.isArray(post.attachments) ? post.attachments : [];
      const gallery = images.length ? `<div class="anon-image-grid">${images.map(image => `<img src="${esc(image.viewUrl || image.view_url || '')}" alt="첨부 이미지">`).join('')}</div>` : '';
      return `<article class="anon-post" data-id="${post.id}"><div class="anon-post-head"><div><span class="anon-label">익명 리더</span><time>${format(post.created_at)}</time></div><div class="action-group">${post.can_edit ? '<button class="action-btn" data-edit>수정</button><button class="action-btn reject" data-delete>삭제</button>' : ''}</div></div><h2>${esc(post.title)}</h2><div class="anon-body">${esc(post.body).replace(/\n/g, '<br>')}</div>${gallery}<button class="comment-toggle" data-comments>댓글 ${post.comment_count}개 보기</button><div class="comments-area" hidden></div></article>`;
    }).join('');
    root.querySelectorAll('[data-comments]').forEach(button => button.addEventListener('click', () => toggleComments(button.closest('.anon-post'))));
    root.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deletePost(button.closest('.anon-post'))));
    root.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editPost(button.closest('.anon-post'))));
  }

  async function editPost(article) {
    const title = prompt('수정할 제목을 입력해 주세요.', article.querySelector('h2').textContent);
    if (title === null) return;
    const body = prompt('수정할 내용을 입력해 주세요.', article.querySelector('.anon-body').innerText);
    if (body === null) return;
    const { error } = await client.rpc('update_anonymous_post', { p_post_id: article.dataset.id, p_title: title, p_body: body });
    if (error) return show(error.message, 'error');
    show('글을 수정했습니다.', 'success');
    await loadPosts();
  }

  async function deletePost(article) {
    if (!confirm('이 글을 삭제하시겠습니까?')) return;
    const { error } = await client.rpc('delete_anonymous_post', { p_post_id: article.dataset.id });
    if (error) return show(error.message, 'error');
    show('글을 삭제했습니다.', 'success');
    await loadPosts();
  }

  async function toggleComments(article) {
    const area = article.querySelector('.comments-area');
    if (!area.hidden) { area.hidden = true; return; }
    area.hidden = false;
    area.innerHTML = '<div class="loading-state">댓글을 불러오는 중입니다.</div>';
    const { data, error } = await client.rpc('list_anonymous_comments', { p_post_id: article.dataset.id });
    if (error) { area.innerHTML = `<div class="auth-message show error">${esc(error.message)}</div>`; return; }
    area.innerHTML = `<div class="comment-list">${(data || []).map(comment => `<div class="anon-comment" data-id="${comment.id}"><div><strong>익명 리더</strong><time>${format(comment.created_at)}</time></div><p>${esc(comment.body).replace(/\n/g, '<br>')}</p>${comment.can_edit ? '<button class="small-action" data-delete-comment>삭제</button>' : ''}</div>`).join('') || '<p class="empty-state">첫 댓글을 남겨보세요.</p>'}</div><form class="comment-form"><input name="body" maxlength="1000" required placeholder="댓글을 입력해 주세요"><button class="btn btn-primary" type="submit">등록</button></form>`;
    area.querySelector('.comment-form').addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const { error: commentError } = await client.rpc('create_anonymous_comment', { p_post_id: article.dataset.id, p_body: String(formData.get('body') || '') });
      if (commentError) return show(commentError.message, 'error');
      area.hidden = true;
      await toggleComments(article);
    });
    area.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('댓글을 삭제하시겠습니까?')) return;
      const { error: deleteError } = await client.rpc('delete_anonymous_comment', { p_comment_id: button.closest('.anon-comment').dataset.id });
      if (deleteError) return show(deleteError.message, 'error');
      area.hidden = true;
      await toggleComments(article);
    }));
  }
})();
