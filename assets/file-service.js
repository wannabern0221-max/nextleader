(() => {
  const config = window.KNA_FILE_CONFIG || {};
  const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');

  async function authHeaders(optional = false) {
    const client = window.knaSupabase;
    if (!client) {
      if (optional) return {};
      throw new Error('로그인 연결을 확인해 주세요.');
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token && !optional) throw new Error('로그인이 필요합니다.');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function encodeUtf8Base64(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  async function request(path, options = {}) {
    if (!baseUrl) throw new Error('파일 서비스 주소가 설정되지 않았습니다.');
    const headers = new Headers(options.headers || {});
    const auth = await authHeaders(Boolean(options.authOptional));
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    if (options.json !== undefined) {
      headers.set('content-type', 'application/json');
      options.body = JSON.stringify(options.json);
    }
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(payload?.message || `파일 요청에 실패했습니다. (${response.status})`);
    return payload;
  }

  async function upload(file, options = {}) {
    if (!(file instanceof File)) throw new Error('업로드할 파일을 선택해 주세요.');
    const max = Number(config.maxFileBytes || 50 * 1024 * 1024);
    if (file.size > max) throw new Error(`파일은 ${formatBytes(max)} 이하만 업로드할 수 있습니다.`);
    const headers = {
      'content-type': file.type || 'application/octet-stream',
      'x-file-name-b64': encodeUtf8Base64(file.name),
      'x-file-size': String(file.size),
      'x-file-purpose': options.purpose || 'attachment',
      'x-file-audience': options.audience || 'leaders',
      'x-download-enabled': String(options.downloadEnabled !== false)
    };
    const payload = await request('/upload', {
      method: 'POST',
      headers,
      body: file
    });
    return payload.file;
  }

  async function update(id, patch) {
    const payload = await request(`/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: patch
    });
    return payload.file;
  }

  async function remove(id) {
    return request(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function list(limit = 200) {
    const payload = await request(`/admin/files?limit=${encodeURIComponent(limit)}`);
    return payload.files || [];
  }

  async function storage() {
    return request('/admin/storage');
  }

  async function cleanup() {
    return request('/admin/cleanup', { method: 'POST' });
  }

  async function download(file) {
    const item = typeof file === 'string' ? { id: file } : file;
    const url = item.downloadUrl || `${baseUrl}/download/${encodeURIComponent(item.id)}`;
    const headers = await authHeaders(true);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      let message = '파일을 내려받지 못했습니다.';
      try { message = (await response.json()).message || message; } catch (_) {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = item.originalName || item.name || 'download';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let index = -1;
    do { size /= 1024; index += 1; } while (size >= 1024 && index < units.length - 1);
    return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[index]}`;
  }

  function audienceFromVisibility(value) {
    return ['public', 'leaders', 'executives'].includes(value) ? value : 'leaders';
  }

  window.KNA_FILE_SERVICE = Object.freeze({
    baseUrl,
    upload,
    update,
    remove,
    list,
    storage,
    cleanup,
    download,
    formatBytes,
    audienceFromVisibility
  });
})();
