# Orbital Pong 360




https://github.com/user-attachments/assets/16ddc660-09be-4ede-abbf-8dbbc9ada6d6




> Same game. A higher orbit.

A neon arcade game that takes Pong beyond the sidelines. Move your paddle around the **entire 360° arena**, return the ball from any angle, and keep the rally alive.

Play against the computer, challenge a friend on the same device, or defend the whole circle in Survival. Built with **HTML, CSS, and vanilla JavaScript**, the game lives in a single HTML file with no external dependencies or build step.

## Highlights

- **Full-circle movement:** freely orbit the entire ring instead of staying on one side of the court.
- **Three modes and three difficulty levels:** VS AI, local two-player, and Survival; choose Easy, Normal, or Hard.
- **Skill-based returns:** off-center hits and paddle movement influence the outgoing angle, while each successful return increases ball speed up to a difficulty-dependent limit.
- **Neon presentation:** glowing paddles, ball trails, impact effects, synthesized arcade audio, and a responsive layout.
- **Helpful extras:** an optional landing guide, live rally/speed/spin readouts, locally saved best rallies, fullscreen support, and automatic pausing when the window loses focus.

## Getting started

Download `orbital-pong-360.html` and open it in a modern browser with JavaScript enabled. Select a mode and difficulty, then click **Launch into orbit** or press **Space**.

The downloaded file runs offline. No installation, account, package manager, or server is required.

### Optional local server

For development, serve the project folder with Python 3:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://localhost:8000/orbital-pong-360.html
```

On systems where Python 3 uses the `python3` command, replace `python` with `python3`.

## How to play

The circular rim is **not a wall**: the ball escapes unless the active paddle catches it. Neither player is restricted to a half of the arena.

### Duel modes

In **VS AI** and **2 Players**, returns alternate. The **glowing paddle** must make the next return; the dim paddle is inactive and cannot block the ball. Miss your return and your opponent earns a point. The first player to **7 points** wins.

### Survival

Control one paddle and defend all 360 degrees. Every successful return adds to your score and makes the ball faster until it reaches the speed cap. One miss ends the run.

### Game modes

| Mode | Players | Objective |
| --- | --- | --- |
| VS AI | You versus the computer | Be the first to score 7 points. |
| 2 Players | Two people on one device | Alternate returns and race to 7 points. |
| Survival | One player | Make as many consecutive returns as possible. |

Two-player mode is local only; there is no online matchmaking or network multiplayer.

## Controls

| Input | Action |
| --- | --- |
| Mouse movement over the arena | Aim Player 1's paddle around the ring. |
| Touch and drag | Aim your paddle around the ring. |
| `A` / `D` | Move Player 1 counterclockwise / clockwise. |
| Left / Right arrow keys | Move your paddle in solo modes, or Player 2 in local multiplayer. |
| `Space` | Start, pause, resume, or play again after a game ends. |
| `Esc` | Pause or resume during a match; browser fullscreen behavior may also apply. |
| `R` | Restart the current game. |
| `M` | Toggle sound. |
| `F` | Toggle fullscreen where supported. |

**Two-player touch controls:** each player touches near their paddle and drags around the arena. Two simultaneous touches control the paddles independently.

Paddles have a movement-speed limit: aiming at a position guides your paddle toward it rather than teleporting it.

## Settings and saved progress

**Difficulty** changes starting and maximum ball speed, paddle size, player movement speed, and the computer's reaction time, movement speed, and aiming accuracy. Changing difficulty returns the game to the launch screen; changing mode resets the match.

**Landing guide** shows the ball's predicted next contact point and can be toggled during play.

Sound, guide preference, difficulty, and best rally records are saved in browser `localStorage` when available. Duel modes share one best-rally record; Survival has a separate record. Records are local to the browser, not synced across devices. An in-progress match is not saved across page reloads.

The game continues to work when storage is unavailable, but settings and records may not persist.

## Built with

| Component | Implementation |
| --- | --- |
| Interface | HTML and CSS, with responsive layouts and inline SVG icons |
| Rendering | HTML Canvas 2D and `requestAnimationFrame` |
| Gameplay | Vanilla JavaScript with a fixed simulation timestep |
| Collision detection | Continuous ball-path intersection with the circular paddle boundary |
| Audio | Web Audio API oscillators; no audio files required |
| Input | Keyboard and Pointer Events, including multitouch |
| Persistence | Browser `localStorage` |

The game recreates the neon visual concept in code; the original concept image is not required to run it.

## Project structure

```text
orbital-pong-360/
|-- orbital-pong-360.html   # Complete game: markup, styles, and JavaScript
`-- README.md              # Project documentation
```

To publish on a static host, upload the HTML file. Use `index.html` as the filename when you want the game to be the site's default entry page. No backend or build output is needed.

## Customization

Edit the constants near the start of the inline script in `orbital-pong-360.html`:

| Setting | Purpose |
| --- | --- |
| `POINTS_TO_WIN` | Duel match target; currently 7. |
| `CONFIGS` | Ball speeds, paddle arc sizes, movement speeds, and AI behavior for each difficulty. |
| `PADDLE_R`, `PADDLE_W`, `BALL_R` | Paddle position, paddle thickness, and ball size in arena-relative units. |
| `CYAN`, `PINK` | Canvas player colors; update the CSS `--cyan` and `--pink` variables to match. |
| `FIXED_DT` | Physics timestep; currently `1 / 180` seconds, independent of display refresh rate. |

Some interface copy also contains the seven-point target, so update those labels when changing `POINTS_TO_WIN`.

## Browser notes

Use a modern browser with Canvas 2D, Pointer Events, and `ResizeObserver` support. Sound starts after user interaction and is optional. Fullscreen availability depends on the browser and how the page is embedded.

The interface includes keyboard controls, focus indicators, status announcements, and reduced-motion adjustments. The game itself remains visual and timing-based; these features do not make it fully screen-reader playable.

## Contributing

Bug reports and improvements are welcome. For a bug report, include your browser, device, game mode, difficulty, and steps to reproduce the issue. Keep contributions self-contained and preserve the game's offline, dependency-free setup.
