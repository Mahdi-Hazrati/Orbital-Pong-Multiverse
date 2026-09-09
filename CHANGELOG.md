# Changelog

## 2.0 - Multiverse

Replaces the original single-circle implementation with a dimension-independent game engine and a rebuilt interface.

### Added

- Circle, sphere, and hypersphere physics using two-, three-, and four-component vectors.
- Twelve campaign sectors with return goals, lives, unlocks, stars, XP, and achievements.
- Two-to-four-player local matches and up to three AI opponents.
- One-life Survival in every dimension.
- Manual depth and fourth-axis phase input, with optional assistance.
- Projected 3D and 4D arenas, dimension-aware landing predictions, and axis readouts.
- WebRTC room implementation with per-guest invite/reply exchange, ready-up, room chat, and host settings.
- Separate reliable control and low-latency state channels, snapshot sequencing, rematch epochs, and stale-input expiry.
- Direct/LAN mode with no ICE servers and optional public-STUN internet discovery.
- Helpful errors when browser policy exposes no connection routes.
- Profile export/import and saved local progression.
- Modular source, a dependency-free HTML build script, and automated tests.

### Changed

- Competitive matches use lives and last-pilot-standing elimination, rather than first-to-seven scoring.
- Successful returns rotate through every living pilot. Only the active paddle collides.
- The host owns the shared simulation in online rooms; losing the host ends the room.

### Validation limitation

Offline/local gameplay was exercised in browser tests. The real WebRTC test was blocked by the build browser's network policy and remains unverified, not passed. Transport-mocked protocol tests are identified separately. No TURN relay or universal internet-connectivity guarantee is provided.
