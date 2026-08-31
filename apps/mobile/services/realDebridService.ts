import type {
  RealDebridDeviceFlow,
  RealDebridDevicePollResult,
  RealDebridStatus,
} from "@streamer/shared";
import { api } from "./api";

export async function getRealDebridStatus() {
  const { data } = await api.get<RealDebridStatus>(
    "/api/integrations/real-debrid/status",
  );
  return data;
}

export async function startRealDebridDeviceFlow() {
  const { data } = await api.post<RealDebridDeviceFlow>(
    "/api/integrations/real-debrid/device",
  );
  return data;
}

export async function pollRealDebridDeviceFlow(flowId: string) {
  const { data } = await api.post<RealDebridDevicePollResult>(
    `/api/integrations/real-debrid/device/${encodeURIComponent(flowId)}/poll`,
  );
  return data;
}

export async function disconnectRealDebrid() {
  await api.delete("/api/integrations/real-debrid");
}
