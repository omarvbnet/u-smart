export interface HeroStat {
    id: string;
    key: string;
    value: number;
    label: string;
    icon: string | null;
    suffix: string | null;
    isActive: boolean;
    order: number;
  }
  
  export interface FeaturedProject {
    id: string;
    title: string;
    description: string | null;
    category: string;
    imageUrl: string | null;
    featured: boolean;
    status: string;
    order?: number;
    client: {
      name: string;
      logo: string | null;
    } | null;
  }
  
  export interface Solution {
    id: string;
    title: string;
    description: string | null;
    icon: string | null;
    color: string;
    link: string | null;
    isActive: boolean;
    order: number;
  }
  
  export interface Client {
    id: string;
    name: string;
    logo: string | null;
    industry: string | null;
    country?: {
      name: string;
      code: string;
      flag: string | null;
    } | null;
    _count?: {
      projects: number;
    };
  }