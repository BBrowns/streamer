# Playback Validation Matrix

This document defines the reference fixtures used to validate playback behavior across devices. It serves as the source of truth for PR 89 acceptance criteria.

## Fixture List

| ID  | Title              | Source Type | Container | Codec (V/A) | Notes                            |
| --- | ------------------ | ----------- | --------- | ----------- | -------------------------------- |
| F1  | Big Buck Bunny     | Direct HTTP | MP4       | H.264 / AAC | Baseline standard compatibility. |
| F2  | Sintel             | Direct HTTP | HLS       | H.264 / AAC | Standard HLS streaming.          |
| F3  | Tears of Steel     | Torrent     | MKV       | H.264 / AC3 | Remux test (MKV to MP4).         |
| F4  | Cosmos Laundromat  | Torrent     | MKV       | HEVC / EAC3 | HEVC + Remux test.               |
| F5  | Elephants Dream    | Direct HTTP | MP4       | AV1 / AAC   | AV1 compatibility (Web/Android). |
| F6  | Big Buck Bunny 4K  | Torrent     | MKV       | HEVC / AC3  | High bitrate 4K performance.     |
| F7  | Sintel (Subtitles) | Torrent     | MKV       | H.264 / AAC | Subtitles (Internal/External).   |
| F8  | Broken Source      | Direct HTTP | MP4       | N/A         | Timeout / Fallback trigger.      |

## Validation Results Matrix

| Device  | Fixture | First Frame | Seek | Fallback | Cancel | Cleanup | Log |
| ------- | ------- | :---------: | :--: | :------: | :----: | :-----: | --- |
| iPhone  | F1      |             |      |          |        |         |     |
| iPhone  | F2      |             |      |          |        |         |     |
| iPhone  | F3      |             |      |          |        |         |     |
| iPhone  | F4      |             |      |          |        |         |     |
| Android | F1      |             |      |          |        |         |     |
| Android | F4      |             |      |          |        |         |     |
| Android | F5      |             |      |          |        |         |     |
| Desktop | F1      |             |      |          |        |         |     |
| Desktop | F3      |             |      |          |        |         |     |
| Desktop | F6      |             |      |          |        |         |     |
| Web     | F1      |             |      |          |        |         |     |
| Web     | F2      |             |      |          |        |         |     |
| Web     | F5      |             |      |          |        |         |     |

**Legend:**

- ✅ Passed
- ❌ Failed
- ⚠️ Partial / Warning
- ➖ N/A or Not Tested

## Acceptance Criteria Checklist

- [ ] All F1-F8 fixtures defined with representative metadata.
- [ ] Device matrix covering iPhone, Android, Desktop, and Web.
- [ ] Results captured for First Frame, Seek, Fallback, Cancel, and Cleanup.
- [ ] Logs captured and archived for failed runs.
