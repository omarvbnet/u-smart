import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'منسق المشاريع الرقمي | U-Smart',
  description: 'منصة منسق المشاريع الرقمي - إدارة المهام، التقارير، والتكامل مع الأنظمة',
};

export default function CoordinatorRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-gray-50 text-gray-900 antialiased">
      {children}
    </div>
  );
}
