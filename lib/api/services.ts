const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

export const servicesApi = {
  async list() {
    const res = await fetch(`${base}/api/services`);
    const data = await res.json();
    return data;
  },
  async getBySlug(slug: string) {
    const res = await fetch(`${base}/api/services/slug/${encodeURIComponent(slug)}`);
    const data = await res.json();
    return data;
  },
  async create(body: Record<string, unknown>) {
    const res = await fetch(`${base}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async update(id: string, body: Record<string, unknown>) {
    const res = await fetch(`${base}/api/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async delete(id: string) {
    const res = await fetch(`${base}/api/services/${id}`, { method: 'DELETE' });
    return res.json();
  },
};
