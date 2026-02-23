'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Paintbrush, Pipette } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  presets?: { name: string; primary: string; secondary?: string }[];
  className?: string;
  label?: string;
}

export function ColorPicker({
  value,
  onChange,
  presets,
  className,
  label,
}: ColorPickerProps) {
  const pickColor = async () => {
    if (typeof window === 'undefined' || !('EyeDropper' in window)) {
      return;
    }
    try {
      const eyeDropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
      const result = await eyeDropper.open();
      onChange(result.sRGBHex);
    } catch {
      // User cancelled or not supported
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start text-left font-normal', className)}
        >
          <div className="w-full flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full border shadow-sm transition-all"
              style={{ backgroundColor: value }}
            />
            <div className="truncate flex-1">
              {label ? `${label}: ${value}` : value || 'Pick a color'}
            </div>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex flex-col gap-4">
          {presets && presets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Presets</Label>
              <div className="grid grid-cols-5 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.primary}
                    type="button"
                    className={`w-full aspect-square rounded-md cursor-pointer active:scale-95 transition-all ring-offset-background border ${
                      value === p.primary ? 'ring-2 ring-ring ring-offset-2 border-transparent' : 'border-border hover:border-muted-foreground/30'
                    }`}
                    style={{ backgroundColor: p.primary }}
                    onClick={() => onChange(p.primary)}
                    title={p.name}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Custom Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-input"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={pickColor}
                title="Pick color from screen"
              >
                <Pipette className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Custom Hex</Label>
            <div className="flex items-center gap-2">
              <Paintbrush className="w-4 h-4 text-muted-foreground" />
              <Input
                id="custom"
                value={value}
                className="h-8 flex-1 font-mono text-xs"
                onChange={(e) => onChange(e.currentTarget.value)}
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
