import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Loader2, Plus, Save, Trash2, Pencil, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = {
  date: '',
  ticker: '',
  volume_ratio: '',
  total_value: '',
  avg_price: '',
  result: 'win',
  estimated_return_pct: '',
  note: ''
};

export default function AdminWins() {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [adminEmail, setAdminEmail] = useState('');

  const authedFetch = useMemo(() => async (path, init = {}) => {
    const token = user ? await user.getIdToken() : null;
    return fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {})
      }
    });
  }, [user]);

  const loadEntries = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/wins');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setEntries(data.entries || []);
      setAdminEmail(data.admin || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadEntries();
  }, [user, authLoading]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.date || '',
      ticker: entry.ticker || '',
      volume_ratio: entry.volume_ratio ?? '',
      total_value: entry.total_value ?? '',
      avg_price: entry.avg_price ?? '',
      result: entry.result || 'win',
      estimated_return_pct: entry.estimated_return_pct ?? '',
      note: entry.note || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setSubmitting(true);
    try {
      const payload = {
        date: form.date,
        ticker: form.ticker.toUpperCase().trim(),
        volume_ratio: Number(form.volume_ratio) || 0,
        total_value: Number(form.total_value) || 0,
        avg_price: Number(form.avg_price) || 0,
        result: form.result,
        estimated_return_pct: Number(form.estimated_return_pct) || 0,
        note: form.note
      };

      const url = editingId
        ? `/api/admin/wins?id=${encodeURIComponent(editingId)}`
        : '/api/admin/wins';
      const method = editingId ? 'PUT' : 'POST';

      const res = await authedFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus(editingId ? 'Updated.' : 'Added.');
      resetForm();
      await loadEntries();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    setError('');
    setStatus('');
    try {
      const res = await authedFetch(`/api/admin/wins?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setStatus('Deleted.');
      await loadEntries();
    } catch (err) {
      setError(err.message);
    }
  };

  if (authLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Checking auth…</div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <NoticeCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          title="Sign in required"
          body="This page is for admins only. Sign in with the email listed in ADMIN_EMAILS."
        >
          <Link href="/login" className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg px-4 py-2 text-sm">
            Go to sign in
          </Link>
        </NoticeCard>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Track record · admin</h1>
          <p className="text-sm text-gray-600 mt-1">Add or edit the trades shown on <Link href="/wins" className="text-green-700 underline">/wins</Link>.</p>
        </div>
        {adminEmail && (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" /> {adminEmail}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}
      {status && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{status}</div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-gray-200 rounded-2xl p-5 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">
            {editingId ? 'Edit entry' : 'Add new trade'}
          </h2>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Date" hint="YYYY-MM-DD">
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Ticker">
            <input
              type="text"
              required
              maxLength={10}
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
              placeholder="AAPL"
              className={inputCls}
            />
          </Field>
          <Field label="Result">
            <select
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value })}
              className={inputCls}
            >
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="flat">Flat</option>
            </select>
          </Field>
          <Field label="Return %" hint="-5 for -5%, 12 for +12%">
            <input
              type="number"
              step="0.1"
              value={form.estimated_return_pct}
              onChange={(e) => setForm({ ...form, estimated_return_pct: e.target.value })}
              placeholder="12.5"
              className={inputCls}
            />
          </Field>
          <Field label="Volume ratio" hint="e.g. 3.2 for 3.2×">
            <input
              type="number"
              step="0.01"
              value={form.volume_ratio}
              onChange={(e) => setForm({ ...form, volume_ratio: e.target.value })}
              placeholder="3.2"
              className={inputCls}
            />
          </Field>
          <Field label="Notional (USD)" hint="dark pool dollar value">
            <input
              type="number"
              step="1000000"
              value={form.total_value}
              onChange={(e) => setForm({ ...form, total_value: e.target.value })}
              placeholder="500000000"
              className={inputCls}
            />
          </Field>
          <Field label="Avg price">
            <input
              type="number"
              step="0.01"
              value={form.avg_price}
              onChange={(e) => setForm({ ...form, avg_price: e.target.value })}
              placeholder="178.42"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Note" hint="Short context shown in the table (max 280 chars)" className="mt-3">
          <input
            type="text"
            maxLength={280}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="3.2× volume + tradeable straddle into earnings"
            className={inputCls}
          />
        </Field>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-black text-white font-semibold rounded-lg px-4 py-2 text-sm disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? 'Save changes' : 'Add entry'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Discard
            </button>
          )}
        </div>
      </form>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Existing entries ({entries.length})</h2>
          <button onClick={loadEntries} className="text-xs text-gray-600 hover:text-gray-900">Refresh</button>
        </div>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No entries yet. Use the form above to add your first trade.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Ticker</th>
                  <th className="text-right px-4 py-2">Vol×</th>
                  <th className="text-right px-4 py-2">Notional</th>
                  <th className="text-center px-4 py-2">Result</th>
                  <th className="text-right px-4 py-2">Return</th>
                  <th className="text-left px-4 py-2">Note</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{e.date}</td>
                    <td className="px-4 py-2 font-bold text-gray-900">${e.ticker}</td>
                    <td className="px-4 py-2 text-right font-mono">{Number(e.volume_ratio || 0).toFixed(2)}×</td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(e.total_value || 0))}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <ResultPill result={e.result} />
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${Number(e.estimated_return_pct) > 0 ? 'text-green-700' : Number(e.estimated_return_pct) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {Number(e.estimated_return_pct) > 0 ? '+' : ''}{Number(e.estimated_return_pct).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate" title={e.note}>{e.note}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(e)}
                        className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 mr-3"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500';

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs font-semibold text-gray-700 mb-1">{label}{hint && <span className="ml-1 font-normal text-gray-400">· {hint}</span>}</div>
      {children}
    </label>
  );
}

function ResultPill({ result }) {
  const map = {
    win: 'bg-green-100 text-green-700',
    loss: 'bg-red-100 text-red-700',
    flat: 'bg-gray-100 text-gray-700'
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${map[result] || map.flat}`}>
      {result || 'flat'}
    </span>
  );
}

function NoticeCard({ icon, title, body, children }) {
  return (
    <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-2xl p-6 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 border border-amber-200 mb-3 mx-auto">
        {icon}
      </div>
      <h2 className="font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-600 mb-4">{body}</p>
      {children}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Track Record Admin · KAHF Capital</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <section className="max-w-6xl mx-auto px-4 py-10">
        {children}
      </section>
      <Footer />
    </div>
  );
}
