import { getCatalystCalendar } from '../../lib/benzinga-calendar';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requested = parseInt(req.query.days, 10);
  const days = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 90) : 30;

  try {
    const calendar = await getCatalystCalendar({ days });
    const payload = { ...calendar };
    delete payload.source;
    payload.warnings = Array.isArray(calendar.warnings) && calendar.warnings.length
      ? ['Some calendars did not respond']
      : [];
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (error) {
    const status = error.code === 'NOT_CONFIGURED' || error.status === 401 || error.status === 403 ? 503 : 502;
    console.error('news-scanner:', error.message);
    return res.status(status).json({
      error: 'Catalyst calendar is unavailable'
    });
  }
}
