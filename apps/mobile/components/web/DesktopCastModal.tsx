import React from "react";

export interface CastDevice {
  id: string;
  name: string;
  type: string;
}

interface Props {
  visible: boolean;
  playbackUri: string;
  title: string;
  onClose: () => void;
  onCastStart?: (device: CastDevice) => void;
}

export function DesktopCastModal(props: Props) {
  return null;
}
