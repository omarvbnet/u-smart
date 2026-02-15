'use client';

import React, { useState, useEffect } from 'react';
import {
  Loader2,
  RefreshCw,
  Filter,
  Mail,
  Phone,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

const PRODUCT_TYPES = ['KNX', 'Buspro', 'Zigbee'] as const;
const STATUSES = ['PENDING', 'CONTACTED', 'QUOTED', 'CLOSED'] as const;

type ProductRequest = {
  id: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  productType: string;
  name: string;
  email: string;
  phone: string;
  message: string | null;
  status: string;
  createdAt: string;
  product?: { title: string; slug: string };
};

export default function AdminProductRequestsPage() {
  const [list, setList] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/product-requests${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setList(data.requests ?? []);
        setPendingCount(data.pendingCount ?? 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter, typeFilter]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/product-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        if (status !== 'PENDING') setPendingCount((c) => Math.max(0, c - 1));
        setExpandedId(null);
      } else if (res.status === 401) {
        window.alert('Session expired. Please log in again.');
      } else {
        window.alert(data.message || 'Failed to update status');
      }
    } catch (e) {
      console.error(e);
      window.alert('Failed to update status. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const productLink = (slug: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/products/${slug}`;
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Product Order Requests</h1>
        {pendingCount > 0 && (
          <span className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg font-semibold">
            {pendingCount} pending
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">All types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8" />
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {list.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          {expandedId === r.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{r.name}</div>
                        <a
                          href={`mailto:${r.email}`}
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {r.email}
                        </a>
                        <a
                          href={`tel:${r.phone}`}
                          className="text-sm text-gray-600 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {r.phone}
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{r.productTitle}</div>
                        <a
                          href={productLink(r.productSlug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          View product <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{r.productType}</td>
                      <td className="px-6 py-4">
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          disabled={updatingId === r.id}
                          className="text-sm border rounded px-2 py-1"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {updatingId === r.id && (
                          <Loader2 className="w-4 h-4 inline ml-1 animate-spin text-blue-600" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(r.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <a
                          href={`mailto:${r.email}?subject=Re: Order request for ${encodeURIComponent(r.productTitle)}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Reply
                        </a>
                      </td>
                    </tr>
                    {expandedId === r.id && r.message && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-6 py-4">
                          <p className="text-sm text-gray-700">
                            <strong>Message:</strong> {r.message}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">No product order requests yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
