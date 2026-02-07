'use client';

import { useState, useEffect } from 'react';
import { heroApi } from '@/lib/api/hero';
import type { HeroStat, FeaturedProject, Solution } from '@/app/api/types';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export default function HeroAdminPage() {
  const [stats, setStats] = useState<HeroStat[]>([]);
  const [projects, setProjects] = useState<FeaturedProject[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStat, setEditingStat] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState<number>(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, projectsRes, solutionsRes] = await Promise.all([
        heroApi.getStats(),
        heroApi.getFeaturedProjects(),
        heroApi.getSolutions()
      ]);

      if (statsRes.success) setStats(statsRes.statistics);
      if (projectsRes.success) setProjects(projectsRes.projects);
      if (solutionsRes.success) setSolutions(solutionsRes.solutions);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStat = async (key: string) => {
    const result = await heroApi.updateStatistic(key, editedValue);
    if (result.success) {
      setStats(stats.map(stat => 
        stat.key === key ? { ...stat, value: editedValue } : stat
      ));
      setEditingStat(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        إدارة قسم الهيرو
      </h1>

      {/* إحصائيات الهيرو */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">إحصائيات الهيرو</h2>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            تحديث البيانات
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.id}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  {stat.label}
                </span>
                <button
                  onClick={() => {
                    setEditingStat(stat.key);
                    setEditedValue(stat.value);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <PencilIcon className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {editingStat === stat.key ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editedValue}
                    onChange={(e) => setEditedValue(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <button
                    onClick={() => handleUpdateStat(stat.key)}
                    className="p-2 bg-green-500 text-white rounded-lg"
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingStat(null)}
                    className="p-2 bg-red-500 text-white rounded-lg"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-900">
                  {stat.value}
                  {stat.suffix ?? ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* المشاريع المميزة */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">
          المشاريع المميزة ({projects.length})
        </h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  المشروع
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الفئة
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  العميل
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {project.imageUrl && (
                        <img
                          src={project.imageUrl}
                          alt={project.title}
                          className="w-10 h-10 rounded-lg object-cover mr-3"
                        />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {project.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {project.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {project.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {project.client?.name || 'لا يوجد'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900 mr-4">
                      <PencilIcon className="w-4 h-4 inline" />
                    </button>
                    <button className="text-red-600 hover:text-red-900">
                      <TrashIcon className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* الحلول */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            الحلول ({solutions.length})
          </h2>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            إضافة حل جديد
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {solutions.map((solution) => (
            <div
              key={solution.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${solution.color}-100`}>
                    <span className="text-xl">{solution.icon || '💡'}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {solution.title}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {solution.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <PencilIcon className="w-4 h-4 text-gray-500" />
                  </button>
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <TrashIcon className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  الترتيب: {solution.order}
                </span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  solution.isActive 
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {solution.isActive ? 'نشط' : 'غير نشط'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}