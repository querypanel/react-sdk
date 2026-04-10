import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';

function DashboardSkeleton() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
    </div>
  );
}

export default function DashboardLayoutRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardLayout>
        {children}
      </DashboardLayout>
      <Toaster />
    </Suspense>
  );
} 