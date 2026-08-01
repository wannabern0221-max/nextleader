(async () => {
  const client = window.knaSupabase;
  const root = document.querySelector('#boardRoot');
  const form = document.querySelector('#anonymousPostForm');
  const message = document.querySelector('#boardMessage');
  let access;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const show = (text, type='info') => { message.className=`auth-message show ${type}`; message.textContent=text; };
  const format = value => new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

  if (!window.SUPABASE_CONFIG_READY || !client) return show('리더 서비스 연결 설정을 확인해 주세요.','error');

  try {
    const { data: session } = await client.auth.getSession();
    if (!session.session) return location.replace('login.html');
    const { data, error } = await client.rpc('get_my_access');
    if (error) throw error;
    access = data;
    if (access?.approval_status !== 'approved') return location.replace('dashboard.html');
    await loadPosts();
  } catch (error) { show(error.message || '소통방을 불러오지 못했습니다.','error'); }

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const fd = new FormData(form);
    const { error } = await client.rpc('create_anonymous_post',{p_title:String(fd.get('title')||''),p_body:String(fd.get('body')||'')});
    submit.disabled = false;
    if (error) return show(error.message,'error');
    form.reset(); show('익명 글을 등록했습니다.','success'); await loadPosts();
  });

  async function loadPosts() {
    root.innerHTML='<div class="loading-state">익명 글을 불러오는 중입니다.</div>';
    const { data, error } = await client.rpc('list_anonymous_posts');
    if (error) return show(error.message,'error');
    if (!data?.length) { root.innerHTML='<div class="empty-state">아직 등록된 글이 없습니다.</div>'; return; }
    root.innerHTML=data.map(post=>`<article class="anon-post" data-id="${post.id}">
      <div class="anon-post-head"><div><span class="anon-label">익명 리더</span><time>${format(post.created_at)}</time></div><div class="action-group">${post.can_edit?'<button class="action-btn" data-edit>수정</button><button class="action-btn reject" data-delete>삭제</button>':''}</div></div>
      <h2>${escapeHtml(post.title)}</h2><div class="anon-body">${escapeHtml(post.body).replace(/\n/g,'<br>')}</div>
      <button class="comment-toggle" data-comments>댓글 ${post.comment_count}개 보기</button>
      <div class="comments-area" hidden></div>
    </article>`).join('');

    root.querySelectorAll('[data-comments]').forEach(btn=>btn.addEventListener('click',()=>toggleComments(btn.closest('.anon-post'))));
    root.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deletePost(btn.closest('.anon-post'))));
    root.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>editPost(btn.closest('.anon-post'))));
  }

  async function editPost(article) {
    const title = prompt('수정할 제목을 입력해 주세요.', article.querySelector('h2').textContent);
    if (title===null) return;
    const body = prompt('수정할 내용을 입력해 주세요.', article.querySelector('.anon-body').innerText);
    if (body===null) return;
    const { error } = await client.rpc('update_anonymous_post',{p_post_id:article.dataset.id,p_title:title,p_body:body});
    if (error) return show(error.message,'error');
    show('글을 수정했습니다.','success'); await loadPosts();
  }

  async function deletePost(article) {
    if (!confirm('이 글을 삭제하시겠습니까?')) return;
    const { error } = await client.rpc('delete_anonymous_post',{p_post_id:article.dataset.id});
    if (error) return show(error.message,'error');
    show('글을 삭제했습니다.','success'); await loadPosts();
  }

  async function toggleComments(article) {
    const area=article.querySelector('.comments-area');
    if (!area.hidden) { area.hidden=true; return; }
    area.hidden=false; area.innerHTML='<div class="loading-state">댓글을 불러오는 중입니다.</div>';
    const { data,error }=await client.rpc('list_anonymous_comments',{p_post_id:article.dataset.id});
    if (error) { area.innerHTML=`<div class="auth-message show error">${escapeHtml(error.message)}</div>`; return; }
    area.innerHTML=`<div class="comment-list">${(data||[]).map(c=>`<div class="anon-comment" data-id="${c.id}"><div><strong>익명 리더</strong><time>${format(c.created_at)}</time></div><p>${escapeHtml(c.body).replace(/\n/g,'<br>')}</p>${c.can_edit?'<button class="small-action" data-delete-comment>삭제</button>':''}</div>`).join('') || '<p class="empty-state">첫 댓글을 남겨보세요.</p>'}</div>
      <form class="comment-form"><input name="body" maxlength="1000" required placeholder="댓글을 입력해 주세요"><button class="btn btn-primary" type="submit">등록</button></form>`;
    area.querySelector('.comment-form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await client.rpc('create_anonymous_comment',{p_post_id:article.dataset.id,p_body:String(fd.get('body')||'')});if(error)return show(error.message,'error');await toggleComments(article);await toggleComments(article);});
    area.querySelectorAll('[data-delete-comment]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('댓글을 삭제하시겠습니까?'))return;const {error}=await client.rpc('delete_anonymous_comment',{p_comment_id:btn.closest('.anon-comment').dataset.id});if(error)return show(error.message,'error');await toggleComments(article);await toggleComments(article);}));
  }
})();
