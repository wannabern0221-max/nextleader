(() => {
  const config = window.SUPABASE_CONFIG || {};
  const invalid =
    !config.url ||
    !config.publishableKey ||
    config.url.includes('PASTE_') ||
    config.publishableKey.includes('PASTE_');

  window.SUPABASE_CONFIG_READY = !invalid;
  if (invalid || !window.supabase?.createClient) {
    window.SUPABASE_CONFIG_READY = false;
    window.knaSupabase = null;
    return;
  }

  window.knaSupabase = window.supabase.createClient(
    config.url,
    config.publishableKey,
    {
      auth: {
        storageKey: 'kna-busan-policy-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
