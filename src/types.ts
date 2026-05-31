export type GameState = 'title' | 'modeselect' | 'difficulty' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'serving_ai' | 'leaderboard' | 'achievements' | 'settings' | 'help' | 'stats';

export type GameMode = 'match' | 'quick' | 'rally' | 'serve' | 'spike' | 'daily';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type CourtTheme = 'holodeck' | 'crimson' | 'ocean' | 'ultraviolet' | 'solar';

export interface ThemeConfig {
  floor: string;
  gridColor: string;
  accent: string;
  highlight: string;
  netColor: string;
  opponentColor: string;
  ballTrail: string;
}

export const THEMES: Record<CourtTheme, ThemeConfig> = {
  holodeck: {
    floor: '#0a1a2a',
    gridColor: '#00ffff',
    accent: '#00ffff',
    highlight: '#ff00ff',
    netColor: '#44ccff',
    opponentColor: '#ff6600',
    ballTrail: '#00ffff',
  },
  crimson: {
    floor: '#1a0a0a',
    gridColor: '#ff3333',
    accent: '#ff3333',
    highlight: '#ff8800',
    netColor: '#ff6644',
    opponentColor: '#ffaa00',
    ballTrail: '#ff3333',
  },
  ocean: {
    floor: '#0a1a2a',
    gridColor: '#0088ff',
    accent: '#0088ff',
    highlight: '#00ffaa',
    netColor: '#44aaff',
    opponentColor: '#ff4488',
    ballTrail: '#0088ff',
  },
  ultraviolet: {
    floor: '#1a0a2a',
    gridColor: '#aa44ff',
    accent: '#aa44ff',
    highlight: '#ff44aa',
    netColor: '#8844ff',
    opponentColor: '#44ff88',
    ballTrail: '#aa44ff',
  },
  solar: {
    floor: '#1a1a0a',
    gridColor: '#ffaa00',
    accent: '#ffaa00',
    highlight: '#ff4400',
    netColor: '#ffcc44',
    opponentColor: '#44aaff',
    ballTrail: '#ffaa00',
  },
};

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-point', name: 'First Blood', desc: 'Score your first point' },
  { id: 'first-win', name: 'Victor', desc: 'Win your first match' },
  { id: 'ace', name: 'Ace!', desc: 'Score with a serve' },
  { id: 'spike-master', name: 'Spike Master', desc: 'Land 10 spikes' },
  { id: 'combo-3', name: 'Hot Streak', desc: 'Score 3 points in a row' },
  { id: 'combo-5', name: 'On Fire', desc: 'Score 5 points in a row' },
  { id: 'combo-10', name: 'Unstoppable', desc: 'Score 10 points in a row' },
  { id: 'rally-10', name: 'Long Rally', desc: 'Keep a rally going for 10 hits' },
  { id: 'rally-25', name: 'Marathon Rally', desc: '25-hit rally' },
  { id: 'rally-50', name: 'Epic Rally', desc: '50-hit rally' },
  { id: 'shutout', name: 'Shutout', desc: 'Win a set without conceding' },
  { id: 'ace-5', name: 'Ace Machine', desc: 'Land 5 aces total' },
  { id: 'spike-50', name: 'Spike Legend', desc: 'Land 50 spikes total' },
  { id: 'veteran', name: 'Veteran', desc: 'Play 10 matches' },
  { id: 'champion', name: 'Champion', desc: 'Win 5 matches' },
  { id: 'hard-win', name: 'Hard Mode', desc: 'Win on hard difficulty' },
  { id: 'perfect-set', name: 'Perfect Set', desc: 'Win a set 21-0' },
  { id: 'comeback', name: 'Comeback King', desc: 'Win after 5 consecutive points' },
  { id: 'marathon', name: 'Marathon Match', desc: 'Play for 10 minutes' },
  { id: 'daily-player', name: 'Daily Grind', desc: 'Complete a daily challenge' },
  { id: 'block-1', name: 'Wall', desc: 'Block an opponent shot' },
  { id: 'block-10', name: 'Iron Curtain', desc: 'Block 10 shots total' },
  { id: 'dig-10', name: 'Dig Deep', desc: 'Save 10 low balls with bumps' },
  { id: 'serve-ace-3', name: 'Ace Streak', desc: '3 aces in one match' },
  { id: 'all-modes', name: 'Versatile', desc: 'Play every game mode' },
];
