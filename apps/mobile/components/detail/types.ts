import type { PlaybackPlan, Stream } from "@streamer/shared";
import type {
  PlaybackReadinessActionTarget,
  PlaybackReadinessNoticeCopy,
} from "./PlaybackReadinessNotice";

export interface DetailLayoutProps {
  id: string;
  castType: "movie" | "series";
  meta: any;
  streams: Stream[] | undefined;
  streamsLoading: boolean;
  groupedStreams: Record<string, Stream[]>;
  availableResolutions: string[];
  selectedResolution: string | null;
  initiallyOpenSources?: boolean;
  setSelectedResolution: (res: string) => void;
  inLibrary: boolean;
  handleToggleLibrary: () => void;
  trailerUrl?: string | null;
  onWatchTrailer?: () => void;
  handlePlayStream: (
    stream?: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => void;
  handlePlayCandidate: (
    plan: PlaybackPlan,
    candidateId: string,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => void;
  handleDownloadStream: (
    stream?: Stream,
    episodeTitle?: string,
    season?: number,
    episode?: number,
  ) => void;
  handleCastStream?: (stream?: Stream) => void;
  planningAction?: "play" | "download" | "cast" | null;
  playbackNotice?: PlaybackReadinessNoticeCopy | null;
  onDismissPlaybackNotice?: () => void;
  onPlaybackNoticeAction?: (target: PlaybackReadinessActionTarget) => void;
  onBack: () => void;
}
