import type { Stream } from "@streamer/shared";

export interface DetailLayoutProps {
  id: string;
  castType: "movie" | "series";
  meta: any;
  streams: Stream[] | undefined;
  streamsLoading: boolean;
  groupedStreams: Record<string, Stream[]>;
  availableResolutions: string[];
  selectedResolution: string | null;
  setSelectedResolution: (res: string) => void;
  inLibrary: boolean;
  handleToggleLibrary: () => void;
  handlePlayStream: (
    stream: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => void;
  handleDownloadStream: (
    stream: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => void;
  onBack: () => void;
}
