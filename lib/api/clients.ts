const base = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

export const clientsApi = {
  async list() {
    const res = await fetch(`${base}/api/clients`);
    const data = await res.json();
    return data;
  },
  async create(body: Record<string, unknown>) {
    const res = await fetch(`${base}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async update(id: string, body: Record<string, unknown>) {
    const res = await fetch(`${base}/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async delete(id: string) {
    const res = await fetch(`${base}/api/clients/${id}`, { method: 'DELETE' });
    return res.json();
  },
};
