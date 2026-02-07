const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

export const projectsApi = {
  async list(category?: string, locale?: string) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (locale) params.set('locale', locale);
    const qs = params.toString();
    const url = qs ? `${base}/api/projects?${qs}` : `${base}/api/projects`;
    const res = await fetch(url);
    const data = await res.json();
    return data;
  },
  async create(body: Record<string, unknown>) {
    const res = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async update(id: string, body: Record<string, unknown>) {
    const res = await fetch(`${base}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async delete(id: string) {
    const res = await fetch(`${base}/api/projects/${id}`, { method: 'DELETE' });
    return res.json();
  },
};
