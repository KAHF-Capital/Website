// Raw-body helpers for webhook routes (signatures are computed over the exact
// bytes the provider sent, so Next's body parser is disabled there).

export async function readRawBody(req, { limit = 1024 * 1024 } = {}) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseBody(raw, contentType = '') {
  if (!raw) return {};
  if (String(contentType).includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
