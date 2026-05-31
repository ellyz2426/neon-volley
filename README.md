# Neon Volley VR

Holodeck VR beach volleyball — smash neon balls across a glowing court, outplay the AI opponent with bumps, sets, and spikes in this intense arcade volleyball experience.

Built with [IWSDK 0.4.1](https://iwsdk.dev) (Immersive Web SDK).

## 🎮 Play

**[▶ Play Now](https://ellyz2426.github.io/neon-volley/)**

Works in any modern browser. VR headset optional (Meta Quest recommended).

## Features

### Gameplay
- **Beach volleyball physics**: 4-substep simulation with gravity, air resistance, spin effects, and realistic ball trajectory
- **3 hit types**: Bump (low ball, high arc), Set (medium height, controlled), Spike (above net, powerful downward smash)
- **Net collision**: Ball bounces off net mesh with energy loss, can dribble over the top
- **Court boundaries**: Out-of-bounds detection with last-touch attribution
- **Serve mechanic**: Charge-and-release power bar with accuracy/scatter tradeoff
- **Ace detection**: Score directly off a serve for bonus recognition

### Game Modes
- **Match**: Full match — first to 21, win by 2, best of 3 sets
- **Quick Match**: Short game — first to 11, single set
- **Rally**: Keep the rally alive as long as possible, track your best
- **Serve Practice**: Hone your serve accuracy and power
- **Spike Drill**: Ball tossed up for spike practice
- **Daily Challenge**: Seeded difficulty that changes daily

### AI Opponent
- **3 difficulty levels**: Easy, Medium, Hard
- **Adaptive behavior**: Prediction-based movement, reaction time, accuracy, hit range
- **AI serves**: Opponent serves with difficulty-scaled power and accuracy
- **Hit types**: AI uses bumps, sets, and spikes contextually based on ball position

### Progression
- **20 achievements** with localStorage persistence (First Blood, Ace!, Spike Master, Unstoppable, Shutout, and more)
- **Top 20 leaderboard** tracking scores, modes, difficulty, and win/loss
- **Combo scoring system**: Consecutive point multiplier tracking
- **Career stats**: Games played, wins, total aces, spikes, blocks, best rally

### Visuals
- **Holodeck environment**: Neon grid floor/ceiling, 14 floating wireframe decorations, 40 ambient particles, fog
- **5 court themes**: Holodeck (cyan), Crimson (red), Ocean (blue), Ultraviolet (purple), Solar (gold) — live-switchable
- **Ball effects**: Glowing ball with wireframe overlay, dynamic trail, ground shadow, speed-reactive glow
- **Neon opponent**: Wireframe humanoid with body, head, arms, legs, visor, and hit animations
- **Player hands**: Glowing spheres with proximity pulse when near ball
- **Particle system**: Pooled particles (100 max) with gravity for hits, points, and celebrations
- **Ball landing markers**: Visual indicators where the ball contacts the ground
- **Court lines**: Boundary, center, attack, and service zone markings

### Audio
- **15+ procedural Web Audio SFX**: Serve, bump, set, spike, net hit, point won/lost, ace, victory/defeat, countdown, game start, achievement unlock
- **Ambient synthwave drone** music with bass oscillator + triangle pad + LFO modulation
- **Volume controls**: Independent SFX and music volume sliders in settings

### UI
- **13 PanelUI templates** (`.uikitml`), zero HTML DOM — fully VR-compatible
- Head-following HUD with score, set info, and combo display
- Serve power bar with visual charge indicator
- Countdown overlay for match start
- Toast notifications for points, aces, achievements
- World-space panels: title, mode select, difficulty, pause, game over, leaderboard, achievements, settings, help

### Controls
| Action | Browser | VR |
|--------|---------|-----|
| Move | WASD / Arrows | Left Thumbstick |
| Serve / Hit | Space | Right Trigger |
| Pause | Escape | B Button |

## Tech

- IWSDK 0.4.1 (Three.js + ECS)
- TypeScript (~2,900 lines across 3 source files)
- 13 `.uikitml` spatial UI templates
- Procedural Web Audio (no audio files)
- localStorage persistence (achievements, stats, leaderboard)
- GitHub Pages deployment

## Build

```bash
npm install
npx vite build
```

## License

MIT
