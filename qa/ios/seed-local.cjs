// Run only against the dedicated local smoke-test server described in README.md.
const origin = 'http://127.0.0.1:3301/api';
const credentials = { email: 'levelup-flow-0908@example.test', password: 'LevelUp-QA-2026!' };
async function request(path, body, token) {
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
(async () => {
  let session;
  try { session = await request('/auth/login', credentials); }
  catch { session = await request('/auth/register', { ...credentials, username: 'FlowQA' }); }
  const history = await request('/activities', undefined, session.token);
  if (history.activities.length === 0) {
    const result = await request('/planned-activities', { title: 'iOS QA history fixture', type: 'STUDY', scheduleType: 'SIMPLE', timezone: 'UTC' }, session.token);
    await request(`/planned-activities/${result.plannedActivity.id}/complete`, {}, session.token);
  }
  console.log('Local QA fixture ready; token omitted.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
