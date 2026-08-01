Worker 적용 순서

1. Cloudflare의 bnleader-file-service 코드 편집기에서 worker.js 전체를 붙여넣고 Deploy 합니다.
2. Settings > Variables and Secrets에서 아래 비밀값을 추가합니다.
   이름: SUPABASE_SERVICE_ROLE_KEY
   값: Supabase 프로젝트의 service_role secret key
   주의: 이 값은 GitHub나 홈페이지 코드에 넣으면 안 됩니다.
3. 일반 변수도 확인합니다.
   SUPABASE_URL=https://dsyufrexxrmqjfvonlfg.supabase.co
   SUPABASE_ANON_KEY=현재 공개용 publishable key
   ALLOWED_ORIGINS=https://bnleader.kro.kr,https://www.bnleader.kro.kr
4. Triggers > Cron Triggers에서 "15 * * * *"를 추가합니다.
   Cloudflare 예약 실행은 UTC 기준이며 이 설정은 매시간 15분에 점검합니다.
5. R2 binding은 이미 완료된 FILES -> bnleader-files를 그대로 유지합니다.

자동 정리 기준
- 사용량이 9GB에 도달하면 정리 시작
- 오래된 파일부터 삭제
- 7.5GB까지 줄인 뒤 중단
- 업로드 직전에도 예상 사용량을 검사

보안
- Public Access Disabled 유지
- service_role 키는 Worker secret에만 저장
- 홈페이지에는 기술 서비스 이름을 표시하지 않음
