import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { FilePlus, Search, FileText, Layers, Image, RefreshCw, Zap, Wrench } from 'lucide-react';
import ReportCard from '@/components/reports/ReportCard';
import EmptyState from '@/components/reports/EmptyState';

const PULL_THRESHOLD = 72;

export default function Dashboard() {
  const navigate = useNavigate();
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  const { data: reports = [], isLoading, refetch } = useQuery({
    queryKey: ['reports', user?.email, isAdmin],
    queryFn: () =>
      isAdmin
        ? base44.entities.Report.list('-created_date', 100)
        : base44.entities.Report.filter({ created_by: user?.email }, '-created_date', 100),
    enabled: !!user,
  });

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback((e) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullY(Math.min(delta * 0.5, PULL_THRESHOLD + 20));
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      await refetch();
      setIsRefreshing(false);
    }
    setPullY(0);
    touchStartY.current = null;
  }, [pullY, isRefreshing, refetch]);

  const filtered = reports.filter((r) => {
    const matchesSearch = !search ||
      (r.project || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.report_by || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    // Reports created before the type feature have no report_type; treat them
    // as electrical so they still appear under that filter.
    const matchesType = typeFilter === 'all' || (r.report_type || 'electrical') === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const totalBlocks = reports.reduce((s, r) => s + (r.blocks?.length || 0), 0);
  const totalImages = reports.reduce((s, r) => s + (r.blocks?.reduce((a, b) => a + (b.images?.length || 0), 0) || 0), 0);

  const progress = Math.min(pullY / PULL_THRESHOLD, 1);
  const showPullIndicator = pullY > 8;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="space-y-8 relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {showPullIndicator && (
        <div
          className="flex items-center justify-center transition-all duration-150"
          style={{ height: pullY, overflow: 'hidden' }}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw
              className={`w-5 h-5 text-primary transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${progress * 360}deg)` }}
            />
            <span>{isRefreshing ? 'Refreshing…' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? 'All reports — Admin view' : 'Your field inspection reports'}
          </p>
        </div>
        <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md min-h-[44px]">
              <FilePlus className="w-4 h-4" />
              New Report
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choose report type</DialogTitle>
              <DialogDescription>
                Pick the type of report you want to create.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => { setTypeDialogOpen(false); navigate('/reports/new?type=electrical'); }}
                className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
              >
                <Zap className="w-8 h-8 text-primary" />
                <span className="font-semibold">Electrical</span>
                <span className="text-xs text-muted-foreground">Workers, devices installed, pipe ran</span>
              </button>
              <button
                onClick={() => { setTypeDialogOpen(false); navigate('/reports/new?type=mechanical'); }}
                className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
              >
                <Wrench className="w-8 h-8 text-primary" />
                <span className="font-semibold">Mechanical</span>
                <span className="text-xs text-muted-foreground">Workers, beds installed</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats row */}
      {reports.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Reports', value: reports.length, icon: FileText, color: 'text-primary' },
            { label: 'Sections', value: totalBlocks, icon: Layers, color: 'text-destructive' },
            { label: 'Photos', value: totalImages, icon: Image, color: 'text-accent' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg bg-muted ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {reports.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'draft', 'completed'].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="capitalize min-h-[44px]"
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Type filter */}
      {reports.length > 0 && (
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'All Types', Icon: null },
            { value: 'electrical', label: 'Electrical', Icon: Zap },
            { value: 'mechanical', label: 'Mechanical', Icon: Wrench },
          ].map(({ value, label, Icon }) => (
            <Button
              key={value}
              variant={typeFilter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTypeFilter(value)}
              className="gap-1.5 min-h-[44px]"
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {label}
            </Button>
          ))}
        </div>
      )}

      {/* Report grid */}
      {reports.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No reports match your filter.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}