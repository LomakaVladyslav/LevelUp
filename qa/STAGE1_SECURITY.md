# Stage 1 security decisions — 2026-10-27

## Dependency review

Baseline audit: backend 5 (4 high, 1 critical); mobile 17 (8 moderate, 8 high, 1 critical). This counts npm package findings, not distinct exploitable application defects.

Backend now has zero audit findings after updating body-parser, proxy-addr, multer, nodemailer and brace-expansion. body-parser handles public request bodies (reachable DoS). Multer uses memory storage and a synchronous file filter, so the reported disk/async-filter paths are not used, but the patch is applied. Numeric proxy hop trust does not use the vulnerable subnet matching path. Nodemailer uses one configured SMTP service and fixed templates; user email addresses reach the address parser. Upgrade 9→10.1.4 requires Node >=20 (project runs Node 22); mail rendering is tested using the real stream transport with no delivery. No DKIM or arbitrary attachment content is used. brace-expansion is tooling only.

Mobile updated compatible transitive versions: brace-expansion, compression, fast-uri, follow-redirects, node-forge, shell-quote, source-map-js, undici, zod and React Navigation core/routers. These are mostly development/build tooling, despite being under Expo's production npm dependency tree. follow-redirects is Axios's Node adapter; native uses XHR. The xcode-only uuid override to 11.1.1 retains the CommonJS v4 API; Xcode project ID generation was checked. No Expo/RN/native module version changed.

Remaining **4 package findings, 2 underlying advisories**:
- `decode-uri-component` moderate, inherited through query-string / expo-router. Malformed percent-encoded deep-link/query input can reach decoding (runtime reachable). Fixed 0.5.1 is ESM; query-string 7 expects a callable CommonJS export. Do not force-override. Requires a reviewed compatible backport or Router/SDK upgrade and deep-link regression tests before public release.
- `image-size` high in Metro. Host-side asset parser DoS, not native application runtime; repository images are currently trusted. Fixed 2.x drops synchronous filename input used by Metro. Do not force-override. Resolve with compatible Metro upgrade/backport before release build pipeline is considered hardened; do not process untrusted assets meanwhile.

No audit fix --force, SDK downgrade, native dependency upgrade, production migration, or deployment was performed. npm audit is a known-advisory check, not proof that software has no vulnerabilities.
