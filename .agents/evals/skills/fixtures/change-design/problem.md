# Playback queue ownership fixture

Today the API, desktop bridge, and mobile client each retain part of a playback
queue. Restarts and reconnects can leave their views inconsistent. Produce a
decision record only; this fixture intentionally has no implementation.
