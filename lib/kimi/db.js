// Storage backends for Kimi behind one small interface:
//
//   get(col, id)                      -> doc | null
//   set(col, id, data, { merge })     -> void
//   create(col, id, data)             -> { created }      (atomic create-if-absent)
//   update(col, id, patch)            -> void             (deep-merge upsert)
//   updateIf(col, id, predicate, patch) -> { updated, doc } (transactional)
//   query(col, { where, orderBy, limit }) -> docs
//
// Backends: Firestore (production), a JSON file (local development), and pure
// memory (tests). Select with KIMI_STORE=firestore|file|memory; the default is
// memory under NODE_ENV=test, Firestore in production, and the file otherwise,
// so local development never writes to production Firestore by accident.

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { isFirebaseAdminConfigured, getFirestoreAdmin } from '../firebase-admin.js';

class Increment {
  constructor(n) {
    this.n = n;
  }
}

export function increment(n = 1) {
  return new Increment(n);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Increment);
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function clean(value) {
  if (value instanceof Increment) return value;
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : clean(v)));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out;
  }
  return value;
}

function resolveIncrements(value) {
  if (value instanceof Increment) return value.n;
  if (Array.isArray(value)) return value.map(resolveIncrements);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveIncrements(v);
    return out;
  }
  return value;
}

export function deepMerge(target, patch) {
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) continue;
    if (v instanceof Increment) out[k] = (Number(out[k]) || 0) + v.n;
    else if (isPlainObject(v)) out[k] = deepMerge(isPlainObject(out[k]) ? out[k] : {}, v);
    else out[k] = clone(v);
  }
  return out;
}

function getPath(doc, field) {
  return String(field)
    .split('.')
    .reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), doc);
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function matchesWhere(doc, [field, op, value]) {
  const actual = getPath(doc, field);
  switch (op) {
    case '==':
      return actual === value;
    case '!=':
      return actual !== undefined && actual !== value;
    case '<':
      return actual !== undefined && actual !== null && actual < value;
    case '<=':
      return actual !== undefined && actual !== null && actual <= value;
    case '>':
      return actual !== undefined && actual !== null && actual > value;
    case '>=':
      return actual !== undefined && actual !== null && actual >= value;
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(value);
    default:
      throw new Error(`Unsupported where operator: ${op}`);
  }
}

function normalizeOrderBy(orderBy) {
  if (!orderBy) return null;
  const [field, dir = 'asc'] = Array.isArray(orderBy) ? orderBy : [orderBy];
  return { field, dir: dir === 'desc' ? 'desc' : 'asc' };
}

function sortDocs(docs, order) {
  if (!order) return docs;
  const sign = order.dir === 'desc' ? -1 : 1;
  return docs.sort((a, b) => sign * compareValues(getPath(a, order.field), getPath(b, order.field)));
}

export class MemoryBackend {
  constructor(state = null) {
    this.kind = 'memory';
    this.state = state || { collections: {} };
  }

  _col(name) {
    if (!this.state.collections[name]) this.state.collections[name] = {};
    return this.state.collections[name];
  }

  _beforeAccess() {}

  _afterWrite() {}

  async get(col, id) {
    this._beforeAccess();
    const doc = this._col(col)[String(id)];
    return doc ? clone(doc) : null;
  }

  async set(col, id, data, { merge = false } = {}) {
    this._beforeAccess();
    const c = this._col(col);
    const key = String(id);
    const cleaned = clean(data);
    c[key] = { ...(merge ? deepMerge(c[key], cleaned) : clone(resolveIncrements(cleaned))), id: key };
    this._afterWrite();
  }

  async create(col, id, data) {
    this._beforeAccess();
    const c = this._col(col);
    const key = String(id);
    if (c[key]) return { created: false };
    c[key] = { ...clone(resolveIncrements(clean(data))), id: key };
    this._afterWrite();
    return { created: true };
  }

  async update(col, id, patch) {
    return this.set(col, id, patch, { merge: true });
  }

  async updateIf(col, id, predicate, patch) {
    this._beforeAccess();
    const c = this._col(col);
    const key = String(id);
    const current = c[key] ? clone(c[key]) : null;
    if (!predicate(current)) return { updated: false, doc: current };
    const resolved = clean(typeof patch === 'function' ? patch(current) : patch);
    c[key] = { ...deepMerge(c[key], resolved), id: key };
    this._afterWrite();
    return { updated: true, doc: clone(c[key]) };
  }

  async query(col, { where = [], orderBy = null, limit = null } = {}) {
    this._beforeAccess();
    let docs = Object.values(this._col(col)).filter((d) => where.every((w) => matchesWhere(d, w)));
    docs = sortDocs(docs, normalizeOrderBy(orderBy));
    if (limit) docs = docs.slice(0, limit);
    return docs.map(clone);
  }
}

// Local development store. State is shared through globalThis so every Next.js
// route bundle in the dev server sees the same data, and the file is reloaded
// when another process (the seed script) rewrites it.
export class FileBackend extends MemoryBackend {
  constructor(file) {
    const key = `__kimiFileStore:${file}`;
    if (!globalThis[key]) {
      globalThis[key] = { file, collections: {}, loaded: false, loadedMtimeMs: 0, dirty: false, timer: null };
    }
    super(globalThis[key]);
    this.kind = 'file';
    this.file = file;
    if (!globalThis[key].exitHook) {
      globalThis[key].exitHook = true;
      process.once('beforeExit', () => this.flushSync());
    }
  }

  _load() {
    const s = this.state;
    try {
      const parsed = JSON.parse(fs.readFileSync(s.file, 'utf8'));
      s.collections = parsed && typeof parsed.collections === 'object' ? parsed.collections : {};
      s.loadedMtimeMs = fs.statSync(s.file).mtimeMs;
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[kimi/db] could not read ${s.file}: ${err.message}`);
      s.collections = {};
    }
    s.loaded = true;
  }

  _beforeAccess() {
    const s = this.state;
    if (!s.loaded) {
      this._load();
      return;
    }
    if (s.dirty) return;
    try {
      if (fs.statSync(s.file).mtimeMs > s.loadedMtimeMs + 1) this._load();
    } catch {
      // File not written yet.
    }
  }

  _afterWrite() {
    const s = this.state;
    s.dirty = true;
    if (s.manualFlush) return;
    if (!s.timer) {
      s.timer = setTimeout(() => this.flushSync(), 150);
      if (typeof s.timer.unref === 'function') s.timer.unref();
    }
  }

  flushSync() {
    const s = this.state;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    if (!s.dirty) return;
    const body = JSON.stringify({ version: 1, collections: s.collections });
    fs.mkdirSync(path.dirname(s.file), { recursive: true });
    const tmp = `${s.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, s.file);
    } catch {
      fs.writeFileSync(s.file, body);
      try {
        fs.unlinkSync(tmp);
      } catch {
        // Already gone.
      }
    }
    s.loadedMtimeMs = fs.statSync(s.file).mtimeMs;
    s.dirty = false;
  }
}

function toFirestore(value) {
  if (value instanceof Increment) return admin.firestore.FieldValue.increment(value.n);
  if (Array.isArray(value)) return value.map(toFirestore);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toFirestore(v);
    return out;
  }
  return value;
}

export class FirestoreBackend {
  constructor() {
    this.kind = 'firestore';
    this.db = getFirestoreAdmin();
  }

  _ref(col, id) {
    return this.db.collection(col).doc(String(id));
  }

  async get(col, id) {
    const snap = await this._ref(col, id).get();
    return snap.exists ? { ...snap.data(), id: snap.id } : null;
  }

  async set(col, id, data, { merge = false } = {}) {
    await this._ref(col, id).set(toFirestore(clean({ ...data, id: String(id) })), { merge });
  }

  async create(col, id, data) {
    try {
      await this._ref(col, id).create(toFirestore(clean({ ...data, id: String(id) })));
      return { created: true };
    } catch (err) {
      if (err?.code === 6 || /already exists/i.test(err?.message || '')) return { created: false };
      throw err;
    }
  }

  async update(col, id, patch) {
    await this._ref(col, id).set(toFirestore(clean(patch)), { merge: true });
  }

  async updateIf(col, id, predicate, patch) {
    const ref = this._ref(col, id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? { ...snap.data(), id: snap.id } : null;
      if (!predicate(current)) return { updated: false, doc: current };
      const resolved = clean(typeof patch === 'function' ? patch(current) : patch);
      tx.set(ref, toFirestore({ ...resolved, id: String(id) }), { merge: true });
      return { updated: true, doc: deepMerge(current, resolved) };
    });
  }

  async query(col, { where = [], orderBy = null, limit = null } = {}) {
    const order = normalizeOrderBy(orderBy);
    const build = (withOrder) => {
      let q = this.db.collection(col);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      if (withOrder && order) q = q.orderBy(order.field, order.dir);
      if (withOrder && limit) q = q.limit(limit);
      return q;
    };
    try {
      const snap = await build(true).get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    } catch (err) {
      // Missing composite index: answer from a single-field query and sort here.
      if (err?.code !== 9 || !order) throw err;
      console.warn(`[kimi/db] Firestore index missing for ${col}; sorting in memory. ${err.message}`);
      const snap = await build(false).get();
      let docs = sortDocs(snap.docs.map((d) => ({ ...d.data(), id: d.id })), order);
      if (limit) docs = docs.slice(0, limit);
      return docs;
    }
  }
}

function resolveMode() {
  const explicit = String(process.env.KIMI_STORE || '').toLowerCase();
  if (['memory', 'file', 'firestore'].includes(explicit)) return explicit;
  if (process.env.NODE_ENV === 'test') return 'memory';
  if (process.env.NODE_ENV === 'production') return 'firestore';
  return 'file';
}

export function devStoreFile() {
  return process.env.KIMI_STORE_FILE || path.join(process.cwd(), 'data', 'kimi-dev-store.json');
}

export function getDb() {
  if (globalThis.__kimiDbOverride) return globalThis.__kimiDbOverride;
  const mode = resolveMode();
  if (mode === 'memory') {
    if (!globalThis.__kimiMemoryDb) globalThis.__kimiMemoryDb = new MemoryBackend();
    return globalThis.__kimiMemoryDb;
  }
  if (mode === 'file') return new FileBackend(devStoreFile());
  if (!isFirebaseAdminConfigured()) {
    const err = new Error('Kimi storage is not configured: Firebase Admin credentials are missing (or set KIMI_STORE).');
    err.statusCode = 503;
    throw err;
  }
  if (!globalThis.__kimiFirestoreDb) globalThis.__kimiFirestoreDb = new FirestoreBackend();
  return globalThis.__kimiFirestoreDb;
}

export function describeDb() {
  const mode = globalThis.__kimiDbOverride ? globalThis.__kimiDbOverride.kind : resolveMode();
  return { mode, file: mode === 'file' ? devStoreFile() : null };
}

/** Batch writes to the dev file store and write once at the end (seeding). */
export function setFileAutoFlush(enabled) {
  const db = getDb();
  if (db.kind === 'file') db.state.manualFlush = !enabled;
  return db;
}

/** Swap in a fresh in-memory database (tests, replay). */
export function useMemoryDb() {
  globalThis.__kimiDbOverride = new MemoryBackend();
  return globalThis.__kimiDbOverride;
}

export function flushDb() {
  const db = globalThis.__kimiDbOverride || (resolveMode() === 'file' ? new FileBackend(devStoreFile()) : null);
  if (db && typeof db.flushSync === 'function') db.flushSync();
}
