// Fail a release build during configuration, before an unusable binary is produced.
module.exports = ({ config }) => {
  const release = process.env.NODE_ENV === 'production' ||
    ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE);
  if (release) {
    const value = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
    if (!value) throw new Error('Set EXPO_PUBLIC_API_BASE_URL to the HTTPS API origin before building a release.');
    let url;
    try { url = new URL(value); } catch { throw new Error('EXPO_PUBLIC_API_BASE_URL is not a valid URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', '/api', '/api/'].includes(url.pathname)) {
      throw new Error('Release API URL must be an HTTPS origin, optionally ending in /api, without credentials or query parameters.');
    }
  }
  return config;
};
