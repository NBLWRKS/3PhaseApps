import React from 'react';
import { ClipboardList } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <ClipboardList className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">No reports yet</h2>
      <p className="text-muted-foreground max-w-sm">
        Reports you create will appear here, with project details, sections with photos, and PDF export.
      </p>
    </div>
  );
}
