import React, { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, X, GripVertical, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ReportBlock({ block, index, onUpdate, onRemove, canRemove }) {
  const fileInputRef = useRef(null);

  const [uploading, setUploading] = React.useState(false);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            return file_url || null;
          } catch (err) {
            return null;
          }
        })
      );
      const urls = results.filter(Boolean);
      const failed = results.length - urls.length;
      if (urls.length) {
        onUpdate('images', [...(block.images || []), ...urls]);
      }
      if (failed > 0) {
        toast.error(
          `${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded. Try again, or use a JPG/PNG.`
        );
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (idx) => {
    const imgs = [...(block.images || [])];
    imgs.splice(idx, 1);
    onUpdate('images', imgs);
  };

  return (
    <Card className="relative border-l-4 border-l-primary">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {index + 1}
          </div>
          <Input
            placeholder="Section title"
            value={block.title || ''}
            onChange={(e) => onUpdate('title', e.target.value)}
            className="font-medium text-base border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
          />
          {canRemove && (
            <Button variant="ghost" size="icon" onClick={onRemove} className="text-muted-foreground hover:text-destructive shrink-0">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Description */}
        <Textarea
          placeholder="Describe findings, observations, or notes for this section..."
          value={block.description || ''}
          onChange={(e) => onUpdate('description', e.target.value)}
          className="min-h-[100px] resize-none mb-4"
        />

        {/* Images */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {(block.images || []).map((url, idx) => (
              <div key={idx} className="relative group w-28 h-28 rounded-lg overflow-hidden border border-border">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-28 h-28 rounded-lg border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-60"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Add Photos'}</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}
