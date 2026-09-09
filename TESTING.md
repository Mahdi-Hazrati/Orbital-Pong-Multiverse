# Validation report

## Observed results for this build

| Suite | Result | Scope |
| --- | --- | --- |
| Engine, rules, and signaling validation | 36 passed | Unit vectors, tangent bases, intersections, collision response, genuine Z/W dependence, long-run numeric stability, turn order, lives, progression, serialization, pause, and connection-code parsing. |
| Room protocol | 8 passed | Explicitly mocked transport. Four-player ready state, consistent starts, input validation, stale-input expiry, ordering, rematch isolation, chat, pause, lobby transitions, and malformed packets. |
| Chromium browser checks | 19 passed | Real application UI, keyboard controls, progression and next-level flow, 3D/4D controls, four local keyboard sets, Survival, settings pause, responsive layouts, synthetic multitouch, and blocked-route error handling. |
| Real four-browser WebRTC match | 1 skipped | The build environment's managed Chromium exposed no ICE connection routes. A real connection was not established or verified. |
| Uncaught browser JavaScript exceptions | 0 observed | During the completed browser smoke run. |

Machine-readable results are in `reports/browser-results.json`. Node test output is in `reports/unit-results.txt`.

## How the browser checks ran

The test loaded the actual built HTML into blank Chromium documents. The only source substitution enabled the existing `?test` interface, since those blank documents have no test query parameter. Game physics, UI event handlers, rendering, and room code were otherwise the shipped implementations.

Viewport checks covered 320, 390, 768, and 1366 pixels. The default desktop screenshot used a 1440-pixel viewport. The tests exercised synthetic Pointer Events for multitouch; this is not a claim of physical-device touch testing.

The build browser disallowed ordinary URL/file navigation and blocked non-proxied WebRTC networking. Those policies were not changed or bypassed. The real-connection test was marked skipped, rather than replaced with a fake success. The application correctly reported the unavailable routes and released the pending room seat.

Because these checks used blank browser documents, they did not establish that file-origin or HTTPS-origin persistent storage, clipboard access, downloads, or fullscreen work in every browser. The application implements fallbacks where possible, and the README describes these browser-dependent behaviors.

## Run the checks yourself

From the project folder:

```sh
python build.py
node --test tests/*.test.cjs
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python tests/browser_smoke.py
```

To require real connections rather than allow a network-policy skip, first serve the files from a local static origin:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then, in another terminal:

```sh
python tests/browser_smoke.py --url http://localhost:8000/ --require-p2p
```

The real-connection branch uses a host and three independent guest browser contexts with actual RTCPeerConnection instances. It tests invite/reply exchange, ready-up, a four-player 4D start, remote input, shared pause, literal-text chat, and host departure. No mocked transport is substituted in that branch.

The separate `protocol.test.cjs` suite is transport-mocked by design and is clearly identified as such. It checks message/state behavior, not ICE, DTLS, SCTP, browser interoperability, or NAT traversal.

## Remaining release validation

Before describing online play as production-validated, complete at least a same-network two-device match and a four-device match on real browsers, followed by Internet/STUN tests across different home and mobile networks. Test departures, visibility changes, packet delay/loss, rematches, invalid replies, and each dimension.

Also verify actual profile persistence and import/export on the delivery origin, hardware multitouch, clipboard fallbacks, and fullscreen behavior in the intended browsers. The bundled tests provide a repeatable starting point, not a universal compatibility certification.

Some restrictive networks will still need TURN to connect. TURN is intentionally absent from this server-free build, so testing cannot make universal internet connectivity a supported guarantee.
