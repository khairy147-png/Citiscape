import { banks, byId, expiry } from './netlify/functions/assessment-bank.js';

const ADMIN_HASH = 'a5abc26ff83a620fae8a850d82dddd43c1b805b063bb1c2e9e63407afd112355';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

const shuffle = (items) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const isTax = q => /VAT|Corporate Tax|Tax Controls/i.test(q.topic || '');
const pickLevel = level => {
  const pool = banks[level] || [];
  const tax = shuffle(pool.filter(isTax));
  const other = shuffle(pool.filter(q => !isTax(q)));
  return shuffle([...tax.slice(0, 2), ...other.slice(0, 10)]);
};
const expired = () => Date.now() > Date.parse(expiry);

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function storeStub(env) {
  const id = env.ASSESSMENT_STORE.idFromName('nps-accounting-interview');
  return env.ASSESSMENT_STORE.get(id);
}

async function storageCall(env, action, body = {}) {
  const stub = storeStub(env);
  return stub.fetch('https://internal/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function startAssessment(request, env) {
  if (expired()) return json({ error: 'This assessment is no longer available.' }, 410);
  const b = await request.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  const mobile = String(b.mobile || '').trim();
  const salary = String(b.salary ?? '').trim();
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !salary) {
    return json({ error: 'Please complete the required candidate details.' }, 400);
  }

  const technical = [...pickLevel(1), ...pickLevel(2), ...pickLevel(3)];
  const level4 = shuffle(banks[4] || []);
  if (technical.length !== 36 || level4.length !== 24) {
    return json({ error: 'Assessment configuration error.' }, 500);
  }

  const all = [...technical, ...level4];
  const session = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const record = {
    session,
    startedAt,
    candidate: { name, email, mobile, salary },
    ids: all.map(q => q.id),
    completed: false
  };
  const saved = await storageCall(env, 'put-session', { session, record });
  if (!saved.ok) return json({ error: 'Unable to start assessment.' }, 500);

  const questions = all.map(q => {
    const opts = shuffle(q.options.map((text, original) => ({ text, original })));
    return {
      id: q.id,
      level: q.level,
      topic: q.topic,
      question: q.question,
      options: opts.map(x => x.text),
      map: opts.map(x => x.original)
    };
  });
  return json({ session, startedAt, questions });
}

async function submitAssessment(request, env) {
  if (expired()) return json({ error: 'This assessment is no longer available.' }, 410);
  const b = await request.json().catch(() => ({}));
  const session = String(b.session || '');
  if (!session) return json({ error: 'Invalid assessment session.' }, 400);

  const sr = await storageCall(env, 'get-session', { session });
  if (!sr.ok) return json({ error: 'Invalid assessment session.' }, 403);
  const { record: s } = await sr.json();
  if (!s) return json({ error: 'Invalid assessment session.' }, 403);
  if (s.completed) return json({ error: 'Assessment already submitted.' }, 410);
  if (!Array.isArray(b.answers) || b.answers.length !== s.ids.length) {
    return json({ error: 'Please answer all questions before submitting.' }, 400);
  }

  let acct = 0, cog = 0, cogN = 0;
  const lc = { 1: 0, 2: 0, 3: 0 }, lt = { 1: 0, 2: 0, 3: 0 };
  const dims = {}, dmax = {}, detail = [];

  for (let i = 0; i < s.ids.length; i++) {
    const q = byId[s.ids[i]];
    if (!q) return json({ error: 'Assessment configuration mismatch.' }, 500);
    const sel = Number(b.answers[i]?.original);
    const candidate = q.options[sel] ?? 'No answer';

    if (q.level <= 3) {
      lt[q.level]++;
      const ok = sel === Number(q.answer);
      if (ok) { acct++; lc[q.level]++; }
      detail.push({ n: i + 1, level: q.level, topic: q.topic, question: q.question, candidate, correct: q.options[q.answer], ok, score: ok ? 1 : 0, max: 1, type: 'technical' });
      continue;
    }

    const kind = q.assessment_type || q.type || 'cognitive';
    if (kind === 'cognitive') {
      cogN++;
      const ok = sel === Number(q.answer);
      if (ok) cog++;
      detail.push({ n: i + 1, level: 4, topic: q.topic, question: q.question, candidate, correct: q.options[q.answer], ok, score: ok ? 1 : 0, max: 1, type: 'cognitive' });
      continue;
    }

    const d = q.profile?.dimension || 'Behavior';
    const scores = q.profile?.scores || [0, 0, 0];
    const sc = Number(scores[sel] ?? 0);
    dims[d] = (dims[d] || 0) + sc;
    dmax[d] = (dmax[d] || 0) + 3;
    detail.push({ n: i + 1, level: 4, topic: q.topic, question: q.question, candidate, score: sc, max: 3, type: 'behavior' });
  }

  const accounting = Math.round(acct / 36 * 100);
  const levels = {};
  [1, 2, 3].forEach(l => levels[l] = Math.round(lc[l] / Math.max(1, lt[l]) * 100));
  const cognitive = Math.round(cog / Math.max(1, cogN) * 100);
  let bp = 0, bm = 0;
  const dimensions = {};
  Object.keys(dims).forEach(d => {
    bp += dims[d]; bm += dmax[d];
    dimensions[d] = Math.round(dims[d] / Math.max(1, dmax[d]) * 100);
  });
  const behavior = Math.round(bp / Math.max(1, bm) * 100);

  let technical = 'Not Recommended at This Stage';
  if (levels[1] >= 75 && levels[2] >= 70 && levels[3] >= 70 && accounting >= 72) technical = 'Recommended — Chief Accountant';
  else if (levels[1] >= 70 && levels[2] >= 65 && accounting >= 65) technical = 'Recommended — Senior Accountant';
  else if (levels[1] >= 60 && accounting >= 55) technical = 'Recommended — General Accountant';

  const fit = Math.round(accounting * .65 + cognitive * .20 + behavior * .15);
  const hiring = fit >= 85 && accounting >= 70 ? 'Highly Recommended'
    : fit >= 72 && accounting >= 60 ? 'Recommended'
    : fit >= 60 ? 'Consider with Interview Review'
    : 'Not Recommended at This Stage';

  const completedAt = new Date().toISOString();
  const elapsed = Math.max(0, Number(b.elapsed) || Math.round((Date.now() - Date.parse(s.startedAt)) / 1000));
  const report = {
    id: crypto.randomUUID(),
    candidate: s.candidate,
    startedAt: s.startedAt,
    completedAt,
    elapsed,
    accounting,
    accountingCorrect: acct,
    levels,
    cognitive,
    behavior,
    dimensions,
    technical,
    fit,
    hiring,
    detail
  };

  const saved = await storageCall(env, 'complete-session', { session, report, completedAt });
  if (!saved.ok) return json({ error: 'Unable to save assessment result.' }, 500);
  return json({ ok: true, message: 'Assessment Completed Successfully.' });
}

async function getResults(request, env) {
  const auth = request.headers.get('x-admin-key') || '';
  if (await sha256(auth) !== ADMIN_HASH) return json({ error: 'Unauthorized' }, 401);
  const r = await storageCall(env, 'list-results');
  if (!r.ok) return json({ error: 'Unable to load results.' }, 500);
  return new Response(r.body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function logoResponse() {
  try {
    const home = await fetch('https://nps.ae/', { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!home.ok) throw new Error('nps');
    const html = await home.text();
    const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
    let best = null, scoreBest = -1;
    for (const tag of tags) {
      const m = tag.match(/\bsrc=["']([^"']+)["']/i);
      if (!m) continue;
      const text = tag.toLowerCase();
      let score = 0;
      if (text.includes('custom-logo')) score += 100;
      if (text.includes('site-logo')) score += 80;
      if (text.includes('logo')) score += 50;
      if (text.includes('nps')) score += 20;
      if (score > scoreBest) { scoreBest = score; best = m[1]; }
    }
    if (!best || scoreBest < 20) throw new Error('logo');
    return Response.redirect(new URL(best, 'https://nps.ae/').href, 302);
  } catch {
    return new Response('NPS', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
}

export class AssessmentStore {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    const body = await request.json().catch(() => ({}));
    if (action === 'put-session') {
      await this.state.storage.put('session:' + body.session, body.record);
      return json({ ok: true });
    }
    if (action === 'get-session') {
      const record = await this.state.storage.get('session:' + body.session);
      return json({ record: record || null });
    }
    if (action === 'complete-session') {
      const key = 'session:' + body.session;
      const record = await this.state.storage.get(key);
      if (!record || record.completed) return json({ error: 'Invalid or completed session.' }, 409);
      record.completed = true;
      record.completedAt = body.completedAt;
      await this.state.storage.put(key, record);
      await this.state.storage.put('result:' + body.report.id, body.report);
      return json({ ok: true });
    }
    if (action === 'list-results') {
      const entries = await this.state.storage.list({ prefix: 'result:' });
      const results = [...entries.values()];
      results.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
      return json({ results });
    }
    return json({ error: 'Not found' }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'POST' && (p === '/api/start' || p === '/assessment/api/start')) return startAssessment(request, env);
    if (request.method === 'POST' && (p === '/api/submit' || p === '/assessment/api/submit')) return submitAssessment(request, env);
    if (request.method === 'GET' && (p === '/api/results' || p === '/assessment/api/results')) return getResults(request, env);
    if (request.method === 'GET' && (p === '/api/logo' || p === '/assessment/api/logo')) return logoResponse();
    return env.ASSETS.fetch(request);
  }
};
