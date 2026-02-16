'use client';

import { useEffect, useState } from 'react';
import { User, Loader2 } from 'lucide-react';

export default function CoordinatorProfilePage() {
  const [skills, setSkills] = useState<string[]>([]);
  const [cvUrl, setCvUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skillsInput, setSkillsInput] = useState('');

  useEffect(() => {
    fetch('/api/coordinator/profile', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.profile) {
          setSkills(d.profile.skills || []);
          setCvUrl(d.profile.cvUrl || '');
          setSkillsInput((d.profile.skills || []).join(', '));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skillsArray = skillsInput.trim() ? skillsInput.split(/[,،]/).map((s) => s.trim()).filter(Boolean) : [];
      const res = await fetch('/api/coordinator/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ skills: skillsArray, cvUrl: cvUrl.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setSkills(data.profile.skills || []);
        setSkillsInput((data.profile.skills || []).join(', '));
        setCvUrl(data.profile.cvUrl || '');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">الملف الشخصي</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-6 max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">المهارات (مفصولة بفاصلة)</label>
            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="مثال: React, Node.js, إدارة المشاريع"
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">رابط السيرة الذاتية</label>
            <input
              type="url"
              value={cvUrl}
              onChange={(e) => setCvUrl(e.target.value)}
              placeholder="https://..."
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </form>
      </section>
    </div>
  );
}
