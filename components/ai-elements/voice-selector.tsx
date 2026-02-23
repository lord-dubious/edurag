'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { CircleSmallIcon, MarsIcon, MarsStrokeIcon, NonBinaryIcon, PauseIcon, PlayIcon, TransgenderIcon, VenusAndMarsIcon, VenusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop: T | undefined;
  defaultProp: T;
  onChange?: (value: T) => void;
}): [T, (value: T) => void];
function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop: T | undefined;
  defaultProp: T | undefined;
  onChange?: (value: T) => void;
}): [T | undefined, (value: T | undefined) => void];
function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop: T | undefined;
  defaultProp: T | undefined;
  onChange?: (value: T) => void;
}): [T | undefined, (value: T | undefined) => void] {
  const [uncontrolledProp, setUncontrolledProp] = useState<T | undefined>(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledProp;

  const setValue = useCallback(
    (nextValue: T | undefined) => {
      if (!isControlled) {
        setUncontrolledProp(nextValue);
      }
      (onChange as ((value: T | undefined) => void) | undefined)?.(nextValue);
    },
    [isControlled, onChange]
  );

  return [value, setValue];
}

const GENDER_ICON_MAP: Record<string, ReactNode> = {
  male: <MarsIcon className='size-4' />,
  female: <VenusIcon className='size-4' />,
  transgender: <TransgenderIcon className='size-4' />,
  androgyne: <MarsStrokeIcon className='size-4' />,
  'non-binary': <NonBinaryIcon className='size-4' />,
  intersex: <VenusAndMarsIcon className='size-4' />,
};

const ACCENT_EMOJI_MAP: Record<string, string> = {
  american: '🇺🇸',
  british: '🇬🇧',
  australian: '🇦🇺',
  canadian: '🇨🇦',
  irish: '🇮🇪',
  scottish: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  indian: '🇮🇳',
  'south-african': '🇿🇦',
  'new-zealand': '🇳🇿',
  spanish: '🇪🇸',
  french: '🇫🇷',
  german: '🇩🇪',
  italian: '🇮🇹',
  portuguese: '🇵🇹',
  brazilian: '🇧🇷',
  mexican: '🇲🇽',
  argentinian: '🇦🇷',
  japanese: '🇯🇵',
  chinese: '🇨🇳',
  korean: '🇰🇷',
  russian: '🇷🇺',
  arabic: '🇸🇦',
  dutch: '🇳🇱',
  swedish: '🇸🇪',
  norwegian: '🇳🇴',
  danish: '🇩🇰',
  finnish: '🇫🇮',
  polish: '🇵🇱',
  turkish: '🇹🇷',
  greek: '🇬🇷',
};

interface VoiceSelectorContextValue {
  value: string | undefined;
  setValue: (value: string | undefined) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const VoiceSelectorContext = createContext<VoiceSelectorContextValue | null>(null);

export const useVoiceSelector = (): VoiceSelectorContextValue => {
  const context = useContext(VoiceSelectorContext);
  if (!context) {
    throw new Error('VoiceSelector components must be used within VoiceSelector');
  }
  return context;
};

export interface VoiceSelectorProps extends ComponentProps<typeof Dialog> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
}

export const VoiceSelector = ({
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: VoiceSelectorProps) => {
  const [value, setValue] = useControllableState({
    defaultProp: defaultValue,
    onChange: onValueChange,
    prop: valueProp,
  });

  const [open, setOpen] = useControllableState({
    defaultProp: defaultOpen,
    onChange: onOpenChange,
    prop: openProp,
  });

  const voiceSelectorContext = useMemo(
    () => ({ open, setOpen, setValue, value }),
    [value, setValue, open, setOpen]
  );

  return (
    <VoiceSelectorContext.Provider value={voiceSelectorContext}>
      <Dialog onOpenChange={setOpen} open={open} {...props}>
        {children}
      </Dialog>
    </VoiceSelectorContext.Provider>
  );
};

export interface VoiceSelectorTriggerProps extends ComponentProps<typeof DialogTrigger> {}

export const VoiceSelectorTrigger = (props: VoiceSelectorTriggerProps) => (
  <DialogTrigger {...props} />
);

export interface VoiceSelectorContentProps extends Omit<ComponentProps<typeof DialogContent>, 'title'> {
  title?: ReactNode;
}

export const VoiceSelectorContent = ({
  className,
  children,
  title = 'Voice Selector',
  ...props
}: VoiceSelectorContentProps) => (
  <DialogContent
    aria-describedby={undefined}
    className={cn('p-0', className)}
    {...props}
  >
    <DialogTitle className='sr-only'>{title}</DialogTitle>
    <Command className='**:data-[slot=command-input-wrapper]:h-auto'>
      {children}
    </Command>
  </DialogContent>
);

export interface VoiceSelectorDialogProps extends ComponentProps<typeof CommandDialog> {}

export const VoiceSelectorDialog = (props: VoiceSelectorDialogProps) => (
  <CommandDialog {...props} />
);

export interface VoiceSelectorInputProps extends ComponentProps<typeof CommandInput> {}

export const VoiceSelectorInput = ({
  className,
  ...props
}: VoiceSelectorInputProps) => (
  <CommandInput className={cn('h-auto py-3.5', className)} {...props} />
);

export type VoiceSelectorListProps = ComponentProps<typeof CommandList>;

export const VoiceSelectorList = (props: VoiceSelectorListProps) => (
  <CommandList {...props} />
);

export type VoiceSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

export const VoiceSelectorEmpty = (props: VoiceSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

export type VoiceSelectorGroupProps = ComponentProps<typeof CommandGroup>;

export const VoiceSelectorGroup = (props: VoiceSelectorGroupProps) => (
  <CommandGroup {...props} />
);

export type VoiceSelectorItemProps = ComponentProps<typeof CommandItem>;

export const VoiceSelectorItem = ({
  className,
  value,
  ...props
}: VoiceSelectorItemProps) => {
  const { setValue, setOpen } = useVoiceSelector();

  const handleSelect = useCallback(
    () => {
      setValue(value);
      setOpen(false);
    },
    [setValue, setOpen, value]
  );

  return (
    <CommandItem className={cn('px-4 py-2', className)} onSelect={handleSelect} {...props} />
  );
};

export type VoiceSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

export const VoiceSelectorShortcut = (props: VoiceSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

export type VoiceSelectorSeparatorProps = ComponentProps<typeof CommandSeparator>;

export const VoiceSelectorSeparator = (props: VoiceSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

export type VoiceSelectorGenderProps = ComponentProps<'span'> & {
  value?:
    | 'male'
    | 'female'
    | 'transgender'
    | 'androgyne'
    | 'non-binary'
    | 'intersex';
};

export const VoiceSelectorGender = ({
  className,
  value,
  children,
  ...props
}: VoiceSelectorGenderProps) => {
  const icon = value ? GENDER_ICON_MAP[value] ?? <CircleSmallIcon className='size-4' /> : <CircleSmallIcon className='size-4' />;

  return (
    <span className={cn('text-muted-foreground text-xs', className)} {...props}>
      {children ?? icon}
    </span>
  );
};

export type VoiceSelectorAccentProps = ComponentProps<'span'> & {
  value?:
    | 'american'
    | 'british'
    | 'australian'
    | 'canadian'
    | 'irish'
    | 'scottish'
    | 'indian'
    | 'south-african'
    | 'new-zealand'
    | 'spanish'
    | 'french'
    | 'german'
    | 'italian'
    | 'portuguese'
    | 'brazilian'
    | 'mexican'
    | 'argentinian'
    | 'japanese'
    | 'chinese'
    | 'korean'
    | 'russian'
    | 'arabic'
    | 'dutch'
    | 'swedish'
    | 'norwegian'
    | 'danish'
    | 'finnish'
    | 'polish'
    | 'turkish'
    | 'greek'
    | string;
};

export const VoiceSelectorAccent = ({
  className,
  value,
  children,
  ...props
}: VoiceSelectorAccentProps) => {
  const emoji = value ? ACCENT_EMOJI_MAP[value] ?? null : null;

  return (
    <span className={cn('text-muted-foreground text-xs', className)} {...props}>
      {children ?? emoji}
    </span>
  );
};

export type VoiceSelectorAgeProps = ComponentProps<'span'>;

export const VoiceSelectorAge = ({
  className,
  ...props
}: VoiceSelectorAgeProps) => (
  <span
    className={cn('text-muted-foreground text-xs tabular-nums', className)}
    {...props}
  />
);

export type VoiceSelectorNameProps = ComponentProps<'span'>;

export const VoiceSelectorName = ({
  className,
  ...props
}: VoiceSelectorNameProps) => (
  <span
    className={cn('flex-1 truncate text-left font-medium', className)}
    {...props}
  />
);

export type VoiceSelectorDescriptionProps = ComponentProps<'span'>;

export const VoiceSelectorDescription = ({
  className,
  ...props
}: VoiceSelectorDescriptionProps) => (
  <span className={cn('text-muted-foreground text-xs', className)} {...props} />
);

export type VoiceSelectorAttributesProps = ComponentProps<'div'>;

export const VoiceSelectorAttributes = ({
  className,
  children,
  ...props
}: VoiceSelectorAttributesProps) => (
  <div className={cn('flex items-center text-xs', className)} {...props}>
    {children}
  </div>
);

export type VoiceSelectorBulletProps = ComponentProps<'span'>;

export const VoiceSelectorBullet = ({
  className,
  ...props
}: VoiceSelectorBulletProps) => (
  <span
    aria-hidden='true'
    className={cn('select-none text-border', className)}
    {...props}
  >
    &bull;
  </span>
);

export type VoiceSelectorPreviewProps = Omit<ComponentProps<'button'>, 'children'> & {
  playing?: boolean;
  loading?: boolean;
  onPlay?: () => void;
};

export const VoiceSelectorPreview = ({
  className,
  playing,
  loading,
  onPlay,
  onClick,
  ...props
}: VoiceSelectorPreviewProps) => {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick?.(event);
      onPlay?.();
    },
    [onClick, onPlay,]
  );

  let icon = <PlayIcon className='size-3' />;

  if (loading) {
    icon = <Spinner className='size-3' />;
  } else if (playing) {
    icon = <PauseIcon className='size-3' />;
  }

  return (
    <Button
      aria-label={playing ? 'Pause preview' : 'Play preview'}
      className={cn('size-6', className)}
      disabled={loading}
      onClick={handleClick}
      size='icon-sm'
      type='button'
      variant='outline'
      {...props}
    >
      {icon}
    </Button>
  );
};
