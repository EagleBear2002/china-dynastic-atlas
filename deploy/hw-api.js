#!/usr/bin/env node
// Huawei Cloud OpenAPI signed-request helper (SDK-HMAC-SHA256).
// Credentials come from HW_AK / HW_SK environment variables.
//
// Quirk handling: Huawei APIG may verify the signature against a canonicalized
// URI (e.g. trailing slash appended) that differs from the request path, and it
// echoes the canonical_request it used inside the 401 error body. On 401 we
// parse that canonical request and retry once with the server's own path.
//
// CLI usage:
//   node hw-api.js get  <url>
//   node hw-api.js post <url> <json-string-or-@file>
// Module usage:
//   const { call } = require('./hw-api.js'); await call('GET', url)

const crypto = require('crypto');

const AK = process.env.HW_AK;
const SK = process.env.HW_SK;

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

function canonicalQueryOf(u) {
  const params = [];
  u.searchParams.forEach((v, k) => params.push([k, v]));
  params.sort((a, b) => (a[0] + '=' + a[1] < b[0] + '=' + b[1] ? -1 : 1));
  return params
    .map(([k, v]) => `${encodeOf(k)}=${encodeOf(v)}`)
    .join('&');
}

// Percent-encoding matching the official SDK signer (uppercase hex).
function encodeOf(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
}

// The official signer always appends a trailing slash to the canonical URI.
function canonicalPathOf(pathname) {
  let p = (pathname || '/').split('/').map(encodeOf).join('/');
  if (!p.endsWith('/')) p += '/';
  return p;
}

function serverCanonicalPath(body) {
  try {
    const msg = JSON.parse(body).error_msg || '';
    const m = msg.match(/canonical_request:(\w+)\|([^|]*)\|/);
    if (m) return m[2];
  } catch {}
  return null;
}

async function call(method, rawUrl, bodyStr) {
  if (!AK || !SK) throw new Error('HW_AK / HW_SK not set');
  const payload = bodyStr || '';
  let currentUrl = rawUrl;
  let pathOverride = null;
  let lastAuthHeader = null;

  for (let hop = 0; hop < 5; hop++) {
    const u = new URL(currentUrl);
    const host = u.hostname;
    const path = pathOverride || canonicalPathOf(u.pathname);
    const canonicalQuery = canonicalQueryOf(u);
    const xSdkDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const headers = { host, 'x-sdk-date': xSdkDate };
    if (bodyStr) headers['content-type'] = 'application/json';
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join('');
    const signedHeaders = names.join(';');

    const canonicalRequest = [
      method,
      path,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      sha256hex(payload),
    ].join('\n');
    const stringToSign = ['SDK-HMAC-SHA256', xSdkDate, sha256hex(canonicalRequest)].join('\n');
    const signature = crypto.createHmac('sha256', SK).update(stringToSign).digest('hex');
    const authorization = `SDK-HMAC-SHA256 Access=${AK}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    lastAuthHeader = authorization;

    const res = await fetch(currentUrl, {
      method,
      headers: { ...headers, authorization },
      body: bodyStr ? payload : undefined,
      redirect: 'manual',
    });

    if ([301, 302, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (loc) {
        currentUrl = new URL(loc, currentUrl).href;
        continue;
      }
    }

    const text = await res.text();

    if (res.status === 401) {
      const srvPath = serverCanonicalPath(text);
      if (srvPath && srvPath !== path) {
        pathOverride = srvPath;
        continue;
      }
      const err = new Error(`401 ${text.slice(0, 300)}`);
      err.status = 401;
      err.body = text;
      throw err;
    }

    return { status: res.status, body: text, auth: lastAuthHeader };
  }
  throw new Error('too many retries/redirects');
}

module.exports = { call };

if (require.main === module) {
  const [, , cmd, url, bodyArg] = process.argv;
  if (cmd !== 'get' && cmd !== 'post') {
    console.error('usage: hw-api.js get|post <url> [json|@file]');
    process.exit(2);
  }
  let bodyStr = '';
  if (cmd === 'post') {
    bodyStr =
      bodyArg && bodyArg.startsWith('@')
        ? require('fs').readFileSync(bodyArg.slice(1), 'utf8')
        : bodyArg || '{}';
  }
  call(cmd.toUpperCase(), url, bodyStr)
    .then((r) => {
      console.error('STATUS ' + r.status);
      console.log(r.body);
    })
    .catch((e) => {
      console.error('ERROR ' + e.message);
      process.exit(1);
    });
}
