import {
  World,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  Follower,
  FollowBehavior,
  ScreenSpace,
  InputComponent,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  PlaneGeometry,
  ConeGeometry,
  TorusGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  Color,
  Vector3,
  Quaternion,
  Euler,
  Fog,
  AmbientLight,
  PointLight,
  DirectionalLight,
  BufferGeometry,
  Float32BufferAttribute,
  EdgesGeometry,
  LineSegments,
  AdditiveBlending,
  RingGeometry,
} from "@iwsdk/core";

import { GameState, CourtTheme, THEMES, ACHIEVEMENTS, GameMode, Difficulty, AchievementDef } from "./types";
import { AudioManager } from "./audio";

// ============================================================
// GAME CONSTANTS
// ============================================================
const COURT_WIDTH = 8; // 8m x 8m per side (official beach)
const COURT_LENGTH = 16;
const NET_HEIGHT = 2.43;
const NET_WIDTH = 8.5;
const BALL_RADIUS = 0.105; // official volleyball radius ~10.5cm
const GRAVITY = -9.81;
const SERVE_POWER_MIN = 6;
const SERVE_POWER_MAX = 14;
const SPIKE_POWER = 12;
const SET_POWER = 5;
const BUMP_POWER = 6;

// ============================================================
// GAME STATE MANAGER
// ============================================================
class GameStateManager {
  state: GameState = 'title';
  mode: GameMode = 'match';
  difficulty: Difficulty = 'medium';
  theme: CourtTheme = 'holodeck';

  // Score
  playerScore = 0;
  opponentScore = 0;
  playerSets = 0;
  opponentSets = 0;
  currentSet = 1;
  pointTarget = 21;
  setsToWin = 2;

  // Ball state
  ballPos = new Vector3(0, 1.5, -3);
  ballVel = new Vector3(0, 0, 0);
  ballSpin = new Vector3(0, 0, 0);
  ballActive = false;
  ballOnPlayerSide = true;
  lastTouchPlayer = true;
  playerTouches = 0;
  opponentTouches = 0;

  // Serve
  servingPlayer = true;
  serveCharge = 0;
  isCharging = false;
  serveTossed = false;
  serveBallY = 0;

  // Rally stats
  rallyLength = 0;
  longestRally = 0;
  totalRallies = 0;
  aces = 0;
  spikes = 0;
  blocks = 0;
  digs = 0;

  // Player
  playerX = 0;
  playerZ = -4;
  swingCooldown = 0;

  // AI
  aiX = 0;
  aiZ = 4;
  aiTargetX = 0;
  aiTargetZ = 4;
  aiState: 'idle' | 'moving' | 'hitting' | 'serving' = 'idle';
  aiReactionTimer = 0;
  aiHitCooldown = 0;

  // Combo
  combo = 0;
  maxCombo = 0;
  consecutivePoints = 0;

  // Timing
  matchTime = 0;
  countdown = 0;
  gameStarted = false;
  paused = false;

  // Practice stats
  serveAttempts = 0;
  serveHits = 0;
  spikeAttempts = 0;
  spikeHits = 0;
  practiceTimer = 0;
  practiceTimeLimit = 60; // 60 seconds for practice modes
  gamesPlayed = 0;
  gamesWon = 0;
  totalAces = 0;
  totalSpikes = 0;
  totalBlocks = 0;
  bestRally = 0;
  achievements: Set<string> = new Set();

  constructor() {
    this.loadPersistence();
  }

  loadPersistence() {
    try {
      const data = localStorage.getItem('neon-volley-save');
      if (data) {
        const d = JSON.parse(data);
        this.gamesPlayed = d.gamesPlayed || 0;
        this.gamesWon = d.gamesWon || 0;
        this.totalAces = d.totalAces || 0;
        this.totalSpikes = d.totalSpikes || 0;
        this.totalBlocks = d.totalBlocks || 0;
        this.bestRally = d.bestRally || 0;
        this.achievements = new Set(d.achievements || []);
      }
    } catch {}
  }

  savePersistence() {
    try {
      localStorage.setItem('neon-volley-save', JSON.stringify({
        gamesPlayed: this.gamesPlayed,
        gamesWon: this.gamesWon,
        totalAces: this.totalAces,
        totalSpikes: this.totalSpikes,
        totalBlocks: this.totalBlocks,
        bestRally: this.bestRally,
        achievements: Array.from(this.achievements),
      }));
    } catch {}
  }

  resetRound() {
    this.ballActive = false;
    this.playerTouches = 0;
    this.opponentTouches = 0;
    this.serveCharge = 0;
    this.isCharging = false;
    this.serveTossed = false;
    this.rallyLength = 0;
    this.swingCooldown = 0;
    this.aiHitCooldown = 0;
    this.aiState = 'idle';
    this.aiReactionTimer = 0;

    // Position ball for serve
    if (this.servingPlayer) {
      this.ballPos.set(this.playerX, 1.2, -5);
      this.ballVel.set(0, 0, 0);
    } else {
      this.ballPos.set(this.aiX, 1.2, 5);
      this.ballVel.set(0, 0, 0);
    }
  }

  resetMatch() {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.playerSets = 0;
    this.opponentSets = 0;
    this.currentSet = 1;
    this.servingPlayer = true;
    this.combo = 0;
    this.maxCombo = 0;
    this.consecutivePoints = 0;
    this.aces = 0;
    this.spikes = 0;
    this.blocks = 0;
    this.digs = 0;
    this.matchTime = 0;
    this.totalRallies = 0;
    this.longestRally = 0;
    this.serveAttempts = 0;
    this.serveHits = 0;
    this.spikeAttempts = 0;
    this.spikeHits = 0;
    this.practiceTimer = 0;
    this.resetRound();
  }

  getTargetScore(): number {
    if (this.mode === 'quick') return 11;
    if (this.mode === 'rally') return 999;
    return 21;
  }
}

// ============================================================
// MAIN GAME
// ============================================================
let world: any;
let gsm: GameStateManager;
let audio: AudioManager;

// 3D objects
let ballMesh: Mesh;
let ballGlow: Mesh;
let netMesh: Group;
let courtFloor: Mesh;
let courtLines: Group;
let opponentMesh: Group;
let playerHandMeshL: Mesh;
let playerHandMeshR: Mesh;
let ballTrailPoints: Vector3[] = [];
let ballTrailMesh: LineSegments | null = null;
let ballShadow: Mesh;

// Environment
let decorations: Group;
let ambientParticles: Mesh[];
let accentLights: PointLight[];

// Landing markers
let landingMarkers: { mesh: Mesh; life: number }[] = [];

// Opponent animation
let opponentArmAngle = 0;
let opponentArmTarget = 0;
let opponentBobPhase = 0;

// Particles
const MAX_PARTICLES = 100;
let particles: { mesh: Mesh; vel: Vector3; life: number; maxLife: number }[] = [];
let particlePool: Mesh[] = [];

// UI Entities
let titleEntity: any;
let modeSelectEntity: any;
let difficultyEntity: any;
let hudEntity: any;
let pauseEntity: any;
let gameOverEntity: any;
let leaderboardEntity: any;
let achievementsEntity: any;
let settingsEntity: any;
let helpEntity: any;
let toastEntity: any;
let countdownEntity: any;
let serveBarEntity: any;

const uiEntities: Map<string, any> = new Map();

// ============================================================
// ENTRY POINT
// ============================================================
async function main() {
  const container = document.getElementById("app") as HTMLDivElement;
  gsm = new GameStateManager();
  audio = new AudioManager();

  world = await World.create(container, {
    xr: { offer: "once" as any },
    ...({ input: { canvasPointerEvents: true } } as any),
    features: {
      grabbing: false,
      locomotion: { browserControls: true } as any,
      physics: false,
      spatialUI: true,
    },
    render: {
      near: 0.01,
      far: 200,
      ...({ camera: { position: [0, 1.7, -6], lookAt: [0, 1.5, 0] } } as any),
    },
  });

  buildEnvironment();
  buildCourt();
  buildNet();
  buildBall();
  buildOpponent();
  buildPlayerHands();
  buildBallShadow();
  initParticlePool();
  await setupUI();

  showUI('title');

  // Game loop
  const tmpVec = new Vector3();
  let lastTime = performance.now();

  const update = () => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (gsm.state === 'playing' && !gsm.paused) {
      gsm.matchTime += dt;
      updateInput(dt);
      updateBallPhysics(dt);
      updateAI(dt);
      updatePlayerHands(dt);
      updateBallVisuals();
      updateBallTrail();
      updateBallShadow();
      updateParticles(dt);
      updateLandingMarkers(dt);
      updateOpponentAnimation(dt);
      updateHUD();
      updateServeBar();

      // Practice mode timer
      if (gsm.mode === 'serve' || gsm.mode === 'spike') {
        gsm.practiceTimer += dt;
        if (gsm.practiceTimer >= gsm.practiceTimeLimit) {
          endPracticeMode();
        }
      }
    } else if (gsm.state === 'countdown') {
      gsm.countdown -= dt;
      updateCountdown();
      if (gsm.countdown <= 0) {
        gsm.state = 'playing';
        gsm.gameStarted = true;
        hideUI('countdown');
        showUI('hud');
        if (gsm.mode !== 'serve' && gsm.mode !== 'spike') {
          showUI('servebar');
        }
        gsm.resetRound();
        if (gsm.mode === 'spike') {
          startSpikeDrill();
        } else if (gsm.mode === 'serve') {
          showUI('servebar');
          gsm.servingPlayer = true;
        }
        audio.playGameStart();
      }
    } else if (gsm.state === 'serving_ai') {
      // AI serve animation
      gsm.aiReactionTimer -= dt;
      if (gsm.aiReactionTimer <= 0) {
        performAIServe();
        gsm.state = 'playing';
      }
    }

    updateEnvironmentAnimations(dt);
    requestAnimationFrame(update);
  };

  requestAnimationFrame(update);
}

// ============================================================
// COURT
// ============================================================
function buildCourt() {
  const theme = THEMES[gsm.theme];

  // Court floor
  const floorGeo = new PlaneGeometry(COURT_WIDTH + 4, COURT_LENGTH + 6);
  const floorMat = new MeshStandardMaterial({
    color: new Color(theme.floor),
    roughness: 0.9,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
  });
  courtFloor = new Mesh(floorGeo, floorMat);
  courtFloor.rotation.x = -Math.PI / 2;
  courtFloor.position.y = 0.01;
  world.scene.add(courtFloor);

  // Neon grid on floor
  const gridGroup = new Group();
  const gridMat = new LineBasicMaterial({ color: new Color(theme.gridColor), transparent: true, opacity: 0.3 });
  for (let x = -COURT_WIDTH / 2; x <= COURT_WIDTH / 2; x += 1) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([
      x, 0.02, -COURT_LENGTH / 2 - 2, x, 0.02, COURT_LENGTH / 2 + 2
    ], 3));
    gridGroup.add(new LineSegments(geo, gridMat));
  }
  for (let z = -COURT_LENGTH / 2 - 2; z <= COURT_LENGTH / 2 + 2; z += 1) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([
      -COURT_WIDTH / 2 - 1, 0.02, z, COURT_WIDTH / 2 + 1, 0.02, z
    ], 3));
    gridGroup.add(new LineSegments(geo, gridMat));
  }
  world.scene.add(gridGroup);

  // Court boundary lines (bright)
  courtLines = new Group();
  const lineMat = new LineBasicMaterial({ color: new Color(theme.accent), transparent: true, opacity: 0.9 });
  const hw = COURT_WIDTH / 2;
  const hl = COURT_LENGTH / 2;

  // Outer boundary
  const outerPts = [
    -hw, 0.03, -hl, hw, 0.03, -hl,
    hw, 0.03, -hl, hw, 0.03, hl,
    hw, 0.03, hl, -hw, 0.03, hl,
    -hw, 0.03, hl, -hw, 0.03, -hl,
  ];
  const outerGeo = new BufferGeometry();
  outerGeo.setAttribute('position', new Float32BufferAttribute(outerPts, 3));
  courtLines.add(new LineSegments(outerGeo, lineMat));

  // Center line
  const centerGeo = new BufferGeometry();
  centerGeo.setAttribute('position', new Float32BufferAttribute([
    -hw, 0.03, 0, hw, 0.03, 0
  ], 3));
  courtLines.add(new LineSegments(centerGeo, lineMat));

  // Attack lines (3m from net)
  const atkMat = new LineBasicMaterial({ color: new Color(theme.accent), transparent: true, opacity: 0.5 });
  for (const z of [-3, 3]) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([
      -hw, 0.03, z, hw, 0.03, z
    ], 3));
    courtLines.add(new LineSegments(geo, atkMat));
  }

  // Service zones
  for (const z of [-hl, hl]) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([
      0, 0.03, z, 0, 0.03, z + (z < 0 ? 1 : -1)
    ], 3));
    courtLines.add(new LineSegments(geo, atkMat));
  }

  world.scene.add(courtLines);
}

// ============================================================
// NET
// ============================================================
function buildNet() {
  const theme = THEMES[gsm.theme];
  netMesh = new Group();

  // Net posts
  const postGeo = new CylinderGeometry(0.04, 0.04, NET_HEIGHT + 0.3, 8);
  const postMat = new MeshStandardMaterial({
    color: new Color(theme.accent),
    emissive: new Color(theme.accent),
    emissiveIntensity: 0.5,
    metalness: 0.8,
    roughness: 0.2,
  });

  const leftPost = new Mesh(postGeo, postMat);
  leftPost.position.set(-NET_WIDTH / 2, (NET_HEIGHT + 0.3) / 2, 0);
  netMesh.add(leftPost);

  const rightPost = new Mesh(postGeo, postMat);
  rightPost.position.set(NET_WIDTH / 2, (NET_HEIGHT + 0.3) / 2, 0);
  netMesh.add(rightPost);

  // Net top band
  const topBandGeo = new BoxGeometry(NET_WIDTH, 0.08, 0.02);
  const topBandMat = new MeshStandardMaterial({
    color: new Color('#ffffff'),
    emissive: new Color(theme.accent),
    emissiveIntensity: 0.8,
  });
  const topBand = new Mesh(topBandGeo, topBandMat);
  topBand.position.set(0, NET_HEIGHT, 0);
  netMesh.add(topBand);

  // Net mesh (grid lines)
  const netLineMat = new LineBasicMaterial({
    color: new Color(theme.netColor),
    transparent: true,
    opacity: 0.4,
  });

  // Vertical net lines
  for (let x = -NET_WIDTH / 2; x <= NET_WIDTH / 2; x += 0.2) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([
      x, NET_HEIGHT - 1.0, 0, x, NET_HEIGHT, 0
    ], 3));
    netMesh.add(new LineSegments(geo, netLineMat));
  }

  // Horizontal net lines
  for (let y = NET_HEIGHT - 1.0; y <= NET_HEIGHT; y += 0.1) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([
      -NET_WIDTH / 2, y, 0, NET_WIDTH / 2, y, 0
    ], 3));
    netMesh.add(new LineSegments(geo, netLineMat));
  }

  // Antenna markers
  const antGeo = new CylinderGeometry(0.01, 0.01, 0.8, 6);
  for (const xSign of [-1, 1]) {
    const x = xSign * COURT_WIDTH / 2;
    for (let i = 0; i < 4; i++) {
      const color = i % 2 === 0 ? '#ff0000' : '#ffffff';
      const seg = new Mesh(antGeo, new MeshStandardMaterial({
        color: new Color(color),
        emissive: new Color(color),
        emissiveIntensity: 0.6,
      }));
      seg.position.set(x, NET_HEIGHT + 0.1 + i * 0.2, 0);
      seg.scale.y = 0.25;
      netMesh.add(seg);
    }
  }

  world.scene.add(netMesh);
}

// ============================================================
// BALL
// ============================================================
function buildBall() {
  const ballGeo = new SphereGeometry(BALL_RADIUS, 16, 16);
  const ballMat = new MeshStandardMaterial({
    color: new Color('#ffffff'),
    emissive: new Color('#00ffff'),
    emissiveIntensity: 0.4,
    metalness: 0.3,
    roughness: 0.6,
  });
  ballMesh = new Mesh(ballGeo, ballMat);
  ballMesh.position.copy(gsm.ballPos);
  world.scene.add(ballMesh);

  // Glow
  const glowGeo = new SphereGeometry(BALL_RADIUS * 1.5, 12, 12);
  const glowMat = new MeshBasicMaterial({
    color: new Color('#00ffff'),
    transparent: true,
    opacity: 0.15,
    blending: AdditiveBlending,
  });
  ballGlow = new Mesh(glowGeo, glowMat);
  ballMesh.add(ballGlow);

  // Wireframe
  const wireGeo = new EdgesGeometry(new SphereGeometry(BALL_RADIUS * 1.02, 8, 8));
  const wireMat = new LineBasicMaterial({
    color: new Color('#00ffff'),
    transparent: true,
    opacity: 0.4,
  });
  ballMesh.add(new LineSegments(wireGeo, wireMat));
}

function buildBallShadow() {
  const geo = new PlaneGeometry(0.3, 0.3);
  const mat = new MeshBasicMaterial({
    color: new Color('#000000'),
    transparent: true,
    opacity: 0.3,
  });
  ballShadow = new Mesh(geo, mat);
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.02;
  world.scene.add(ballShadow);
}

// ============================================================
// OPPONENT
// ============================================================
function buildOpponent() {
  const theme = THEMES[gsm.theme];
  opponentMesh = new Group();

  // Body (torso)
  const torsoGeo = new BoxGeometry(0.4, 0.6, 0.2);
  const torsoMat = new MeshStandardMaterial({
    color: new Color(theme.opponentColor),
    emissive: new Color(theme.opponentColor),
    emissiveIntensity: 0.3,
    metalness: 0.5,
    roughness: 0.4,
  });
  const torso = new Mesh(torsoGeo, torsoMat);
  torso.position.y = 1.3;
  opponentMesh.add(torso);

  // Head
  const headGeo = new SphereGeometry(0.12, 12, 12);
  const headMat = new MeshStandardMaterial({
    color: new Color(theme.opponentColor),
    emissive: new Color(theme.opponentColor),
    emissiveIntensity: 0.4,
  });
  const head = new Mesh(headGeo, headMat);
  head.position.y = 1.8;
  opponentMesh.add(head);

  // Arms (cylinders)
  for (const xSign of [-1, 1]) {
    const armGeo = new CylinderGeometry(0.04, 0.04, 0.5, 8);
    const arm = new Mesh(armGeo, torsoMat);
    arm.position.set(xSign * 0.3, 1.2, 0);
    arm.rotation.z = xSign * -0.3;
    opponentMesh.add(arm);
  }

  // Legs
  for (const xSign of [-1, 1]) {
    const legGeo = new CylinderGeometry(0.05, 0.05, 0.7, 8);
    const leg = new Mesh(legGeo, torsoMat);
    leg.position.set(xSign * 0.12, 0.35, 0);
    opponentMesh.add(leg);
  }

  // Wireframe overlay
  const wireGeo = new EdgesGeometry(torsoGeo);
  const wireMat = new LineBasicMaterial({ color: new Color(theme.accent), transparent: true, opacity: 0.3 });
  const wire = new LineSegments(wireGeo, wireMat);
  wire.position.y = 1.3;
  opponentMesh.add(wire);

  // Eye visor
  const visorGeo = new BoxGeometry(0.2, 0.04, 0.13);
  const visorMat = new MeshStandardMaterial({
    color: new Color(theme.accent),
    emissive: new Color(theme.accent),
    emissiveIntensity: 1.0,
  });
  const visor = new Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.82, -0.08);
  opponentMesh.add(visor);

  opponentMesh.position.set(0, 0, 5);
  world.scene.add(opponentMesh);
}

// ============================================================
// PLAYER HANDS
// ============================================================
function buildPlayerHands() {
  const handGeo = new SphereGeometry(0.08, 10, 10);
  const handMat = new MeshStandardMaterial({
    color: new Color('#00ffff'),
    emissive: new Color('#00ffff'),
    emissiveIntensity: 0.5,
    metalness: 0.6,
    roughness: 0.3,
  });

  playerHandMeshL = new Mesh(handGeo, handMat);
  playerHandMeshR = new Mesh(handGeo.clone(), handMat.clone());

  // Wireframe
  const wireGeo = new EdgesGeometry(handGeo);
  const wireMat = new LineBasicMaterial({ color: new Color('#00ffff'), transparent: true, opacity: 0.5 });
  playerHandMeshL.add(new LineSegments(wireGeo.clone(), wireMat.clone()));
  playerHandMeshR.add(new LineSegments(wireGeo.clone(), wireMat.clone()));

  playerHandMeshL.position.set(-0.2, 1.0, -5);
  playerHandMeshR.position.set(0.2, 1.0, -5);

  world.scene.add(playerHandMeshL);
  world.scene.add(playerHandMeshR);
}

// ============================================================
// ENVIRONMENT
// ============================================================
function buildEnvironment() {
  const theme = THEMES[gsm.theme];

  // Fog
  world.scene.fog = new Fog(new Color('#0a0a1a'), 15, 60);

  // Ambient light
  const ambient = new AmbientLight(new Color('#1a1a3a'), 0.4);
  world.scene.add(ambient);

  // Court spotlights
  const colors = [theme.accent, theme.highlight, theme.accent];
  const positions = [
    [0, 8, -4],
    [0, 10, 0],
    [0, 8, 4],
  ];
  accentLights = [];
  positions.forEach((p, i) => {
    const light = new PointLight(new Color(colors[i]), 2.5, 30);
    light.position.set(p[0], p[1], p[2]);
    world.scene.add(light);
    accentLights.push(light);
  });

  // Directional light
  const dir = new DirectionalLight(new Color('#ffffff'), 0.3);
  dir.position.set(5, 10, -5);
  world.scene.add(dir);

  // Ceiling grid
  const ceilGeo = new PlaneGeometry(40, 40);
  const ceilMat = new MeshStandardMaterial({
    color: new Color(theme.gridColor),
    transparent: true,
    opacity: 0.08,
    roughness: 1,
  });
  const ceiling = new Mesh(ceilGeo, ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 12;
  world.scene.add(ceiling);

  // Ceiling grid lines
  const ceilLineMat = new LineBasicMaterial({ color: new Color(theme.gridColor), transparent: true, opacity: 0.12 });
  for (let i = -20; i <= 20; i += 2) {
    const g1 = new BufferGeometry();
    g1.setAttribute('position', new Float32BufferAttribute([i, 12, -20, i, 12, 20], 3));
    world.scene.add(new LineSegments(g1, ceilLineMat));
    const g2 = new BufferGeometry();
    g2.setAttribute('position', new Float32BufferAttribute([-20, 12, i, 20, 12, i], 3));
    world.scene.add(new LineSegments(g2, ceilLineMat));
  }

  // Floating wireframe decorations
  decorations = new Group();
  const shapes = [
    () => new TorusGeometry(0.4, 0.1, 8, 16),
    () => new BoxGeometry(0.6, 0.6, 0.6),
    () => new SphereGeometry(0.35, 8, 8),
    () => new ConeGeometry(0.3, 0.6, 8),
  ];
  const decoColors = [theme.accent, theme.highlight, theme.netColor, '#ffffff'];

  for (let i = 0; i < 14; i++) {
    const shapeIdx = i % shapes.length;
    const geo = shapes[shapeIdx]();
    const edgeGeo = new EdgesGeometry(geo);
    const mat = new LineBasicMaterial({
      color: new Color(decoColors[i % decoColors.length]),
      transparent: true,
      opacity: 0.25,
    });
    const mesh = new LineSegments(edgeGeo, mat);
    const angle = (i / 14) * Math.PI * 2;
    const r = 12 + Math.random() * 8;
    mesh.position.set(
      Math.cos(angle) * r,
      3 + Math.random() * 7,
      Math.sin(angle) * r
    );
    mesh.userData = { rotSpeed: 0.2 + Math.random() * 0.5, bobSpeed: 0.3 + Math.random() * 0.4, bobBase: mesh.position.y };
    decorations.add(mesh);
  }
  world.scene.add(decorations);

  // Ambient particles
  ambientParticles = [];
  const partGeo = new SphereGeometry(0.03, 4, 4);
  for (let i = 0; i < 40; i++) {
    const mat = new MeshBasicMaterial({
      color: new Color(decoColors[i % decoColors.length]),
      transparent: true,
      opacity: 0.3 + Math.random() * 0.3,
      blending: AdditiveBlending,
    });
    const p = new Mesh(partGeo, mat);
    p.position.set(
      (Math.random() - 0.5) * 30,
      1 + Math.random() * 10,
      (Math.random() - 0.5) * 30
    );
    p.userData = { driftX: (Math.random() - 0.5) * 0.3, driftY: 0.05 + Math.random() * 0.1, pulseSpeed: 1 + Math.random() * 2, base: p.position.clone() };
    ambientParticles.push(p);
    world.scene.add(p);
  }
}

function updateEnvironmentAnimations(dt: number) {
  const t = performance.now() / 1000;
  decorations?.children.forEach((d: any) => {
    d.rotation.y += d.userData.rotSpeed * dt;
    d.rotation.x += d.userData.rotSpeed * 0.3 * dt;
    d.position.y = d.userData.bobBase + Math.sin(t * d.userData.bobSpeed) * 0.3;
  });
  ambientParticles?.forEach((p: any) => {
    p.position.x = p.userData.base.x + Math.sin(t * p.userData.driftX) * 0.5;
    p.position.y = p.userData.base.y + Math.sin(t * p.userData.driftY) * 0.3;
    const mat = p.material as MeshBasicMaterial;
    mat.opacity = 0.3 + Math.sin(t * p.userData.pulseSpeed) * 0.2;
  });
}

// ============================================================
// PARTICLES
// ============================================================
function initParticlePool() {
  const geo = new SphereGeometry(0.03, 4, 4);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: AdditiveBlending });
    const mesh = new Mesh(geo, mat);
    mesh.visible = false;
    world.scene.add(mesh);
    particlePool.push(mesh);
  }
}

function spawnParticles(pos: Vector3, color: string, count: number, speed = 3) {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const mesh = particlePool.find(p => !p.visible);
    if (!mesh) break;
    mesh.visible = true;
    mesh.position.copy(pos);
    (mesh.material as MeshBasicMaterial).color.set(color);
    (mesh.material as MeshBasicMaterial).opacity = 1;
    const vel = new Vector3(
      (Math.random() - 0.5) * speed,
      Math.random() * speed * 0.8 + 1,
      (Math.random() - 0.5) * speed
    );
    particles.push({ mesh, vel, life: 0, maxLife: 0.5 + Math.random() * 0.5 });
  }
}

function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    p.vel.y -= 9.81 * dt;
    p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
    const t = 1 - p.life / p.maxLife;
    (p.mesh.material as MeshBasicMaterial).opacity = t;
    p.mesh.scale.setScalar(t * 0.8 + 0.2);
    if (p.life >= p.maxLife) {
      p.mesh.visible = false;
      particles.splice(i, 1);
    }
  }
}

// ============================================================
// INPUT
// ============================================================
function updateInput(dt: number) {
  gsm.swingCooldown = Math.max(0, gsm.swingCooldown - dt);

  // Keyboard movement
  const moveSpeed = 4;
  if (world.input.keyboard.getKeyPressed('KeyA') || world.input.keyboard.getKeyPressed('ArrowLeft')) {
    gsm.playerX = Math.max(-COURT_WIDTH / 2 + 0.3, gsm.playerX - moveSpeed * dt);
  }
  if (world.input.keyboard.getKeyPressed('KeyD') || world.input.keyboard.getKeyPressed('ArrowRight')) {
    gsm.playerX = Math.min(COURT_WIDTH / 2 - 0.3, gsm.playerX + moveSpeed * dt);
  }
  if (world.input.keyboard.getKeyPressed('KeyW') || world.input.keyboard.getKeyPressed('ArrowUp')) {
    gsm.playerZ = Math.max(-COURT_LENGTH / 2, gsm.playerZ + moveSpeed * dt);
  }
  if (world.input.keyboard.getKeyPressed('KeyS') || world.input.keyboard.getKeyPressed('ArrowDown')) {
    gsm.playerZ = Math.min(-1, gsm.playerZ - moveSpeed * dt);
  }

  // XR controller input
  const rightGP = world.input.xr?.gamepads?.right;
  const leftGP = world.input.xr?.gamepads?.left;

  // Left thumbstick for movement
  if (leftGP) {
    const axes = leftGP.getAxesValues?.(InputComponent.Thumbstick);
    if (axes) {
      gsm.playerX = Math.max(-COURT_WIDTH / 2 + 0.3, Math.min(COURT_WIDTH / 2 - 0.3, gsm.playerX + axes.x * moveSpeed * dt));
      gsm.playerZ = Math.max(-COURT_LENGTH / 2, Math.min(-1, gsm.playerZ - axes.y * moveSpeed * dt));
    }
  }

  // Serve charge (Space or trigger)
  if (!gsm.ballActive && gsm.servingPlayer) {
    if (world.input.keyboard.getKeyDown('Space') || rightGP?.getButtonDown?.(InputComponent.Trigger)) {
      gsm.isCharging = true;
      gsm.serveCharge = 0;
    }
    if (gsm.isCharging) {
      gsm.serveCharge = Math.min(1, gsm.serveCharge + dt * 1.2);
      // Ball toss animation while charging
      const tossHeight = 1.2 + gsm.serveCharge * 1.5;
      ballMesh.position.set(gsm.playerX, tossHeight, gsm.playerZ);
      ballMesh.visible = true;
      if (world.input.keyboard.getKeyUp('Space') || rightGP?.getButtonUp?.(InputComponent.Trigger)) {
        performServe();
      }
    }
  }

  // Hit ball (click or trigger while ball is active)
  if (gsm.ballActive && gsm.swingCooldown <= 0) {
    const shouldHit = world.input.keyboard.getKeyDown('Space') ||
      rightGP?.getButtonDown?.(InputComponent.Trigger);
    if (shouldHit) {
      attemptHit();
    }
  }

  // Pause (Escape or B)
  if (world.input.keyboard.getKeyDown('Escape') || rightGP?.getButtonDown?.(InputComponent.B_Button)) {
    togglePause();
  }
}

function performServe() {
  gsm.isCharging = false;
  const power = SERVE_POWER_MIN + gsm.serveCharge * (SERVE_POWER_MAX - SERVE_POWER_MIN);
  const scatter = (1 - gsm.serveCharge * 0.7) * 1.5;

  gsm.ballPos.set(gsm.playerX, 2.5, gsm.playerZ);
  gsm.ballVel.set(
    (Math.random() - 0.5) * scatter,
    power * 0.35,
    power * 0.85
  );
  gsm.ballActive = true;
  gsm.lastTouchPlayer = true;
  gsm.playerTouches = 1;
  gsm.opponentTouches = 0;
  gsm.rallyLength = 0;
  gsm.serveTossed = false;

  audio.playServe();
  spawnParticles(gsm.ballPos.clone(), '#00ffff', 8, 2);
  hideUI('servebar');
}

function attemptHit() {
  const distToBall = new Vector3(gsm.playerX, 1.3, gsm.playerZ).distanceTo(gsm.ballPos);
  if (distToBall > 2.0) return; // Too far

  gsm.swingCooldown = 0.4;

  const ballHeight = gsm.ballPos.y;
  const isAboveNet = ballHeight > NET_HEIGHT - 0.3;
  const isNearNet = gsm.playerZ > -3;
  const ballComingFromOpponent = gsm.ballVel.z < -1 && !gsm.lastTouchPlayer;

  let hitPower: number;
  let hitAngleY: number;
  let hitType: string;

  if (isAboveNet && isNearNet && ballComingFromOpponent && ballHeight > 1.8) {
    // BLOCK — ball coming from opponent at net height
    hitPower = gsm.ballVel.length() * 0.8; // Reflect with reduced speed
    hitAngleY = 0.2;
    hitType = 'block';
    gsm.blocks++;
    gsm.totalBlocks++;
    audio.playSpike(); // Reuse spike sound with lower volume
    spawnParticles(gsm.ballPos.clone(), '#ffffff', 12, 3);
    showToast('BLOCK!', '#ffffff');
  } else if (isAboveNet && isNearNet && ballHeight > 2.0) {
    // SPIKE
    hitPower = SPIKE_POWER;
    hitAngleY = 0.15; // Downward
    hitType = 'spike';
    gsm.spikes++;
    gsm.totalSpikes++;
    audio.playSpike();
    spawnParticles(gsm.ballPos.clone(), '#ff4400', 15, 4);
    showToast('SPIKE!', '#ff4400');
  } else if (ballHeight < 1.2) {
    // BUMP (underhand, low ball)
    hitPower = BUMP_POWER;
    hitAngleY = 0.6; // High arc
    hitType = 'bump';
    gsm.digs++;
    audio.playBump();
    spawnParticles(gsm.ballPos.clone(), '#44ff44', 6, 1.5);
  } else {
    // SET (overhead, medium height)
    hitPower = SET_POWER;
    hitAngleY = 0.45;
    hitType = 'set';
    audio.playSet();
    spawnParticles(gsm.ballPos.clone(), '#ffff00', 8, 2);
  }

  // Apply hit
  const aimX = (Math.random() - 0.5) * 2;
  if (hitType === 'block') {
    // Block reflects ball back with reduced speed
    gsm.ballVel.set(
      aimX * hitPower * 0.2,
      hitPower * hitAngleY,
      hitPower * 0.7 // Send back to opponent side
    );
  } else {
    gsm.ballVel.set(
      aimX * hitPower * 0.3,
      hitPower * hitAngleY,
      hitPower * (1 - hitAngleY * 0.5)
    );
  }
  gsm.lastTouchPlayer = true;
  gsm.playerTouches++;
  gsm.rallyLength++;

  checkAchievements();
}

// ============================================================
// BALL PHYSICS
// ============================================================
function updateBallPhysics(dt: number) {
  if (!gsm.ballActive) return;

  const substeps = 4;
  const subDt = dt / substeps;

  for (let s = 0; s < substeps; s++) {
    // Gravity
    gsm.ballVel.y += GRAVITY * subDt;

    // Air resistance
    gsm.ballVel.multiplyScalar(1 - 0.01 * subDt);

    // Move
    gsm.ballPos.add(gsm.ballVel.clone().multiplyScalar(subDt));

    // Spin effect on trajectory
    if (gsm.ballSpin.length() > 0.1) {
      gsm.ballPos.x += gsm.ballSpin.x * subDt * 0.1;
      gsm.ballPos.z += gsm.ballSpin.z * subDt * 0.1;
      gsm.ballSpin.multiplyScalar(0.98);
    }

    // Track which side
    gsm.ballOnPlayerSide = gsm.ballPos.z < 0;

    // Floor bounce
    if (gsm.ballPos.y <= BALL_RADIUS) {
      gsm.ballPos.y = BALL_RADIUS;
      // Ball hit the floor — point scored
      scorePoint();
      return;
    }

    // Ceiling
    if (gsm.ballPos.y > 11) {
      gsm.ballVel.y = -Math.abs(gsm.ballVel.y) * 0.5;
      gsm.ballPos.y = 11;
    }

    // Side walls (out of bounds)
    if (Math.abs(gsm.ballPos.x) > COURT_WIDTH / 2 + 2) {
      gsm.ballVel.x *= -0.3;
      gsm.ballPos.x = Math.sign(gsm.ballPos.x) * (COURT_WIDTH / 2 + 2);
    }

    // Back walls (out)
    if (gsm.ballPos.z < -COURT_LENGTH / 2 - 2 || gsm.ballPos.z > COURT_LENGTH / 2 + 2) {
      scorePoint();
      return;
    }

    // Net collision
    if (Math.abs(gsm.ballPos.z) < 0.15 &&
        gsm.ballPos.y < NET_HEIGHT &&
        gsm.ballPos.y > NET_HEIGHT - 1.0 &&
        Math.abs(gsm.ballPos.x) < NET_WIDTH / 2) {
      // Ball hit the net
      if (gsm.ballVel.z > 0 && gsm.ballPos.z < 0) {
        // Player side hitting net going forward
        gsm.ballVel.z *= -0.3;
        gsm.ballVel.y *= 0.5;
        gsm.ballPos.z = -0.15;
        audio.playNetHit();
      } else if (gsm.ballVel.z < 0 && gsm.ballPos.z > 0) {
        // Opponent side hitting net going backward
        gsm.ballVel.z *= -0.3;
        gsm.ballVel.y *= 0.5;
        gsm.ballPos.z = 0.15;
        audio.playNetHit();
      }
      // Ball might dribble over the net
      if (gsm.ballPos.y >= NET_HEIGHT - 0.1) {
        // Close enough to top — let it pass sometimes
        gsm.ballVel.y += 1;
      }
    }
  }
}

function scorePoint() {
  gsm.ballActive = false;

  // Spawn landing marker
  const theme = THEMES[gsm.theme];
  spawnLandingMarker(gsm.ballPos.clone(), gsm.lastTouchPlayer ? theme.accent : '#ff4444');

  const ballInBounds = Math.abs(gsm.ballPos.x) <= COURT_WIDTH / 2 + 0.1 &&
    Math.abs(gsm.ballPos.z) <= COURT_LENGTH / 2 + 0.1;

  let playerWinsPoint: boolean;

  if (gsm.ballPos.z < 0) {
    // Ball landed on player side
    if (ballInBounds) {
      playerWinsPoint = false; // Opponent scores
    } else {
      // Out on player side, but maybe opponent hit it out?
      playerWinsPoint = !gsm.lastTouchPlayer;
    }
  } else {
    // Ball landed on opponent side
    if (ballInBounds) {
      playerWinsPoint = true; // Player scores
    } else {
      playerWinsPoint = gsm.lastTouchPlayer ? false : true;
    }
  }

  // Out of bounds beyond court
  if (gsm.ballPos.z < -COURT_LENGTH / 2 - 1 || gsm.ballPos.z > COURT_LENGTH / 2 + 1) {
    playerWinsPoint = !gsm.lastTouchPlayer; // Last touch hit it out
  }

  // Practice modes — track stats and reset immediately
  if (gsm.mode === 'serve') {
    gsm.serveAttempts++;
    if (playerWinsPoint) {
      gsm.serveHits++;
      if (gsm.rallyLength === 0 && gsm.servingPlayer) {
        gsm.aces++;
        gsm.totalAces++;
        showToast('ACE!', '#ffd700');
        audio.playAce();
      } else {
        showToast('Good serve!', '#00ff88');
        audio.playPointWon();
      }
    } else {
      showToast('Out / Fault', '#ff4444');
      audio.playPointLost();
    }
    gsm.playerScore = gsm.serveHits;
    updateHUD();
    checkAchievements();
    gsm.resetRound();
    showUI('servebar');
    return;
  }

  if (gsm.mode === 'spike') {
    if (gsm.lastTouchPlayer && gsm.spikes > 0) {
      gsm.spikeHits++;
      showToast('SPIKE HIT!', '#ff4400');
      audio.playPointWon();
    } else {
      showToast('Missed', '#ff4444');
      audio.playPointLost();
    }
    gsm.playerScore = gsm.spikeHits;
    updateHUD();
    checkAchievements();
    setTimeout(() => {
      if (gsm.state === 'playing') startSpikeDrill();
    }, 1000);
    return;
  }

  if (gsm.mode === 'rally') {
    // Rally mode — any point ends, just track length
    if (gsm.rallyLength > gsm.longestRally) {
      gsm.longestRally = gsm.rallyLength;
      if (gsm.rallyLength > gsm.bestRally) {
        gsm.bestRally = gsm.rallyLength;
        showToast('NEW BEST RALLY!', '#ffd700');
      }
    }
    gsm.totalRallies++;
    gsm.playerScore = gsm.longestRally;
    updateHUD();
    gsm.resetRound();
    return;
  }

  // Track rally
  gsm.totalRallies++;
  if (gsm.rallyLength > gsm.longestRally) gsm.longestRally = gsm.rallyLength;
  if (gsm.rallyLength > gsm.bestRally) gsm.bestRally = gsm.rallyLength;

  // Score
  if (playerWinsPoint) {
    gsm.playerScore++;
    gsm.consecutivePoints++;
    gsm.combo++;
    if (gsm.combo > gsm.maxCombo) gsm.maxCombo = gsm.combo;

    // Check for ace (serve that scores directly)
    if (gsm.rallyLength === 0 && gsm.servingPlayer) {
      gsm.aces++;
      gsm.totalAces++;
      showToast('ACE!', '#ffd700');
      audio.playAce();
    } else {
      showToast('POINT!', '#00ff88');
      audio.playPointWon();
    }
    spawnParticles(gsm.ballPos.clone(), '#00ff88', 12, 3);
  } else {
    gsm.opponentScore++;
    gsm.consecutivePoints = 0;
    gsm.combo = 0;
    showToast('Point - Opponent', '#ff4444');
    audio.playPointLost();
    spawnParticles(gsm.ballPos.clone(), '#ff4444', 8, 2);
  }

  // Switch serve every point in rally scoring
  gsm.servingPlayer = playerWinsPoint;

  updateHUD();
  checkSetEnd();
  checkAchievements();

  // Reset for next point
  setTimeout(() => {
    if (gsm.state !== 'gameover') {
      gsm.resetRound();
      if (!gsm.servingPlayer) {
        // AI serves
        gsm.state = 'serving_ai';
        gsm.aiReactionTimer = 1.5;
      } else {
        showUI('servebar');
      }
    }
  }, 1500);
}

function checkSetEnd() {
  const target = gsm.getTargetScore();
  const diff = Math.abs(gsm.playerScore - gsm.opponentScore);
  const maxScore = Math.max(gsm.playerScore, gsm.opponentScore);

  if (maxScore >= target && diff >= 2) {
    // Set won
    if (gsm.playerScore > gsm.opponentScore) {
      gsm.playerSets++;
      showToast('SET WON!', '#00ffff');
    } else {
      gsm.opponentSets++;
      showToast('Set Lost', '#ff6666');
    }

    // Check match end
    if (gsm.playerSets >= gsm.setsToWin || gsm.opponentSets >= gsm.setsToWin) {
      endMatch();
    } else {
      // New set
      gsm.currentSet++;
      gsm.playerScore = 0;
      gsm.opponentScore = 0;
      gsm.servingPlayer = !gsm.servingPlayer;
      updateHUD();
    }
  }
}

function endMatch() {
  gsm.state = 'gameover';
  gsm.gamesPlayed++;
  const won = gsm.playerSets > gsm.opponentSets;
  if (won) {
    gsm.gamesWon++;
    audio.playWin();
    showToast('VICTORY!', '#ffd700');
    spawnParticles(new Vector3(0, 3, -3), '#ffd700', 25, 5);
  } else {
    audio.playLose();
  }
  gsm.savePersistence();
  saveLeaderboard();
  updateGameOverPanel(won);
  hideUI('hud');
  hideUI('servebar');
  showUI('gameover');
}

// ============================================================
// AI
// ============================================================
function updateAI(dt: number) {
  if (!gsm.ballActive) return;

  const diffSettings = {
    easy: { speed: 2.5, reactionTime: 0.6, accuracy: 0.5, hitRange: 2.5 },
    medium: { speed: 3.5, reactionTime: 0.35, accuracy: 0.7, hitRange: 2.0 },
    hard: { speed: 5.0, reactionTime: 0.15, accuracy: 0.9, hitRange: 1.5 },
  };
  const diff = diffSettings[gsm.difficulty];

  gsm.aiHitCooldown = Math.max(0, gsm.aiHitCooldown - dt);

  // Predict ball landing
  let predX = gsm.ballPos.x;
  let predZ = gsm.ballPos.z;
  if (gsm.ballVel.z > 0) {
    // Ball coming toward AI
    const timeToArrive = Math.max(0.1, (gsm.aiZ - gsm.ballPos.z) / Math.max(0.1, gsm.ballVel.z));
    predX = gsm.ballPos.x + gsm.ballVel.x * timeToArrive;
    predZ = gsm.ballPos.z + gsm.ballVel.z * timeToArrive;
  }

  // Add reaction delay
  gsm.aiReactionTimer -= dt;
  if (gsm.aiReactionTimer <= 0) {
    gsm.aiTargetX = predX + (Math.random() - 0.5) * (1 - diff.accuracy) * 3;
    gsm.aiTargetZ = Math.max(1, Math.min(COURT_LENGTH / 2 - 0.5, predZ));
    gsm.aiReactionTimer = diff.reactionTime;
  }

  // Move toward target
  const dx = gsm.aiTargetX - gsm.aiX;
  const dz = gsm.aiTargetZ - gsm.aiZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 0.1) {
    const moveX = (dx / dist) * diff.speed * dt;
    const moveZ = (dz / dist) * diff.speed * dt;
    gsm.aiX = Math.max(-COURT_WIDTH / 2 + 0.3, Math.min(COURT_WIDTH / 2 - 0.3, gsm.aiX + moveX));
    gsm.aiZ = Math.max(1, Math.min(COURT_LENGTH / 2 - 0.5, gsm.aiZ + moveZ));
  }

  // Update opponent visual
  opponentMesh.position.set(gsm.aiX, 0, gsm.aiZ);

  // Try to hit ball
  if (gsm.aiHitCooldown <= 0 && gsm.ballPos.z > 0) {
    const distToBall = new Vector3(gsm.aiX, 1.3, gsm.aiZ).distanceTo(gsm.ballPos);
    if (distToBall < diff.hitRange && gsm.ballPos.y > 0.5 && gsm.ballPos.y < 3.5) {
      performAIHit(diff);
    }
  }
}

function performAIHit(diff: { accuracy: number }) {
  gsm.aiHitCooldown = 0.5;
  gsm.lastTouchPlayer = false;
  gsm.opponentTouches++;
  gsm.rallyLength++;
  triggerOpponentHitAnimation();

  const ballHeight = gsm.ballPos.y;
  const isNearNet = gsm.aiZ < 3;

  let power: number;
  let angleY: number;

  if (ballHeight > NET_HEIGHT && isNearNet) {
    // AI spike
    power = SPIKE_POWER * (0.7 + diff.accuracy * 0.3);
    angleY = 0.15;
    audio.playSpike();
    spawnParticles(gsm.ballPos.clone(), '#ff6600', 10, 3);
  } else if (ballHeight < 1.5) {
    // AI bump
    power = BUMP_POWER * (0.8 + diff.accuracy * 0.2);
    angleY = 0.55;
    audio.playBump();
  } else {
    // AI set/return
    power = SET_POWER * (0.8 + diff.accuracy * 0.4);
    angleY = 0.4;
    audio.playSet();
  }

  // Aim toward player's side with some randomness
  const aimX = (Math.random() - 0.5) * (2 - diff.accuracy) * COURT_WIDTH * 0.3;
  gsm.ballVel.set(
    aimX,
    power * angleY,
    -power * (1 - angleY * 0.4) // Toward player side
  );
}

function performAIServe() {
  const diff = {
    easy: { power: 0.6, accuracy: 0.4 },
    medium: { power: 0.8, accuracy: 0.7 },
    hard: { power: 1.0, accuracy: 0.9 },
  }[gsm.difficulty];

  const power = SERVE_POWER_MIN + diff.power * (SERVE_POWER_MAX - SERVE_POWER_MIN);
  const scatter = (1 - diff.accuracy) * 2;

  gsm.ballPos.set(gsm.aiX, 2.5, gsm.aiZ);
  gsm.ballVel.set(
    (Math.random() - 0.5) * scatter,
    power * 0.3,
    -power * 0.85
  );
  gsm.ballActive = true;
  gsm.lastTouchPlayer = false;
  gsm.opponentTouches = 1;
  gsm.playerTouches = 0;
  gsm.rallyLength = 0;

  audio.playServe();
  spawnParticles(gsm.ballPos.clone(), '#ff6600', 6, 2);
  triggerOpponentHitAnimation();
}

// ============================================================
// SPIKE DRILL
// ============================================================
function startSpikeDrill() {
  gsm.spikeAttempts++;
  // Toss ball up for player to spike
  gsm.ballPos.set(gsm.playerX + (Math.random() - 0.5), 3.5, gsm.playerZ + 2);
  gsm.ballVel.set((Math.random() - 0.5) * 0.5, 2, 0.5);
  gsm.ballActive = true;
  gsm.lastTouchPlayer = false;
  gsm.playerTouches = 0;
}

function endPracticeMode() {
  gsm.state = 'gameover';
  gsm.gamesPlayed++;
  const won = true; // Practice is always "completed"
  gsm.savePersistence();
  updatePracticeOverPanel();
  hideUI('hud');
  hideUI('servebar');
  showUI('gameover');
  audio.playWin();
  spawnParticles(new Vector3(0, 3, -3), '#ffd700', 15, 4);
}

function updatePracticeOverPanel() {
  const doc = getDoc('gameover');
  if (!doc) return;
  if (gsm.mode === 'serve') {
    setText(doc, 'result-text', 'SERVE PRACTICE');
    setText(doc, 'final-score', `Serves: ${gsm.serveAttempts}`);
    setText(doc, 'sets-score', `Aces: ${gsm.aces}`);
    setText(doc, 'stats-text',
      `Hit Rate: ${gsm.serveAttempts > 0 ? Math.round((gsm.serveHits / gsm.serveAttempts) * 100) : 0}%\n` +
      `Total Aces: ${gsm.totalAces}\n` +
      `Time: ${Math.floor(gsm.practiceTimer / 60)}:${String(Math.floor(gsm.practiceTimer % 60)).padStart(2, '0')}`
    );
  } else if (gsm.mode === 'spike') {
    setText(doc, 'result-text', 'SPIKE DRILL');
    setText(doc, 'final-score', `Spikes: ${gsm.spikeHits}/${gsm.spikeAttempts}`);
    setText(doc, 'sets-score', `Accuracy: ${gsm.spikeAttempts > 0 ? Math.round((gsm.spikeHits / gsm.spikeAttempts) * 100) : 0}%`);
    setText(doc, 'stats-text',
      `Total Spikes: ${gsm.totalSpikes}\n` +
      `Time: ${Math.floor(gsm.practiceTimer / 60)}:${String(Math.floor(gsm.practiceTimer % 60)).padStart(2, '0')}`
    );
  }
}

// ============================================================
// VISUAL UPDATES
// ============================================================
function updateBallVisuals() {
  ballMesh.position.copy(gsm.ballPos);

  // Spin rotation
  const speed = gsm.ballVel.length();
  ballMesh.rotation.x += speed * 0.1;
  ballMesh.rotation.z += gsm.ballVel.x * 0.05;

  // Glow intensity based on speed
  const glowIntensity = Math.min(0.4, speed * 0.02);
  (ballGlow.material as MeshBasicMaterial).opacity = 0.1 + glowIntensity;

  // Net proximity pulse — top band glows when ball is close
  if (netMesh && gsm.ballActive) {
    const distToNet = Math.abs(gsm.ballPos.z);
    const nearNet = distToNet < 1.5 && gsm.ballPos.y > NET_HEIGHT - 1.5 && gsm.ballPos.y < NET_HEIGHT + 0.5;
    const topBand = netMesh.children[2]; // top band is 3rd child
    if (topBand && (topBand as Mesh).material) {
      const mat = (topBand as Mesh).material as MeshStandardMaterial;
      if (nearNet) {
        const pulse = 0.8 + Math.sin(performance.now() / 100) * 0.5;
        mat.emissiveIntensity = pulse;
      } else {
        mat.emissiveIntensity = 0.8; // Default
      }
    }
  }
}

function updateBallTrail() {
  if (!gsm.ballActive) {
    // Clear trail when ball stops
    if (ballTrailMesh) {
      world.scene.remove(ballTrailMesh);
      ballTrailMesh.geometry.dispose();
      ballTrailMesh = null;
    }
    ballTrailPoints = [];
    return;
  }

  ballTrailPoints.push(gsm.ballPos.clone());
  if (ballTrailPoints.length > 30) ballTrailPoints.shift();

  if (ballTrailPoints.length < 2) return;

  // Remove old trail mesh
  if (ballTrailMesh) {
    world.scene.remove(ballTrailMesh);
    ballTrailMesh.geometry.dispose();
  }

  const pts: number[] = [];
  for (let i = 0; i < ballTrailPoints.length - 1; i++) {
    const p1 = ballTrailPoints[i];
    const p2 = ballTrailPoints[i + 1];
    pts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));

  // Speed-reactive trail color
  const speed = gsm.ballVel.length();
  const theme = THEMES[gsm.theme];
  let trailColor = theme.ballTrail;
  let trailOpacity = 0.3;
  if (speed > 10) {
    trailColor = '#ff4400'; // Fast = hot
    trailOpacity = 0.5;
  } else if (speed > 6) {
    trailColor = theme.highlight;
    trailOpacity = 0.4;
  }

  const mat = new LineBasicMaterial({
    color: new Color(trailColor),
    transparent: true,
    opacity: trailOpacity,
    blending: AdditiveBlending,
  });
  ballTrailMesh = new LineSegments(geo, mat);
  world.scene.add(ballTrailMesh);
}

function updateBallShadow() {
  if (ballShadow) {
    ballShadow.position.x = gsm.ballPos.x;
    ballShadow.position.z = gsm.ballPos.z;
    const heightScale = Math.max(0.1, 1 - gsm.ballPos.y / 10);
    ballShadow.scale.setScalar(0.3 + (1 - heightScale) * 0.5);
    (ballShadow.material as MeshBasicMaterial).opacity = heightScale * 0.3;
    ballShadow.visible = gsm.ballActive;
  }
}

// ============================================================
// LANDING MARKERS
// ============================================================
function spawnLandingMarker(pos: Vector3, color: string) {
  const geo = new RingGeometry(0.05, 0.25, 16);
  const mat = new MeshBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity: 0.8,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos.x, 0.03, pos.z);
  world.scene.add(mesh);
  landingMarkers.push({ mesh, life: 0 });
  // Cap markers
  while (landingMarkers.length > 10) {
    const old = landingMarkers.shift()!;
    world.scene.remove(old.mesh);
    old.mesh.geometry.dispose();
  }
}

function updateLandingMarkers(dt: number) {
  for (let i = landingMarkers.length - 1; i >= 0; i--) {
    const m = landingMarkers[i];
    m.life += dt;
    const fade = Math.max(0, 1 - m.life / 3); // 3 second fade
    (m.mesh.material as MeshBasicMaterial).opacity = fade * 0.8;
    m.mesh.scale.setScalar(1 + m.life * 0.3); // Grow slightly
    if (m.life >= 3) {
      world.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      landingMarkers.splice(i, 1);
    }
  }
}

// ============================================================
// OPPONENT ANIMATION
// ============================================================
function updateOpponentAnimation(dt: number) {
  if (!opponentMesh) return;

  // Bob up and down slightly when moving
  const isMoving = Math.abs(gsm.aiTargetX - gsm.aiX) > 0.2 || Math.abs(gsm.aiTargetZ - gsm.aiZ) > 0.2;
  if (isMoving) {
    opponentBobPhase += dt * 8;
    opponentMesh.position.y = Math.abs(Math.sin(opponentBobPhase)) * 0.05;
  } else {
    // Subtle idle breathing
    opponentBobPhase += dt * 2;
    opponentMesh.position.y = Math.sin(opponentBobPhase) * 0.015;
  }

  // Arm animation — smooth toward target
  opponentArmAngle += (opponentArmTarget - opponentArmAngle) * dt * 10;
  opponentArmTarget = Math.max(0, opponentArmTarget - dt * 3); // Return to rest

  // Apply arm rotation to children (arms are indices 3 and 4)
  const arms = opponentMesh.children.filter((_, i) => i === 3 || i === 4);
  arms.forEach((arm, idx) => {
    const sign = idx === 0 ? -1 : 1;
    arm.rotation.x = -opponentArmAngle * 1.2;
    arm.rotation.z = sign * (-0.3 + opponentArmAngle * 0.2);
  });

  // Face the ball when active
  if (gsm.ballActive && gsm.ballPos.z > 0) {
    const lookAngle = Math.atan2(gsm.ballPos.x - gsm.aiX, gsm.ballPos.z - gsm.aiZ);
    opponentMesh.rotation.y = lookAngle * 0.3; // Subtle body turn
  } else {
    opponentMesh.rotation.y *= 0.95; // Return to center
  }
}

function triggerOpponentHitAnimation() {
  opponentArmTarget = Math.PI * 0.6; // Raise arms for hit
}

function updatePlayerHands(dt: number) {
  // Position hands near player
  const handBaseY = 1.0;
  playerHandMeshL.position.set(gsm.playerX - 0.25, handBaseY, gsm.playerZ + 0.2);
  playerHandMeshR.position.set(gsm.playerX + 0.25, handBaseY, gsm.playerZ + 0.2);

  // Pulse when ball is near
  if (gsm.ballActive) {
    const dist = new Vector3(gsm.playerX, 1.3, gsm.playerZ).distanceTo(gsm.ballPos);
    if (dist < 2.5) {
      const pulse = 1 + Math.sin(performance.now() / 100) * 0.1;
      playerHandMeshL.scale.setScalar(pulse);
      playerHandMeshR.scale.setScalar(pulse);
      (playerHandMeshR.material as MeshStandardMaterial).emissiveIntensity = 0.5 + (2.5 - dist) * 0.3;
      (playerHandMeshL.material as MeshStandardMaterial).emissiveIntensity = 0.5 + (2.5 - dist) * 0.3;
    } else {
      playerHandMeshL.scale.setScalar(1);
      playerHandMeshR.scale.setScalar(1);
    }
  }
}

// ============================================================
// UI SETUP
// ============================================================
async function setupUI() {
  const configs: { name: string; config: string; maxW: number; maxH: number; pos: [number, number, number]; type: 'world' | 'follower' | 'screen' }[] = [
    { name: 'title', config: '/ui/title.json', maxW: 1.0, maxH: 1.2, pos: [0, 1.8, -3], type: 'world' },
    { name: 'modeselect', config: '/ui/modeselect.json', maxW: 1.0, maxH: 1.2, pos: [0, 1.8, -3], type: 'world' },
    { name: 'difficulty', config: '/ui/difficulty.json', maxW: 0.8, maxH: 0.8, pos: [0, 1.8, -3], type: 'world' },
    { name: 'hud', config: '/ui/hud.json', maxW: 0.35, maxH: 0.12, pos: [0, 0, 0], type: 'follower' },
    { name: 'pause', config: '/ui/pause.json', maxW: 0.6, maxH: 0.6, pos: [0, 1.8, -2], type: 'world' },
    { name: 'gameover', config: '/ui/gameover.json', maxW: 0.9, maxH: 1.0, pos: [0, 1.8, -3], type: 'world' },
    { name: 'leaderboard', config: '/ui/leaderboard.json', maxW: 0.8, maxH: 1.0, pos: [0, 1.8, -3], type: 'world' },
    { name: 'achievements', config: '/ui/achievements.json', maxW: 0.9, maxH: 1.2, pos: [0, 1.8, -3], type: 'world' },
    { name: 'settings', config: '/ui/settings.json', maxW: 0.8, maxH: 0.9, pos: [0, 1.8, -3], type: 'world' },
    { name: 'help', config: '/ui/help.json', maxW: 0.9, maxH: 1.1, pos: [0, 1.8, -3], type: 'world' },
    { name: 'toast', config: '/ui/toast.json', maxW: 0.3, maxH: 0.08, pos: [0, 0, 0], type: 'follower' },
    { name: 'countdown', config: '/ui/countdown.json', maxW: 0.3, maxH: 0.15, pos: [0, 0, 0], type: 'follower' },
    { name: 'servebar', config: '/ui/servebar.json', maxW: 0.25, maxH: 0.08, pos: [0, 0, 0], type: 'follower' },
    { name: 'stats', config: '/ui/stats.json', maxW: 0.85, maxH: 1.1, pos: [0, 1.8, -3], type: 'world' },
  ];

  for (const cfg of configs) {
    const entity = world.createTransformEntity(undefined, { persistent: true });
    entity.addComponent(PanelUI, {
      config: cfg.config,
      maxWidth: cfg.maxW,
      maxHeight: cfg.maxH,
    });

    if (cfg.type === 'world') {
      entity.object3D!.position.set(...cfg.pos);
    } else if (cfg.type === 'follower') {
      let offsetPos: [number, number, number] = [0, 0.1, -0.5];
      if (cfg.name === 'hud') offsetPos = [0.2, -0.12, -0.5];
      if (cfg.name === 'toast') offsetPos = [0, 0.15, -0.6];
      if (cfg.name === 'countdown') offsetPos = [0, 0.05, -0.5];
      if (cfg.name === 'servebar') offsetPos = [-0.2, -0.15, -0.5];

      entity.addComponent(Follower, {
        target: world.player.head,
        offsetPosition: offsetPos,
        behavior: FollowBehavior.PivotY,
        speed: 5,
        tolerance: 0.3,
      });
    }

    entity.object3D!.visible = false;
    uiEntities.set(cfg.name, entity);
  }

  // Wait for panels to load, then wire events
  setTimeout(() => wireUIEvents(), 500);
}

function showUI(name: string) {
  const entity = uiEntities.get(name);
  if (entity?.object3D) entity.object3D.visible = true;
}

function hideUI(name: string) {
  const entity = uiEntities.get(name);
  if (entity?.object3D) entity.object3D.visible = false;
}

function hideAllUI() {
  uiEntities.forEach((entity, name) => {
    if (entity.object3D) entity.object3D.visible = false;
  });
}

function getDoc(name: string): UIKitDocument | null {
  const entity = uiEntities.get(name);
  if (!entity) return null;
  return entity.getValue(PanelDocument, 'document') as UIKitDocument | null;
}

function setText(doc: UIKitDocument | null, id: string, text: string) {
  if (!doc) return;
  const el = doc.getElementById(id);
  if (el && (el as any).text) {
    (el as any).text.value = text;
  }
}

function wireUIEvents() {
  // Title
  wireBtn('title', 'btn-play', () => { hideUI('title'); showUI('modeselect'); audio.playClick(); });
  wireBtn('title', 'btn-leaderboard', () => { hideUI('title'); updateLeaderboardPanel(); showUI('leaderboard'); audio.playClick(); });
  wireBtn('title', 'btn-achievements', () => { hideUI('title'); updateAchievementsPanel(); showUI('achievements'); audio.playClick(); });
  wireBtn('title', 'btn-settings', () => { hideUI('title'); showUI('settings'); audio.playClick(); });
  wireBtn('title', 'btn-help', () => { hideUI('title'); showUI('help'); audio.playClick(); });
  wireBtn('title', 'btn-stats', () => { hideUI('title'); updateStatsPanel(); showUI('stats'); audio.playClick(); });

  // Mode select
  const modes: [string, GameMode][] = [
    ['btn-match', 'match'],
    ['btn-quick', 'quick'],
    ['btn-rally', 'rally'],
    ['btn-serve', 'serve'],
    ['btn-spike', 'spike'],
    ['btn-daily', 'daily'],
  ];
  for (const [btnId, mode] of modes) {
    wireBtn('modeselect', btnId, () => {
      gsm.mode = mode;
      if (mode === 'rally' || mode === 'serve' || mode === 'spike') {
        hideUI('modeselect');
        startGame();
      } else {
        hideUI('modeselect');
        showUI('difficulty');
      }
      audio.playClick();
    });
  }
  wireBtn('modeselect', 'btn-back', () => { hideUI('modeselect'); showUI('title'); audio.playClick(); });

  // Difficulty
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    wireBtn('difficulty', `btn-${diff}`, () => {
      gsm.difficulty = diff;
      hideUI('difficulty');
      startGame();
      audio.playClick();
    });
  }
  wireBtn('difficulty', 'btn-back', () => { hideUI('difficulty'); showUI('modeselect'); audio.playClick(); });

  // Pause
  wireBtn('pause', 'btn-resume', () => { togglePause(); audio.playClick(); });
  wireBtn('pause', 'btn-quit', () => { gsm.paused = false; gsm.state = 'title'; hideAllUI(); showUI('title'); audio.playClick(); });

  // Game over
  wireBtn('gameover', 'btn-rematch', () => { hideUI('gameover'); startGame(); audio.playClick(); });
  wireBtn('gameover', 'btn-title', () => { hideUI('gameover'); gsm.state = 'title'; showUI('title'); audio.playClick(); });

  // Leaderboard
  wireBtn('leaderboard', 'btn-back', () => { hideUI('leaderboard'); showUI('title'); audio.playClick(); });

  // Achievements
  wireBtn('achievements', 'btn-back', () => { hideUI('achievements'); showUI('title'); audio.playClick(); });

  // Settings
  wireBtn('settings', 'btn-back', () => { hideUI('settings'); showUI('title'); audio.playClick(); });
  wireBtn('settings', 'btn-sfx-up', () => { audio.sfxVolume = Math.min(1, audio.sfxVolume + 0.1); updateSettingsDisplay(); });
  wireBtn('settings', 'btn-sfx-down', () => { audio.sfxVolume = Math.max(0, audio.sfxVolume - 0.1); updateSettingsDisplay(); });
  wireBtn('settings', 'btn-music-up', () => { audio.musicVolume = Math.min(1, audio.musicVolume + 0.1); updateSettingsDisplay(); });
  wireBtn('settings', 'btn-music-down', () => { audio.musicVolume = Math.max(0, audio.musicVolume - 0.1); updateSettingsDisplay(); });
  wireBtn('settings', 'btn-theme-prev', () => { cycleTheme(-1); });
  wireBtn('settings', 'btn-theme-next', () => { cycleTheme(1); });

  // Help
  wireBtn('help', 'btn-back', () => { hideUI('help'); showUI('title'); audio.playClick(); });

  // Stats
  wireBtn('stats', 'btn-back', () => { hideUI('stats'); showUI('title'); audio.playClick(); });
}

function wireBtn(panel: string, btnId: string, handler: () => void) {
  const doc = getDoc(panel);
  if (!doc) {
    // Retry after delay
    setTimeout(() => {
      const doc2 = getDoc(panel);
      if (doc2) {
        const el = doc2.getElementById(btnId);
        if (el) el.addEventListener('click', handler);
      }
    }, 1000);
    return;
  }
  const el = doc.getElementById(btnId);
  if (el) el.addEventListener('click', handler);
}

// ============================================================
// GAME FLOW
// ============================================================
function startGame() {
  gsm.resetMatch();
  if (gsm.mode === 'quick') {
    gsm.setsToWin = 1;
  } else if (gsm.mode === 'match') {
    gsm.setsToWin = 2;
  } else {
    gsm.setsToWin = 1;
  }

  // Daily challenge seed
  if (gsm.mode === 'daily') {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    gsm.difficulty = (['easy', 'medium', 'hard'] as const)[seed % 3];
  }

  hideAllUI();
  gsm.state = 'countdown';
  gsm.countdown = 3.5;
  showUI('countdown');
  audio.playCountdown();
}

function togglePause() {
  if (gsm.state === 'playing') {
    gsm.paused = true;
    gsm.state = 'paused';
    showUI('pause');
    hideUI('hud');
  } else if (gsm.state === 'paused') {
    gsm.paused = false;
    gsm.state = 'playing';
    hideUI('pause');
    showUI('hud');
  }
}

// ============================================================
// HUD UPDATE
// ============================================================
function updateHUD() {
  const doc = getDoc('hud');
  if (!doc) return;

  if (gsm.mode === 'rally') {
    setText(doc, 'score-display', `Rally: ${gsm.rallyLength} | Best: ${gsm.longestRally}`);
  } else if (gsm.mode === 'serve') {
    const timeLeft = Math.max(0, Math.ceil(gsm.practiceTimeLimit - gsm.practiceTimer));
    setText(doc, 'score-display', `Serves: ${gsm.serveHits} | Aces: ${gsm.aces}`);
    setText(doc, 'set-display', `TIME: ${timeLeft}s`);
  } else if (gsm.mode === 'spike') {
    const timeLeft = Math.max(0, Math.ceil(gsm.practiceTimeLimit - gsm.practiceTimer));
    setText(doc, 'score-display', `Spikes: ${gsm.spikeHits}/${gsm.spikeAttempts}`);
    setText(doc, 'set-display', `TIME: ${timeLeft}s`);
  } else {
    setText(doc, 'score-display', `${gsm.playerScore} - ${gsm.opponentScore}`);
  }
  if (gsm.mode !== 'serve' && gsm.mode !== 'spike') {
    setText(doc, 'set-display', gsm.mode === 'match' ? `Set ${gsm.currentSet} | ${gsm.playerSets}-${gsm.opponentSets}` : gsm.mode.toUpperCase());
  }
  setText(doc, 'combo-display', gsm.combo > 1 ? `x${gsm.combo} COMBO` : '');
  const mins = Math.floor(gsm.matchTime / 60);
  const secs = Math.floor(gsm.matchTime % 60);
  setText(doc, 'time-display', `${mins}:${String(secs).padStart(2, '0')}`);
}

function updateServeBar() {
  if (!gsm.isCharging) return;
  const doc = getDoc('servebar');
  if (!doc) return;
  const pct = Math.round(gsm.serveCharge * 100);
  const filled = Math.round(gsm.serveCharge * 10);
  const bar = '|'.repeat(filled) + '.'.repeat(10 - filled);
  setText(doc, 'power-bar', `[${bar}] ${pct}%`);
}

function updateCountdown() {
  const doc = getDoc('countdown');
  if (!doc) return;
  const num = Math.ceil(gsm.countdown);
  setText(doc, 'countdown-text', num > 0 ? `${num}` : 'SERVE!');
}

// ============================================================
// TOAST
// ============================================================
let toastTimer = 0;
function showToast(msg: string, color: string) {
  const doc = getDoc('toast');
  if (doc) {
    setText(doc, 'toast-text', msg);
    // Color via emissive (limited by uikitml)
  }
  showUI('toast');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hideUI('toast'), 2000) as any;
}

// ============================================================
// GAME OVER PANEL
// ============================================================
function updateGameOverPanel(won: boolean) {
  const doc = getDoc('gameover');
  if (!doc) return;
  setText(doc, 'result-text', won ? 'VICTORY!' : 'DEFEAT');
  setText(doc, 'final-score', `${gsm.playerScore} - ${gsm.opponentScore}`);
  setText(doc, 'sets-score', `Sets: ${gsm.playerSets} - ${gsm.opponentSets}`);
  setText(doc, 'stats-text',
    `Aces: ${gsm.aces} | Spikes: ${gsm.spikes} | Blocks: ${gsm.blocks}\n` +
    `Longest Rally: ${gsm.longestRally} | Max Combo: ${gsm.maxCombo}\n` +
    `Time: ${Math.floor(gsm.matchTime / 60)}:${String(Math.floor(gsm.matchTime % 60)).padStart(2, '0')}`
  );
}

// ============================================================
// LEADERBOARD
// ============================================================
function saveLeaderboard() {
  try {
    const entries = JSON.parse(localStorage.getItem('neon-volley-leaderboard') || '[]');
    entries.push({
      score: gsm.playerScore,
      oppScore: gsm.opponentScore,
      mode: gsm.mode,
      difficulty: gsm.difficulty,
      won: gsm.playerSets > gsm.opponentSets,
      date: new Date().toISOString().split('T')[0],
    });
    entries.sort((a: any, b: any) => b.score - a.score);
    localStorage.setItem('neon-volley-leaderboard', JSON.stringify(entries.slice(0, 20)));
  } catch {}
}

function updateLeaderboardPanel() {
  const doc = getDoc('leaderboard');
  if (!doc) return;
  try {
    const entries = JSON.parse(localStorage.getItem('neon-volley-leaderboard') || '[]');
    for (let i = 0; i < 10; i++) {
      const e = entries[i];
      setText(doc, `lb-${i}`, e
        ? `${i + 1}. ${e.score}-${e.oppScore} ${e.mode} ${e.difficulty} ${e.won ? 'W' : 'L'} ${e.date}`
        : `${i + 1}. ---`
      );
    }
  } catch {}
}

// ============================================================
// ACHIEVEMENTS
// ============================================================
function checkAchievements() {
  const checks: [string, () => boolean][] = [
    ['first-point', () => gsm.playerScore >= 1],
    ['first-win', () => gsm.gamesWon >= 1],
    ['ace', () => gsm.totalAces >= 1],
    ['spike-master', () => gsm.totalSpikes >= 10],
    ['combo-3', () => gsm.combo >= 3],
    ['combo-5', () => gsm.combo >= 5],
    ['combo-10', () => gsm.combo >= 10],
    ['rally-10', () => gsm.longestRally >= 10],
    ['rally-25', () => gsm.longestRally >= 25],
    ['rally-50', () => gsm.longestRally >= 50],
    ['shutout', () => gsm.playerScore >= gsm.getTargetScore() && gsm.opponentScore === 0],
    ['ace-5', () => gsm.totalAces >= 5],
    ['spike-50', () => gsm.totalSpikes >= 50],
    ['veteran', () => gsm.gamesPlayed >= 10],
    ['champion', () => gsm.gamesWon >= 5],
    ['hard-win', () => gsm.difficulty === 'hard' && gsm.gamesWon > 0],
    ['perfect-set', () => gsm.playerScore >= gsm.getTargetScore() && gsm.opponentScore === 0],
    ['comeback', () => gsm.playerScore >= gsm.getTargetScore() && gsm.consecutivePoints >= 5],
    ['marathon', () => gsm.matchTime >= 600],
    ['daily-player', () => gsm.mode === 'daily' && gsm.gamesPlayed >= 1],
    ['block-1', () => gsm.totalBlocks >= 1],
    ['block-10', () => gsm.totalBlocks >= 10],
    ['dig-10', () => gsm.digs >= 10],
    ['serve-ace-3', () => gsm.aces >= 3],
  ];

  for (const [id, check] of checks) {
    if (!gsm.achievements.has(id) && check()) {
      gsm.achievements.add(id);
      showToast(`Achievement: ${ACHIEVEMENTS.find(a => a.id === id)?.name || id}`, '#ffd700');
      audio.playAchievement();
      gsm.savePersistence();
    }
  }
}

function updateAchievementsPanel() {
  const doc = getDoc('achievements');
  if (!doc) return;
  ACHIEVEMENTS.forEach((a, i) => {
    const unlocked = gsm.achievements.has(a.id);
    setText(doc, `ach-${i}`, `${unlocked ? '[x]' : '[ ]'} ${a.name} - ${a.desc}`);
  });
}

function updateStatsPanel() {
  const doc = getDoc('stats');
  if (!doc) return;
  setText(doc, 'stat-games', `${gsm.gamesPlayed}`);
  setText(doc, 'stat-wins', `${gsm.gamesWon}`);
  setText(doc, 'stat-winrate', gsm.gamesPlayed > 0 ? `${Math.round((gsm.gamesWon / gsm.gamesPlayed) * 100)}%` : '0%');
  setText(doc, 'stat-aces', `${gsm.totalAces}`);
  setText(doc, 'stat-spikes', `${gsm.totalSpikes}`);
  setText(doc, 'stat-blocks', `${gsm.totalBlocks}`);
  setText(doc, 'stat-rally', `${gsm.bestRally}`);
  setText(doc, 'stat-achcount', `${gsm.achievements.size}/${ACHIEVEMENTS.length}`);
}

// ============================================================
// SETTINGS
// ============================================================
const themeKeys = Object.keys(THEMES) as CourtTheme[];

function cycleTheme(dir: number) {
  const idx = themeKeys.indexOf(gsm.theme);
  const next = (idx + dir + themeKeys.length) % themeKeys.length;
  gsm.theme = themeKeys[next];
  updateSettingsDisplay();
  applyThemeColors();
  audio.playClick();
}

function applyThemeColors() {
  const theme = THEMES[gsm.theme];

  // Court floor
  if (courtFloor) {
    (courtFloor.material as MeshStandardMaterial).color.set(theme.floor);
  }

  // Accent lights
  if (accentLights) {
    const lightColors = [theme.accent, theme.highlight, theme.accent];
    accentLights.forEach((light, i) => {
      light.color.set(lightColors[i]);
    });
  }

  // Net top band emissive
  if (netMesh) {
    netMesh.children.forEach(child => {
      const mesh = child as Mesh;
      if (mesh.material && (mesh.material as MeshStandardMaterial).emissive) {
        const mat = mesh.material as MeshStandardMaterial;
        if (mat.emissiveIntensity > 0.4) {
          mat.emissive.set(theme.accent);
          mat.color.set(theme.accent);
        }
      }
    });
  }

  // Opponent color
  if (opponentMesh) {
    opponentMesh.children.forEach(child => {
      const mesh = child as Mesh;
      if (mesh.material) {
        const mat = mesh.material as MeshStandardMaterial;
        if (mat.emissiveIntensity >= 1.0) {
          // Visor — use accent
          mat.color.set(theme.accent);
          mat.emissive.set(theme.accent);
        } else if (mat.emissiveIntensity > 0) {
          // Body parts — use opponent color
          mat.color.set(theme.opponentColor);
          mat.emissive.set(theme.opponentColor);
        }
      }
    });
  }

  // Fog
  if (world?.scene?.fog) {
    // Keep fog dark but tint slightly
    world.scene.fog.color.set('#0a0a1a');
  }

  // Ball wireframe/glow colors
  if (ballGlow) {
    (ballGlow.material as MeshBasicMaterial).color.set(theme.accent);
  }
  if (ballMesh && ballMesh.children.length > 1) {
    const wireChild = ballMesh.children[1]; // wireframe is second child
    if (wireChild && (wireChild as LineSegments).material) {
      ((wireChild as LineSegments).material as LineBasicMaterial).color.set(theme.accent);
    }
  }

  // Player hands
  if (playerHandMeshL) {
    (playerHandMeshL.material as MeshStandardMaterial).color.set(theme.accent);
    (playerHandMeshL.material as MeshStandardMaterial).emissive.set(theme.accent);
  }
  if (playerHandMeshR) {
    (playerHandMeshR.material as MeshStandardMaterial).color.set(theme.accent);
    (playerHandMeshR.material as MeshStandardMaterial).emissive.set(theme.accent);
  }
}

function updateSettingsDisplay() {
  const doc = getDoc('settings');
  if (!doc) return;
  setText(doc, 'sfx-val', `${Math.round(audio.sfxVolume * 100)}%`);
  setText(doc, 'music-val', `${Math.round(audio.musicVolume * 100)}%`);
  setText(doc, 'theme-val', gsm.theme.toUpperCase());
}

// ============================================================
// START
// ============================================================
main();
