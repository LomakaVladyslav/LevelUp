// Evaluate as Node does during a build, without Expo's Babel env inlining.
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const source = readFileSync(require.resolve('../app.config'), 'utf8');
const configure = (input: unknown) => {
  const module = { exports: null as any };
  runInNewContext(source, { module, process, URL: require('node:url').URL });
  return module.exports(input);
};
const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; });

test('production configuration fails before bundling without a real HTTPS origin', () => {
  for (const url of ['', 'http://localhost:3000', 'https://user:pass@example.test', 'https://example.test/wrong']) {
    process.env = { ...originalEnvironment, NODE_ENV: 'production', EXPO_PUBLIC_API_BASE_URL: url };
    expect(() => configure({ config: {} })).toThrow();
  }
});

test('preview and production profiles preserve native config with a valid origin', () => {
  const config = { name: 'LevelUp', plugins: ['expo-secure-store'] };
  process.env = { ...originalEnvironment, NODE_ENV: 'production', EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_BASE_URL: 'https://example.test/api' };
  expect(configure({ config })).toBe(config);
});

test('development permits local HTTP servers', () => {
  process.env = { ...originalEnvironment, NODE_ENV: 'development', EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000' };
  expect(configure({ config: { name: 'LevelUp' } })).toEqual({ name: 'LevelUp' });
});
