export interface InstrumentDef {
  key: string;
  name: string;
  shortName: string;
  color: string;
  lightColor: string;
  strokes: string[];
}

export const INSTRUMENTS: InstrumentDef[] = [
  { key: 'ls', name: 'Surdo Grave (Low)', shortName: 'Surdo G.', color: '#ef4444', lightColor: '#fee2e2', strokes: ['X', '0', 's', 't', 'r'] },
  { key: 'ms', name: 'Surdo Médium (Mid)', shortName: 'Surdo M.', color: '#f97316', lightColor: '#ffedd5', strokes: ['X', '0', 's', 't', 'r'] },
  { key: 'hs', name: 'Surdo Aigu (High)', shortName: 'Surdo A.', color: '#f59e0b', lightColor: '#fef3c7', strokes: ['X', '0', 's', 't', 'r'] },
  { key: 're', name: 'Repinique', shortName: 'Repi', color: '#10b981', lightColor: '#d1fae5', strokes: ['X', 'f', 'r', 'h', '.', 'z', 's'] },
  { key: 'sn', name: 'Caisse Claire (Snare)', shortName: 'Caisse', color: '#06b6d4', lightColor: '#cffafe', strokes: ['.', 'X', 'r', 'f'] },
  { key: 'ta', name: 'Tamborim', shortName: 'Tamborim', color: '#8b5cf6', lightColor: '#ede9fe', strokes: ['X', 'r', 'f'] },
  { key: 'ag', name: 'Agogô', shortName: 'Agogô', color: '#ec4899', lightColor: '#fce7f3', strokes: ['o', 'a', 'r', '.'] },
  { key: 'sh', name: 'Chocalho / Shaker', shortName: 'Chocalho', color: '#64748b', lightColor: '#f1f5f9', strokes: ['X', '.'] },
  { key: 'ot', name: 'Sifflet & Voix', shortName: 'Sifflet', color: '#a855f7', lightColor: '#f3e8ff', strokes: ['w', 'y', 'A', 'B', 'F'] }
];

export const STROKE_LABELS: Record<string, { label: string; desc: string; color: string; isAccent?: boolean }> = {
  'X': { label: 'X', desc: 'Frappe ouverte (Open / Fort)', color: '#f43f5e', isAccent: true }, // Rose vif / Rouge dynamique
  '0': { label: '0', desc: 'Son étouffé (Mute)', color: '#64748b' },                           // Gris ardoise feutré
  's': { label: 'sil', desc: 'Frappe douce / feutrée', color: '#0ea5e9' },                      // Bleu ciel
  'r': { label: 'rim', desc: 'Rimshot (Cercle)', color: '#eab308', isAccent: true },           // Jaune doré éclatant
  'f': { label: 'fl', desc: 'Fla / Accent double', color: '#a855f7', isAccent: true },         // Violet néon
  'h': { label: 'hd', desc: 'Frappe main nue', color: '#10b981' },                             // Vert émeraude
  'o': { label: 'bas', desc: 'Cloche grave', color: '#3b82f6' },                               // Bleu saphir
  'a': { label: 'haut', desc: 'Cloche aigüe', color: '#f97316', isAccent: true },              // Orange vif
  '.': { label: '•', desc: 'Shake / Ghost note', color: '#06b6d4' },                           // Cyan
  'z': { label: 'z', desc: 'Buzz / Roulement', color: '#d946ef', isAccent: true },             // Fuchsia
  'w': { label: 'Wh', desc: 'Coup de sifflet court', color: '#14b8a6', isAccent: true },       // Turquoise
  'y': { label: 'Wh2', desc: 'Coup de sifflet long', color: '#06b6d4', isAccent: true },       // Cyan intense
  'A': { label: 'Oi!', desc: 'Cri Oi!', color: '#e11d48', isAccent: true },                     // Rouge rubis
  'B': { label: 'Ua!', desc: 'Cri Ua!', color: '#8b5cf6', isAccent: true },                     // Violet
  'F': { label: 'Hey!', desc: 'Cri Hey!', color: '#f59e0b', isAccent: true }                   // Ambre
};

export interface Pattern {
  name: string;
  displayName?: string;
  time: number;
  loop?: boolean;
  upbeat?: number;
  tracks: Record<string, string>;
  volumeHack?: Record<number, number> | Record<string, Record<number, number>>;
  length: number;
  notes?: string;
  maxRepeats?: number; // Nombre max de répétitions en mode Live (1 par défaut pour breaks, 2 ou 4 pour thèmes)
  priority?: number; // Poids/Priorité aléatoire en mode Live (1 = normal, 2 = souvent, 3 = très fréquent, 0 = exclu)
}

export interface Tune {
  name: string;
  displayName?: string;
  categories: string[];
  sheet?: string | null;
  video?: string | null;
  audioGuide?: string | null;
  notes?: string;
  time: number;
  speed?: number;
  patterns: Record<string, Pattern>;
  exampleSong?: (string | { patternName: string; instruments?: string[] })[];
}

export interface Playlist {
  id: string;
  name: string;
  tuneNames: string[];
}

export type GameDifficulty = 'easy' | 'medium' | 'hard';

export interface DailyChallengeDef {
  dateKey: string; // "YYYY-MM-DD"
  tuneKey: string;
  tuneName: string;
  patternKey: string;
  patternName: string;
  instrumentKey: string;
  instrumentName: string;
  sequenceTracks: Record<string, string>;
  sequenceLength: number;
  timeSignature: number;
  repeats: number;
  totalNotes: number;
}

export interface ScoreEntry {
  id: string;
  playerName: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: string;
  totalNotes: number;
  perfects: number;
  greats: number;
  goods: number;
  misses: number;
  timestamp: string;
}
