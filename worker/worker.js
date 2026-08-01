const START_CLEANUP_BYTES = 9_000_000_000;
const TARGET_BYTES = 7_500_000_000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://bnleader.kro.kr',
  'https://www.bnleader.kro.kr'
];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status >= 500) console.error(error);
      return json({ ok: false, message: error?.message || '요청을 처리하지 못했습니다.' }, status, request, env);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanupStorage(env, { force: false, reason: 'scheduled' }));
  }
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method === 'GET' && (pathname === '/' || pathname === '/health')) {
    return json({ ok: true, message: '파일 서비스가 정상 작동 중입니다.' }, 200, request, env);
  }

  if (request.method === 'POST' && pathname === '/upload') {
    return uploadFile(request, env, ctx);
  }

  const viewMatch = pathname.match(/^\/view\/([0-9a-f-]{36})$/i);
  if (request.method === 'GET' && viewMatch) {
    return serveFile(request, env, viewMatch[1], false);
  }

  const downloadMatch = pathname.match(/^\/download\/([0-9a-f-]{36})$/i);
  if (request.method === 'GET' && downloadMatch) {
    return serveFile(request, env, downloadMatch[1], true);
  }

  const fileMatch = pathname.match(/^\/files\/([0-9a-f-]{36})$/i);
  if (request.method === 'PATCH' && fileMatch) {
    return updateFile(request, env, fileMatch[1]);
  }
  if (request.method === 'DELETE' && fileMatch) {
    return deleteFile(request, env, fileMatch[1]);
  }

  if (request.method === 'GET' && pathname === '/admin/files') {
    return listFiles(request, env, url);
  }
  if (request.method === 'GET' && pathname === '/admin/storage') {
    return storageStatus(request, env);
  }
  if (request.method === 'POST' && pathname === '/admin/cleanup') {
    const access = await requireFileManager(request, env);
    const result = await cleanupStorage(env, { force: true, reason: `manual:${access.id}` });
    return json({ ok: true, ...result }, 200, request, env);
  }

  return json({ ok: false, message: '요청한 기능을 찾을 수 없습니다.' }, 404, request, env);
}

async function uploadFile(request, env, ctx) {
  const access = await requireApprovedUser(request, env);
  const size = Number(request.headers.get('x-file-size') || request.headers.get('content-length') || 0);
  if (!Number.isFinite(size) || size <= 0) throw httpError(400, '파일 크기를 확인할 수 없습니다.');
  if (size > MAX_FILE_BYTES) throw httpError(413, '파일은 50MB 이하만 업로드할 수 있습니다.');

  const originalName = decodeBase64Utf8(request.headers.get('x-file-name-b64') || '');
  if (!originalName) throw httpError(400, '파일 이름을 확인할 수 없습니다.');

  const mimeType = String(request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const purpose = normalizePurpose(request.headers.get('x-file-purpose'));
  const audience = normalizeAudience(request.headers.get('x-file-audience'));
  const downloadEnabled = request.headers.get('x-download-enabled') !== 'false';

  assertAllowedFile(originalName, mimeType, purpose);

  const projected = (await getStorageObjects(env.FILES)).totalBytes + size;
  if (projected >= START_CLEANUP_BYTES) {
    const preUploadTarget = Math.max(0, TARGET_BYTES - size);
    await cleanupStorage(env, { force: true, targetBytes: preUploadTarget, reason: 'before-upload' });
  }

  const afterCleanup = (await getStorageObjects(env.FILES)).totalBytes;
  if (afterCleanup + size >= START_CLEANUP_BYTES && afterCleanup > 0) {
    throw httpError(507, '저장공간 정리 후에도 파일을 저장할 공간이 부족합니다. 파일 관리자에게 문의해 주세요.');
  }

  const id = crypto.randomUUID();
  const accessToken = crypto.randomUUID();
  const safeName = sanitizeFileName(originalName);
  const now = new Date();
  const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}-${safeName}`;

  const stored = await env.FILES.put(key, request.body, {
    httpMetadata: {
      contentType: mimeType,
      contentDisposition: purpose === 'attachment'
        ? `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`
        : `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`
    },
    customMetadata: {
      fileId: id,
      uploaderId: access.id,
      originalName: truncateMetadata(originalName),
      purpose,
      audience,
      downloadEnabled: String(downloadEnabled),
      accessToken,
      createdAt: now.toISOString()
    }
  });

  const row = {
    id,
    object_key: key,
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: stored.size || size,
    uploader_id: access.id,
    purpose,
    audience,
    download_enabled: downloadEnabled,
    access_token: accessToken,
    status: 'active'
  };

  try {
    await serviceInsert(env, 'site_files', row);
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }

  const base = new URL(request.url).origin;
  const result = publicFileShape(row, base);
  ctx.waitUntil(cleanupStorage(env, { force: false, reason: 'after-upload' }));
  return json({ ok: true, file: result }, 201, request, env);
}

async function serveFile(request, env, id, forceDownload) {
  const row = await getFileRow(env, id);
  if (!row || row.status !== 'active') throw httpError(404, '파일을 찾을 수 없습니다.');

  const url = new URL(request.url);
  const tokenMatches = safeEqual(String(url.searchParams.get('t') || ''), String(row.access_token || ''));
  const access = await optionalApprovedUser(request, env);
  const isManager = Boolean(access && (access.system_role === 'policy_director' || access.permissions?.includes('file_manage')));
  const isOwner = Boolean(access && access.id === row.uploader_id);

  if (forceDownload) {
    if (!row.download_enabled && !isManager && !isOwner) {
      throw httpError(403, '이 파일은 다른 리더의 다운로드가 허용되지 않았습니다.');
    }
    const publicAllowed = row.audience === 'public' && tokenMatches;
    const leaderAllowed = Boolean(access && access.approval_status === 'approved');
    if (!publicAllowed && !leaderAllowed && !isManager && !isOwner) {
      throw httpError(401, '로그인이 필요합니다.');
    }
  } else {
    const inlineAllowed = tokenMatches && String(row.mime_type || '').startsWith('image/');
    const authenticatedAllowed = Boolean(access && access.approval_status === 'approved');
    if (!inlineAllowed && !authenticatedAllowed && !isManager && !isOwner) {
      throw httpError(401, '파일을 볼 권한이 없습니다.');
    }
  }

  const object = await env.FILES.get(row.object_key);
  if (!object) throw httpError(404, '저장된 파일을 찾을 수 없습니다.');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', row.audience === 'public' ? 'public, max-age=3600' : 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (forceDownload) {
    headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
    waitUntilNoThrow(updateLastDownloaded(env, row.id));
  } else {
    headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);
  }
  applyCors(headers, request, env);
  return new Response(object.body, { status: 200, headers });
}

async function updateFile(request, env, id) {
  const access = await requireApprovedUser(request, env);
  const row = await getFileRow(env, id);
  if (!row || row.status !== 'active') throw httpError(404, '파일을 찾을 수 없습니다.');
  const isManager = access.system_role === 'policy_director' || access.permissions?.includes('file_manage');
  if (row.uploader_id !== access.id && !isManager) throw httpError(403, '파일 설정을 변경할 권한이 없습니다.');

  const body = await readJson(request);
  const patch = { updated_at: new Date().toISOString() };
  if ('downloadEnabled' in body) patch.download_enabled = Boolean(body.downloadEnabled);
  if ('audience' in body) patch.audience = normalizeAudience(body.audience);
  if ('linkedContentId' in body) patch.linked_content_id = body.linkedContentId || null;

  const updated = await servicePatch(env, 'site_files', `id=eq.${encodeURIComponent(id)}`, patch, true);
  const next = updated?.[0] || { ...row, ...patch };
  return json({ ok: true, file: publicFileShape(next, new URL(request.url).origin) }, 200, request, env);
}

async function deleteFile(request, env, id) {
  const access = await requireFileManager(request, env);
  const row = await getFileRow(env, id);
  if (!row || row.status !== 'active') throw httpError(404, '파일을 찾을 수 없습니다.');
  await env.FILES.delete(row.object_key);
  await servicePatch(env, 'site_files', `id=eq.${encodeURIComponent(id)}`, {
    status: 'deleted',
    deleted_at: new Date().toISOString(),
    deleted_reason: `manual:${access.id}`,
    updated_at: new Date().toISOString()
  });
  return json({ ok: true, message: '파일을 삭제했습니다.' }, 200, request, env);
}

async function listFiles(request, env, url) {
  await requireFileManager(request, env);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
  const rows = await serviceSelect(env, 'site_files', `select=*&status=eq.active&order=created_at.desc&limit=${limit}`);
  const base = new URL(request.url).origin;
  return json({ ok: true, files: rows.map(row => publicFileShape(row, base)) }, 200, request, env);
}

async function storageStatus(request, env) {
  await requireFileManager(request, env);
  const current = await getStorageObjects(env.FILES);
  return json({
    ok: true,
    usedBytes: current.totalBytes,
    fileCount: current.objects.length,
    cleanupStartsAtBytes: START_CLEANUP_BYTES,
    cleanupTargetBytes: TARGET_BYTES,
    remainingUntilCleanupBytes: Math.max(0, START_CLEANUP_BYTES - current.totalBytes)
  }, 200, request, env);
}

async function cleanupStorage(env, options = {}) {
  const current = await getStorageObjects(env.FILES);
  const targetBytes = Number.isFinite(options.targetBytes) ? Math.max(0, options.targetBytes) : TARGET_BYTES;
  if (!options.force && current.totalBytes < START_CLEANUP_BYTES) {
    return { cleaned: false, beforeBytes: current.totalBytes, afterBytes: current.totalBytes, deletedCount: 0 };
  }
  if (current.totalBytes <= targetBytes) {
    return { cleaned: false, beforeBytes: current.totalBytes, afterBytes: current.totalBytes, deletedCount: 0 };
  }

  const sorted = [...current.objects].sort((a, b) => new Date(a.uploaded).getTime() - new Date(b.uploaded).getTime());
  let remaining = current.totalBytes;
  const toDelete = [];
  for (const object of sorted) {
    if (remaining <= targetBytes) break;
    toDelete.push(object);
    remaining -= object.size || 0;
  }

  for (let i = 0; i < toDelete.length; i += 1000) {
    await env.FILES.delete(toDelete.slice(i, i + 1000).map(item => item.key));
  }

  const deletedAt = new Date().toISOString();
  for (let i = 0; i < toDelete.length; i += 100) {
    const keys = toDelete.slice(i, i + 100).map(item => item.key);
    await markDeletedByKeys(env, keys, deletedAt, options.reason || 'automatic-cleanup');
  }

  return {
    cleaned: toDelete.length > 0,
    beforeBytes: current.totalBytes,
    afterBytes: Math.max(0, remaining),
    deletedCount: toDelete.length,
    deletedBytes: current.totalBytes - Math.max(0, remaining)
  };
}

async function getStorageObjects(bucket) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ limit: 1000, cursor, include: ['customMetadata', 'httpMetadata'] });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { objects, totalBytes: objects.reduce((sum, item) => sum + (item.size || 0), 0) };
}

async function requireApprovedUser(request, env) {
  const access = await getUserAccess(request, env, true);
  if (!access || access.approval_status !== 'approved') throw httpError(403, '승인된 리더만 이용할 수 있습니다.');
  return access;
}

async function optionalApprovedUser(request, env) {
  try {
    return await getUserAccess(request, env, false);
  } catch (_) {
    return null;
  }
}

async function requireFileManager(request, env) {
  const access = await requireApprovedUser(request, env);
  if (access.system_role !== 'policy_director' && !access.permissions?.includes('file_manage')) {
    throw httpError(403, '파일 관리 권한이 없습니다.');
  }
  return access;
}

async function getUserAccess(request, env, required) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    if (required) throw httpError(401, '로그인이 필요합니다.');
    return null;
  }
  assertSupabaseEnv(env, false);
  const response = await fetch(`${trimSlash(env.SUPABASE_URL)}/rest/v1/rpc/get_my_access`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization,
      'content-type': 'application/json'
    },
    body: '{}'
  });
  if (!response.ok) {
    if (required) throw httpError(401, '로그인 정보를 확인하지 못했습니다.');
    return null;
  }
  return response.json();
}

async function getFileRow(env, id) {
  const rows = await serviceSelect(env, 'site_files', `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0] || null;
}

async function updateLastDownloaded(env, id) {
  try {
    await servicePatch(env, 'site_files', `id=eq.${encodeURIComponent(id)}`, {
      last_downloaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('last_downloaded_at update failed', error);
  }
}

async function markDeletedByKeys(env, keys, deletedAt, reason) {
  if (!keys.length) return;
  await serviceRpc(env, 'mark_site_files_deleted_v1', {
    p_object_keys: keys,
    p_deleted_at: deletedAt,
    p_reason: reason
  });
}

function publicFileShape(row, base) {
  const token = encodeURIComponent(row.access_token);
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    purpose: row.purpose,
    audience: row.audience,
    downloadEnabled: Boolean(row.download_enabled),
    uploaderId: row.uploader_id,
    linkedContentId: row.linked_content_id,
    createdAt: row.created_at,
    viewUrl: `${base}/view/${row.id}?t=${token}`,
    downloadUrl: `${base}/download/${row.id}?t=${token}`
  };
}

function normalizePurpose(value) {
  const allowed = new Set(['cover', 'body-image', 'attachment', 'board-image', 'page-image', 'popup-image']);
  const next = String(value || 'attachment');
  return allowed.has(next) ? next : 'attachment';
}

function normalizeAudience(value) {
  const allowed = new Set(['public', 'leaders', 'executives']);
  const next = String(value || 'leaders');
  return allowed.has(next) ? next : 'leaders';
}

function assertAllowedFile(name, mimeType, purpose) {
  const extension = String(name).toLowerCase().split('.').pop() || '';
  const allowedExtensions = new Set([
    'png', 'jpg', 'jpeg', 'webp', 'gif',
    'pdf', 'ppt', 'pptx', 'doc', 'docx', 'hwp', 'hwpx',
    'xls', 'xlsx', 'csv', 'txt', 'zip'
  ]);
  if (!allowedExtensions.has(extension)) throw httpError(415, '허용되지 않는 파일 형식입니다.');
  if (['cover', 'body-image', 'board-image', 'page-image', 'popup-image'].includes(purpose) && !mimeType.startsWith('image/')) {
    throw httpError(415, '이 위치에는 이미지 파일만 업로드할 수 있습니다.');
  }
}

function sanitizeFileName(value) {
  const normalized = String(value || 'file').normalize('NFKC');
  const dot = normalized.lastIndexOf('.');
  const extension = dot >= 0 ? normalized.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
  const base = (dot >= 0 ? normalized.slice(0, dot) : normalized)
    .replace(/[^0-9a-zA-Z가-힣_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
  return `${base}${extension}`;
}

function decodeBase64Utf8(value) {
  try {
    const binary = atob(String(value || ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (_) {
    return '';
  }
}

function truncateMetadata(value) {
  return String(value || '').slice(0, 900);
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(request, env) {
  const headers = new Headers();
  applyCors(headers, request, env);
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type,x-file-name-b64,x-file-size,x-file-purpose,x-file-audience,x-download-enabled');
  headers.set('access-control-max-age', '86400');
  return headers;
}

function applyCors(headers, request, env) {
  const origin = request.headers.get('origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'origin');
  }
}

function json(payload, status, request, env) {
  const headers = new Headers(JSON_HEADERS);
  applyCors(headers, request, env);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(payload), { status, headers });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    throw httpError(400, '요청 내용이 올바르지 않습니다.');
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function assertSupabaseEnv(env, serviceRequired = true) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('로그인 연동 설정이 누락되었습니다.');
  if (serviceRequired && !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('서버 전용 연동 설정이 누락되었습니다.');
}

function serviceHeaders(env, extra = {}) {
  assertSupabaseEnv(env, true);
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra
  };
}

async function serviceSelect(env, table, query) {
  const response = await fetch(`${trimSlash(env.SUPABASE_URL)}/rest/v1/${table}?${query}`, {
    headers: serviceHeaders(env)
  });
  if (!response.ok) throw new Error(`파일 기록 조회 실패: ${await response.text()}`);
  return response.json();
}

async function serviceInsert(env, table, body) {
  const response = await fetch(`${trimSlash(env.SUPABASE_URL)}/rest/v1/${table}`, {
    method: 'POST',
    headers: serviceHeaders(env, { prefer: 'return=representation' }),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`파일 기록 저장 실패: ${await response.text()}`);
  return response.json();
}

async function serviceRpc(env, functionName, body) {
  const response = await fetch(`${trimSlash(env.SUPABASE_URL)}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`파일 기록 처리 실패: ${await response.text()}`);
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : null;
}

async function servicePatch(env, table, filter, body, returnRepresentation = false) {
  const response = await fetch(`${trimSlash(env.SUPABASE_URL)}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: serviceHeaders(env, { prefer: returnRepresentation ? 'return=representation' : 'return=minimal' }),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`파일 기록 수정 실패: ${await response.text()}`);
  return returnRepresentation ? response.json() : null;
}

function waitUntilNoThrow(promise) {
  Promise.resolve(promise).catch(error => console.warn(error));
}
