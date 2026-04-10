"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";

interface Subscription {
  id: string;
  email: string;
  created_at: string;
  status: string;
  source?: string;
}

interface ExportSubscriptionsProps {
  subscriptions: Subscription[];
}

export function ExportSubscriptions({ subscriptions }: ExportSubscriptionsProps) {
  const exportToCSV = () => {
    if (!subscriptions || subscriptions.length === 0) {
      alert('No subscriptions to export');
      return;
    }

    // Create CSV content
    const headers = ['Email', 'Status', 'Source', 'Subscribed Date', 'Subscribed Time'];
    const csvContent = [
      headers.join(','),
      ...subscriptions.map(sub => [
        sub.email,
        sub.status,
        sub.source || 'unknown',
        new Date(sub.created_at).toLocaleDateString(),
        new Date(sub.created_at).toLocaleTimeString()
      ].join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `querypanel-subscriptions-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button onClick={exportToCSV} variant="outline" size="sm">
      <DownloadIcon className="w-4 h-4 mr-2" />
      Export CSV
    </Button>
  );
} 