import React, { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArrowLeft, Pencil, Trash2, Download, Calendar, User, Loader2, Languages, Users, Cpu, Pipette, Images, BedDouble } from 'lucide-react';

export default function ReportView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', id],
    queryFn: () => base44.entities.Report.get(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Report.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Report deleted');
      navigate('/reports');
    },
  });

  const [showTranslateTip, setShowTranslateTip] = useState(false);

  // Browser-based translation is free and needs no API. We just guide the
  // reader to their browser's built-in "Translate page" feature. The report
  // content is marked lang="es" so Chrome/Edge/Safari detect Spanish and offer
  // to translate automatically; this button surfaces that for discoverability.
  const handleTranslate = () => {
    setShowTranslateTip(true);
  };

  const handleSaveAllPhotos = async () => {
    const allImages = (report.blocks || []).flatMap((b, bIdx) =>
      (b.images || []).map((url, iIdx) => ({ url, name: `${report.project || 'report'}-section${bIdx + 1}-photo${iIdx + 1}.jpg` }))
    );
    if (!allImages.length) {
      toast.error('No photos in this report');
      return;
    }
    setSavingPhotos(true);
    try {
      for (const { url, name } of allImages) {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      toast.success(`${allImages.length} photo${allImages.length > 1 ? 's' : ''} saved`);
    } catch (e) {
      toast.error('Failed to save photos');
    } finally {
      setSavingPhotos(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke('generatePdf', { reportId: id });
      if (res.data?.file_url) {
        window.open(res.data.file_url, '_blank');
        toast.success('PDF generated');
      }
    } catch (e) {
      toast.error('Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Report not found.</p>
        <Link to="/reports" className="text-primary mt-4 inline-block">Go back</Link>
      </div>
    );
  }

  // Non-admins can only view their own reports
  if (!isAdmin && report.created_by !== user?.email) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">You don't have permission to view this report.</p>
        <Link to="/reports" className="text-primary mt-4 inline-block">Go back</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => navigate('/reports')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleTranslate} className="gap-2">
            <Languages className="w-4 h-4" />
            Translate
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={handleSaveAllPhotos} disabled={savingPhotos} className="gap-2">
              {savingPhotos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Images className="w-4 h-4" />}
              Save All Photos
            </Button>
          )}
          <Button variant="outline" onClick={handleExportPDF} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export PDF
          </Button>
          <Link to={`/reports/${id}/edit`}>
            <Button variant="outline" className="gap-2">
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {showTranslateTip && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium text-foreground">Translate this report with your browser</p>
              <p className="text-muted-foreground">
                Your browser can translate this page into your language for free:
              </p>
              <ul className="text-muted-foreground list-disc pl-5 space-y-0.5">
                <li><span className="font-medium">Chrome / Edge:</span> right-click the page and choose “Translate to…”, or tap the translate icon in the address bar.</li>
                <li><span className="font-medium">Safari (iPhone/Mac):</span> tap the <span className="font-medium">aA</span> / translate icon in the address bar and choose “Translate.”</li>
                <li><span className="font-medium">Android Chrome:</span> tap the ⋮ menu, then “Translate.”</li>
              </ul>
            </div>
            <button
              onClick={() => setShowTranslateTip(false)}
              className="text-muted-foreground hover:text-foreground text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Report header */}
      <Card lang="es">
        <div className="h-1 bg-gradient-to-r from-destructive via-primary to-accent" />
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">{report.project || 'Untitled Report'}</h1>
            <Badge
              variant={report.status === 'completed' ? 'default' : 'secondary'}
              className={report.status === 'completed' ? 'bg-accent text-accent-foreground' : ''}
            >
              {report.status === 'completed' ? 'Completed' : 'Draft'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {report.report_by || 'Unknown'}
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {report.report_date ? format(new Date(report.report_date), 'MMMM d, yyyy') : 'No date'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Site Stats */}
      {(report.workers != null || report.devices_installed != null || report.pipe_ran_ft != null || report.beds_installed != null) && (
        <Card>
          <div className="h-1 bg-gradient-to-r from-primary to-accent" />
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-4">Site Statistics</h2>
            {report.report_type === 'mechanical' ? (
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="space-y-1">
                  <div className="flex justify-center"><Users className="w-5 h-5 text-primary" /></div>
                  <p className="text-2xl font-bold">{report.workers ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Workers</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-center"><BedDouble className="w-5 h-5 text-primary" /></div>
                  <p className="text-2xl font-bold">{report.beds_installed ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Beds Installed</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <div className="flex justify-center"><Users className="w-5 h-5 text-primary" /></div>
                  <p className="text-2xl font-bold">{report.workers ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Workers</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-center"><Cpu className="w-5 h-5 text-primary" /></div>
                  <p className="text-2xl font-bold">{report.devices_installed ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Devices Installed</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-center"><Pipette className="w-5 h-5 text-primary" /></div>
                  <p className="text-2xl font-bold">{report.pipe_ran_ft ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Pipe Ran (ft)</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      {(report.blocks || []).map((block, idx) => (
        <Card key={idx} lang="es" className="border-l-4 border-l-primary">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                {idx + 1}
              </div>
              <h3 className="text-lg font-semibold text-foreground">{block.title || 'Untitled Section'}</h3>
            </div>
            {block.description && (
              <p className="text-muted-foreground whitespace-pre-wrap mb-4 leading-relaxed">{block.description}</p>
            )}
            {block.images?.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {block.images.map((url, imgIdx) => (
                  <a key={imgIdx} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={url}
                      alt={`Section ${idx + 1} photo ${imgIdx + 1}`}
                      className="w-full h-40 object-cover rounded-lg border border-border hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {(!report.blocks || report.blocks.length === 0) && (
        <p className="text-center text-muted-foreground py-8">No sections in this report.</p>
      )}
    </div>
  );
}