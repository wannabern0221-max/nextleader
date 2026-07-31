
const qs = (s, root = document) => root.querySelector(s);
const qsa = (s, root = document) => [...root.querySelectorAll(s)];

const menuBtn = qs('.menu-button');
const nav = qs('.nav');
if (menuBtn && nav) {
  menuBtn.addEventListener('click', () => nav.classList.toggle('open'));
}

const modal = qs('#siteModal');
const modalTitle = qs('#modalTitle');
const modalBody = qs('#modalBody');
const closeBtns = qsa('[data-close-modal]');
const hideToday = qs('#hideToday');

function openModal(title, body) {
  if (!modal) return;
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
closeBtns.forEach(btn => btn.addEventListener('click', closeModal));
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

qsa('[data-article]').forEach(btn => {
  btn.addEventListener('click', () => {
    openModal(
      btn.dataset.title || '게시글',
      `<p>${btn.dataset.body || '게시글 내용이 들어갈 자리입니다.'}</p>
       <p style="font-size:13px;color:#6a7786;margin-top:24px;">※ 현재 초안은 공개 열람 전용 화면입니다.</p>`
    );
  });
});

const alertBtn = qs('[data-open-alert]');
if (alertBtn) {
  alertBtn.addEventListener('click', () => openModal(
    '홈페이지 이용 안내',
    `<p><strong>차세대 간호리더 부산 정책국 홈페이지 초안</strong>입니다.</p>
     <p>현재 버전에서는 공개 메뉴와 게시글 열람 흐름을 확인할 수 있습니다. 로그인·회원가입 승인·자료 업로드 기능은 Supabase 연동 단계에서 추가됩니다.</p>`
  ));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
if (document.body.dataset.page === 'home') {
  const hidden = localStorage.getItem('noticeHiddenDate');
  if (hidden !== todayKey()) {
    setTimeout(() => openModal(
      '정책국 홈페이지 초안 안내',
      `<p>안녕하세요. 대한간호협회 차세대 간호리더 부산 정책국 홈페이지 초안입니다.</p>
       <p>메뉴 이동과 게시글 열람을 먼저 확인해 주세요. 카드뉴스·사업계획·일정·정책 콘텐츠는 추후 관리자 화면에서 등록할 수 있도록 연결할 예정입니다.</p>`
    ), 450);
  }
}
if (hideToday) {
  hideToday.addEventListener('change', () => {
    if (hideToday.checked) localStorage.setItem('noticeHiddenDate', todayKey());
    else localStorage.removeItem('noticeHiddenDate');
  });
}

const loginPreview = qs('#signupPreview');
if (loginPreview) {
  loginPreview.addEventListener('submit', (e) => {
    e.preventDefault();
    const toast = qs('#toast');
    if (toast) {
      toast.textContent = '초안 화면입니다. 실제 가입 신청은 Supabase 연동 후 활성화됩니다.';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3200);
    }
  });
}
