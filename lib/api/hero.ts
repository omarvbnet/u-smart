import type { HeroStat, FeaturedProject, Solution, Client } from '@/app/api/types';

const getBaseUrl = () =>
  typeof window !== 'undefined'
    ? '/api/hero'
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/api/hero';

export interface HeroApiResponse {
  success: boolean;
  message?: string;
  statistics: HeroStat[];
  featuredProjects: FeaturedProject[];
  solutions: Solution[];
  clients: Client[];
  totalProjects: number;
  totalClients: number;
}

export const heroApi = {
  async getHero(): Promise<HeroApiResponse> {
    const base = getBaseUrl();
    const url = typeof window !== 'undefined' ? base : base.replace('/hero', '/api/hero');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch hero data');
    return res.json();
  },

  async getStats(): Promise<{ success: boolean; statistics: HeroStat[] }> {
    const data = await this.getHero();
    return { success: data.success, statistics: data.statistics };
  },

  async getFeaturedProjects(): Promise<{ success: boolean; projects: FeaturedProject[] }> {
    const data = await this.getHero();
    return { success: data.success, projects: data.featuredProjects };
  },

  async getSolutions(): Promise<{ success: boolean; solutions: Solution[] }> {
    const data = await this.getHero();
    return { success: data.success, solutions: data.solutions };
  },

  async getClients(): Promise<{ success: boolean; clients: Client[] }> {
    const data = await this.getHero();
    return { success: data.success, clients: data.clients };
  },

  async updateStatistic(key: string, value: number): Promise<{ success: boolean }> {
    const base =
      typeof window !== 'undefined'
        ? ''
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const url = `${base}/api/hero/statistics/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const data = await res.json();
    return { success: res.ok && data.success };
  },
};
