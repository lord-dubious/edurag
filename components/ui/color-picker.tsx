'use client';

import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
      <PopoverContent className="w-72">
        <div className="flex flex-col gap-4">
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Color Picker</Label>
            <HexColorPicker
              color={value}
              onChange={onChange}
              style={{ width: '100%', height: 150 }}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">#</span>
              <HexColorInput
                color={value}
                onChange={onChange}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm font-mono"
              />
            </div>
          </div>
          {presets && presets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Presets</Label>
              <div className="grid grid-cols-5 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.primary}
                    type="button"
                    className={`w-full aspect-square rounded-md cursor-pointer active:scale-95 transition-all ring-offset-background border ${value === p.primary ? 'ring-2 ring-ring ring-offset-2 border-transparent' : 'border-border hover:border-muted-foreground/30'
                      }`}
                    style={{ backgroundColor: p.primary }}
                    onClick={() => onChange(p.primary)}
                    title={p.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
