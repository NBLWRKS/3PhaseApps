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

  // Photos may be stored as plain URL strings (legacy) or as { url, caption }
  // objects (new, with per-photo descriptions). Normalize so the rest of the
  // component can always treat them as objects.
  const photos = (block.images || []).map((img) =>
    typeof img === 'string' ? { url: img, caption: '' } : { url: img.url, caption: img.caption || '' }
  );

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      // Upload in small batches rather than all at once. Firing dozens of
      // simultaneous uploads (especially large phone photos on mobile data)
      // can overwhelm the connection and cause some to silently fail — which
      // looked like a "max photos" limit. Batching makes large sets reliable.
      const BATCH = 3;
      const newPhotos = [];
      let failed = 0;
      for (let i = 0; i < files.length; i += BATCH) {
        const slice = files.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map(async (file) => {
            try {
              const { file_url } = await base44.integrations.Core.UploadFile({ file });
              return file_url || null;
            } catch (err) {
              return null;
            }
          })
        );
        for (const url of results) {
          if (url) newPhotos.push({ url, caption: '' });
          else failed++;
        }
      }
      if (newPhotos.length) {
        onUpdate('images', [...photos, ...newPhotos]);
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
    const imgs = [...photos];
    imgs.splice(idx, 1);
    onUpdate('images', imgs);
  };

  const setCaption = (idx, caption) => {
    const imgs = photos.map((p, i) => (i === idx ? { ...p, caption } : p));
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo, idx) => (
              <div key={idx} className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="relative group aspect-square">
                  <img src={photo.url} alt="" className="w-full h-full object-contain bg-muted" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <Input
                  value={photo.caption}
                  onChange={(e) => setCaption(idx, e.target.value)}
                  placeholder="Add a description…"
                  className="border-0 border-t border-border rounded-none text-xs h-8 focus-visible:ring-0"
                />
              </div>
            ))}

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-60"
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