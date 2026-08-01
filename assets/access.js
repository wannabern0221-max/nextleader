(() => {
  const roleLabels = Object.freeze({
    president: '회장',
    political_vice_president: '정무부회장',
    leader: '리더',
    team_leader: '팀장',
    deputy_manager: '차장',
    section_manager: '과장',
    department_manager: '부장',
    policy_general_manager: '정책총괄부장',
    senior_manager_div1: '정책1부 수석부장',
    senior_manager_div2: '정책2부 수석부장',
    policy_director: '정책국장',
    external_admin: '관리자',
    member: '리더',
    staff: '담당자',
    general_manager: '정책총괄부장',
    senior_manager: '수석부장',
    director: '정책국장'
  });

  const departmentLabels = Object.freeze({
    policy_office: '정책국',
    div1: '정책1부',
    div2: '정책2부',
    '정책국': '정책국',
    '정책1부': '정책1부',
    '정책2부': '정책2부'
  });

  const permissionLabels = Object.freeze({
    member_approve: '가입 승인',
    role_manage: '직책 관리',
    permission_grant: '기능 권한 관리',
    content_write_notice: '공지사항 작성',
    content_write_card: '카드뉴스 작성',
    content_write_policy: '정책 콘텐츠 작성',
    content_approve: '게시 승인',
    news_manage: '외부 뉴스 관리',
    board_moderate: '익명 소통방 관리',
    anonymous_identity_reveal: '익명 작성자 확인',
    schedule_manage_common: '정책국 공통 일정 관리',
    schedule_manage_div1: '정책1부 일정 관리',
    schedule_manage_div2: '정책2부 일정 관리',
    file_manage: '파일 관리',
    system_manage: '시스템 관리'
  });

  const allPermissionCodes = Object.freeze(Object.keys(permissionLabels));
  const coreSecurityPermissions = Object.freeze([
    'member_approve',
    'role_manage',
    'permission_grant',
    'anonymous_identity_reveal',
    'file_manage',
    'system_manage'
  ]);

  const makeSet = values => new Set(values);
  const defaultPermissions = Object.freeze({
    president: makeSet([
      'content_write_notice','content_write_card','content_write_policy','content_approve',
      'news_manage','board_moderate',
      'schedule_manage_common','schedule_manage_div1','schedule_manage_div2'
    ]),
    political_vice_president: makeSet([
      'content_write_notice','content_write_card','content_write_policy','content_approve',
      'news_manage','board_moderate',
      'schedule_manage_common','schedule_manage_div1','schedule_manage_div2'
    ]),
    policy_director: makeSet(allPermissionCodes),
    senior_manager_div1: makeSet([
      'member_approve','role_manage','permission_grant',
      'content_write_notice','content_write_card','content_write_policy','content_approve',
      'board_moderate','schedule_manage_div1'
    ]),
    senior_manager_div2: makeSet([
      'member_approve','role_manage','permission_grant',
      'content_write_notice','content_write_card','content_write_policy','content_approve',
      'board_moderate','schedule_manage_div2'
    ]),
    policy_general_manager: makeSet([
      'permission_grant','content_write_notice','content_write_card','content_write_policy',
      'content_approve','news_manage','board_moderate','schedule_manage_common'
    ]),
    department_manager: makeSet([]),
    deputy_manager: makeSet([]),
    section_manager: makeSet([]),
    team_leader: makeSet([]),
    leader: makeSet([]),
    external_admin: makeSet(['system_manage'])
  });

  const labels = {
    role: value => roleLabels[value] || value || '리더',
    department: value => departmentLabels[value] || value || '정책국',
    permission: value => permissionLabels[value] || value
  };

  const has = (access, code) => Array.isArray(access?.permissions) && access.permissions.includes(code);
  const isExecutive = role => [
    'president','political_vice_president',
    'policy_director','senior_manager_div1','senior_manager_div2','policy_general_manager',
    'director','senior_manager','general_manager'
  ].includes(role);
  const canManageCenter = access => ['member_approve','role_manage','permission_grant','system_manage'].some(code => has(access, code));

  window.KNA_ACCESS = Object.freeze({
    roleLabels,
    departmentLabels,
    permissionLabels,
    allPermissionCodes,
    coreSecurityPermissions,
    defaultPermissions,
    labels,
    has,
    isExecutive,
    canManageCenter
  });
})();
