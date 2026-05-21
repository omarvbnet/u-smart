'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { proviserHomePath } from '@/lib/proviser-web';

export default function ProviserIndexPage() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/requester-me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.user) {
          router.replace(proviserHomePath(data.user.role));
        } else {
          router.replace('/proviser/login');
        }
      })
      .catch(() => router.replace('/proviser/login'));
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );
}
