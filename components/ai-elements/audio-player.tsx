"use client";

import type { Experimental_SpeechResult as SpeechResult } from "ai";
import type { ComponentProps, CSSProperties } from "react";
import type { JSX } from "react";

import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@/components/ui/button-group";

export type AudioPlayerProps = Omit<
  ComponentProps<typeof MediaController>,
  "audio"
>;

export const AudioPlayer = ({
  children,
  style,
  ...props
}: AudioPlayerProps): JSX.Element => (
  <MediaController
    audio
    data-slot="audio-player"
    style={
      {
        "--media-background-color": "transparent",
        "--media-button-icon-height": "1rem",
        "--media-button-icon-width": "1rem",
        "--media-control-background": "transparent",
        "--media-control-hover-background": "var(--color-accent)",
        "--media-control-padding": "0",
        "--media-font": "var(--font-sans)",
        "--media-font-size": "10px",
        "--media-icon-color": "currentColor",
        "--media-preview-time-background": "var(--color-background)",
        "--media-preview-time-border-radius": "var(--radius-md)",
        "--media-preview-time-text-shadow": "none",
        "--media-primary-color": "var(--color-primary)",
        "--media-range-bar-color": "var(--color-primary)",
        "--media-range-track-background": "var(--color-secondary)",
        "--media-secondary-color": "var(--color-secondary)",
        "--media-text-color": "var(--color-foreground)",
        "--media-tooltip-arrow-display": "none",
        "--media-tooltip-background": "var(--color-background)",
        "--media-tooltip-border-radius": "var(--radius-md)",
        ...style,
      } as CSSProperties
    }
    {...props}
  >
    {children}
  </MediaController>
);

export type AudioPlayerElementProps = Omit<ComponentProps<"audio">, "src"> &
  (
    | {
        data: SpeechResult["audio"];
      }
    | {
        src: string;
      }
  );

export const AudioPlayerElement = (props: AudioPlayerElementProps): JSX.Element => {
  const { src, data, ...rest } = props as {
    src?: string;
    data?: { mediaType?: string; base64?: string };
    [key: string]: unknown;
  };

  let audioSrc: string | undefined;
  if (typeof src === "string" && src.length > 0) {
    audioSrc = src;
  } else if (
    data &&
    typeof data === "object" &&
    typeof data.mediaType === "string" &&
    typeof data.base64 === "string"
  ) {
    audioSrc = `data:${data.mediaType};base64,${data.base64}`;
  }

  return (
    <audio
      data-slot="audio-player-element"
      slot="media"
      src={audioSrc}
      {...rest}
    />
  );
};

export type AudioPlayerControlBarProps = ComponentProps<typeof MediaControlBar>;

export const AudioPlayerControlBar = ({
  children,
  ...props
}: AudioPlayerControlBarProps): JSX.Element => (
  <MediaControlBar data-slot="audio-player-control-bar" {...props}>
    <ButtonGroup orientation="horizontal">{children}</ButtonGroup>
  </MediaControlBar>
);

export type AudioPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>;

export const AudioPlayerPlayButton = ({
  className,
  ...props
}: AudioPlayerPlayButtonProps): JSX.Element => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaPlayButton
      className={cn("bg-transparent", className)}
      data-slot="audio-player-play-button"
      {...props}
    />
  </Button>
);

export type AudioPlayerSeekBackwardButtonProps = ComponentProps<
  typeof MediaSeekBackwardButton
>;

export const AudioPlayerSeekBackwardButton = ({
  seekOffset = 10,
  ...props
}: AudioPlayerSeekBackwardButtonProps): JSX.Element => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaSeekBackwardButton
      data-slot="audio-player-seek-backward-button"
      seekOffset={seekOffset}
      {...props}
    />
  </Button>
);

export type AudioPlayerSeekForwardButtonProps = ComponentProps<
  typeof MediaSeekForwardButton
>;

export const AudioPlayerSeekForwardButton = ({
  seekOffset = 10,
  ...props
}: AudioPlayerSeekForwardButtonProps): JSX.Element => (
  <Button asChild size="icon-sm" variant="outline">
    <MediaSeekForwardButton
      data-slot="audio-player-seek-forward-button"
      seekOffset={seekOffset}
      {...props}
    />
  </Button>
);

export type AudioPlayerTimeDisplayProps = ComponentProps<
  typeof MediaTimeDisplay
>;

export const AudioPlayerTimeDisplay = ({
  className,
  ...props
}: AudioPlayerTimeDisplayProps): JSX.Element => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaTimeDisplay
      className={cn("tabular-nums", className)}
      data-slot="audio-player-time-display"
      {...props}
    />
  </ButtonGroupText>
);

export type AudioPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>;

export const AudioPlayerTimeRange = ({
  className,
  ...props
}: AudioPlayerTimeRangeProps): JSX.Element => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaTimeRange
      className={className}
      data-slot="audio-player-time-range"
      {...props}
    />
  </ButtonGroupText>
);

export type AudioPlayerDurationDisplayProps = ComponentProps<
  typeof MediaDurationDisplay
>;

export const AudioPlayerDurationDisplay = ({
  className,
  ...props
}: AudioPlayerDurationDisplayProps): JSX.Element => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaDurationDisplay
      className={cn("tabular-nums", className)}
      data-slot="audio-player-duration-display"
      {...props}
    />
  </ButtonGroupText>
);

export type AudioPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>;

export const AudioPlayerMuteButton = ({
  className,
  ...props
}: AudioPlayerMuteButtonProps): JSX.Element => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaMuteButton
      className={className}
      data-slot="audio-player-mute-button"
      {...props}
    />
  </ButtonGroupText>
);

export type AudioPlayerVolumeRangeProps = ComponentProps<
  typeof MediaVolumeRange
>;

export const AudioPlayerVolumeRange = ({
  className,
  ...props
}: AudioPlayerVolumeRangeProps): JSX.Element => (
  <ButtonGroupText asChild className="bg-transparent">
    <MediaVolumeRange
      className={className}
      data-slot="audio-player-volume-range"
      {...props}
    />
  </ButtonGroupText>
);
