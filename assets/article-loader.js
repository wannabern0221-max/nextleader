(async()=>{
  const id=new URLSearchParams(location.search).get('id');
  if(!id||!window.SUPABASE_CONFIG_READY||!window.knaSupabase)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const formatBody=value=>{
    const lines=String(value||'').replace(/\r/g,'').split('\n');
    const html=[]; let list=[];
    const flush=()=>{if(list.length){html.push(`<ul>${list.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`);list=[];}};
    lines.forEach(raw=>{
      const line=raw.trim();
      if(!line){flush();return;}
      if(line.startsWith('## ')){flush();html.push(`<h2>${esc(line.slice(3))}</h2>`);return;}
      if(line.startsWith('- ')){list.push(line.slice(2));return;}
      flush();html.push(`<p>${esc(line)}</p>`);
    });
    flush(); return html.join('');
  };
  const{data,error}=await window.knaSupabase.from('content_posts').select('title,category,body,published_at').eq('id',id).eq('status','published').maybeSingle();
  if(error||!data)return;
  const labels={notice:'공지사항',card:'카드뉴스',policy:'정책 콘텐츠'};
  document.title=`${data.title} | 대한간호학생회 부산 정책국`;
  document.querySelector('#articleTitle').textContent=data.title;
  document.querySelector('#articleCategory').textContent=labels[data.category]||'게시물';
  document.querySelector('#articleDate').textContent=data.published_at?new Date(data.published_at).toLocaleDateString('ko-KR'):'';
  document.querySelector('#articleBody').innerHTML=formatBody(data.body);
})();
