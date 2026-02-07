'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, PencilIcon, TrashIcon, PlusIcon, ClipboardDocumentListIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

type ChecklistItem = { id: string; label: string; weight: 'minor' | 'major' };
type Checklist = {
  id: string;
  name: string;
  items: (ChecklistItem & { weight?: string })[];
  createdAt: string;
  updatedAt: string;
};

export default function AdminChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formItems, setFormItems] = useState<ChecklistItem[]>([]);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/checklists');
      const data = await res.json();
      if (data.success && data.checklists) {
        setChecklists(data.checklists.map((c: Checklist) => ({
          ...c,
          items: Array.isArray(c.items) ? c.items : [],
        })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormItems([]);
    setNewItemLabel('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (c: Checklist) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormItems(Array.isArray(c.items) ? c.items.map((it: { id: string; label: string; weight?: string }) => ({ id: it.id, label: it.label, weight: (it.weight === 'major' ? 'major' : 'minor') as 'minor' | 'major' })) : []);
    setNewItemLabel('');
    setError('');
    setShowForm(true);
  };

  const addItem = () => {
    if (!newItemLabel.trim()) return;
    setFormItems((prev) => [...prev, { id: `item-${Date.now()}`, label: newItemLabel.trim(), weight: 'minor' as const }]);
    setNewItemLabel('');
  };

  const setItemWeight = (index: number, weight: 'minor' | 'major') => {
    setFormItems((prev) => prev.map((it, i) => (i === index ? { ...it, weight } : it)));
  };

  const removeItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formName.trim()) {
      setError('Checklist name is required');
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/admin/checklists/${editingId}` : '/api/admin/checklists';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), items: formItems }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        load();
      } else {
        setError(data.message || 'Failed to save');
      }
    } catch (e) {
      setError('Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this checklist?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/checklists/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setChecklists((prev) => prev.filter((c) => c.id !== id));
      } else {
        alert(data.message || 'Could not delete');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardDocumentListIcon className="w-7 h-7 text-amber-600" />
          Inspection checklists
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
          >
            <PlusIcon className="w-5 h-5" />
            New checklist
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Create checklist templates to use when adding inspection results to QC tickets. Select a checklist from the dropdown when filling inspection details.
      </p>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit checklist' : 'Create checklist'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Checklist name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g. Site Safety Inspection"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Items</label>
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newItemLabel}
                    onChange={(e) => setNewItemLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Add item (e.g. Check fire extinguisher)"
                  />
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-3 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 text-sm font-medium"
                  >
                    Add
                  </button>
                </div>
                {formItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No items yet. Add checklist items above.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600">
                      <span className="col-span-6">Item</span>
                      <span className="col-span-3">Weight</span>
                      <span className="col-span-3 text-right">Actions</span>
                    </div>
                    {formItems.map((item, i) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-t border-gray-100">
                        <span className="col-span-6 text-sm text-gray-900">{item.label}</span>
                        <select
                          value={item.weight}
                          onChange={(e) => setItemWeight(i, e.target.value as 'minor' | 'major')}
                          className="col-span-3 text-sm border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="minor">Minor</option>
                          <option value="major">Major</option>
                        </select>
                        <div className="col-span-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading && checklists.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : checklists.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-amber-50/50">
          No checklists yet. Create a checklist template to use in QC inspection requests.
        </div>
      ) : (
        <div className="space-y-3">
          {checklists.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-gray-200 bg-white overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  className="flex items-center gap-2 w-full text-left hover:bg-gray-100 -m-2 p-2 rounded"
                >
                  <ChevronDownIcon className={`w-5 h-5 text-gray-500 transition-transform ${expandedId === c.id ? 'rotate-180' : ''}`} />
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-sm text-gray-500">({(c.items?.length ?? 0)} items)</span>
                </button>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <PencilIcon className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
              {expandedId === c.id && c.items && c.items.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 mb-1">
                    <span className="col-span-1">#</span>
                    <span className="col-span-8">Item</span>
                    <span className="col-span-3">Weight</span>
                  </div>
                  {c.items.map((item, i) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 text-sm py-1">
                      <span className="col-span-1 text-gray-400">{i + 1}.</span>
                      <span className="col-span-8 text-gray-700">{item.label}</span>
                      <span className="col-span-3 text-gray-600">{(item as { weight?: string }).weight || 'minor'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
