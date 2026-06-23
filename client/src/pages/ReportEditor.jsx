import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canEdit, canSupervise } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Plus, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import ReportBlock from '@/components/reports/ReportBlock';

const emptyBlock = () => ({ title: '', description: '', images: [] });

export default function ReportEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Report type: 'electrical' (default) or 'mechanical'. For new reports it
  // comes from the ?type= query param chosen on the dashboard; for existing
  // reports it comes from the saved record.
  const initialType = searchParams.get('type') === 'mechanical' ? 'mechanical' : 'electrical';
  const [reportType, setReportType] = useState(initialType);

  const [project, setProject] = useState('');
  const [reportBy, setReportBy] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [blocks, setBlocks] = useState([emptyBlock()]);
  const [status, setStatus] = useState('draft');
  const [workers, setWorkers] = useState('');
  const [devicesInstalled, setDevicesInstalled] = useState('');
  const [pipeRanFt, setPipeRanFt] = useState('');
  const [bedsInstalled, setBedsInstalled] = useState('');

  const isMechanical = reportType === 'mechanical';

  const { data: existingReport, isLoading } = useQuery({
    queryKey: ['report', id],
    queryFn: () => base44.entities.Report.get(id),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existingReport) {
      setReportType(existingReport.report_type === 'mechanical' ? 'mechanical' : 'electrical');
      setProject(existingReport.project || '');
      setReportBy(existingReport.report_by || '');
      setReportDate(existingReport.report_date || new Date().toISOString().split('T')[0]);
      setBlocks(existingReport.blocks?.length ? existingReport.blocks : [emptyBlock()]);
      setStatus(existingReport.status || 'draft');
      setWorkers(existingReport.workers ?? '');
      setDevicesInstalled(existingReport.devices_installed ?? '');
      setPipeRanFt(existingReport.pipe_ran_ft ?? '');
      setBedsInstalled(existingReport.beds_installed ?? '');
    }
  }, [existingReport]);

  // Load user name for new reports
  useEffect(() => {
    if (isNew) {
      base44.auth.me().then(user => {
        if (user?.full_name) setReportBy(user.full_name);
      }).catch(() => {});
    }
  }, [isNew]);

  const saveMutation = useMutation({
    mutationFn: async (newStatus) => {
      const data = {
        report_type: reportType,
        project,
        report_by: reportBy,
        report_date: reportDate,
        status: newStatus || status,
        blocks,
        workers: workers !== '' ? Number(workers) : null,
        // Type-specific stats: keep only the fields that belong to this type
        // so switching type doesn't leave stale numbers from the other type.
        devices_installed: !isMechanical && devicesInstalled !== '' ? Number(devicesInstalled) : null,
        pipe_ran_ft: !isMechanical && pipeRanFt !== '' ? Number(pipeRanFt) : null,
        beds_installed: isMechanical && bedsInstalled !== '' ? Number(bedsInstalled) : null,
      };
      if (isNew) {
        return base44.entities.Report.create(data);
      } else {
        return base44.entities.Report.update(id, data);
      }
    },
    onSuccess: (result, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      toast.success(isNew ? 'Report created' : 'Report saved');
      if (isNew && result?.id) {
        navigate(`/reports/${result.id}`, { replace: true });
      }
    },
  });

  const updateBlock = (idx, key, value) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, [key]: value } : b));
  };

  const removeBlock = (idx) => {
    if (blocks.length <= 1) return;
    setBlocks(prev => prev.filter((_, i) => i !== idx));
  };

  const addBlock = () => setBlocks(prev => [...prev, emptyBlock()]);

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Non-admins can only edit their own reports
  if (!isNew && existingReport && !isAdmin && !canSupervise(user, 'reports') && existingReport.created_by !== user?.email) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">You don't have permission to edit this report.</p>
        <button onClick={() => navigate('/reports')} className="text-primary mt-4 inline-block">Go back</button>
      </div>
    );
  }

  // Read-only Reports users cannot edit at all.
  if (!canEdit(user, 'reports')) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">You have read-only access to Reports.</p>
        <button onClick={() => navigate('/reports')} className="text-primary mt-4 inline-block">Go back</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/reports')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate(status)}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </Button>
          <Button
            onClick={() => saveMutation.mutate('completed')}
            disabled={saveMutation.isPending}
            className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <CheckCircle2 className="w-4 h-4" />
            Complete
          </Button>
        </div>
      </div>

      {/* Project info */}
      <Card>
        <div className="h-1 bg-gradient-to-r from-destructive via-primary to-accent" />
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Report Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3">
              <Label>Project Name</Label>
              <Input
                placeholder="e.g. Conveyor Belt Inspection - Site A"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Report By</Label>
              <Input
                placeholder="Your name"
                value={reportBy}
                onChange={(e) => setReportBy(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Site Stats */}
      <Card>
        <div className="h-1 bg-gradient-to-r from-primary to-accent" />
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Site Statistics</h2>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary capitalize">
              {reportType}
            </span>
          </div>
          {isMechanical ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Workers</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={workers}
                  onChange={(e) => setWorkers(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Beds Installed</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={bedsInstalled}
                  onChange={(e) => setBedsInstalled(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Workers</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={workers}
                  onChange={(e) => setWorkers(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Devices Installed</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={devicesInstalled}
                  onChange={(e) => setDevicesInstalled(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Pipe Ran (ft)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={pipeRanFt}
                  onChange={(e) => setPipeRanFt(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Sections</h2>
        {blocks.map((block, idx) => (
          <ReportBlock
            key={idx}
            block={block}
            index={idx}
            onUpdate={(key, value) => updateBlock(idx, key, value)}
            onRemove={() => removeBlock(idx)}
            canRemove={blocks.length > 1}
          />
        ))}
        <Button variant="outline" onClick={addBlock} className="w-full gap-2 border-dashed h-12">
          <Plus className="w-4 h-4" />
          Add Section
        </Button>
      </div>
    </div>
  );
}