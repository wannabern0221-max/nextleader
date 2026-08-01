const qs = (s, root = document) => root.querySelector(s);
const qsa = (s, root = document) => [...root.querySelectorAll(s)];

const menuBtn = qs('.menu-button');
const nav = qs('.nav');
if (menuBtn && nav) menuBtn.addEventListener('click', () => nav.classList.toggle('open'));

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
if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

const alertBtn = qs('[data-open-alert]');
if (alertBtn) {
  alertBtn.addEventListener('click', () => openModal(
    '홈페이지 이용 안내',
    `<p><strong>대한간호학생회 부산 정책국 홈페이지</strong>입니다.</p>
     <p>공개 메뉴는 로그인 없이 열람할 수 있습니다. 관계자 기능은 이메일 인증과 관리자 승인을 완료한 뒤 이용할 수 있습니다.</p>`
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
      '대한간호학생회 부산 정책국 안내',
      `<p>정책국 공식 홈페이지입니다.</p>
       <p>공개 게시물은 누구나 열람할 수 있으며 관계자는 이메일 인증과 가입 승인을 거쳐 내부 기능을 이용합니다.</p>`
    ), 450);
  }
}
if (hideToday) {
  hideToday.addEventListener('change', () => {
    if (hideToday.checked) localStorage.setItem('noticeHiddenDate', todayKey());
    else localStorage.removeItem('noticeHiddenDate');
  });
}
if (document.body.dataset.page === 'article') {
  const params = new URLSearchParams(location.search);
  const item = window.KNA_CONTENT?.[params.get('slug')];
  const title = qs('#articleTitle');
  const category = qs('#articleCategory');
  const date = qs('#articleDate');
  const body = qs('#articleBody');
  if (item) {
    document.title = `${item.title} | 대한간호학생회 부산 정책국`;
    title.textContent = item.title;
    category.textContent = item.category;
    date.textContent = item.date;
    body.innerHTML = item.body;
  } else {
    title.textContent = '게시물을 찾을 수 없습니다';
    category.textContent = '안내';
    date.textContent = '';
    body.innerHTML = '<p>주소가 잘못되었거나 게시물이 이동되었습니다.</p>';
  }
}
