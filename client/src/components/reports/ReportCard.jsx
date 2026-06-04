import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, Layers, ArrowRight, Zap, Wrench } from 'lucide-react';
import { format } from 'date-fns';

export default function ReportCard({ report }) {
  const blockCount = report.blocks?.length || 0;
  const imageCount = report.blocks?.reduce((sum, b) => sum + (b.images?.length || 0), 0) || 0;
  const isMechanical = report.report_type === 'mechanical';
  const TypeIcon = isMechanical ? Wrench : Zap;

  return (
    <Link to={`/reports/${report.id}`}>
      <Card className="group hover:shadow-lg hover:border-primary/30 transition-all duration-300 overflow-hidden cursor-pointer">
        {/* Accent strip */}
        <div className="h-1 bg-gradient-to-r from-destructive via-primary to-accent" />
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-foreground text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {report.project || 'Untitled Report'}
            </h3>
            <Badge
              variant={report.status === 'completed' ? 'default' : 'secondary'}
              className={report.status === 'completed' ? 'bg-accent text-accent-foreground' : ''}
            >
              {report.status === 'completed' ? 'Completed' : 'Draft'}
            </Badge>
          </div>

          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <TypeIcon className="w-3.5 h-3.5" />
              <span className="capitalize">{report.report_type || 'electrical'}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5" />
              <span>{report.report_by || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {report.report_date
                  ? format(new Date(report.report_date), 'MMM d, yyyy')
                  : 'No date'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              <span>{blockCount} section{blockCount !== 1 ? 's' : ''} · {imageCount} photo{imageCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            View Report <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}