import {
  getCastSessionProfile,
  getChromecastDeviceProfile,
} from "../deviceProfile";

describe("cast device profiles", () => {
  it("maps explicit Chromecast capabilities into planning support flags", () => {
    const deviceProfile = getChromecastDeviceProfile({
      maxQuality: "2160p",
      supportsHls: false,
      supportsMp4: true,
      supportsMkv: true,
      supportedCodecs: ["h265", "eac3"],
      canAccessLocalhost: false,
      requiresRemoteReachableUrl: true,
      remuxAllowed: false,
    });
    const castProfile = getCastSessionProfile(deviceProfile, {
      supportsHls: false,
      supportsMp4: true,
      supportsMkv: true,
      supportedCodecs: ["h265", "eac3"],
      canAccessLocalhost: false,
      requiresRemoteReachableUrl: true,
      remuxAllowed: false,
    });

    expect(deviceProfile).toMatchObject({
      platform: "chromecast",
      maxQuality: "2160p",
      supports: {
        h264: false,
        h265: true,
        mp4: true,
        mkv: true,
        hls: false,
        aac: false,
        eac3: true,
      },
    });
    expect(castProfile).toEqual({
      supportsHls: false,
      supportsMp4: true,
      supportsMkv: true,
      supportedCodecs: ["h265", "eac3"],
      canAccessLocalhost: false,
      requiresRemoteReachableUrl: true,
      remuxAllowed: false,
    });
  });

  it("uses conservative Chromecast defaults when no device capabilities are reported", () => {
    const deviceProfile = getChromecastDeviceProfile();
    const castProfile = getCastSessionProfile(deviceProfile);

    expect(deviceProfile.supports).toMatchObject({
      h264: true,
      h265: false,
      mp4: true,
      mkv: false,
      hls: true,
      aac: true,
    });
    expect(castProfile).toMatchObject({
      supportsHls: true,
      supportsMp4: true,
      supportsMkv: false,
      canAccessLocalhost: false,
      requiresRemoteReachableUrl: true,
      remuxAllowed: true,
    });
  });
});
