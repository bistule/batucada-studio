<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { INSTRUMENTS, STROKE_LABELS, type Tune, type Pattern, type Playlist, type GameDifficulty, type ScoreEntry, type DailyChallengeDef } from './types';
import rawTunes from './tunesData.json';
import { audio } from './soundEngine';
import { BRAND } from "./branding";
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Play,
  Square,
  Sliders,
  Headphones,
  Search,
  FileText,
  Video,
  ListMusic,
  Plus,
  Radio,
  Zap,
  Trash2,
  ChevronRight,
  FolderPlus,
  Music,
  Copy,
  Settings2,
  Maximize,
  Minimize,
  Sun,
  Moon,
  StickyNote,
  Edit3,
  Download,
  Upload,
  Image,
  ImageIcon,
  X,
  Sparkles,
  CheckCircle2,
  ChevronLeft,
  MessageSquare,
  Send,
  Shuffle,
  Volume2,
  VolumeX,
  Keyboard,
  QrCode,
  Share2,
  RotateCcw,
  AlertTriangle,
  FileDown,
  FileUp,
  Link,
  Camera,
  Info,
  BookOpen,
  History,
  Crown,
  Lock,
  Unlock,
  Trophy,
  Flame,
  Target,
  KeyRound,
  ShieldCheck
} from 'lucide-vue-next';

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.4.3';
const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : new Date().toISOString();

// State
const tunes = ref<Record<string, Tune>>(rawTunes as unknown as Record<string, Tune>);
const currentTuneKey = ref<string>('Afoxe');
const currentPatternKey = ref<string>('Tune');
const currentTab = ref<'musician' | 'studio' | 'mixer' | 'playlists' | 'game'>('musician');

// Mode Maestro State
const isMaestro = ref(false);
const showMaestroModal = ref(false);
const maestroPinInput = ref('');
const maestroPinError = ref('');
const maestroChangePinMode = ref(false);
const maestroOldPinInput = ref('');
const maestroNewPinInput = ref('');
const isSyncingWithServer = ref(false);
const serverSyncStatus = ref<'idle' | 'syncing' | 'synced' | 'offline'>('idle');

// Stockage du PIN en session pour les requêtes authentifiées au serveur
const maestroSessionPin = ref<string>(sessionStorage.getItem('batucada_maestro_pin') || '');
if (maestroSessionPin.value) {
  isMaestro.value = true;
}

async function verifyMaestroPin() {
  maestroPinError.value = '';
  const pin = maestroPinInput.value.trim();
  if (!pin) {
    maestroPinError.value = 'Veuillez saisir un code PIN.';
    return;
  }

  try {
    const res = await fetch('/api/maestro/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (res.ok && data.success && data.authorized) {
      isMaestro.value = true;
      maestroSessionPin.value = pin;
      sessionStorage.setItem('batucada_maestro_pin', pin);
      showMaestroModal.value = false;
      maestroPinInput.value = '';
      triggerModeFlash('MODE MAESTRO ACTIF', '#ec4899', 'crown');
      // Re-synchroniser avec le serveur
      fetchTunesFromServer();
    } else {
      maestroPinError.value = data.error || 'Code PIN incorrect.';
    }
  } catch (err) {
    // Fallback hors-ligne / dev local
    const localPin = localStorage.getItem('batucada_maestro_pin_local') || '1234';
    if (pin === localPin) {
      isMaestro.value = true;
      maestroSessionPin.value = pin;
      sessionStorage.setItem('batucada_maestro_pin', pin);
      showMaestroModal.value = false;
      maestroPinInput.value = '';
      triggerModeFlash('MODE MAESTRO (LOCAL)', '#ec4899', 'crown');
    } else {
      maestroPinError.value = 'Code PIN incorrect.';
    }
  }
}

function lockMaestro() {
  isMaestro.value = false;
  maestroSessionPin.value = '';
  sessionStorage.removeItem('batucada_maestro_pin');
  showMaestroModal.value = false;
  triggerModeFlash('MODE MAESTRO VERROUILLÉ', '#64748b', 'lock');
  if (currentTab.value === 'studio') {
    currentTab.value = 'musician';
  }
}

async function changeMaestroPin() {
  maestroPinError.value = '';
  const curPin = maestroOldPinInput.value.trim();
  const newPin = maestroNewPinInput.value.trim();

  if (!curPin || !newPin) {
    maestroPinError.value = 'Tous les champs sont requis.';
    return;
  }
  if (newPin.length < 4) {
    maestroPinError.value = 'Le nouveau code PIN doit faire au moins 4 caractères.';
    return;
  }

  try {
    const res = await fetch('/api/maestro/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin: curPin, newPin })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      maestroSessionPin.value = newPin;
      sessionStorage.setItem('batucada_maestro_pin', newPin);
      localStorage.setItem('batucada_maestro_pin_local', newPin);
      alert('Code PIN Maestro modifié avec succès !');
      maestroChangePinMode.value = false;
      maestroOldPinInput.value = '';
      maestroNewPinInput.value = '';
    } else {
      maestroPinError.value = data.error || 'Erreur lors du changement de PIN.';
    }
  } catch (err) {
    // Fallback local
    const localPin = localStorage.getItem('batucada_maestro_pin_local') || '1234';
    if (curPin === localPin) {
      localStorage.setItem('batucada_maestro_pin_local', newPin);
      maestroSessionPin.value = newPin;
      sessionStorage.setItem('batucada_maestro_pin', newPin);
      alert('Code PIN Maestro modifié localement avec succès !');
      maestroChangePinMode.value = false;
      maestroOldPinInput.value = '';
      maestroNewPinInput.value = '';
    } else {
      maestroPinError.value = 'Ancien code PIN incorrect.';
    }
  }
}

async function fetchTunesFromServer() {
  try {
    serverSyncStatus.value = 'syncing';
    const res = await fetch('/api/tunes');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.tunes && Object.keys(data.tunes).length > 0) {
        tunes.value = data.tunes;
        saveTunesToStorage(false); // Sauvegarde locale sans push serveur
        serverSyncStatus.value = 'synced';
        return;
      }
    }
  } catch (e) {
    console.warn('Mode hors ligne ou serveur API non joignable, utilisation des données locales.');
    serverSyncStatus.value = 'offline';
  }
}

async function syncTunesToServer() {
  if (!isMaestro.value || !maestroSessionPin.value) return;
  try {
    isSyncingWithServer.value = true;
    const res = await fetch('/api/maestro/save-tunes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Maestro-Pin': maestroSessionPin.value
      },
      body: JSON.stringify({ tunes: tunes.value })
    });
    if (res.ok) {
      serverSyncStatus.value = 'synced';
    }
  } catch (err) {
    console.warn('Erreur synchronisation serveur:', err);
  } finally {
    isSyncingWithServer.value = false;
  }
}

const searchQuery = ref('');
const selectedCategory = ref('all');
const isPlaying = ref(false);
const activeStep = ref<number>(-1);
const smoothPosition = ref<number>(0);
let animationFrameId: number | null = null;
const bpm = ref(100);
const metronomeMode = ref<'off' | 'measure' | 'phrase'>('off');
const metronomeVolume = ref<number>(0.6); // Volume réglable du métronome
const showKeyboardHelpModal = ref(false); // Modal raccourcis clavier
const showChangelogModal = ref(false); // Modal Changelog / Historique des versions
const showGuideModal = ref(false); // Modal Guide & Aide solfégique
const latencyMs = ref(0);
const soloInstrument = ref<string | null>('re'); // Default to repinique for training

// Hero Mode / Groovy Beat Interactive Trainer
const showHeroTrainer = ref(false);
const heroSelectedInst = ref<string>('re');
const heroSpacing = ref<number>(75); // Distance in px between steps (Zoom/Stretch timeline)
const heroFocusMode = ref<boolean>(false); // Focus mode hides all UI except highway and play button
const showHeroAccompanimentDrawer = ref<boolean>(false);
const heroAccompanimentClickState = ref<'active' | 'drawer' | 'muted'>('muted'); // 3-step cycle for Groovy Beat accompaniment button

function cycleHeroAccompanimentButton() {
  if (heroAccompanimentClickState.value === 'muted') {
    // 1er appui : Activer tous les accompagnants
    heroAccompanimentClickState.value = 'active';
    showHeroAccompanimentDrawer.value = false;
    INSTRUMENTS.forEach(i => {
      if (audio.isMuted(i.key)) audio.toggleMute(i.key);
    });
  } else if (heroAccompanimentClickState.value === 'active') {
    // 2ème appui : Ouvrir le menu des réglages personnalisés
    heroAccompanimentClickState.value = 'drawer';
    showHeroAccompanimentDrawer.value = true;
  } else {
    // 3ème appui : Couper tous les accompagnants (ne garder que l'instrument solo joué)
    heroAccompanimentClickState.value = 'muted';
    showHeroAccompanimentDrawer.value = false;
    INSTRUMENTS.forEach(i => {
      if (i.key !== heroSelectedInst.value) {
        if (!audio.isMuted(i.key)) audio.toggleMute(i.key);
      }
    });
  }
}
const heroLiveMode = ref<boolean>(false); // Mode Live aléatoire continu
const heroMaxPatternRepeats = ref<number>(2); // Nombre max de répétitions par pattern (global de base)
const currentLivePatternRepeatCount = ref<number>(0);
const incomingNextPatternKey = ref<string | null>(null); // Annonce du prochain pattern pour l'apprentissage
const isNextPatternImminent = ref<boolean>(false); // Alerte visuelle au beat avant la transition
const showGoSplash = ref<boolean>(false); // Animation festive "GO !" au lancement du nouveau pattern
let goSplashTimer: number | null = null;

// Dès que le mode Live est activé ou change, pré-sélectionner immédiatement le prochain pattern
watch(heroLiveMode, (active) => {
  if (active) {
    if (!incomingNextPatternKey.value) {
      incomingNextPatternKey.value = pickRandomNextPattern(currentPatternKey.value);
    }
  } else {
    incomingNextPatternKey.value = null;
    isNextPatternImminent.value = false;
  }
});

// ==========================================
// 🎮 MODE JEU DU JOUR & HALL OF FAME
// ==========================================
const gameSelectedDifficulty = ref<GameDifficulty>('medium');
const gamePlayerName = ref<string>(localStorage.getItem('batucada_player_name') || '');
const isGameActive = ref<boolean>(false);
const isGameFullScreen = ref<boolean>(false);
const isGameWaitingToStart = ref<boolean>(false);
const isGamePlaying = ref<boolean>(false);
const gameScore = ref<number>(0);
const gameCombo = ref<number>(0);
const gameMaxCombo = ref<number>(0);
const gamePerfects = ref<number>(0);
const gameGreats = ref<number>(0);
const gameGoods = ref<number>(0);
const gameMisses = ref<number>(0);
const gameLastFeedback = ref<{ text: string; color: string; timingDiffMs?: number; id: number } | null>(null);
let gameFeedbackCounter = 0;
const showGameResultModal = ref<boolean>(false);
const allScores = ref<Record<string, Record<string, ScoreEntry[]>>>({});
const isSubmittingScore = ref<boolean>(false);
const scoreSubmitSuccess = ref<boolean>(false);

// Clé de date du jour (YYYY-MM-DD) locale
const todayDateKey = computed(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

// Génération déterministe de la séquence du jour à partir de la date
const dailyChallenge = computed<DailyChallengeDef>(() => {
  const tuneKeys = Object.keys(tunes.value);
  if (tuneKeys.length === 0) {
    return {
      dateKey: todayDateKey.value,
      tuneKey: 'Afoxe',
      tuneName: 'Afoxê',
      patternKey: 'Tune',
      patternName: 'Thème Principal (x4)',
      instrumentKey: 're',
      instrumentName: 'Repinique',
      sequenceTracks: { re: 'X.r.X.r.X.r.X.r.X.r.X.r.X.r.X.r.' },
      sequenceLength: 32,
      timeSignature: 4,
      repeats: 2,
      totalNotes: 16
    };
  }

  // Hash simple de la date YYYY-MM-DD
  const dateStr = todayDateKey.value;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  // Choisir un morceau déterministe
  const tuneIndex = posHash % tuneKeys.length;
  const selTuneKey = tuneKeys[tuneIndex];
  const selTune = tunes.value[selTuneKey];

  // Choisir un pattern avec des notes
  const patternKeys = Object.keys(selTune.patterns || {});
  const selPatternKey = patternKeys[(posHash >> 2) % patternKeys.length] || 'Tune';
  const selPattern = selTune.patterns[selPatternKey] || { tracks: {}, length: 16, time: 4 };

  // Choisir un instrument phare qui a des notes dans ce pattern
  const candidateInsts = INSTRUMENTS.filter(inst => {
    const track = selPattern.tracks[inst.key] || '';
    return track.split('').some(c => c !== ' ');
  });

  const chosenInst = candidateInsts.length > 0
    ? candidateInsts[(posHash >> 4) % candidateInsts.length]
    : INSTRUMENTS[3]; // Repinique par défaut

  // Enchaînement musical : calculer le nombre de répétitions pour avoir une séquence d'au moins 30 secondes
  const baseLen = selPattern.length || 16;
  const timeSig = selPattern.time || selTune.time || 4;
  const stepsPerBeat = timeSig === 3 ? 3 : (timeSig === 12 ? 12 : 4);
  // Au tempo moyen (110 BPM) : 110 beats/min => (60/110) s par beat
  const secondsPerBaseLoop = (baseLen / stepsPerBeat) * (60.0 / 110.0);
  // Viser au minimum ~30 secondes (ex: 32s de jeu)
  const targetRepeats = Math.max(2, Math.ceil(30.0 / Math.max(secondsPerBaseLoop, 1.0)));
  const repeats = Math.min(targetRepeats, 16); // borne de sécurité

  const sequenceTracks: Record<string, string> = {};
  for (const inst of INSTRUMENTS) {
    const unitTrack = (selPattern.tracks[inst.key] || '').padEnd(baseLen, ' ');
    sequenceTracks[inst.key] = unitTrack.repeat(repeats);
  }

  const seqLen = baseLen * repeats;
  const myTrack = sequenceTracks[chosenInst.key] || '';
  const noteCount = myTrack.split('').filter(c => c !== ' ').length;

  return {
    dateKey: dateStr,
    tuneKey: selTuneKey,
    tuneName: selTune.displayName || selTune.name,
    patternKey: selPatternKey,
    patternName: `${selPattern.displayName || selPatternKey} (x${repeats})`,
    instrumentKey: chosenInst.key,
    instrumentName: chosenInst.name,
    sequenceTracks,
    sequenceLength: seqLen,
    timeSignature: timeSig,
    repeats,
    totalNotes: Math.max(1, noteCount)
  };
});

// Vitesse BPM selon la difficulté du jeu
const gameBpm = computed(() => {
  if (gameSelectedDifficulty.value === 'easy') return 80;
  if (gameSelectedDifficulty.value === 'medium') return 110;
  return 140; // hard
});

const gameMultiplier = computed(() => {
  if (gameSelectedDifficulty.value === 'easy') return 1.0;
  if (gameSelectedDifficulty.value === 'medium') return 1.5;
  return 2.0; // hard
});

// Récupération des scores du serveur
async function fetchScoresFromServer() {
  try {
    const res = await fetch('/api/scores');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.scores) {
        allScores.value = data.scores;
        localStorage.setItem('batucada_local_scores_cache', JSON.stringify(data.scores));
      }
    }
  } catch (e) {
    const cached = localStorage.getItem('batucada_local_scores_cache');
    if (cached) {
      try {
        allScores.value = JSON.parse(cached);
      } catch {}
    }
  }
}

// Hall of Fame actuel pour le jour et la difficulté sélectionnés
const currentHallOfFame = computed<ScoreEntry[]>(() => {
  const dScores = allScores.value[todayDateKey.value] || {};
  return dScores[gameSelectedDifficulty.value] || [];
});

// Dynamic highway ribbon nodes for Game Mode (Scrolling View)
const gameRibbonNodes = computed(() => {
  const challenge = dailyChallenge.value;
  const seqLen = challenge.sequenceLength || 16;
  const timeSig = challenge.timeSignature || 4;
  const myTrack = challenge.sequenceTracks[challenge.instrumentKey] || '';

  let stepsPerBeat = 4;
  let stepsPerMeasure = 16;
  if (timeSig === 3) {
    stepsPerBeat = 3;
    stepsPerMeasure = 6;
  } else if (timeSig === 12) {
    stepsPerBeat = 12;
    stepsPerMeasure = 48;
  } else if (timeSig === 6) {
    stepsPerBeat = 6;
    stepsPerMeasure = 24;
  } else if (timeSig === 2) {
    stepsPerBeat = 2;
    stepsPerMeasure = 4;
  }

  const nodes: Array<{
    id: string;
    stepOffset: number;
    stroke: string;
    isFirstBeat: boolean;
    isOtherBeat: boolean;
  }> = [];

  for (let i = 0; i < seqLen; i++) {
    const stroke = myTrack[i] || ' ';
    const isBeat = (i % stepsPerBeat === 0);
    const isMeasureStart = (i % stepsPerMeasure === 0);
    nodes.push({
      id: `game-${i}`,
      stepOffset: i,
      stroke,
      isFirstBeat: isMeasureStart,
      isOtherBeat: isBeat && !isMeasureStart
    });
  }

  return nodes;
});
// Indices et temps cibles des notes du défi en cours
interface TargetNote {
  step: number;
  expectedTime: number; // en secondes Web Audio
  stroke: string;
  hit: boolean;
}

let gameTargetNotes: TargetNote[] = [];
let gameLoopTimeout: number | null = null;

function startGameChallenge() {
  if (isCountingIn.value || isGamePlaying.value) return;

  // Préparation du plein écran et état de pause en attente de clic
  isGameFullScreen.value = true;
  isGameWaitingToStart.value = true;
  isGameActive.value = true;
  isGamePlaying.value = false;
  smoothPosition.value = 0;
  activeStep.value = -1;
  gameScore.value = 0;
  gameCombo.value = 0;
  gameMaxCombo.value = 0;
  gamePerfects.value = 0;
  gameGreats.value = 0;
  gameGoods.value = 0;
  gameMisses.value = 0;
  gameLastFeedback.value = null;
  showGameResultModal.value = false;
  scoreSubmitSuccess.value = false;

  // Régler le tempo du moteur sur la difficulté
  bpm.value = gameBpm.value;
  audio.setBpm(gameBpm.value);

  // Ajuster le mix sonore : volume max (1.0) sur la piste jouée, et atténuation (0.28) des autres pistes
  INSTRUMENTS.forEach(i => {
    if (audio.isMuted(i.key)) {
      audio.toggleMute(i.key);
    }
    if (i.key === dailyChallenge.value.instrumentKey) {
      audio.setVolume(i.key, 1.0);
    } else {
      audio.setVolume(i.key, 0.28);
    }
  });

  // Tenter le passage en plein écran natif
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function confirmStartGame() {
  if (!isGameWaitingToStart.value) return;
  isGameWaitingToStart.value = false;

  const challenge = dailyChallenge.value;
  const seqLen = challenge.sequenceLength || 16;
  const timeSig = challenge.timeSignature || 4;
  const isTernary = (timeSig === 3 || timeSig === 6 || timeSig === 12);
  const totalBeats = isTernary ? 2 : 4; // 2 temps en 6/8 ou 4 temps en 4/4
  const beatIntervalMs = (60.0 / gameBpm.value) * 1000;
  const stepsPerBeat = timeSig === 3 ? 3 : (timeSig === 12 ? 12 : 4);
  const secPerStep = (60.0 / gameBpm.value) / stepsPerBeat;

  // 1. Décompte sonore (clic) & visuel animé (1-2-3-4)
  isCountingIn.value = true;
  countInStep.value = 1;
  audio.playClick(audio.getCurrentTime(), true);

  const runGameCountIn = (b: number) => {
    if (!isCountingIn.value) return;
    if (b > totalBeats) {
      isCountingIn.value = false;
      countInStep.value = 0;
      launchGameSequence(challenge, seqLen, timeSig, secPerStep);
      return;
    }
    countInStep.value = b;
    audio.playClick(audio.getCurrentTime(), b === 1);
    countInTimer = window.setTimeout(() => {
      runGameCountIn(b + 1);
    }, beatIntervalMs);
  };

  countInTimer = window.setTimeout(() => {
    runGameCountIn(2);
  }, beatIntervalMs);
}

function exitGameFullScreen() {
  isGameFullScreen.value = false;
  isGameWaitingToStart.value = false;
  isGamePlaying.value = false;
  isCountingIn.value = false;
  if (countInTimer) clearTimeout(countInTimer);
  if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
  audio.stop();
  isPlaying.value = false;
  activeStep.value = -1;
  smoothPosition.value = 0;

  // Restaurer le volume normal de tous les instruments
  INSTRUMENTS.forEach(i => {
    audio.setVolume(i.key, 1.0);
  });
}

function launchGameSequence(challenge: DailyChallengeDef, seqLen: number, timeSig: number, secPerStep: number) {
  isGamePlaying.value = true;

  // Démarrer la lecture de la séquence complète
  audio.start(
    challenge.sequenceTracks,
    seqLen,
    undefined,
    (st) => {
      activeStep.value = st;
    },
    timeSig
  );
  isPlaying.value = true;
  startSmoothAnimation();

  // Le timing exact de début du moteur est audio.currentPatternStartTime
  const startTime = audio.currentPatternStartTime || (audio.startTime + 0.05);

  const myTrack = challenge.sequenceTracks[challenge.instrumentKey] || '';
  gameTargetNotes = [];
  for (let s = 0; s < seqLen; s++) {
    const stroke = myTrack[s];
    // Seules les VRAIES notes (différentes de l'espace vide ' ') sont ciblées
    if (stroke && stroke.trim() !== '') {
      gameTargetNotes.push({
        step: s,
        expectedTime: startTime + (s * secPerStep),
        stroke: stroke,
        hit: false
      });
    }
  }

  // Surveiller les notes manquées en temps réel
  const checkMissesInterval = window.setInterval(() => {
    if (!isGamePlaying.value) {
      clearInterval(checkMissesInterval);
      return;
    }
    const curTime = audio.getCurrentTime();
    // Ne considérer comme manquée que si la note a dépassé la cible d'au moins 180ms
    for (const note of gameTargetNotes) {
      if (!note.hit && curTime > note.expectedTime + 0.18) {
        note.hit = true;
        gameMisses.value++;
        gameCombo.value = 0;
        triggerGameHitFeedback('MISS', '#ef4444');
      }
    }
  }, 40);

  // Fin de séquence & résultat
  const totalDurationMs = (seqLen * secPerStep * 1000) + 300;
  if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
  gameLoopTimeout = window.setTimeout(() => {
    clearInterval(checkMissesInterval);
    finishGameChallenge();
  }, totalDurationMs);
}

function triggerGameHitFeedback(text: string, color: string, timingDiffMs?: number) {
  gameFeedbackCounter++;
  gameLastFeedback.value = {
    id: gameFeedbackCounter,
    text,
    color,
    timingDiffMs
  };
}

// Frappe du joueur (au clavier ou au clic sur le bouton de frappe géant)
function registerPlayerHit() {
  if (!isGamePlaying.value) return;

  const curTime = audio.getCurrentTime();
  // Pas de retour sonore synthétique pour le joueur en mode jeu : uniquement le feedback visuel et de timing !

  // Trouver la note cible la plus proche non encore validée
  let closestNote: TargetNote | null = null;
  let minDiff = Infinity;

  for (const note of gameTargetNotes) {
    if (!note.hit) {
      const diff = Math.abs(curTime - note.expectedTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestNote = note;
      }
    }
  }

  // Fenêtre de tolérance de frappe étendue (jusqu'à 180ms)
  if (closestNote && minDiff <= 0.18) {
    closestNote.hit = true;
    const diffMs = Math.round((curTime - closestNote.expectedTime) * 1000);
    const absDiffMs = Math.abs(diffMs);

    let basePoints = 0;
    let label = '';
    let color = '';

    if (absDiffMs <= 35) {
      basePoints = 100;
      label = '👑 PARFAIT !';
      color = '#fbbf24'; // Jaune or
      gamePerfects.value++;
    } else if (absDiffMs <= 80) {
      basePoints = 70;
      label = '⚡ BIEN';
      color = '#14b8a6'; // Turquoise
      gameGreats.value++;
    } else {
      basePoints = 35;
      label = '👌 PASSABLE';
      color = '#38bdf8'; // Bleu ciel
      gameGoods.value++;
    }

    gameCombo.value++;
    if (gameCombo.value > gameMaxCombo.value) {
      gameMaxCombo.value = gameCombo.value;
    }

    // Calcul du multiplicateur de combo
    let comboMult = 1;
    if (gameCombo.value >= 24) comboMult = 4;
    else if (gameCombo.value >= 16) comboMult = 3;
    else if (gameCombo.value >= 8) comboMult = 2;

    const gainedScore = Math.round(basePoints * comboMult * gameMultiplier.value);
    gameScore.value += gainedScore;

    triggerGameHitFeedback(label, color, diffMs);
  } else {
    // Si l'écart est supérieur à 180ms : frappe dans le vide / parasite
    // Réinitialiser combo mais pas de feedback agressif pour ne pas polluer l'écran
    gameCombo.value = 0;
    triggerGameHitFeedback('⚡ HORS TEMPO', '#f43f5e');
  }
}

const gameAccuracy = computed(() => {
  const total = dailyChallenge.value.totalNotes;
  if (total === 0) return 0;
  const weighted = (gamePerfects.value * 100) + (gameGreats.value * 70) + (gameGoods.value * 35);
  const maxPossible = total * 100;
  return Math.min(100, Math.max(0, Math.round((weighted / maxPossible) * 1000) / 10));
});

const gameFinalGrade = computed(() => {
  const acc = gameAccuracy.value;
  if (acc >= 98 && gameMisses.value === 0) return 'S+';
  if (acc >= 90) return 'S';
  if (acc >= 80) return 'A';
  if (acc >= 65) return 'B';
  return 'C';
});

function finishGameChallenge() {
  isGamePlaying.value = false;
  audio.stop();
  isPlaying.value = false;

  // Bonus Full Combo
  if (gameMisses.value === 0 && (gamePerfects.value + gameGreats.value + gameGoods.value) === dailyChallenge.value.totalNotes) {
    gameScore.value += Math.round(1000 * gameMultiplier.value);
  }
  // Bonus All Perfect
  if (gamePerfects.value === dailyChallenge.value.totalNotes) {
    gameScore.value += Math.round(2500 * gameMultiplier.value);
  }

  showGameResultModal.value = true;
}

async function submitScoreToHallOfFame() {
  const name = gamePlayerName.value.trim() || 'Sambiste Anonyme';
  localStorage.setItem('batucada_player_name', name);
  isSubmittingScore.value = true;

  const payload = {
    dateKey: todayDateKey.value,
    level: gameSelectedDifficulty.value,
    playerName: name,
    score: gameScore.value,
    accuracy: gameAccuracy.value,
    maxCombo: gameMaxCombo.value,
    grade: gameFinalGrade.value,
    totalNotes: dailyChallenge.value.totalNotes,
    perfects: gamePerfects.value,
    greats: gameGreats.value,
    goods: gameGoods.value,
    misses: gameMisses.value
  };

  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success && data.scores) {
      allScores.value = data.scores;
      scoreSubmitSuccess.value = true;
      localStorage.setItem('batucada_local_scores_cache', JSON.stringify(data.scores));
    }
  } catch (e) {
    // Fallback local
    if (!allScores.value[todayDateKey.value]) allScores.value[todayDateKey.value] = {};
    if (!allScores.value[todayDateKey.value][gameSelectedDifficulty.value]) {
      allScores.value[todayDateKey.value][gameSelectedDifficulty.value] = [];
    }
    const localEntry: ScoreEntry = {
      id: Date.now().toString(),
      playerName: name,
      score: gameScore.value,
      accuracy: gameAccuracy.value,
      maxCombo: gameMaxCombo.value,
      grade: gameFinalGrade.value,
      totalNotes: dailyChallenge.value.totalNotes,
      perfects: gamePerfects.value,
      greats: gameGreats.value,
      goods: gameGoods.value,
      misses: gameMisses.value,
      timestamp: new Date().toISOString()
    };
    allScores.value[todayDateKey.value][gameSelectedDifficulty.value].push(localEntry);
    allScores.value[todayDateKey.value][gameSelectedDifficulty.value].sort((a, b) => b.score - a.score);
    localStorage.setItem('batucada_local_scores_cache', JSON.stringify(allScores.value));
    scoreSubmitSuccess.value = true;
  } finally {
    isSubmittingScore.value = false;
  }
}
const showModeFlash = ref(false);
const modeFlashTitle = ref('');
const modeFlashColor = ref('#14b8a6');
const modeFlashIcon = ref('headphones');
let modeFlashTimer: number | null = null;

function triggerModeFlash(title: string, color: string, icon: string = 'zap') {
  modeFlashTitle.value = title;
  modeFlashColor.value = color;
  modeFlashIcon.value = icon;
  showModeFlash.value = true;
  if (modeFlashTimer) clearTimeout(modeFlashTimer);
  modeFlashTimer = window.setTimeout(() => {
    showModeFlash.value = false;
  }, 500);
}

// Fullscreen & Dark / Light Theme & Low Performance Mode
const isFullscreen = ref(false);
let wakeLockSentinel: any = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {}
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

watch(isPlaying, (playing) => {
  if (playing) {
    requestWakeLock();
  } else {
    releaseWakeLock();
  }
});
const isDarkMode = ref(true);
const isLowPerformanceMode = ref(false);
const heroCountInEnabled = ref<boolean>(false); // Option décompte 4 temps avant départ Groovy Beat
const isCountingIn = ref<boolean>(false); // Statut décompte actif
const countInStep = ref<number>(0); // Numéro du temps en cours de décompte (1, 2, 3, 4)
// Tooltip Tutorial Tour
const showTooltipTour = ref(false);
const currentTooltipStep = ref(0);
const tooltipSteps = [
  {
    target: '.brand-area',
    title: '🥁 Batucada Studio',
    text: 'Personnalisez le nom et le logo de votre groupe dans les réglages !',
    position: 'bottom'
  },
  {
    target: '.organic-hero-btn',
    title: '🎮 Mode Groovy Beat',
    text: 'Entraînez-vous en défilement vertical 60 FPS avec le mode Groovy Beat et Focus plein écran.',
    position: 'bottom'
  },
  {
    target: '.mode-switch-btn',
    title: '🎧 / ⚡ Mode Écoute & Studio',
    text: 'Basculez en un clic entre le mode écoute multi-pistes et le mode édition/composition Studio.',
    position: 'bottom'
  },
  {
    target: '.sidebar-card',
    title: '🎵 Répertoire (52 Morceaux)',
    text: 'Recherchez et filtrez par catégorie. Cliquez pour charger un morceau instantanément.',
    position: 'right'
  },
  {
    target: '.master-play-circle',
    title: '▶️ Barre de Lecture Flottante',
    text: 'Contrôlez le tempo BPM, lancez le métronome et accédez à vos playlists partout.',
    position: 'top'
  }
];

function startTooltipTour() {
  currentTooltipStep.value = 0;
  showTooltipTour.value = true;
}

function nextTooltip() {
  if (currentTooltipStep.value < tooltipSteps.length - 1) {
    currentTooltipStep.value++;
  } else {
    closeTooltipTour();
  }
}

function prevTooltip() {
  if (currentTooltipStep.value > 0) {
    currentTooltipStep.value--;
  }
}

function closeTooltipTour() {
  showTooltipTour.value = false;
  localStorage.setItem('batucada_tooltip_tour_seen_v1', 'true');
}

// Feedback / Suggestions system
const showFeedbackModal = ref(false);
const showMetronomeVolPopover = ref(false);
const feedbackAuthor = ref('');
const feedbackCategory = ref<'suggestion' | 'bug' | 'musique' | 'autre'>('suggestion');
const feedbackText = ref('');
const feedbackImageBase64 = ref<string | null>(null);
const feedbackFileInput = ref<HTMLInputElement | null>(null);
const feedbackList = ref<Array<{ id: string; author: string; category: string; text: string; date: string; image?: string; approved?: boolean }>>([]);
const feedbackSuccessMsg = ref(false);
const adminMode = ref(false); // Mode modération pour approuver/rejeter les photos

function openFeedbackModal() {
  showFeedbackModal.value = true;
  feedbackSuccessMsg.value = false;
  feedbackImageBase64.value = null;
  loadFeedbacks();
}

function handleFeedbackImage(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    if (file.size > 2 * 1024 * 1024) {
      alert("L'image est trop lourde (max 2 Mo)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      feedbackImageBase64.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
}

function removeFeedbackImage() {
  feedbackImageBase64.value = null;
  if (feedbackFileInput.value) feedbackFileInput.value.value = '';
}

function toggleFeedbackApproval(id: string) {
  const item = feedbackList.value.find(f => f.id === id);
  if (item) {
    item.approved = !item.approved;
    localStorage.setItem('batucada_feedbacks_v1', JSON.stringify(feedbackList.value));
  }
}

function loadFeedbacks() {
  try {
    const raw = localStorage.getItem('batucada_feedbacks_v1');
    if (raw) {
      feedbackList.value = JSON.parse(raw);
    } else {
      feedbackList.value = [
        {
          id: '1',
          author: 'Alex (Repi)',
          category: 'suggestion',
          text: 'Super pratique le mode Groovy Beat ! Serait-il possible d\'ajouter un décompte 4 temps avant le démarrage ?',
          date: 'Hier à 18:30',
          approved: true
        },
        {
          id: '2',
          author: 'Léa (Surdo)',
          category: 'musique',
          text: 'Sur Angela Davis, le break 2 mériterait un repère visuel sur la 2ème mesure.',
          date: 'Il y a 2 jours',
          approved: true
        }
      ];
    }
  } catch {
    feedbackList.value = [];
  }
}

function submitFeedback() {
  if (!feedbackText.value.trim() && !feedbackImageBase64.value) return;
  const newEntry = {
    id: Date.now().toString(),
    author: feedbackAuthor.value.trim() || 'Anonyme',
    category: feedbackCategory.value,
    text: feedbackText.value.trim(),
    image: feedbackImageBase64.value || undefined,
    // Les photos soumises nécessitent une validation/approbation
    approved: feedbackImageBase64.value ? false : true,
    date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  };
  feedbackList.value.unshift(newEntry);
  localStorage.setItem('batucada_feedbacks_v1', JSON.stringify(feedbackList.value));
  feedbackText.value = '';
  feedbackImageBase64.value = null;
  if (feedbackFileInput.value) feedbackFileInput.value.value = '';
  feedbackSuccessMsg.value = true;
  setTimeout(() => {
    feedbackSuccessMsg.value = false;
  }, 4000);
}

function deleteFeedback(id: string) {
  feedbackList.value = feedbackList.value.filter(f => f.id !== id);
  localStorage.setItem('batucada_feedbacks_v1', JSON.stringify(feedbackList.value));
}

// Modal state for New Tune Creation
const showNewTuneModal = ref(false);
const newTuneName = ref('');
const newTuneBpm = ref(100);
const newTuneSignature = ref(4);

// Modal state for Media & Notes Edition
const showMediaModal = ref(false);
const editSheetUrl = ref('');
const editVideoUrl = ref('');
const editAudioGuideUrl = ref('');
const editTuneNotes = ref('');

// Playlists
const playlists = ref<Playlist[]>([
  { id: '1', name: 'Répétition Débutants', tuneNames: ['Afoxe', 'Antitek', 'Voodoo'] },
  { id: '2', name: 'Setlist Carnaval & Manif', tuneNames: ['Bella Ciao', 'Samba Reggae', 'Bhangra', 'Custard'] }
]);
const activePlaylistId = ref<string>('1');

// Custom Batucada Branding (Logo / Emoji + Names)
const bandName = ref('Batucada Studio');
const bandSubtitle = ref('Section Percussions & Répétitions');
const logoType = ref<'emoji' | 'image'>('emoji');
const customEmoji = ref('🥁');
const customImageBase64 = ref<string | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);
const isExportingPdf = ref(false);

const emptyTuneFallback: Tune = {
  name: 'Aucun morceau',
  displayName: 'Aucun morceau',
  categories: [],
  time: 4,
  speed: 100,
  patterns: {
    'Base': {
      name: 'Base',
      displayName: 'Base',
      time: 4,
      length: 16,
      tracks: {}
    }
  }
};

const emptyPatternFallback: Pattern = {
  name: 'Base',
  displayName: 'Base',
  time: 4,
  length: 16,
  tracks: {}
};

// Computed
const currentTune = computed<Tune>(() => tunes.value[currentTuneKey.value] || Object.values(tunes.value)[0] || emptyTuneFallback);
const currentPattern = computed<Pattern>(() => currentTune.value?.patterns?.[currentPatternKey.value] || Object.values(currentTune.value?.patterns || {})[0] || emptyPatternFallback);
const patternLength = computed(() => currentPattern.value?.length || 16);
const activePlaylist = computed(() => playlists.value.find(p => p.id === activePlaylistId.value) || playlists.value[0]);

// Helper to resolve track alias (e.g. '@ls', '@re') and guarantee correct track content
function resolveTrackString(pattern: Pattern | undefined, instKey: string, expectedLen: number): string {
  if (!pattern || !pattern.tracks) return ' '.repeat(expectedLen);
  let track = pattern.tracks[instKey] || '';
  if (track.startsWith('@')) {
    const targetKey = track.slice(1, 3);
    track = pattern.tracks[targetKey] || '';
  }
  if (track.length < expectedLen) {
    track = track.padEnd(expectedLen, ' ');
  }
  return track;
}

const currentHeroInstrumentDef = computed(() => INSTRUMENTS.find(i => i.key === heroSelectedInst.value) || INSTRUMENTS[3]);
const currentHeroTrack = computed(() => resolveTrackString(currentPattern.value, heroSelectedInst.value, patternLength.value));

// Compute dynamic highway ribbon blocks taking incoming live patterns into account
const heroRibbonNodes = computed(() => {
  const curKey = currentPatternKey.value;
  const curPat = currentPattern.value;
  const curLen = patternLength.value;
  const curTrack = resolveTrackString(curPat, heroSelectedInst.value, curLen);
  const curTime = curPat?.time || currentTune.value?.time || 4;

  const nextKey = (heroLiveMode.value && incomingNextPatternKey.value) ? incomingNextPatternKey.value : curKey;
  const nextPat = currentTune.value?.patterns?.[nextKey] || curPat;
  const nextLen = nextPat?.length || curLen;
  const nextTrack = resolveTrackString(nextPat, heroSelectedInst.value, nextLen);
  const nextTime = nextPat?.time || currentTune.value?.time || 4;

  // Détermination exacte des étapes par pulsation (temps) et par mesure
  const getBeatAndMeasureDiv = (pTime: number, len: number) => {
    let stepsPerBeat = 4;
    let stepsPerMeasure = 16;
    if (pTime === 3) {
      // 6/8 ternaire : 3 pas par temps ternaire (croches), mesure à 6 pas
      stepsPerBeat = 3;
      stepsPerMeasure = 6;
    } else if (pTime === 12) {
      // 12 pas par temps : pulsation à 12 pas, mesure à 48 ou 12 pas
      stepsPerBeat = 12;
      stepsPerMeasure = 48;
    } else if (pTime === 6) {
      // time: 6 : 6 pas par temps, mesure à 24 ou 6 pas
      stepsPerBeat = 6;
      stepsPerMeasure = 24;
    } else if (pTime === 2) {
      // 2/4 : 2 pas par temps, mesure à 4 ou 8 pas
      stepsPerBeat = 2;
      stepsPerMeasure = (len >= 8 && len % 4 === 0) ? 4 : 2;
    } else if (pTime === 8) {
      // 8 pas par temps
      stepsPerBeat = 8;
      stepsPerMeasure = 32;
    } else if (len % 3 === 0 && len % 4 !== 0) {
      stepsPerBeat = 3;
      stepsPerMeasure = 6;
    }
    return { stepsPerBeat, stepsPerMeasure };
  };

  const curConfig = getBeatAndMeasureDiv(curTime, curLen);
  const nextConfig = getBeatAndMeasureDiv(nextTime, nextLen);

  const nodes: Array<{
    id: string;
    stepOffset: number;
    stroke: string;
    isFirstBeat: boolean;
    isOtherBeat: boolean;
  }> = [];

  // 1. Cycle Précédent (Current Pattern) [-curLen -> -1]
  for (let i = 0; i < curLen; i++) {
    const stroke = curTrack[i] || ' ';
    const isBeat = (i % curConfig.stepsPerBeat === 0);
    const isMeasureStart = (i % curConfig.stepsPerMeasure === 0);
    nodes.push({
      id: `prev-${i}`,
      stepOffset: i - curLen,
      stroke,
      isFirstBeat: isMeasureStart,
      isOtherBeat: isBeat && !isMeasureStart
    });
  }

  // 2. Cycle Courant [0 -> curLen - 1]
  for (let i = 0; i < curLen; i++) {
    const stroke = curTrack[i] || ' ';
    const isBeat = (i % curConfig.stepsPerBeat === 0);
    const isMeasureStart = (i % curConfig.stepsPerMeasure === 0);
    nodes.push({
      id: `curr-${i}`,
      stepOffset: i,
      stroke,
      isFirstBeat: isMeasureStart,
      isOtherBeat: isBeat && !isMeasureStart
    });
  }

  // 3. Cycle Suivant (Lookahead live) [curLen -> curLen + nextLen - 1]
  for (let i = 0; i < nextLen; i++) {
    const stroke = nextTrack[i] || ' ';
    const isBeat = (i % nextConfig.stepsPerBeat === 0);
    const isMeasureStart = (i % nextConfig.stepsPerMeasure === 0);
    nodes.push({
      id: `next-${i}`,
      stepOffset: curLen + i,
      stroke,
      isFirstBeat: isMeasureStart,
      isOtherBeat: isBeat && !isMeasureStart
    });
  }

  return nodes;
});

const filteredTunesList = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  return Object.values(tunes.value).filter(t => {
    const matchName = t.name.toLowerCase().includes(q) || (t.displayName && t.displayName.toLowerCase().includes(q));
    const matchCat = selectedCategory.value === 'all' || (t.categories && t.categories.includes(selectedCategory.value));
    return matchName && matchCat;
  });
});

// Methods
function selectTune(key: string) {
  currentTuneKey.value = key;
  const t = tunes.value[key];
  if (t) {
    const pKeys = Object.keys(t.patterns || {});
    if (pKeys.length > 0) {
      currentPatternKey.value = pKeys[0];
    }
    if (t.speed) {
      bpm.value = t.speed;
      audio.setBpm(t.speed);
    }
  }
  if (isPlaying.value) {
    restartPlayback();
  }
}

function selectPattern(pKey: string) {
  currentPatternKey.value = pKey;
  if (isPlaying.value) {
    restartPlayback();
  }
}

let countInTimer: number | null = null;

function triggerCountInAndPlay() {
  if (isCountingIn.value) {
    if (countInTimer) clearTimeout(countInTimer);
    isCountingIn.value = false;
    countInStep.value = 0;
    return;
  }

  isCountingIn.value = true;
  countInStep.value = 1;

  const timeSig = currentPattern.value?.time || currentTune.value?.time || 4;
  const isTernary = (timeSig === 3 || timeSig === 6 || timeSig === 12);
  const totalBeats = isTernary ? 2 : 4; // 2 temps en 6/8 ou 4 temps en 4/4
  const beatIntervalMs = (60.0 / bpm.value) * 1000;

  audio.playClick(audio.getCurrentTime(), true);

  const runBeat = (b: number) => {
    if (!isCountingIn.value) return;
    if (b > totalBeats) {
      isCountingIn.value = false;
      countInStep.value = 0;
      restartPlayback();
      return;
    }
    countInStep.value = b;
    audio.playClick(audio.getCurrentTime(), b === 1);
    countInTimer = window.setTimeout(() => {
      runBeat(b + 1);
    }, beatIntervalMs);
  };

  countInTimer = window.setTimeout(() => {
    runBeat(2);
  }, beatIntervalMs);
}

function togglePlay() {
  if (isCountingIn.value) {
    if (countInTimer) clearTimeout(countInTimer);
    isCountingIn.value = false;
    countInStep.value = 0;
    return;
  }

  if (isPlaying.value) {
    audio.stop();
    isPlaying.value = false;
    activeStep.value = -1;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  } else {
    if (showHeroTrainer.value && heroCountInEnabled.value) {
      triggerCountInAndPlay();
    } else {
      restartPlayback();
    }
  }
}

function startSmoothAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
  const renderLoop = () => {
    if (isPlaying.value) {
      const pLen = patternLength.value || 16;
      const timeSig = currentPattern.value?.time || currentTune.value?.time || 4;
      const rawPos = audio.getPlaybackProgress(timeSig);
      smoothPosition.value = ((rawPos % pLen) + pLen) % pLen;
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  };
  animationFrameId = requestAnimationFrame(renderLoop);
}

function cycleMetronome() {
  if (metronomeMode.value === 'off') {
    metronomeMode.value = 'measure';
  } else if (metronomeMode.value === 'measure') {
    metronomeMode.value = 'phrase';
  } else {
    metronomeMode.value = 'off';
  }
  audio.setMetronomeMode(metronomeMode.value);
}

function updateMetronomeVolume(vol: number) {
  metronomeVolume.value = vol;
  audio.setMetronomeVolume(vol);
}

function getPatternPriority(p: Pattern | undefined): number {
  if (p && typeof p.priority === 'number') {
    return p.priority;
  }
  return 1; // 1 = standard
}

function setPatternPriority(pKey: string, val: number) {
  if (currentTune.value?.patterns?.[pKey]) {
    currentTune.value.patterns[pKey].priority = val;
  }
}

function pickRandomNextPattern(excludeKey: string): string {
  const patternsObj = currentTune.value?.patterns || {};
  const entries = Object.entries(patternsObj);
  if (entries.length <= 1) return excludeKey;

  // Weighted random pool based on pattern priority
  const pool: string[] = [];
  for (const [key, p] of entries) {
    if (key === excludeKey) continue;
    const prio = getPatternPriority(p);
    if (prio > 0) {
      // Add 'prio' times to the random lottery wheel
      for (let i = 0; i < prio; i++) {
        pool.push(key);
      }
    }
  }

  if (pool.length === 0) {
    const remaining = entries.filter(([k]) => k !== excludeKey).map(([k]) => k);
    return remaining[0] || excludeKey;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function getPatternMaxRepeats(p: Pattern | undefined): number {
  if (p && typeof p.maxRepeats === 'number' && p.maxRepeats > 0) {
    return p.maxRepeats;
  }
  // Par défaut : 1x si le nom contient 'break', 'virada', 'appel', 2x sinon
  if (p && p.name && (p.name.toLowerCase().includes('break') || p.name.toLowerCase().includes('virada') || p.name.toLowerCase().includes('appel'))) {
    return 1;
  }
  return heroMaxPatternRepeats.value || 2;
}

function setPatternMaxRepeats(pKey: string, val: number) {
  if (currentTune.value?.patterns?.[pKey]) {
    currentTune.value.patterns[pKey].maxRepeats = val;
  }
}

function restartPlayback() {
  if (!currentPattern.value) return;
  isPlaying.value = true;
  audio.setBpm(bpm.value);
  audio.setLatencyCompensation(latencyMs.value);
  audio.setMetronomeMode(metronomeMode.value);
  audio.setMetronomeVolume(metronomeVolume.value);

  const timeSig = currentPattern.value.time || currentTune.value.time || 4;

  audio.start(
    currentPattern.value.tracks,
    currentPattern.value.length || 16,
    currentPattern.value.volumeHack,
    (step) => {
      activeStep.value = step;

      // When in Live Mode, prepare and announce next pattern in advance
      if (heroLiveMode.value && currentTune.value.patterns) {
        const pLen = currentPattern.value.length || 16;
        const currentLimit = getPatternMaxRepeats(currentPattern.value);

        // Toujours garantir que le prochain pattern est connu à l'avance pour le ruban
        if (!incomingNextPatternKey.value) {
          incomingNextPatternKey.value = pickRandomNextPattern(currentPatternKey.value);
        }

        // Annonce visuelle dynamique :
        // Si le pattern ne se joue qu'une fois (1 répétition), afficher le bandeau pendant toute la 2ème moitié du motif (ou au moins 1 mesure)
        // Sinon, afficher le bandeau dès la dernière répétition (ex: repeat >= 1) ou pendant la dernière mesure
        const measureLength = (timeSig === 3 || pLen % 3 === 0 && pLen % 4 !== 0) ? 12 : 16;
        const announceWindow = (currentLimit === 1) ? Math.max(Math.floor(pLen / 2), Math.min(measureLength, pLen)) : Math.min(measureLength, pLen);

        if (currentLivePatternRepeatCount.value >= currentLimit - 1) {
          isNextPatternImminent.value = step >= (pLen - announceWindow);
        } else {
          isNextPatternImminent.value = false;
        }
      } else {
        incomingNextPatternKey.value = null;
        isNextPatternImminent.value = false;
      }
    },
    timeSig,
    () => {
      // If Live Mode is active in Groovy Beat, seamlessly switch pattern at loop end
      if (heroLiveMode.value && currentTune.value.patterns) {
        const patternKeys = Object.keys(currentTune.value.patterns);
        if (patternKeys.length > 1) {
          currentLivePatternRepeatCount.value++;
          const currentLimit = getPatternMaxRepeats(currentPattern.value);
          if (currentLivePatternRepeatCount.value >= currentLimit) {
            const nextKey = incomingNextPatternKey.value || pickRandomNextPattern(currentPatternKey.value);
            currentPatternKey.value = nextKey;
            currentLivePatternRepeatCount.value = 0;
            // Préparer tout de suite le motif d'après pour que le ruban lookahead reste toujours alimenté en amont
            incomingNextPatternKey.value = pickRandomNextPattern(nextKey);
            isNextPatternImminent.value = false;

            // Trigger subtle & brief "GO !" Splash animation
            showGoSplash.value = true;
            if (goSplashTimer) clearTimeout(goSplashTimer);
            goSplashTimer = window.setTimeout(() => {
              showGoSplash.value = false;
            }, 600);

            const nextPat = currentTune.value.patterns[nextKey];
            if (nextPat) {
              return {
                tracks: nextPat.tracks,
                length: nextPat.length || 16,
                timeSignature: nextPat.time || currentTune.value.time || 4,
                volumeHack: nextPat.volumeHack
              };
            }
          }
        }
      }
    }
  );

  startSmoothAnimation();
}

function setBpmValue(val: number) {
  bpm.value = Math.max(40, Math.min(240, val));
  audio.setBpm(bpm.value);
}

function toggleSolo(instKey: string) {
  if (soloInstrument.value === instKey) {
    soloInstrument.value = null;
    audio.setSolo(null);
  } else {
    soloInstrument.value = instKey;
    audio.setSolo(instKey);
  }
}

function toggleMute(instKey: string) {
  audio.toggleMute(instKey);
}

function resetMix() {
  soloInstrument.value = null;
  audio.setSolo(null);
  INSTRUMENTS.forEach(i => {
    if (audio.isMuted(i.key)) audio.toggleMute(i.key);
    audio.setVolume(i.key, 1.0);
  });
}

function cycleCell(instKey: string, stepIndex: number) {
  if (currentTab.value !== 'studio') {
    const track = currentPattern.value.tracks[instKey] || '';
    const stroke = track[stepIndex] || 'X';
    audio.playStroke(instKey, stroke);
    return;
  }

  const instDef = INSTRUMENTS.find(i => i.key === instKey);
  if (!instDef) return;

  const allowedStrokes = [' ', ...instDef.strokes];
  const trackStr = currentPattern.value.tracks[instKey] || ' '.repeat(patternLength.value);
  const curStroke = trackStr[stepIndex] || ' ';
  const nextIdx = (allowedStrokes.indexOf(curStroke) + 1) % allowedStrokes.length;
  const newStroke = allowedStrokes[nextIdx];

  const chars = trackStr.split('');
  chars[stepIndex] = newStroke;
  currentPattern.value.tracks[instKey] = chars.join('');

  if (newStroke !== ' ') {
    audio.playStroke(instKey, newStroke);
  }
}

function changeHeroInstrument(newInstKey: string) {
  heroSelectedInst.value = newInstKey;
  soloInstrument.value = newInstKey;
  // Automatically ensure the newly selected instrument is unmuted / ON
  if (audio.isMuted(newInstKey)) {
    audio.toggleMute(newInstKey);
  }
}

function triggerHeroSolo() {
  // Isolate strictly to the current instrument
  INSTRUMENTS.forEach(i => {
    if (i.key === heroSelectedInst.value) {
      if (audio.isMuted(i.key)) audio.toggleMute(i.key);
    } else {
      if (!audio.isMuted(i.key)) audio.toggleMute(i.key);
    }
  });
}

function switchModeTab(targetTab: 'musician' | 'studio' | 'mixer' | 'playlists' | 'game') {
  currentTab.value = targetTab;
  if (targetTab === 'studio') {
    triggerModeFlash('MODE STUDIO', '#f59e0b', 'zap');
  } else if (targetTab === 'musician') {
    triggerModeFlash('MODE ÉCOUTE', '#14b8a6', 'headphones');
  } else if (targetTab === 'game') {
    triggerModeFlash('DÉFI DU JOUR', '#eab308', 'trophy');
  } else if (targetTab === 'playlists') {
    triggerModeFlash('PLAYLISTS', '#8b5cf6', 'playlists');
  } else if (targetTab === 'mixer') {
    triggerModeFlash('MIXEUR & OPTIONS', '#06b6d4', 'mixer');
  }
}

function openHeroTrainer(instKey?: string) {
  const targetInst = instKey || heroSelectedInst.value || 're';
  changeHeroInstrument(targetInst);
  triggerHeroSolo();
  heroAccompanimentClickState.value = 'muted';

  showHeroTrainer.value = true;
  triggerModeFlash('GROOVY BEAT', '#10b981', 'groovy');
  if (!isPlaying.value) {
    togglePlay();
  }
}

function closeHeroTrainer(suppressFlash: boolean = false) {
  showHeroTrainer.value = false;
  heroFocusMode.value = false;
  heroLiveMode.value = false;
  incomingNextPatternKey.value = null;
  if (isPlaying.value) {
    togglePlay();
  }
  if (suppressFlash !== true) {
    if (currentTab.value === 'studio') {
      triggerModeFlash('MODE STUDIO', '#f59e0b', 'zap');
    } else if (currentTab.value === 'musician') {
      triggerModeFlash('MODE ÉCOUTE', '#14b8a6', 'headphones');
    }
  }
}

function toggleFocusMode() {
  if (heroFocusMode.value) {
    exitFocusMode();
  } else {
    enterFocusMode();
  }
}

function enterFocusMode() {
  heroFocusMode.value = true;
  triggerModeFlash('MODE FOCUS', '#38bdf8', 'focus');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      isFullscreen.value = true;
    }).catch(() => {});
  }
}

function exitFocusMode() {
  heroFocusMode.value = false;
  triggerModeFlash('GROOVY BEAT', '#10b981', 'groovy');
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

// Fullscreen Toggle
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      isFullscreen.value = true;
    }).catch(() => {});
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false;
    }).catch(() => {});
  }
}

// Dark / Light Mode Toggle
function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
}

// Tap Tempo
let tapTimes: number[] = [];
function tapTempo() {
  const now = performance.now();
  tapTimes.push(now);
  if (tapTimes.length > 4) tapTimes.shift();
  if (tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    setBpmValue(Math.round(60000 / avg));
  }
}

// Custom Logo Upload
function handleLogoUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      customImageBase64.value = e.target?.result as string;
      logoType.value = 'image';
      saveBrandingToStorage();
    };
    reader.readAsDataURL(file);
  }
}

function selectPresetEmoji(emoji: string) {
  customEmoji.value = emoji;
  logoType.value = 'emoji';
  saveBrandingToStorage();
}

function saveBrandingToStorage() {
  localStorage.setItem('batucada_branding_config', JSON.stringify({
    bandName: bandName.value,
    bandSubtitle: bandSubtitle.value,
    logoType: logoType.value,
    customEmoji: customEmoji.value,
    customImageBase64: customImageBase64.value,
    isLowPerformanceMode: isLowPerformanceMode.value
  }));
}

// GENERATE & EXPORT PDF SHEET
async function exportTuneToPdf() {
  isExportingPdf.value = true;
  try {
    const tune = currentTune.value;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(15, 20, 28);
    doc.rect(0, 0, pageWidth, 25, 'F');

    doc.setTextColor(20, 184, 166);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(tune.displayName || tune.name, 15, 12);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${bandName.value} • Tempo: ${tune.speed || 100} BPM • Mesure: ${tune.time || 4}/4`, 15, 19);

    if (tune.notes) {
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(9);
      doc.text(`Notes : ${tune.notes}`, 15, 32);
    }

    let yOffset = tune.notes ? 38 : 30;

    const patternEntries = Object.entries(tune.patterns || {});
    for (const [pName, pObj] of patternEntries) {
      if (yOffset > pageHeight - 45) {
        doc.addPage();
        yOffset = 20;
      }

      doc.setFillColor(241, 245, 249);
      doc.rect(15, yOffset, pageWidth - 30, 7, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`[Break / Pattern] : ${pObj.displayName || pName} (${pObj.length || 16} temps)`, 18, yOffset + 5);

      yOffset += 10;

      const pLen = pObj.length || 16;
      const cellWidth = Math.min(10, (pageWidth - 65) / pLen);

      INSTRUMENTS.forEach(inst => {
        const track = pObj.tracks[inst.key] || '';
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(inst.shortName, 15, yOffset + 4.5);

        for (let s = 0; s < pLen; s++) {
          const stroke = track[s] || ' ';
          const xPos = 45 + s * cellWidth;

          if (s % 4 === 0) {
            doc.setFillColor(226, 232, 240);
          } else {
            doc.setFillColor(248, 250, 252);
          }
          doc.rect(xPos, yOffset, cellWidth, 6, 'FD');

          if (stroke !== ' ') {
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(stroke, xPos + (cellWidth / 2) - 1.5, yOffset + 4.5);
          }
        }
        yOffset += 7;
      });

      yOffset += 5;
    }

    const filename = `Partition_${(tune.displayName || tune.name).replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
  } catch {
    alert("Erreur lors de la génération de la partition PDF.");
  } finally {
    isExportingPdf.value = false;
  }
}

// Create New Tune
function openCreateTuneModal() {
  newTuneName.value = '';
  newTuneBpm.value = 100;
  newTuneSignature.value = 4;
  showNewTuneModal.value = true;
}

function confirmCreateNewTune() {
  if (!newTuneName.value.trim()) return;
  const rawKey = newTuneName.value.trim();
  const emptyTracks: Record<string, string> = {};
  INSTRUMENTS.forEach(i => {
    emptyTracks[i.key] = ' '.repeat(16);
  });

  const newTuneObj: Tune = {
    name: rawKey,
    displayName: rawKey,
    categories: ['custom', 'new'],
    speed: newTuneBpm.value,
    time: newTuneSignature.value,
    patterns: {
      'Base': {
        name: 'Base',
        displayName: 'Rythme de Base',
        time: newTuneSignature.value,
        length: 16,
        tracks: emptyTracks
      },
      'Break 1': {
        name: 'Break 1',
        displayName: 'Break 1',
        time: newTuneSignature.value,
        length: 16,
        tracks: { ...emptyTracks }
      }
    }
  };

  tunes.value[rawKey] = newTuneObj;
  currentTuneKey.value = rawKey;
  currentPatternKey.value = 'Base';
  bpm.value = newTuneBpm.value;
  showNewTuneModal.value = false;
  currentTab.value = 'studio';
}

// Studio Pattern Settings: Length, Time Signature & Upbeat (Levée)
function updateCurrentPatternLength(newLength: number) {
  if (!currentPattern.value) return;
  const targetLen = Math.max(1, Math.min(128, newLength));
  currentPattern.value.length = targetLen;
  
  // Adjust string lengths for all tracks
  for (const instKey of Object.keys(currentPattern.value.tracks)) {
    let trackStr = currentPattern.value.tracks[instKey] || '';
    if (trackStr.length < targetLen) {
      trackStr = trackStr.padEnd(targetLen, ' ');
    } else if (trackStr.length > targetLen) {
      trackStr = trackStr.slice(0, targetLen);
    }
    currentPattern.value.tracks[instKey] = trackStr;
  }
  saveTunesToStorage();
  if (isPlaying.value) restartPlayback();
}

function updateCurrentPatternTimeSignature(timeSig: number) {
  if (!currentPattern.value) return;
  currentPattern.value.time = timeSig;
  saveTunesToStorage();
  if (isPlaying.value) restartPlayback();
}

function updateCurrentPatternUpbeat(upbeatVal: number) {
  if (!currentPattern.value) return;
  currentPattern.value.upbeat = Math.max(0, Math.min(48, upbeatVal));
  saveTunesToStorage();
  if (isPlaying.value) restartPlayback();
}

function clearCurrentPatternStrokes() {
  if (!currentPattern.value) return;
  if (confirm("Voulez-vous effacer toutes les notes de ce break/pattern ?")) {
    const len = patternLength.value || 16;
    for (const instKey of Object.keys(currentPattern.value.tracks)) {
      currentPattern.value.tracks[instKey] = ' '.repeat(len);
    }
    saveTunesToStorage();
  }
}
function addNewBreakToCurrentTune() {
  const name = prompt('Nom du nouveau break (ex: Break 2, Solo, Intro) :');
  if (name && name.trim()) {
    const bName = name.trim();
    const emptyTracks: Record<string, string> = {};
    INSTRUMENTS.forEach(i => {
      emptyTracks[i.key] = ' '.repeat(patternLength.value || 16);
    });
    currentTune.value.patterns[bName] = {
      name: bName,
      displayName: bName,
      time: currentTune.value.time || 4,
      length: patternLength.value || 16,
      tracks: emptyTracks
    };
    currentPatternKey.value = bName;
  }
}

function deleteCurrentPattern() {
  const pKeys = Object.keys(currentTune.value.patterns || {});
  if (pKeys.length <= 1) {
    alert('Impossible de supprimer le dernier break du morceau.');
    return;
  }
  if (confirm(`Confirmez-vous la suppression du break "${currentPatternKey.value}" ?`)) {
    delete currentTune.value.patterns[currentPatternKey.value];
    const remaining = Object.keys(currentTune.value.patterns);
    currentPatternKey.value = remaining[0];
  }
}

function duplicateCurrentPattern() {
  const name = prompt('Nom pour la copie du break :', `${currentPatternKey.value} (Copie)`);
  if (name && name.trim()) {
    const bName = name.trim();
    const tracksCopy = JSON.parse(JSON.stringify(currentPattern.value.tracks));
    currentTune.value.patterns[bName] = {
      name: bName,
      displayName: bName,
      time: currentPattern.value.time,
      length: currentPattern.value.length,
      tracks: tracksCopy
    };
    currentPatternKey.value = bName;
  }
}

// Media & Notes Editor
function openMediaModal() {
  editSheetUrl.value = currentTune.value.sheet || '';
  editVideoUrl.value = currentTune.value.video || '';
  editAudioGuideUrl.value = currentTune.value.audioGuide || '';
  editTuneNotes.value = currentTune.value.notes || '';
  showMediaModal.value = true;
}

function saveMediaSettings() {
  currentTune.value.sheet = editSheetUrl.value.trim() || null;
  currentTune.value.video = editVideoUrl.value.trim() || null;
  currentTune.value.audioGuide = editAudioGuideUrl.value.trim() || null;
  currentTune.value.notes = editTuneNotes.value.trim() || undefined;
  showMediaModal.value = false;
}

// State for Export / Import / QR Code Modals
const showExportImportModal = ref(false);
const exportImportTab = ref<'export' | 'import' | 'qrcode' | 'scan' | 'reset'>('export');
const qrcodeDataUrl = ref<string>('');
const shareTuneTarget = ref<Tune | null>(null);
const importJsonText = ref<string>('');
const importUrlText = ref<string>('');
const importFileRef = ref<HTMLInputElement | null>(null);
let html5QrCodeScanner: Html5Qrcode | null = null;
const isScanningQr = ref(false);
const scanErrorMsg = ref<string | null>(null);

function openTuneQrShare(tune: Tune) {
  shareTuneTarget.value = tune;
  exportImportTab.value = 'qrcode';
  showExportImportModal.value = true;
  generateSpecificTuneQrCode(tune);
}

// Generate QR Code for a specific Tune
async function generateSpecificTuneQrCode(tune: Tune) {
  try {
    const shareObj = {
      name: tune.name,
      displayName: tune.displayName,
      categories: tune.categories || ['custom'],
      speed: tune.speed || 100,
      time: tune.time || 4,
      patterns: tune.patterns
    };
    const jsonCompact = JSON.stringify(shareObj);
    const shareUrl = `${window.location.origin}${window.location.pathname}?tuneData=${encodeURIComponent(jsonCompact)}`;
    if (shareUrl.length < 2400) {
      qrcodeDataUrl.value = await QRCode.toDataURL(shareUrl, { width: 320, margin: 2, color: { dark: '#14b8a6', light: '#0f172a' } });
    } else {
      qrcodeDataUrl.value = await QRCode.toDataURL(jsonCompact.slice(0, 1200), { width: 320, margin: 2 });
    }
  } catch (err) {
    console.error('Erreur génération QR Code:', err);
  }
}

function startQrCameraScanner() {
  scanErrorMsg.value = null;
  isScanningQr.value = true;
  setTimeout(async () => {
    try {
      if (html5QrCodeScanner) {
        await html5QrCodeScanner.stop().catch(() => {});
      }
      html5QrCodeScanner = new Html5Qrcode('qr-reader-video-box');
      await html5QrCodeScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          stopQrCameraScanner();
          handleScannedQrResult(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.error('Erreur caméra QR:', err);
      scanErrorMsg.value = "Impossible d'accéder à la caméra. Vérifiez les autorisations de votre navigateur.";
      isScanningQr.value = false;
    }
  }, 200);
}

function stopQrCameraScanner() {
  if (html5QrCodeScanner) {
    html5QrCodeScanner.stop().then(() => {
      html5QrCodeScanner?.clear();
      html5QrCodeScanner = null;
    }).catch(() => {});
  }
  isScanningQr.value = false;
}

function handleScannedQrResult(result: string) {
  try {
    let rawPayload = result;
    if (result.includes('tuneData=')) {
      const parts = result.split('tuneData=');
      rawPayload = decodeURIComponent(parts[1]);
    }
    const parsed = JSON.parse(rawPayload);
    applyImportData(parsed);
    alert(`Morceau "${parsed.displayName || parsed.name || 'Importé'}" flashé et importé avec succès !`);
    showExportImportModal.value = false;
  } catch (err) {
    alert("Le QR code scanné n'est pas un format de morceau valide.");
  }
}

function saveTunesToStorage(pushToServer = true) {
  localStorage.setItem('batucada_custom_tunes_v1', JSON.stringify(tunes.value));
  if (pushToServer && isMaestro.value && maestroSessionPin.value) {
    syncTunesToServer();
  }
}

function deleteCurrentTune() {
  if (!isMaestro.value) {
    alert("Le Mode Maestro est requis pour supprimer un morceau du répertoire.");
    return;
  }
  const tuneKeys = Object.keys(tunes.value);
  if (tuneKeys.length <= 1) {
    alert("Impossible de supprimer le dernier morceau de la bibliothèque.");
    return;
  }

  const curName = currentTune.value.displayName || currentTune.value.name;
  if (confirm(`🗑️ Confirmez-vous la suppression définitive du morceau "${curName}" pour TOUS les utilisateurs ?`)) {
    const nameToDelete = currentTuneKey.value;
    delete tunes.value[nameToDelete];
    const remaining = Object.keys(tunes.value);
    currentTuneKey.value = remaining[0];
    currentPatternKey.value = Object.keys(tunes.value[currentTuneKey.value].patterns || {})[0] || 'Tune';
    saveTunesToStorage(true);
    
    // Appel direct suppression API serveur
    if (maestroSessionPin.value) {
      fetch(`/api/maestro/delete-tune/${encodeURIComponent(nameToDelete)}`, {
        method: 'DELETE',
        headers: { 'X-Maestro-Pin': maestroSessionPin.value }
      }).catch(e => console.error(e));
    }
    alert(`Le morceau "${curName}" a été supprimé avec succès.`);
  }
}

function savePlaylistsToStorage() {
  localStorage.setItem('batucada_custom_playlists_v1', JSON.stringify(playlists.value));
}

function loadSavedData() {
  try {
    const savedTunes = localStorage.getItem('batucada_custom_tunes_v1');
    if (savedTunes) {
      tunes.value = JSON.parse(savedTunes);
    }
    const savedPlaylists = localStorage.getItem('batucada_custom_playlists_v1');
    if (savedPlaylists) {
      playlists.value = JSON.parse(savedPlaylists);
    }
  } catch (err) {
    console.error('Erreur chargement localStorage:', err);
  }
}

// Rename Tune
function renameCurrentTune() {
  const curName = currentTune.value.displayName || currentTune.value.name;
  const newName = prompt('Nouveau nom pour ce morceau :', curName);
  if (newName && newName.trim() && newName.trim() !== curName) {
    currentTune.value.displayName = newName.trim();
    saveTunesToStorage();
  }
}

// Rename Pattern
function renameCurrentPattern() {
  const curPat = currentPattern.value;
  const curDisplayName = curPat.displayName || currentPatternKey.value;
  const newName = prompt('Nouveau nom pour ce break/pattern :', curDisplayName);
  if (newName && newName.trim() && newName.trim() !== curDisplayName) {
    curPat.displayName = newName.trim();
    saveTunesToStorage();
  }
}

// Export All Tunes & Playlists to JSON File
function downloadSingleTune(tune: Tune) {
  const blob = new Blob([JSON.stringify(tune, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Morceau_${tune.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadExportFile() {
  const exportPayload = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    tunes: tunes.value,
    playlists: playlists.value
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Batucada_Studio_Sauvegarde_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Generate QR Code for sharing currently selected Tune or full playlist
async function generateTuneQrCode() {
  try {
    const shareObj = {
      t: currentTune.value.name,
      d: currentTune.value.displayName,
      p: currentTune.value.patterns,
      s: currentTune.value.speed,
      tm: currentTune.value.time
    };
    const jsonCompact = JSON.stringify(shareObj);
    // Build share URL or standalone payload
    const shareUrl = `${window.location.origin}${window.location.pathname}?tuneData=${encodeURIComponent(jsonCompact)}`;
    if (shareUrl.length < 2400) {
      qrcodeDataUrl.value = await QRCode.toDataURL(shareUrl, { width: 300, margin: 2, color: { dark: '#14b8a6', light: '#0f172a' } });
    } else {
      qrcodeDataUrl.value = await QRCode.toDataURL(jsonCompact.slice(0, 1200), { width: 300, margin: 2 });
    }
  } catch (err) {
    console.error('Erreur génération QR Code:', err);
  }
}

// Import JSON file
function handleImportFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        applyImportData(parsed);
        alert('Morceaux et playlists importés avec succès !');
        showExportImportModal.value = false;
      } catch {
        alert('Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  }
}

// Import from Raw JSON Text
function handleImportJsonText() {
  if (!importJsonText.value.trim()) return;
  try {
    const parsed = JSON.parse(importJsonText.value.trim());
    applyImportData(parsed);
    alert('Données importées avec succès !');
    importJsonText.value = '';
    showExportImportModal.value = false;
  } catch {
    alert('Format JSON invalide.');
  }
}

// Import from URL
async function handleImportUrl() {
  if (!importUrlText.value.trim()) return;
  try {
    const res = await fetch(importUrlText.value.trim());
    if (!res.ok) throw new Error('Erreur HTTP');
    const parsed = await res.json();
    applyImportData(parsed);
    alert('Morceaux téléchargés et importés avec succès !');
    importUrlText.value = '';
    showExportImportModal.value = false;
  } catch {
    alert('Impossible de récupérer les données depuis cette URL.');
  }
}

function applyImportData(data: any) {
  if (data.tunes) {
    tunes.value = { ...tunes.value, ...data.tunes };
  } else if (data.patterns && data.name) {
    // Single tune import
    tunes.value[data.name] = data;
    currentTuneKey.value = data.name;
  }
  if (data.playlists && Array.isArray(data.playlists)) {
    playlists.value = data.playlists;
  }
  saveTunesToStorage();
  savePlaylistsToStorage();
}

// Reset functions
function resetToDefaultTunes() {
  if (confirm("Voulez-vous rétablir le répertoire d'origine de Batucada Studio (52 morceaux standards) ?")) {
    tunes.value = JSON.parse(JSON.stringify(rawTunes));
    saveTunesToStorage();
    currentTuneKey.value = Object.keys(tunes.value)[0] || 'Afoxe';
    currentPatternKey.value = Object.keys(currentTune.value.patterns)[0] || 'Tune';
    alert('Répertoire par défaut restauré avec succès !');
    showExportImportModal.value = false;
  }
}

function clearAllTunes() {
  if (confirm("⚠️ ATTENTION : Voulez-vous vraiment effacer TOUS les morceaux du répertoire ? Cette action est irréversible.")) {
    tunes.value = {};
    saveTunesToStorage();
    showExportImportModal.value = false;
    alert('Tous les morceaux ont été supprimés.');
  }
}

function createPlaylist() {
  const name = prompt('Nom de la nouvelle playlist :');
  if (name && name.trim()) {
    const newId = Date.now().toString();
    playlists.value.push({
      id: newId,
      name: name.trim(),
      tuneNames: [currentTuneKey.value]
    });
    activePlaylistId.value = newId;
  }
}

function removeTuneFromActivePlaylist(index: number) {
  if (activePlaylist.value) {
    activePlaylist.value.tuneNames.splice(index, 1);
  }
}

function addCurrentTuneToPlaylist() {
  if (activePlaylist.value && !activePlaylist.value.tuneNames.includes(currentTuneKey.value)) {
    activePlaylist.value.tuneNames.push(currentTuneKey.value);
  }
}

// Keyboard Shortcuts Listener
function handleGlobalKeydown(e: KeyboardEvent) {
  // Démarre la partie si en attente de clic en plein écran
  if (isGameFullScreen.value && isGameWaitingToStart.value) {
    if (e.code === 'Space' || e.code === 'Enter' || e.key === 'f' || e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      confirmStartGame();
      return;
    }
  }

  // Frappe dans le mode jeu (Espace, Entrée, F, J, K, etc.)
  if (isGamePlaying.value) {
    if (e.code === 'Space' || e.code === 'Enter' || e.key === 'f' || e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      registerPlayerHit();
      return;
    }
  }

  // Ignore shortcuts when typing inside an input or textarea
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

  // Escape : Exit Focus Mode, Live Mode, Game Mode or Close Groovy Beat & Stop Playback
  if (e.key === 'Escape' || e.code === 'Escape') {
    e.preventDefault();
    if (isGameFullScreen.value) {
      exitGameFullScreen();
      return;
    }
    if (showKeyboardHelpModal.value) {
      showKeyboardHelpModal.value = false;
      return;
    }
    if (showChangelogModal.value) {
      showChangelogModal.value = false;
      return;
    }
    if (showGuideModal.value) {
      showGuideModal.value = false;
      return;
    }
    if (showFeedbackModal.value) {
      showFeedbackModal.value = false;
      return;
    }
    if (showNewTuneModal.value) {
      showNewTuneModal.value = false;
      return;
    }
    if (heroFocusMode.value) {
      exitFocusMode();
      return;
    }
    if (heroLiveMode.value) {
      heroLiveMode.value = false;
      incomingNextPatternKey.value = null;
      if (isPlaying.value) togglePlay();
      return;
    }
    if (showHeroTrainer.value) {
      closeHeroTrainer();
      return;
    }
    if (isPlaying.value) {
      togglePlay();
      return;
    }
  }

  // Play / Stop : Space
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
    return;
  }

  // Metronome Cycle : Key M
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    cycleMetronome();
    return;
  }

  // Mode Switch (Écoute / Studio) : Key S
  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    switchModeTab(currentTab.value === 'studio' ? 'musician' : 'studio');
    return;
  }

  // Groovy Beat Mode (Toggle / Open / Close) : Key G
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    if (showHeroTrainer.value) {
      closeHeroTrainer();
    } else {
      openHeroTrainer();
    }
    return;
  }

  // Live Mode in Groovy Beat : Key L
  if (e.key === 'l' || e.key === 'L') {
    e.preventDefault();
    heroLiveMode.value = !heroLiveMode.value;
    return;
  }

  // Focus Mode in Groovy Beat : Key F
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    if (showHeroTrainer.value) {
      if (heroFocusMode.value) exitFocusMode();
      else enterFocusMode();
    }
    return;
  }

  // Fullscreen : Key F11 or Alt+F
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  // TAP Tempo : Key T
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    tapTempo();
    return;
  }

  // Tempo Up / Down : ArrowUp / ArrowDown or +/-
  if (e.key === 'ArrowUp' || e.key === '+') {
    e.preventDefault();
    setBpmValue(bpm.value + (e.shiftKey ? 10 : 5));
    return;
  }
  if (e.key === 'ArrowDown' || e.key === '-') {
    e.preventDefault();
    setBpmValue(bpm.value - (e.shiftKey ? 10 : 5));
    return;
  }

  // Next / Prev Pattern : ArrowRight / ArrowLeft
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    const pKeys = Object.keys(currentTune.value.patterns || {});
    const curIdx = pKeys.indexOf(currentPatternKey.value);
    if (curIdx >= 0 && curIdx < pKeys.length - 1) {
      selectPattern(pKeys[curIdx + 1]);
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const pKeys = Object.keys(currentTune.value.patterns || {});
    const curIdx = pKeys.indexOf(currentPatternKey.value);
    if (curIdx > 0) {
      selectPattern(pKeys[curIdx - 1]);
    }
    return;
  }

  // Help Modal Shortcuts : ? / H
  if (e.key === '?' || e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    showKeyboardHelpModal.value = !showKeyboardHelpModal.value;
    return;
  }
}

onMounted(() => {
  loadSavedData();
  fetchTunesFromServer(); // Tente de récupérer la bibliothèque partagée TrueNAS
  fetchScoresFromServer(); // Récupère le Hall of Fame et scores du jour
  window.addEventListener('keydown', handleGlobalKeydown);
  selectTune(Object.keys(tunes.value)[0] || 'Afoxe');
  audio.preloadAllStrokes();

  // Unlock AudioContext on first user interaction anywhere
  const unlockAudio = () => {
    audio.init();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        isFullscreen.value = true;
      }).catch(() => {});
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
  
  const saved = localStorage.getItem('batucada_branding_config');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      if (cfg.bandName) bandName.value = cfg.bandName;
      if (cfg.bandSubtitle) bandSubtitle.value = cfg.bandSubtitle;
      if (cfg.logoType) logoType.value = cfg.logoType;
      if (cfg.customEmoji) customEmoji.value = cfg.customEmoji;
      if (cfg.customImageBase64) customImageBase64.value = cfg.customImageBase64;
      if (typeof cfg.isLowPerformanceMode === 'boolean') isLowPerformanceMode.value = cfg.isLowPerformanceMode;
    } catch {}
  }

  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement;
  });

  // Automatically show tutorial tour on first visit
  const hasSeenTour = localStorage.getItem('batucada_tooltip_tour_seen_v1');
  if (!hasSeenTour) {
    showTooltipTour.value = true;
  }
});
</script>

<template>
        <!-- Main App Shell with Optional Low Performance Mode -->
  <div :class="[
    'app-shell',
    isDarkMode ? 'theme-dark' : 'theme-light',
    `mode-theme-${currentTab}`,
    showHeroTrainer ? 'mode-theme-groovy' : '',
    isLowPerformanceMode ? 'low-perf-active' : ''
  ]">
    <!-- Top Header -->
    <header class="navbar-header">
      <div class="navbar-inner-container">
        <div class="brand-area">
          <!-- Customizable Avatar (Image or Animated Glowing Emoji) -->
          <div class="brand-avatar-box">
            <img v-if="logoType === 'image' && customImageBase64" :src="customImageBase64" alt="Logo" class="brand-logo-img" />
            <span v-else class="brand-emoji-glow">{{ customEmoji }}</span>
          </div>

          <div class="brand-text-block">
            <h1 class="brand-title">{{ bandName }}</h1>
            <p class="brand-sub">{{ bandSubtitle }}</p>
          </div>
        </div>

        <!-- Controls Right: Quick Tools & Navigation Modes -->
        <div class="header-right-group">
          <!-- Main 4-Mode Nav Cluster (Visual Circular/Capsule Buttons) -->
          <div class="header-modes-nav">
            <!-- Mode 0: Groovy Beat Button integrated in the mode cluster -->
            <button
              class="mode-tab-btn btn-tab-groovy"
              title="Lancer l'entraînement interactif Groovy Beat"
              @click="openHeroTrainer()"
            >
              <Sparkles :size="15" />
              <span class="mode-nav-label">Groovy</span>
            </button>

            <!-- Mode 1: Écoute -->
            <button
              :class="['mode-tab-btn', 'btn-tab-musician', currentTab === 'musician' ? 'active' : '']"
              title="Mode Écoute & Apprentissage"
              @click="switchModeTab('musician')"
            >
              <Headphones :size="15" />
              <span class="mode-nav-label">Écoute</span>
            </button>

            <!-- Mode 2: Studio -->
            <button
              :class="['mode-tab-btn', 'btn-tab-studio', currentTab === 'studio' ? 'active' : '']"
              title="Mode Studio (Éditeur rythmique)"
              @click="switchModeTab('studio')"
            >
              <Zap :size="15" :class="{ 'mode-icon-spin': currentTab === 'studio' }" />
              <span class="mode-nav-label">Studio</span>
            </button>

            <!-- Mode 3: Défi du Jour & Game -->
            <button
              :class="['mode-tab-btn', 'btn-tab-game', currentTab === 'game' ? 'active' : '']"
              title="Défi Rythmique du Jour & Hall of Fame"
              @click="switchModeTab('game')"
            >
              <Trophy :size="15" />
              <span class="mode-nav-label">Défi</span>
            </button>
          </div>

          <!-- Maestro Mode Button -->
          <button
            :class="['maestro-badge-btn', isMaestro ? 'active' : '']"
            :title="isMaestro ? 'Mode Maestro Actif (Cliquez pour verrouiller ou configurer)' : 'Activer le Mode Maestro (Code PIN)'"
            @click="showMaestroModal = true"
          >
            <Crown :size="14" class="maestro-crown-icon" />
            <span v-if="isMaestro" class="maestro-label">Maestro</span>
            <Lock v-if="!isMaestro" :size="11" class="text-muted opacity-60" />
            <ShieldCheck v-else :size="12" class="text-success animate-pulse" />
          </button>

          <div class="quick-header-tools">
            <button class="tool-btn" :title="isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'" @click="toggleFullscreen">
              <Minimize v-if="isFullscreen" :size="15" />
              <Maximize v-else :size="15" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="main-body">

      <!-- TAB 1: MUSICIEN & STUDIO -->
      <div v-if="currentTab === 'musician' || currentTab === 'studio'" class="layout-grid">
        
        <!-- Left: Tunes list & Filters -->
        <aside class="sidebar-card">
          <!-- Button Nouveau Morceau only visible in Studio mode -->
          <button v-if="currentTab === 'studio'" class="btn-create-tune" @click="openCreateTuneModal">
            <Plus :size="16" />
            <span>Nouveau Morceau</span>
          </button>

          <div class="search-box">
            <Search :size="15" class="text-muted" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Rechercher..."
              class="search-input"
            />
          </div>

          <!-- Category filter tags -->
          <div class="chips-scroll">
            <button
              v-for="cat in [
                { id: 'all', label: 'Tous' },
                { id: 'custom', label: 'Mes Créations' },
                { id: 'common', label: 'Standards' },
                { id: 'onesurdo', label: '1 Surdo' },
                { id: 'easy', label: 'Facile' },
                { id: 'medium', label: 'Moyen' },
                { id: 'tricky', label: 'Technique' }
              ]"
              :key="cat.id"
              :class="['chip-btn', selectedCategory === cat.id ? 'active' : '']"
              @click="selectedCategory = cat.id"
            >
              {{ cat.label }}
            </button>
          </div>

          <!-- Tunes Count and List -->
          <div class="tunes-list-header d-flex justify-content-between align-items-center">
            <span class="count-badge">{{ filteredTunesList.length }} MORCEAUX</span>
            <button
              class="tune-import-export-btn"
              title="Importer / Exporter des morceaux ou réinitialiser"
              @click="showExportImportModal = true; exportImportTab = 'export'"
            >
              <Share2 :size="12" />
              <span>Gérer</span>
            </button>
          </div>

          <div class="tunes-scroll-area">
            <div
              v-for="t in filteredTunesList"
              :key="t.name"
              :class="['tune-item-card', t.name === currentTuneKey ? 'selected' : '']"
              @click="selectTune(t.name)"
            >
              <div class="tune-info-box">
                <span class="tune-name">{{ t.displayName || t.name }}</span>
                <div class="tune-cat-row">
                  <span v-for="c in t.categories" :key="c" class="micro-badge">{{ c }}</span>
                </div>
              </div>

              <div class="tune-card-right-actions">
                <span class="pattern-count-badge">{{ Object.keys(t.patterns || {}).length }} breaks</span>
                <button
                  class="tune-qr-share-mini-btn"
                  title="Partager par QR Code"
                  @click.stop="openTuneQrShare(t)"
                >
                  <QrCode :size="13" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <!-- Right: Player & Sequencer Matrix Desk -->
        <section v-if="Object.keys(tunes).length > 0" class="desk-card" id="tuneDeskSection">
          <!-- Tune Banner -->
          <div class="tune-banner">
            <div class="tune-banner-left">
              <div class="title-row">
                <h2 class="tune-heading">{{ currentTune.displayName || currentTune.name }}</h2>
                <button
                  v-if="currentTab === 'studio' && isMaestro"
                  class="edit-name-mini-btn"
                  title="Renommer ce morceau"
                  @click="renameCurrentTune"
                >
                  <Edit3 :size="13" />
                </button>
                <button
                  v-if="isMaestro"
                  class="edit-name-mini-btn danger-delete-tune-btn"
                  title="Supprimer définitivement ce morceau (Mode Maestro)"
                  @click="deleteCurrentTune"
                >
                  <Trash2 :size="13" />
                </button>
                <div class="badge-row">
                  <span v-for="c in currentTune.categories" :key="c" class="category-pill">{{ c }}</span>
                </div>
              </div>
              <p class="pattern-subtitle">
                Pattern : <strong class="text-teal">{{ currentPattern?.displayName || currentPatternKey }}</strong>
                <button
                  v-if="currentTab === 'studio'"
                  class="edit-name-mini-btn"
                  title="Renommer ce pattern/break"
                  @click="renameCurrentPattern"
                >
                  <Edit3 :size="12" />
                </button>
                <span class="text-muted"> ({{ patternLength }} temps)</span>
              </p>
            </div>

            <!-- External resources & Media / PDF export actions -->
            <div class="links-row">
              <!-- Launch Groovy Beat Trainer Button (Organic Play) -->
              <button class="action-btn-outline hero-banner-btn organic-banner-btn" title="Lancer le défilement interactif Groovy Beat" @click="openHeroTrainer()">
                <div class="organic-play-icon mini">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" class="organic-play-svg">
                    <path d="M7 4.5v15c0 .85.92 1.38 1.66.95l11.5-7.5c.74-.48.74-1.56 0-2.04L8.66 3.55C7.92 3.12 7 3.65 7 4.5z" />
                  </svg>
                </div>
                <span>Groovy Beat</span>
              </button>

              <button class="action-btn-outline pdf-export-btn" title="Télécharger la partition PDF" @click="exportTuneToPdf" :disabled="isExportingPdf">
                <Download :size="14" />
                <span>{{ isExportingPdf ? 'Génération...' : 'Exporter PDF' }}</span>
              </button>

              <button class="action-btn-outline" title="Gérer notes et liens multimédia" @click="openMediaModal">
                <Edit3 :size="14" />
                <span>Médias & Notes</span>
              </button>

              <a
                v-if="currentTune.sheet"
                :href="currentTune.sheet"
                target="_blank"
                class="action-btn-outline"
                title="Ouvrir la partition PDF d'origine"
              >
                <FileText :size="14" />
                <span>PDF Externe</span>
              </a>
              <a
                v-if="currentTune.video"
                :href="currentTune.video"
                target="_blank"
                class="action-btn-outline video-btn"
                title="Voir la vidéo de démo"
              >
                <Video :size="14" />
                <span>Vidéo</span>
              </a>
            </div>
          </div>

          <!-- Notes display if present -->
          <div v-if="currentTune.notes" class="tune-notes-banner">
            <StickyNote :size="15" class="text-teal flex-shrink-0" />
            <div class="notes-text">{{ currentTune.notes }}</div>
          </div>

          <!-- Studio Toolbar (When in Studio mode) -->
          <div v-if="currentTab === 'studio'" class="studio-bar">
            <div class="studio-top-row">
              <div class="studio-info">
                <Zap :size="14" class="text-teal flex-shrink-0" />
                <span>Mode Studio • Composition & Structure</span>
              </div>
              <div class="studio-actions">
                <button class="action-btn-small" title="Ajouter un break" @click="addNewBreakToCurrentTune">
                  <Plus :size="13" />
                  <span>Nouveau</span>
                </button>
                <button class="action-btn-small" title="Dupliquer le break" @click="duplicateCurrentPattern">
                  <Copy :size="13" />
                  <span>Dupliquer</span>
                </button>
                <button class="action-btn-small danger" title="Effacer toutes les notes de ce break" @click="clearCurrentPatternStrokes">
                  <RotateCcw :size="13" />
                  <span>Vider notes</span>
                </button>
                <button class="action-btn-small danger" title="Supprimer ce break" @click="deleteCurrentPattern">
                  <Trash2 :size="13" />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>

            <!-- Pattern Structure Controls (Mesure, Longueur / Temps, Levée 0 à 48) -->
            <div class="studio-structure-row">
              <!-- 1. Mesure (Time Signature) -->
              <div class="studio-param-box">
                <span class="studio-param-label">Mesure :</span>
                <select
                  class="studio-param-select"
                  :value="currentPattern?.time || currentTune.time || 4"
                  @change="(e) => updateCurrentPatternTimeSignature(parseInt((e.target as HTMLSelectElement).value))"
                >
                  <option :value="4">4/4 (Binaire standard)</option>
                  <option :value="3">6/8 (Ternaire 12 temps)</option>
                  <option :value="2">2/4 (Binaire court)</option>
                  <option :value="5">5/4 (Asymétrique)</option>
                  <option :value="7">7/8 (Impair)</option>
                </select>
              </div>

              <!-- 2. Longueur totale (Temps / Double-croches) -->
              <div class="studio-param-box">
                <span class="studio-param-label">Longueur :</span>
                <select
                  class="studio-param-select"
                  :value="patternLength"
                  @change="(e) => updateCurrentPatternLength(parseInt((e.target as HTMLSelectElement).value))"
                >
                  <option :value="8">8 temps (1/2 mesure)</option>
                  <option :value="12">12 temps (1 mes. 6/8)</option>
                  <option :value="16">16 temps (1 mesure 4/4)</option>
                  <option :value="24">24 temps (2 mes. 6/8)</option>
                  <option :value="32">32 temps (2 mesures 4/4)</option>
                  <option :value="48">48 temps (3 mes. 4/4)</option>
                  <option :value="64">64 temps (4 mesures 4/4)</option>
                  <option :value="96">96 temps (6 mesures)</option>
                  <option :value="128">128 temps (8 mesures)</option>
                </select>
              </div>

              <!-- 3. Levée / Anacrouse (0 à 48) -->
              <div class="studio-param-box">
                <span class="studio-param-label">Levée (Upbeat) :</span>
                <select
                  class="studio-param-select"
                  :value="currentPattern?.upbeat || 0"
                  @change="(e) => updateCurrentPatternUpbeat(parseInt((e.target as HTMLSelectElement).value))"
                >
                  <option :value="0">0 (Sur le temps 1)</option>
                  <option v-for="u in 48" :key="u" :value="u">
                    {{ u }} {{ u === 1 ? 'temps' : 'temps' }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Patterns & Breaks selector -->
          <div class="patterns-container">
            <div class="patterns-header-row">
              <div class="d-flex align-items-center gap-2">
                <span class="section-label">PATTERNS & BREAKS</span>
                <span class="pattern-live-help-tag">
                  <Shuffle :size="12" class="text-pink" />
                  <span>Répétitions max en Mode Live</span>
                </span>
              </div>
              <span class="text-xs text-muted d-none-mobile">
                Sélectionnez un break ou ajustez son nombre max de boucles :
              </span>
            </div>
            <div class="patterns-pills-row">
              <div
                v-for="(p, pKey) in currentTune.patterns"
                :key="pKey"
                :class="['pattern-card-box', pKey === currentPatternKey ? 'is-selected' : '']"
              >
                <!-- Ligne 1 : Nom complet du Pattern / Break (cliquable pour sélection) -->
                <button
                  :class="['pattern-main-btn', pKey === currentPatternKey ? 'active' : '']"
                  @click="selectPattern(pKey)"
                >
                  <span class="pattern-indicator-dot"></span>
                  <span class="pattern-pill-title">{{ p.displayName || pKey }}</span>
                </button>

                <!-- Ligne 2 : Options Live (Répétition Max & Priorité d'apparition) -->
                <div class="pattern-card-options-row">
                  <!-- Max repeat badge / selector -->
                  <div class="pattern-repeat-badge-box" :title="`Répétition maximale de '${pKey}' avant d'enchaîner en Mode Live`">
                    <span class="repeat-tag-label">MAX</span>
                    <select
                      class="pattern-repeat-select"
                      :value="getPatternMaxRepeats(p)"
                      @change="(e) => setPatternMaxRepeats(pKey, parseInt((e.target as HTMLSelectElement).value))"
                    >
                      <option :value="1">1x (sans boucle)</option>
                      <option :value="2">2x</option>
                      <option :value="4">4x</option>
                      <option :value="8">8x</option>
                    </select>
                  </div>

                  <!-- Priority selector for Live mode frequency -->
                  <div class="pattern-prio-badge-box" :title="`Priorité de tirage en Mode Live (Probabilité d'apparition)`">
                    <span class="prio-tag-label">⭐</span>
                    <select
                      class="pattern-prio-select"
                      :value="getPatternPriority(p)"
                      @change="(e) => setPatternPriority(pKey, parseInt((e.target as HTMLSelectElement).value))"
                    >
                      <option :value="1">Normal</option>
                      <option :value="2">Souvent (x2)</option>
                      <option :value="4">Fréquent (x4)</option>
                      <option :value="0">Exclure (0)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Solo Practice Section with Direct Hero Launcher -->
          <div class="practice-solo-box">
            <div class="solo-header">
              <span class="solo-title">
                <Radio :size="14" class="text-teal" />
                <span>Mode Solo (Entraînement isolé par pupitre)</span>
              </span>
              <button class="text-btn" @click="resetMix">Tout réactiver</button>
            </div>
            <div class="solo-chips-row">
              <button
                v-for="inst in INSTRUMENTS"
                :key="inst.key"
                :class="['inst-solo-chip', soloInstrument === inst.key ? 'active' : '']"
                :style="{ '--inst-color': inst.color }"
                @click="toggleSolo(inst.key)"
              >
                <span class="dot" :style="{ backgroundColor: inst.color }"></span>
                <span>{{ inst.shortName }}</span>
                <span v-if="soloInstrument === inst.key" class="solo-tag">SOLO</span>
                <button class="hero-chip-btn" title="Lancer le ruban Guitar Hero pour cet instru" @click.stop="openHeroTrainer(inst.key)">
                  <div class="organic-play-icon micro">
                    <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor">
                      <path d="M7 4.5v15c0 .85.92 1.38 1.66.95l11.5-7.5c.74-.48.74-1.56 0-2.04L8.66 3.55C7.92 3.12 7 3.65 7 4.5z" />
                    </svg>
                  </div>
                </button>
              </button>
            </div>
          </div>

          <!-- Interactive Sequencer Grid Matrix -->
          <div class="matrix-card">
            <div class="matrix-scroll-wrapper">
              <div class="matrix-table">
                
                <div v-for="inst in INSTRUMENTS" :key="inst.key" class="matrix-row">
                  <div class="inst-cell-header" :style="{ borderLeftColor: inst.color }">
                    <span class="inst-label">{{ inst.shortName }}</span>
                    <button
                      class="mute-mini-btn"
                      :class="{ muted: audio.isMuted(inst.key) }"
                      @click="toggleMute(inst.key)"
                    >
                      {{ audio.isMuted(inst.key) ? 'MUTED' : 'M' }}
                    </button>
                  </div>

                  <!-- Steps -->
                  <div class="steps-row">
                    <button
                      v-for="stepIdx in patternLength"
                      :key="stepIdx - 1"
                      :class="[
                        'step-btn',
                        (stepIdx - 1) % ((currentPattern.time === 3 || currentPattern.time === 6 || currentPattern.time === 12 || (patternLength % 3 === 0 && patternLength % 4 !== 0)) ? 3 : (currentPattern.time === 2 ? 2 : 4)) === 0 ? 'beat-divider' : '',
                        activeStep === stepIdx - 1 ? 'cursor-active' : '',
                        (currentPattern.tracks[inst.key] || '')[stepIdx - 1] && (currentPattern.tracks[inst.key] || '')[stepIdx - 1] !== ' ' ? 'has-stroke' : ''
                      ]"
                      :style="{
                        '--accent': inst.color
                      }"
                      @click="cycleCell(inst.key, stepIdx - 1)"
                    >
                      <span class="stroke-char">
                        {{ (currentPattern.tracks[inst.key] || '')[stepIdx - 1] !== ' ' ? (currentPattern.tracks[inst.key] || '')[stepIdx - 1] : '' }}
                      </span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- Legend of strokes -->
          <div class="strokes-legend">
            <div v-for="(item, char) in STROKE_LABELS" :key="char" class="legend-item">
              <span class="stroke-tag">{{ item.label }}</span>
              <span class="legend-desc">{{ item.desc }}</span>
            </div>
          </div>

        </section>

        <!-- Empty State When No Tunes Exist -->
        <section v-else class="desk-card empty-catalog-card">
          <div class="empty-catalog-content">
            <span class="empty-icon-large">🥁</span>
            <h2 class="empty-heading">Aucun morceau dans votre répertoire</h2>
            <p class="empty-text">
              Vous avez effacé vos morceaux. Vous pouvez en créer un nouveau ou restaurer les 52 morceaux par défaut en un clic :
            </p>
            <div class="d-flex gap-3 justify-content-center flex-wrap mt-3">
              <button class="action-btn-primary" @click="resetToDefaultTunes">
                <RotateCcw :size="15" />
                <span>Restaurer les 52 morceaux</span>
              </button>
              <button class="action-btn-outline" @click="openCreateTuneModal">
                <Plus :size="15" />
                <span>Nouveau Morceau</span>
              </button>
              <button class="action-btn-outline" @click="showExportImportModal = true; exportImportTab = 'import'">
                <FileUp :size="15" />
                <span>Importer un fichier .json</span>
              </button>
            </div>
          </div>
        </section>

      </div>

      <!-- TAB 2: MIXER, LATENCY & CUSTOM BRANDING -->
      <div v-if="currentTab === 'mixer'" class="mixer-layout">
        <div class="glass-card">
          <div class="card-header-bar">
            <div class="title-with-icon">
              <button class="back-nav-circle-btn" title="Retour au morceau en cours" @click="switchModeTab('musician')">
                <ChevronLeft :size="18" />
              </button>
              <h2 class="subhead-title"><Sliders :size="18" class="text-teal" /> Balance & Mix des Pupitres</h2>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button class="action-btn-outline" @click="resetMix">Réinitialiser Mix</button>
              <button class="close-view-btn" title="Fermer et retourner au morceau" @click="switchModeTab('musician')">
                <X :size="16" />
              </button>
            </div>
          </div>
          <div class="faders-grid">
            <div v-for="inst in INSTRUMENTS" :key="inst.key" class="fader-box">
              <div class="fader-label" :style="{ color: inst.color }">
                <span class="dot" :style="{ backgroundColor: inst.color }"></span>
                <span>{{ inst.name }}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                class="modern-slider"
                :value="audio.getVolume(inst.key)"
                @input="(e) => audio.setVolume(inst.key, parseFloat((e.target as HTMLInputElement).value))"
              />
              <div class="fader-actions">
                <button
                  :class="['mini-btn', audio.isMuted(inst.key) ? 'danger' : '']"
                  @click="toggleMute(inst.key)"
                >
                  Mute
                </button>
                <button
                  :class="['mini-btn', soloInstrument === inst.key ? 'warning' : '']"
                  @click="toggleSolo(inst.key)"
                >
                  Solo
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card">
          <h2 class="subhead-title"><Settings2 :size="18" class="text-teal" /> Métronome & Performances</h2>
          
          <!-- Metronome Volume Slider -->
          <div class="latency-control-box mb-3">
            <div class="latency-labels">
              <span class="d-flex align-items-center gap-1"><Volume2 :size="14" class="text-teal" /> Volume du métronome</span>
              <strong class="text-teal">{{ Math.round(metronomeVolume * 100) }} %</strong>
            </div>
            <input
              :value="metronomeVolume"
              type="range"
              min="0"
              max="1.2"
              step="0.05"
              class="modern-slider"
              @input="(e) => updateMetronomeVolume(parseFloat((e.target as HTMLInputElement).value))"
            />
          </div>

          <div class="latency-control-box mb-3">
            <div class="latency-labels">
              <span>Compensation latence (Bluetooth / Audio)</span>
              <strong class="text-teal">{{ latencyMs }} ms</strong>
            </div>
            <input
              v-model="latencyMs"
              type="range"
              min="0"
              max="400"
              step="10"
              class="modern-slider"
              @input="audio.setLatencyCompensation(latencyMs)"
            />
          </div>

          <!-- Theme Toggle (Dark / Light) -->
          <div class="low-perf-card mb-3" @click="toggleTheme">
            <div class="low-perf-info">
              <div class="d-flex align-items-center gap-2">
                <Sun v-if="isDarkMode" :size="16" class="text-teal" />
                <Moon v-else :size="16" class="text-teal" />
                <span class="low-perf-title">Thème de l'application</span>
              </div>
              <p class="low-perf-desc">{{ isDarkMode ? 'Thème actuel : Sombre (Nuit). Cliquer pour passer en mode clair.' : 'Thème actuel : Clair (Jour). Cliquer pour passer en mode sombre.' }}</p>
            </div>
            <button class="action-btn-outline" @click.stop="toggleTheme">
              <span>{{ isDarkMode ? 'Mode Clair' : 'Mode Sombre' }}</span>
            </button>
          </div>

          <!-- Low Performance Mode Toggle (Battery saver & smooth for budget phones) -->
          <div class="low-perf-card mb-3" @click="isLowPerformanceMode = !isLowPerformanceMode; saveBrandingToStorage()">
            <div class="low-perf-info">
              <span class="low-perf-title">Mode Éco-Performances (Mobiles moins puissants)</span>
              <p class="low-perf-desc">Désactive les ombres lourdes, les flous (blur) et les filtres GPU pour un jeu 100% fluide.</p>
            </div>
            <div :class="['custom-toggle-switch', isLowPerformanceMode ? 'active' : '']">
              <span class="toggle-knob"></span>
            </div>
          </div>

          <!-- Build Info / Version Badge -->
          <div class="build-info-card mb-3">
            <div class="d-flex align-items-center justify-content-between w-100">
              <div class="d-flex align-items-center gap-2">
                <Info :size="16" class="text-teal" />
                <span class="low-perf-title">Version & Indice de Build</span>
              </div>
              <button class="mini-btn text-teal" @click="showChangelogModal = true" title="Voir les nouveautés et le changelog complet">
                <History :size="13" />
                <span>Nouveautés</span>
              </button>
            </div>
            <div class="build-badges-row mt-2">
              <span class="build-badge version-badge">v{{ appVersion }}</span>
              <span class="build-badge timestamp-badge" :title="buildTimestamp">
                Build : {{ new Date(buildTimestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </div>
          </div>

          <!-- Documentation / Guide Complet -->
          <div class="tutorial-launcher-card mb-3" @click="showGuideModal = true">
            <div class="tut-launcher-info">
              <div class="d-flex align-items-center gap-2">
                <BookOpen :size="16" class="text-teal" />
                <span class="low-perf-title">Aide & Guide Solfégique</span>
              </div>
              <p class="low-perf-desc">Comprendre les notations (X, f, t, o, a), les signatures (4/4, 6/8, 3/4) et le fonctionnement.</p>
            </div>
            <button class="action-btn-outline" @click.stop="showGuideModal = true">
              <span>Consulter l'aide</span>
            </button>
          </div>

          <!-- Journal des Modifications / Changelog Launcher -->
          <div class="tutorial-launcher-card mb-3" @click="showChangelogModal = true">
            <div class="tut-launcher-info">
              <div class="d-flex align-items-center gap-2">
                <History :size="16" class="text-teal" />
                <span class="low-perf-title">Journal des Modifications (Changelog)</span>
              </div>
              <p class="low-perf-desc">Consulter l'historique détaillé des versions et des correctifs apportés.</p>
            </div>
            <button class="action-btn-outline" @click.stop="showChangelogModal = true">
              <span>Voir l'historique</span>
            </button>
          </div>

          <!-- Interactive Guide & Tooltip Tour Restart Button -->
          <div class="tutorial-launcher-card mb-3" @click="startTooltipTour">
            <div class="tut-launcher-info">
              <div class="d-flex align-items-center gap-2">
                <Sparkles :size="16" class="text-teal" />
                <span class="low-perf-title">Tutoriel & Infobulles animées</span>
              </div>
              <p class="low-perf-desc">Revoir le parcours guidé des fonctionnalités interactives.</p>
            </div>
            <button class="action-btn-primary" @click.stop="startTooltipTour">
              <span>Lancer le guide</span>
            </button>
          </div>

          <!-- Keyboard Shortcuts Launcher -->
          <div class="tutorial-launcher-card mb-3" @click="showKeyboardHelpModal = true">
            <div class="tut-launcher-info">
              <div class="d-flex align-items-center gap-2">
                <Keyboard :size="16" class="text-teal" />
                <span class="low-perf-title">Raccourcis Clavier (PC / Mac)</span>
              </div>
              <p class="low-perf-desc">Consulter la liste de toutes les touches rapides (Espace, M, S, G, L, F, etc.).</p>
            </div>
            <button class="action-btn-outline" @click.stop="showKeyboardHelpModal = true">
              <span>Voir les touches</span>
            </button>
          </div>

          <!-- Feedback & Suggestions launcher -->
          <div class="tutorial-launcher-card feedback-launcher-card mb-4" @click="openFeedbackModal">
            <div class="tut-launcher-info">
              <div class="d-flex align-items-center gap-2">
                <MessageSquare :size="16" class="text-pink" />
                <span class="low-perf-title">Avis & Boîte à suggestions</span>
              </div>
              <p class="low-perf-desc">Partagez vos idées, améliorations ou signalez un souci sur les morceaux.</p>
            </div>
            <button class="action-btn-primary feedback-action-btn" @click.stop="openFeedbackModal">
              <span>Donner mon avis</span>
            </button>
          </div>

          <!-- Batucada Branding & Logo Customizer -->
          <h2 class="subhead-title mt-4"><Music :size="18" class="text-teal" /> Personnalisation & Logo Batucada</h2>
          
          <div class="form-group mb-2">
            <label>Nom du Groupe</label>
            <input v-model="bandName" type="text" class="text-input" @change="saveBrandingToStorage" />
          </div>
          <div class="form-group mb-3">
            <label>Sous-titre / Ville</label>
            <input v-model="bandSubtitle" type="text" class="text-input" @change="saveBrandingToStorage" />
          </div>

          <!-- Logo Picker: Emoji or Uploaded Image -->
          <div class="logo-custom-panel">
            <label class="form-label-bold">Choix du Logo / Avatar :</label>
            
            <div class="logo-type-tabs mb-2">
              <button :class="['chip-btn', logoType === 'emoji' ? 'active' : '']" @click="logoType = 'emoji'; saveBrandingToStorage()">
                Emoji
              </button>
              <button :class="['chip-btn', logoType === 'image' ? 'active' : '']" @click="logoType = 'image'; saveBrandingToStorage()">
                Image importée (PNG, JPG)
              </button>
            </div>

            <!-- Emoji Presets (Including Skull & Pirate) -->
            <div v-if="logoType === 'emoji'" class="emoji-picker-row">
              <button v-for="em in ['💀', '🏴‍☠️', '🥁', '🪘', '🎺', '🔥', '⚡', '🌟', '🎵', '🇧🇷', '🐵', '💥']" :key="em" :class="['emoji-btn', customEmoji === em ? 'selected' : '']" @click="selectPresetEmoji(em)">
                {{ em }}
              </button>
              <input v-model="customEmoji" type="text" class="custom-emoji-input" maxlength="2" placeholder="Autre" @change="saveBrandingToStorage" />
            </div>

            <!-- Image Upload -->
            <div v-if="logoType === 'image'" class="image-upload-box">
              <input ref="fileInputRef" type="file" accept="image/*" class="d-none" @change="handleLogoUpload" />
              <button class="action-btn-primary" @click="fileInputRef?.click()">
                <Upload :size="15" />
                <span>Sélectionner une image...</span>
              </button>
              <span v-if="customImageBase64" class="text-xs text-muted">Image chargée avec succès ✓</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: PLAYLISTS -->
      <div v-if="currentTab === 'playlists'" class="playlists-layout">
        
        <!-- Left: Playlist Selector -->
        <div class="glass-card playlist-sidebar-panel">
          <div class="card-header-bar">
            <div class="title-with-icon">
              <button class="back-nav-circle-btn" title="Retour au morceau en cours" @click="switchModeTab('musician')">
                <ChevronLeft :size="18" />
              </button>
              <ListMusic :size="18" class="text-teal" />
              <h2 class="subhead-title">Mes Playlists</h2>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button class="action-btn-primary" @click="createPlaylist">
                <FolderPlus :size="15" />
                <span>Créer</span>
              </button>
              <button class="close-view-btn" title="Fermer et retourner au morceau" @click="switchModeTab('musician')">
                <X :size="16" />
              </button>
            </div>
          </div>

          <div class="playlist-cards-list">
            <div
              v-for="pl in playlists"
              :key="pl.id"
              :class="['playlist-select-card', pl.id === activePlaylistId ? 'selected' : '']"
              @click="activePlaylistId = pl.id"
            >
              <div class="pl-card-body">
                <div class="pl-title-row">
                  <span class="pl-name">{{ pl.name }}</span>
                  <ChevronRight :size="16" class="chevron-icon" />
                </div>
                <div class="pl-meta-row">
                  <span class="pl-count-badge">{{ pl.tuneNames.length }} morceaux</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Playlist Details & Order -->
        <div class="glass-card playlist-detail-panel">
          <div class="card-header-bar">
            <div>
              <h2 class="subhead-title">{{ activePlaylist?.name || 'Playlist' }}</h2>
              <p class="hint-text mb-0">Ordre de passage et répétition continue</p>
            </div>
            <button class="action-btn-outline" @click="addCurrentTuneToPlaylist">
              <Plus :size="14" />
              <span>Ajouter "{{ currentTune.displayName || currentTune.name }}"</span>
            </button>
          </div>

          <div class="setlist-container">
            <div
              v-for="(tName, idx) in activePlaylist?.tuneNames || []"
              :key="idx"
              :class="['setlist-item-card', tName === currentTuneKey ? 'current-active' : '']"
            >
              <div class="setlist-left">
                <div class="track-number">{{ idx + 1 }}</div>
                <div>
                  <h3 class="track-title">{{ tunes[tName]?.displayName || tName }}</h3>
                  <span class="track-sub">{{ Object.keys(tunes[tName]?.patterns || {}).length }} breaks • {{ tunes[tName]?.speed || 100 }} BPM</span>
                </div>
              </div>

              <div class="setlist-actions">
                <button
                  class="track-play-btn"
                  title="Charger et écouter"
                  @click="selectTune(tName); currentTab = 'musician'; togglePlay();"
                >
                  <Play :size="13" fill="currentColor" />
                  <span>Jouer</span>
                </button>
                <button
                  class="track-delete-btn"
                  title="Retirer de la playlist"
                  @click="removeTuneFromActivePlaylist(idx)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>

            <div v-if="!activePlaylist?.tuneNames || activePlaylist.tuneNames.length === 0" class="empty-placeholder">
              <ListMusic :size="32" class="text-muted mb-2" />
              <p>Aucun morceau dans cette playlist.</p>
              <button class="action-btn-primary mt-2" @click="addCurrentTuneToPlaylist">
                Ajouter le morceau actuel
              </button>
            </div>
          </div>
        </div>

      </div>

      <!-- TAB 4: DÉFI DU JOUR & HALL OF FAME -->
      <div v-if="currentTab === 'game'" class="game-layout">
        
        <!-- Left Column: Défi du Jour & Zone de Frappe -->
        <div class="glass-card game-arena-panel">
          <div class="card-header-bar">
            <div class="title-with-icon">
              <button class="back-nav-circle-btn" title="Retour au morceau en cours" @click="switchModeTab('musician')">
                <ChevronLeft :size="18" />
              </button>
              <Flame :size="20" class="text-warning animate-pulse" />
              <div>
                <h2 class="subhead-title">Défi Rythmique du Jour</h2>
                <span class="badge-date">{{ todayDateKey }}</span>
              </div>
            </div>

            <!-- Difficultés (3 Niveaux de Vitesse) & Bouton Fermer -->
            <div class="d-flex align-items-center gap-2">
              <div class="game-difficulty-pills">
                <button
                  :class="['diff-pill', 'easy', gameSelectedDifficulty === 'easy' ? 'active' : '']"
                  :disabled="isGamePlaying || isGameFullScreen"
                  @click="gameSelectedDifficulty = 'easy'"
                >
                  🟢 Padawan (80)
                </button>
                <button
                  :class="['diff-pill', 'medium', gameSelectedDifficulty === 'medium' ? 'active' : '']"
                  :disabled="isGamePlaying || isGameFullScreen"
                  @click="gameSelectedDifficulty = 'medium'"
                >
                  🟡 Sambiste (110)
                </button>
                <button
                  :class="['diff-pill', 'hard', gameSelectedDifficulty === 'hard' ? 'active' : '']"
                  :disabled="isGamePlaying || isGameFullScreen"
                  @click="gameSelectedDifficulty = 'hard'"
                >
                  🔴 Maestro (140)
                </button>
              </div>

              <button class="close-view-btn" title="Fermer le Défi et retourner au morceau" @click="switchModeTab('musician')">
                <X :size="16" />
              </button>
            </div>
          </div>

          <!-- Challenge Info Card -->
          <div class="challenge-brief-card">
            <div class="challenge-pattern-badge">
              <span class="inst-tag" :style="{ backgroundColor: INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color }">
                {{ dailyChallenge.instrumentName }}
              </span>
              <h3 class="brief-title">{{ dailyChallenge.tuneName }} — {{ dailyChallenge.patternName }}</h3>
            </div>
            <div class="challenge-stats-grid">
              <div class="brief-stat-item">
                <span class="stat-lbl">Notes à frapper</span>
                <strong class="stat-val">{{ dailyChallenge.totalNotes }}</strong>
              </div>
              <div class="brief-stat-item">
                <span class="stat-lbl">Vitesse</span>
                <strong class="stat-val text-teal">{{ gameBpm }} BPM</strong>
              </div>
              <div class="brief-stat-item">
                <span class="stat-lbl">Multiplicateur</span>
                <strong class="stat-val text-warning">x{{ gameMultiplier.toFixed(1) }}</strong>
              </div>
            </div>
          </div>

          <div class="game-start-container my-4">
            <button class="btn-start-game pulse-glow" @click="startGameChallenge">
              <Play :size="24" fill="currentColor" />
              <span>COMMENCER LE DÉFI</span>
            </button>
            <p class="game-touch-hint">Passe en plein écran immersif avec défilement de notes vertical et décompte au clic !</p>
          </div>

        </div>

        <!-- Right Column: Hall of Fame (Leaderboard) -->
        <div class="glass-card game-leaderboard-panel">
          <div class="card-header-bar">
            <div class="title-with-icon">
              <Trophy :size="18" class="text-warning" />
              <h2 class="subhead-title">Hall of Fame</h2>
            </div>
            <span class="hof-diff-tag" :class="gameSelectedDifficulty">
              {{ gameSelectedDifficulty.toUpperCase() }}
            </span>
          </div>

          <p class="hint-text mb-2">Classement du défi du <strong>{{ todayDateKey }}</strong></p>

          <div class="leaderboard-table-container">
            <table v-if="currentHallOfFame.length > 0" class="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Joueur</th>
                  <th>Score</th>
                  <th>Précision</th>
                  <th>Combo</th>
                  <th>Rang</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(entry, index) in currentHallOfFame"
                  :key="entry.id"
                  :class="['hof-row', index === 0 ? 'rank-gold' : index === 1 ? 'rank-silver' : index === 2 ? 'rank-bronze' : '']"
                >
                  <td class="col-rank">
                    <span v-if="index === 0">🥇</span>
                    <span v-else-if="index === 1">🥈</span>
                    <span v-else-if="index === 2">🥉</span>
                    <span v-else>{{ index + 1 }}</span>
                  </td>
                  <td class="col-name font-bold">{{ entry.playerName }}</td>
                  <td class="col-score text-warning font-orbitron">{{ entry.score.toLocaleString() }}</td>
                  <td class="col-acc text-info">{{ entry.accuracy }}%</td>
                  <td class="col-combo">{{ entry.maxCombo }}</td>
                  <td class="col-grade">
                    <span :class="['grade-pill', `grade-${entry.grade.toLowerCase().replace('+', '-plus')}`]">
                      {{ entry.grade }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-else class="empty-placeholder">
              <Trophy :size="36" class="text-muted opacity-30 mb-2" />
              <p>Aucun score enregistré pour ce niveau aujourd'hui.</p>
              <p class="text-muted text-sm">Soyez le premier à inscrire votre nom au Panthéon !</p>
            </div>
          </div>
        </div>

      </div>

      <!-- FULLSCREEN IMMERSIVE GAME ARENA -->
      <div v-if="isGameFullScreen" class="game-fullscreen-modal">
        <!-- Top HUD (Score, Combo, Accuracy & Close) -->
        <div class="game-fullscreen-top-hud">
          <div class="fs-hud-left">
            <span class="fs-tune-title">{{ dailyChallenge.tuneName }} — {{ dailyChallenge.patternName }}</span>
            <span class="fs-inst-tag" :style="{ backgroundColor: INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color }">
              {{ dailyChallenge.instrumentName }}
            </span>
          </div>

          <div class="fs-hud-center">
            <div class="fs-hud-stat">
              <span class="fs-lbl">SCORE</span>
              <span class="fs-val text-warning font-orbitron">{{ gameScore }}</span>
            </div>
            <div class="fs-hud-stat">
              <span class="fs-lbl">COMBO</span>
              <span :class="['fs-val', gameCombo >= 8 ? 'text-teal animate-bounce' : '']">
                {{ gameCombo }} <small class="text-muted">x{{ gameCombo >= 24 ? 4 : gameCombo >= 16 ? 3 : gameCombo >= 8 ? 2 : 1 }}</small>
              </span>
            </div>
            <div class="fs-hud-stat">
              <span class="fs-lbl">PRÉCISION</span>
              <span class="fs-val text-info font-orbitron">{{ gameAccuracy }}%</span>
            </div>
          </div>

          <button class="hero-close-round-btn" title="Quitter le mode jeu (Échap)" @click="exitGameFullScreen">
            <X :size="18" />
          </button>
        </div>

        <!-- Fullscreen Vertical Highway -->
        <div
          class="hero-vertical-highway game-fs-highway"
          @pointerdown="isGameWaitingToStart ? confirmStartGame() : registerPlayerHit()"
        >
          <!-- Waiting to start click overlay -->
          <div v-if="isGameWaitingToStart" class="game-ready-click-overlay">
            <div class="ready-click-card pulse-glow">
              <Target :size="54" class="text-teal mb-2" />
              <h2 class="ready-title font-orbitron animated-gradient-text">PRÊT ?</h2>
              <p class="ready-sub">CLIQUEZ OU APPUYEZ SUR ESPACE POUR LANCER LE DÉCOMPTE</p>
            </div>
          </div>

          <!-- Count-In Overlay in Highway -->
          <transition name="go-splash-anim">
            <div v-if="isCountingIn" class="game-count-in-overlay">
              <div class="go-splash-card count-in-card">
                <span class="count-in-number-glow">{{ countInStep }}</span>
                <span class="count-in-label-sub">PRÉPAREZ-VOUS...</span>
              </div>
            </div>
          </transition>

          <!-- Live Feedback Overlay Popup -->
          <div class="game-fs-feedback-lane">
            <transition name="pop-feedback">
              <div
                v-if="gameLastFeedback"
                :key="gameLastFeedback.id"
                class="live-hit-badge"
                :style="{ color: gameLastFeedback.color, borderColor: gameLastFeedback.color }"
              >
                {{ gameLastFeedback.text }}
                <span v-if="gameLastFeedback.timingDiffMs !== undefined" class="timing-ms">
                  {{ gameLastFeedback.timingDiffMs > 0 ? `+${gameLastFeedback.timingDiffMs}ms` : `${gameLastFeedback.timingDiffMs}ms` }}
                </span>
              </div>
            </transition>
          </div>

          <!-- Target Hit Line -->
          <div class="hero-vertical-target-zone">
            <div class="target-cross-line"></div>
            <div
              class="hit-glow-ring"
              :class="{ pulse: activeStep >= 0 && (dailyChallenge.sequenceTracks[dailyChallenge.instrumentKey]?.[activeStep] || ' ') !== ' ' }"
              :style="{
                borderColor: INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color || '#14b8a6',
                boxShadow: `0 0 35px ${INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color || '#14b8a6'}`
              }"
            >
              <span class="target-stroke-label">
                {{ (dailyChallenge.sequenceTracks[dailyChallenge.instrumentKey]?.[activeStep] || ' ') !== ' ' ? dailyChallenge.sequenceTracks[dailyChallenge.instrumentKey]?.[activeStep] : '•' }}
              </span>
            </div>
          </div>

          <!-- Scrolling Strip (Strictly The Notes to Play) -->
          <div class="hero-vertical-ribbon">
            <div
              v-for="node in gameRibbonNodes"
              :key="node.id"
              :class="[
                'hero-v-node',
                node.isFirstBeat ? 'beat-bar-first' : node.isOtherBeat ? 'beat-bar-other' : '',
                Math.abs(node.stepOffset - smoothPosition) < 0.25 ? 'at-target' : '',
                (node.stroke || ' ') !== ' ' ? 'has-v-note' : 'is-rest'
              ]"
              :style="{
                '--v-color': (node.stroke !== ' ' && STROKE_LABELS[node.stroke]?.color) || INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color || '#14b8a6',
                transform: `translateY(${(node.stepOffset - smoothPosition) * -75}px)`
              }"
            >
              <div v-if="node.isFirstBeat || node.isOtherBeat" :class="['beat-horizontal-bar', node.isFirstBeat ? 'first-beat' : 'other-beat']"></div>
              <div
                class="v-note-bubble"
                :style="{
                  borderColor: (node.stroke !== ' ' && STROKE_LABELS[node.stroke]?.color) || INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color || '#14b8a6'
                }"
              >
                <span class="v-note-stroke">{{ node.stroke !== ' ' ? node.stroke : '' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Big Touch Hit Area at Bottom -->
        <div class="game-fs-bottom-touch-bar">
          <button
            class="game-fs-big-touch-btn"
            :style="{ '--pad-color': INSTRUMENTS.find(i => i.key === dailyChallenge.instrumentKey)?.color || '#14b8a6' }"
            @pointerdown="isGameWaitingToStart ? confirmStartGame() : registerPlayerHit()"
          >
            <span v-if="isGameWaitingToStart">👉 TOUCHEZ POUR COMMENCER</span>
            <span v-else>⚡ TAPER ICI / ESPACE</span>
          </button>
        </div>
      </div>

      <!-- GAME RESULT MODAL DIALOG -->
      <div v-if="showGameResultModal" class="modal-overlay game-result-overlay">
        <div class="modal-card game-result-card pulse-glow">
          <div class="result-banner">
            <Trophy :size="32" class="text-warning animate-bounce" />
            <h2 class="result-title font-orbitron animated-gradient-text">DÉFI TERMINÉ !</h2>
          </div>

          <div class="result-header-row">
            <div class="result-score-block">
              <span class="score-label">SCORE FINAL</span>
              <h1 class="final-score-val font-orbitron text-warning">{{ gameScore.toLocaleString() }}</h1>
            </div>
            <div :class="['result-grade-badge', `grade-${gameFinalGrade.toLowerCase().replace('+', '-plus')}`]">
              {{ gameFinalGrade }}
            </div>
          </div>

          <div class="result-breakdown-grid">
            <div class="breakdown-pill">
              <span>👑 Parfaits</span>
              <strong class="text-warning">{{ gamePerfects }}</strong>
            </div>
            <div class="breakdown-pill">
              <span>⚡ Bien</span>
              <strong class="text-teal">{{ gameGreats }}</strong>
            </div>
            <div class="breakdown-pill">
              <span>👌 Passables</span>
              <strong class="text-info">{{ gameGoods }}</strong>
            </div>
            <div class="breakdown-pill">
              <span>❌ Ratés</span>
              <strong class="text-danger">{{ gameMisses }}</strong>
            </div>
            <div class="breakdown-pill">
              <span>🔥 Max Combo</span>
              <strong>{{ gameMaxCombo }}</strong>
            </div>
            <div class="breakdown-pill">
              <span>🎯 Précision</span>
              <strong>{{ gameAccuracy }}%</strong>
            </div>
          </div>

          <!-- Formulaire Enregistrement Hall of Fame ultra mis en valeur -->
          <div v-if="!scoreSubmitSuccess" class="submit-score-hero-box">
            <div class="submit-hero-header">
              <Sparkles :size="20" class="text-warning" />
              <label class="form-hero-label">INSCRIRE MON PSEUDO AU HALL OF FAME</label>
            </div>
            <div class="hero-input-group">
              <input
                v-model="gamePlayerName"
                type="text"
                placeholder="Entrez votre pseudo..."
                maxlength="20"
                class="hero-text-input font-orbitron"
                :disabled="isSubmittingScore"
                @keyup.enter="submitScoreToHallOfFame"
                autofocus
              />
              <button
                class="btn-hero-submit"
                :disabled="isSubmittingScore || !gamePlayerName.trim()"
                @click="submitScoreToHallOfFame"
              >
                <Trophy :size="18" />
                <span>{{ isSubmittingScore ? 'ENREGISTREMENT...' : 'ENREGISTRER' }}</span>
              </button>
            </div>
          </div>

          <div v-else class="submit-success-alert">
            <CheckCircle2 :size="24" class="text-success" />
            <div>
              <strong>Félicitations !</strong>
              <p>Votre score a été enregistré dans le Hall of Fame.</p>
            </div>
          </div>

          <div class="result-action-buttons">
            <button class="btn-return-hof" @click="exitGameFullScreen(); showGameResultModal = false">
              <Trophy :size="20" />
              <span>VOIR LE CLASSEMENT / RETOUR</span>
            </button>
            <button class="btn-replay-game" @click="showGameResultModal = false; startGameChallenge()">
              <Play :size="20" fill="currentColor" />
              <span>REJOUER CE DÉFI</span>
            </button>
          </div>
        </div>
      </div>

    </main>

    <!-- FULLSCREEN GUITAR HERO / INTERACTIVE TRAINER OVERLAY (VERTICAL HIGHWAY) -->
    <div v-if="showHeroTrainer" :class="['hero-trainer-modal', heroFocusMode ? 'focus-mode-active' : '']">
      
      <!-- Top Navigation (Animated Transition in Focus Mode) -->
      <transition name="hero-top-slide">
        <div v-if="!heroFocusMode" class="hero-top-nav">
          <div class="hero-selectors-group">
            <!-- Tune selector -->
            <select class="hero-select" :value="currentTuneKey" @change="(e) => selectTune((e.target as HTMLSelectElement).value)">
              <option v-for="t in Object.values(tunes)" :key="t.name" :value="t.name">
                {{ t.displayName || t.name }}
              </option>
            </select>

            <!-- Break selector -->
            <select class="hero-select" :value="currentPatternKey" @change="(e) => selectPattern((e.target as HTMLSelectElement).value)">
              <option v-for="(p, pKey) in currentTune.patterns" :key="pKey" :value="pKey">
                {{ p.displayName || pKey }}
              </option>
            </select>

            <!-- Instrument / Pupitre selector -->
            <select class="hero-select inst-select" :value="heroSelectedInst" @change="(e) => changeHeroInstrument((e.target as HTMLSelectElement).value)">
              <option v-for="inst in INSTRUMENTS" :key="inst.key" :value="inst.key">
                {{ inst.name }}
              </option>
            </select>
          </div>

          <div class="hero-top-actions">
            <!-- Game / Challenge Mode Button -->
            <button
              :class="['hero-tool-btn', 'hero-game-btn', currentTab === 'game' ? 'active' : '']"
              title="Défi Rythmique du Jour & Hall of Fame"
              @click="closeHeroTrainer(true); currentTab = 'game'; triggerModeFlash('DÉFI DU JOUR', '#f59e0b', 'trophy')"
            >
              <Trophy :size="16" />
            </button>

            <!-- Organic-styled LIVE Mode Button -->
            <button
              :class="['hero-live-mode-toggle', heroLiveMode ? 'active' : '']"
              :title="heroLiveMode ? 'Désactiver le Mode Live Aléatoire (L)' : 'Activer le Mode Live Aléatoire continu (L)'"
              @click="heroLiveMode = !heroLiveMode"
            >
              <div class="live-pulse-badge">
                <span class="live-dot-glow"></span>
                <span class="live-brand-text">LIVE</span>
              </div>
              <span v-if="heroLiveMode" class="live-on-tag">ON</span>
            </button>

            <!-- Count-In 1-2-3-4 Toggle Button -->
            <button
              :class="['hero-tool-btn', 'hero-countin-btn', heroCountInEnabled ? 'active' : '']"
              :title="heroCountInEnabled ? 'Décompte actif (4 temps avant le départ) - Cliquer pour désactiver' : 'Activer le décompte (1-2-3-4) avant le départ'"
              @click="heroCountInEnabled = !heroCountInEnabled"
            >
              <span class="countin-num-badge">123</span>
              <span v-if="heroCountInEnabled" class="countin-dot-active"></span>
            </button>

            <!-- Accompaniment 3-Step Action Button (Active -> Drawer -> Muted Red) -->
            <button
              :class="[
                'hero-tool-btn',
                'hero-acc-tri-btn',
                heroAccompanimentClickState === 'active' ? 'state-active' : heroAccompanimentClickState === 'drawer' ? 'state-drawer' : 'state-muted'
              ]"
              :title="
                heroAccompanimentClickState === 'muted' ? 'Clic 1: Activer tous les accompagnants' :
                heroAccompanimentClickState === 'active' ? 'Clic 2: Ouvrir les réglages personnalisés' :
                'Clic 3: Couper tous les accompagnants'
              "
              @click="cycleHeroAccompanimentButton"
            >
              <Sliders v-if="heroAccompanimentClickState !== 'muted'" :size="16" />
              <VolumeX v-else :size="16" />
              <span v-if="heroAccompanimentClickState === 'muted'" class="acc-muted-dot"></span>
            </button>

            <!-- Close button -->
            <button class="hero-close-round-btn" title="Fermer le mode entraînement (G / Échap)" @click="() => closeHeroTrainer()">
              <X :size="18" />
            </button>
          </div>
        </div>
      </transition>

      <!-- Accompaniment Instruments Drawer (Modal Glass Panel) -->
      <div v-if="showHeroAccompanimentDrawer && !heroFocusMode" class="hero-accompaniment-backdrop" @click.self="showHeroAccompanimentDrawer = false">
        <div class="hero-accompaniment-sheet">
          <div class="sheet-header">
            <div class="sheet-title-group">
              <Sliders :size="16" class="text-teal" />
              <h3 class="sheet-title">Mixeur & Accompagnements</h3>
            </div>
            <button class="sheet-close-btn" @click="showHeroAccompanimentDrawer = false">
              <X :size="16" />
            </button>
          </div>
          <p class="sheet-desc">
            Ajustez le volume et l'activation de chaque pupitre en temps réel :
          </p>

          <div class="accompaniment-cards-list">
            <div
              v-for="inst in INSTRUMENTS"
              :key="inst.key"
              :class="['inst-acc-row-card', !audio.isMuted(inst.key) ? 'is-active' : 'is-muted', heroSelectedInst === inst.key ? 'is-solo-lead' : '']"
            >
              <!-- Left: Click to toggle mute -->
              <div class="inst-acc-left" @click="toggleMute(inst.key)">
                <span class="dot-large" :style="{ backgroundColor: inst.color }"></span>
                <div class="inst-acc-names">
                  <span class="inst-acc-title">{{ inst.name }}</span>
                  <span v-if="heroSelectedInst === inst.key" class="lead-badge">VOTRE INSTRUMENT</span>
                </div>
              </div>

              <!-- Center/Right: Volume Slider & Toggle Switch -->
              <div class="inst-acc-controls">
                <input
                  type="range"
                  min="0"
                  max="1.2"
                  step="0.05"
                  :value="audio.getVolume(inst.key)"
                  :disabled="audio.isMuted(inst.key)"
                  class="modern-slider acc-vol-slider"
                  title="Volume de l'instrument"
                  @input="(e) => audio.setVolume(inst.key, parseFloat((e.target as HTMLInputElement).value))"
                  @click.stop
                />
                
                <!-- Sleek iOS Style Toggle Switch -->
                <div :class="['custom-toggle-switch', !audio.isMuted(inst.key) ? 'active' : '']" @click="toggleMute(inst.key)">
                  <span class="toggle-knob"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Vertical Highway Runway (Double click anywhere to toggle Focus Mode) -->
      <div
        class="hero-vertical-highway clickable-arena"
        :title="heroFocusMode ? 'Double-cliquer sur la zone de jeu pour quitter le Mode Focus' : 'Double-cliquer sur la zone de jeu pour passer en Mode Focus'"
        @dblclick="toggleFocusMode"
      >
        <!-- Background Giant Watermark de la Marque with Beat Pulsing Movement -->
        <div :class="['brand-watermark', (activeStep >= 0 && activeStep % 4 === 0) ? 'brand-beat-bounce' : '']">
          <img :src="BRAND.logoText" :alt="BRAND.name" class="brand-watermark-img" />
        </div>

        <!-- Floating Direct SOLO Toggle Button (Detached in the arena for quick reach) -->
        <button
          v-if="!heroFocusMode"
          class="hero-floating-solo-btn"
          title="Isoler votre instrument (Couper tous les accompagnements)"
          @click="triggerHeroSolo"
        >
          <Radio :size="18" />
        </button>

        <!-- Floating Controls Cluster Bottom-Left (FX Eco & TAP Button) -->
        <div class="hero-bottom-left-cluster">
          <!-- FX / Low-Performance Toggle Button (Above TAP) -->
          <button
            :class="['hero-floating-fx-btn', !isLowPerformanceMode ? 'fx-active' : 'fx-disabled']"
            :title="!isLowPerformanceMode ? 'Effets visuels et lueurs GPU : ACTIFS (Cliquer pour Mode Éco)' : 'Effets visuels : DÉSACTIVÉS (Mode Éco fluide)'"
            @click="isLowPerformanceMode = !isLowPerformanceMode; saveBrandingToStorage()"
          >
            <Sparkles v-if="!isLowPerformanceMode" :size="16" />
            <Layers v-else :size="16" />
            <span class="hero-fx-text">{{ !isLowPerformanceMode ? 'FX ON' : 'ÉCO' }}</span>
          </button>

          <!-- Big Round TAP Tempo Button (Bottom-Left of the Play Area for easy finger tapping) -->
          <button
            class="hero-floating-tap-btn"
            title="Taper le tempo (TAP)"
            @click="tapTempo"
          >
            <Zap :size="18" />
            <span class="hero-tap-text">TAP</span>
          </button>
        </div>

        <!-- Ambient Watermark BPM Display (Smaller, Bottom-Right, Italic with Beat Glow) -->
        <div :class="['hero-corner-bpm-watermark', (activeStep >= 0 && activeStep % 4 === 0) ? 'beat-glow-pulse' : '']">
          <span class="watermark-number">{{ bpm }}</span>
          <span class="watermark-unit">BPM</span>
        </div>

        <!-- Big Animated Next Pattern Announcement Banner in Live Mode -->
        <transition name="announce-pop">
          <div v-if="heroLiveMode && incomingNextPatternKey && isNextPatternImminent" class="hero-incoming-announcement">
            <div class="announce-pulse-ring"></div>
            <div class="announce-content-card">
              <span class="announce-eyebrow">ATTENTION • PROCHAIN BREAK</span>
              <h2 class="announce-pattern-title animated-gradient-text">
                {{ currentTune.patterns[incomingNextPatternKey]?.displayName || incomingNextPatternKey }}
              </h2>
              <!-- Display number of repeats if not standard Tune or Groove -->
              <div
                v-if="!['tune', 'groove', 'base'].includes((incomingNextPatternKey || '').toLowerCase())"
                class="announce-repeats-pill"
              >
                <span>Répété {{ getPatternMaxRepeats(currentTune.patterns[incomingNextPatternKey]) }} fois</span>
              </div>
              <div class="announce-countdown-dots">
                <span class="dot-bounce"></span>
                <span class="dot-bounce"></span>
                <span class="dot-bounce"></span>
              </div>
            </div>
          </div>
        </transition>

        <!-- Big Animated Count-In (1-2-3-4) Overlay -->
        <transition name="go-splash-anim">
          <div v-if="isCountingIn" class="hero-go-splash-overlay count-in-overlay">
            <div class="go-splash-card count-in-card">
              <span class="count-in-number-glow">{{ countInStep }}</span>
              <span class="count-in-label-sub">PRÉPAREZ-VOUS...</span>
            </div>
          </div>
        </transition>

        <!-- Big Splash GO ! Banner on transition start -->
        <transition name="go-splash-anim">
          <div v-if="showGoSplash" class="hero-go-splash-overlay">
            <div class="go-splash-card">
              <span class="go-sparkle-icon">⚡</span>
              <h1 class="go-text-gradient">GO !</h1>
              <span class="go-pattern-sub">{{ currentPattern?.displayName || currentPatternKey }}</span>
            </div>
          </div>
        </transition>

        <!-- Target Hit Zone (Centered in the Middle of Screen) -->
        <div class="hero-vertical-target-zone">
          <div class="target-cross-line"></div>
          <div
            class="hit-glow-ring"
            :class="{ pulse: activeStep >= 0 && (currentHeroTrack[activeStep] || ' ') !== ' ' }"
            :style="{
              borderColor: (currentHeroTrack[activeStep] && STROKE_LABELS[currentHeroTrack[activeStep]]?.color) || currentHeroInstrumentDef.color,
              boxShadow: `0 0 35px ${(currentHeroTrack[activeStep] && STROKE_LABELS[currentHeroTrack[activeStep]]?.color) || currentHeroInstrumentDef.color}`
            }"
          >
            <span class="target-stroke-label">
              {{ (currentHeroTrack[activeStep] || ' ') !== ' ' ? currentHeroTrack[activeStep] : '•' }}
            </span>
          </div>
          <!-- Permanent Visual Technique Banner (Visible in Focus Mode too with Animated Impact) -->
          <div class="hit-technique-banner" :class="{ 'hit-anim': activeStep >= 0 && (currentHeroTrack[activeStep] || ' ') !== ' ' }">
            <span
              class="technique-dot"
              :style="{ backgroundColor: (currentHeroTrack[activeStep] && STROKE_LABELS[currentHeroTrack[activeStep]]?.color) || currentHeroInstrumentDef.color }"
            ></span>
            <span class="technique-text">
              {{ (currentHeroTrack[activeStep] || ' ') !== ' ' ? (STROKE_LABELS[currentHeroTrack[activeStep]]?.desc || currentHeroTrack[activeStep]) : 'Silence / Écoute' }}
            </span>
          </div>
        </div>

        <!-- Vertical Scrolling Strip: Ultra smooth 60fps continuous highway -->
        <div class="hero-vertical-ribbon">
          <!-- Dynamic multi-cycle nodes with Live Mode Seamless Lookahead -->
          <div
            v-for="node in heroRibbonNodes"
            :key="node.id"
            :class="[
              'hero-v-node',
              node.isFirstBeat ? 'beat-bar-first' : node.isOtherBeat ? 'beat-bar-other' : '',
              Math.abs(node.stepOffset - smoothPosition) < 0.25 ? 'at-target' : '',
              (node.stroke || ' ') !== ' ' ? 'has-v-note' : 'is-rest'
            ]"
            :style="{
              '--v-color': (node.stroke !== ' ' && STROKE_LABELS[node.stroke]?.color) || currentHeroInstrumentDef.color,
              transform: `translateY(${(node.stepOffset - smoothPosition) * -heroSpacing}px)`
            }"
          >
            <!-- Beat divider bar across the highway -->
            <div v-if="node.isFirstBeat || node.isOtherBeat" :class="['beat-horizontal-bar', node.isFirstBeat ? 'first-beat' : 'other-beat']"></div>

            <!-- Note Bubble with Dynamic Color per Stroke Type -->
            <div
              class="v-note-bubble"
              :style="{
                borderColor: (node.stroke !== ' ' && STROKE_LABELS[node.stroke]?.color) || currentHeroInstrumentDef.color
              }"
            >
              <span class="v-note-stroke">
                {{ node.stroke !== ' ' ? node.stroke : '' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Timeline Zoom / Compression Control (When not in focus mode - 100% Visual Icons) -->
      <div v-if="!heroFocusMode" class="hero-zoom-bar">
        <Minimize :size="16" class="text-muted" title="Serrer les notes" />
        <input
          v-model.number="heroSpacing"
          type="range"
          min="45"
          max="140"
          step="5"
          class="modern-slider zoom-slider flex-1"
          title="Espacement et vitesse de défilement visuel"
        />
        <Maximize :size="16" class="text-muted" title="Espacer les notes" />
      </div>

      <!-- Bottom Controls (Universal Harmonized Layout with Focus & Normal Modes) -->
      <footer class="hero-bottom-controls">
        <!-- Thin Upper Track Banner (Current Song & Pattern Name - Present in ALL modes) -->
        <div class="player-top-track-ribbon" style="border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 6px;">
          <span class="ribbon-song-title">{{ currentTune.displayName || currentTune.name }}</span>
          <span class="ribbon-separator">•</span>
          <span class="ribbon-pattern-name">{{ currentPattern?.displayName || currentPatternKey }}</span>
        </div>

        <div class="player-bottom-inner" style="padding-top: 0;">
          <!-- Left: BPM Tempo Controls (Clean -5 / BPM / +5 without inner TAP) -->
          <div class="player-left-col">
            <div class="tempo-control-group">
              <button class="tempo-step-btn" title="Diminuer tempo (-5)" @click="setBpmValue(bpm - 5)">-5</button>
              <div class="tempo-display">
                <span class="bpm-num">{{ bpm }}</span>
                <span class="bpm-unit">BPM</span>
              </div>
              <button class="tempo-step-btn" title="Augmenter tempo (+5)" @click="setBpmValue(bpm + 5)">+5</button>
            </div>
          </div>

          <!-- Center: Master Play Button (Identical Aspect & Strictly Centered) -->
          <div class="player-center-col">
            <button
              :class="['master-play-circle', isPlaying ? 'playing' : '']"
              title="Lecture / Pause (Espace)"
              @click="togglePlay"
            >
              <Square v-if="isPlaying" :size="20" fill="currentColor" />
              <Play v-else :size="22" fill="currentColor" style="margin-left: 3px;" />
            </button>
          </div>

          <!-- Right: Visual Action Icons -->
          <div class="player-right-col">
            <div class="quick-actions">
              <!-- Metronome Multi-mode Button with Direct Volume Popover -->
              <div class="metronome-control-wrapper">
                <button
                  :class="['icon-toggle-btn', metronomeMode !== 'off' ? `active-${metronomeMode}` : '']"
                  :title="metronomeMode === 'off' ? 'Activer métronome (Normal)' : metronomeMode === 'measure' ? 'Basculer métronome (Séquence)' : 'Désactiver métronome'"
                  @click="cycleMetronome"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="metronome-svg">
                    <path d="m5 20 5-16h4l5 16H5z" />
                    <path :class="['metronome-needle', (isPlaying && metronomeMode !== 'off') ? 'needle-swing' : '']" d="M12 18 12 5" />
                    <circle cx="12" cy="11" r="1.8" fill="currentColor" />
                    <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                  </svg>
                </button>
                <button
                  class="metronome-vol-trigger-btn"
                  title="Régler le volume du métronome"
                  @click.stop="showMetronomeVolPopover = !showMetronomeVolPopover"
                >
                  <Volume2 :size="11" />
                </button>

                <!-- Floating Volume Slider Popover -->
                <div v-if="showMetronomeVolPopover" class="metronome-vol-popover" @click.stop>
                  <div class="metronome-popover-header">
                    <span class="popover-title">Volume Clic</span>
                    <strong class="text-teal">{{ Math.round(metronomeVolume * 100) }}%</strong>
                  </div>
                  <input
                    :value="metronomeVolume"
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.05"
                    class="modern-slider"
                    @input="(e) => updateMetronomeVolume(parseFloat((e.target as HTMLInputElement).value))"
                  />
                </div>
              </div>

              <!-- Focus Mode Exit & Return Controls in Right Section -->
              <div v-if="heroFocusMode" class="focus-exit-group">
                <!-- Close Button -->
                <button
                  class="focus-round-btn exit-btn close-variant"
                  title="Fermer le Focus Mode (X / Double-clic)"
                  @click="exitFocusMode"
                >
                  <X :size="18" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>

    </div>

    <!-- GLOBAL FLASH ANNOUNCEMENT OVERLAY (MODE CHANGE) -->
    <transition name="mode-splash-anim">
      <div v-if="showModeFlash" class="global-mode-flash-overlay">
        <div class="mode-flash-card" :style="{ '--flash-glow': modeFlashColor }">
          <div class="mode-flash-icon-box">
            <Zap v-if="modeFlashIcon === 'zap'" :size="38" />
            <Headphones v-else-if="modeFlashIcon === 'headphones'" :size="38" />
            <Sparkles v-else-if="modeFlashIcon === 'groovy'" :size="38" />
            <Trophy v-else-if="modeFlashIcon === 'trophy'" :size="38" />
            <ListMusic v-else-if="modeFlashIcon === 'playlists'" :size="38" />
            <Sliders v-else-if="modeFlashIcon === 'mixer'" :size="38" />
            <Maximize v-else-if="modeFlashIcon === 'focus'" :size="38" />
            <Music v-else :size="38" />
          </div>
          <h1 class="mode-flash-title" :style="{ color: modeFlashColor }">
            {{ modeFlashTitle }}
          </h1>
          <div class="mode-flash-line" :style="{ backgroundColor: modeFlashColor }"></div>
        </div>
      </div>
    </transition>

    <!-- MEDIA & NOTES MODAL DIALOG -->
    <div v-if="showMediaModal" class="modal-overlay" @click.self="showMediaModal = false">
      <div class="modal-card">
        <h3 class="modal-title">Médias & Notes : {{ currentTune.displayName || currentTune.name }}</h3>
        <p class="modal-sub">Ajoutez des liens externes (PDF, vidéo démo, guide audio) et des remarques techniques :</p>

        <div class="form-group mb-2">
          <label>Lien Partition PDF</label>
          <input v-model="editSheetUrl" type="url" placeholder="https://.../partition.pdf" class="text-input" />
        </div>

        <div class="form-group mb-2">
          <label>Lien Vidéo Démo (YouTube, Tube RoR, etc.)</label>
          <input v-model="editVideoUrl" type="url" placeholder="https://.../video" class="text-input" />
        </div>

        <div class="form-group mb-3">
          <label>Notes & Conseils d'interprétation</label>
          <textarea v-model="editTuneNotes" rows="3" placeholder="Ex: Attention à la transition au Break 2, les surdos ralentissent..." class="text-input textarea-input"></textarea>
        </div>

        <div class="modal-buttons">
          <button class="btn-cancel" @click="showMediaModal = false">Annuler</button>
          <button class="btn-confirm" @click="saveMediaSettings">Enregistrer</button>
        </div>
      </div>
    </div>

    <!-- INTERACTIVE ANIMATED TOOLTIP TOUR OVERLAY -->
    <div v-if="showTooltipTour" class="tooltip-tour-backdrop" @click.self="closeTooltipTour">
      <div class="tooltip-tour-card">
        <div class="tooltip-card-header">
          <div class="d-flex align-items-center gap-2">
            <Sparkles :size="15" class="text-teal" />
            <span class="tooltip-badge">Guide {{ currentTooltipStep + 1 }} / {{ tooltipSteps.length }}</span>
          </div>
          <button class="modal-close-icon" @click="closeTooltipTour">
            <X :size="16" />
          </button>
        </div>

        <div class="tooltip-card-body">
          <h4 class="tooltip-title animated-gradient-text">{{ tooltipSteps[currentTooltipStep].title }}</h4>
          <p class="tooltip-text">{{ tooltipSteps[currentTooltipStep].text }}</p>
        </div>

        <div class="tooltip-dots-row">
          <span
            v-for="(_, idx) in tooltipSteps"
            :key="idx"
            :class="['tutorial-dot', idx === currentTooltipStep ? 'active' : '']"
            @click="currentTooltipStep = idx"
          ></span>
        </div>

        <div class="tooltip-actions-row">
          <button v-if="currentTooltipStep > 0" class="btn-cancel btn-sm" @click="prevTooltip">
            <ChevronLeft :size="14" />
            <span>Précédent</span>
          </button>
          <button class="btn-confirm btn-sm ml-auto" @click="nextTooltip">
            <span>{{ currentTooltipStep === tooltipSteps.length - 1 ? 'Terminer !' : 'Suivant' }}</span>
            <ChevronRight v-if="currentTooltipStep < tooltipSteps.length - 1" :size="14" />
            <CheckCircle2 v-else :size="14" />
          </button>
        </div>
      </div>
    </div>

    <!-- FEEDBACK & SUGGESTIONS MODAL DIALOG -->
    <div v-if="showFeedbackModal" class="modal-overlay" @click.self="showFeedbackModal = false">
      <div class="modal-card feedback-modal-card">
        <div class="modal-header-row">
          <div class="d-flex align-items-center gap-2">
            <MessageSquare :size="18" class="text-pink" />
            <h3 class="modal-title m-0">Avis & Boîte à suggestions</h3>
          </div>
          <button class="modal-close-icon" @click="showFeedbackModal = false">
            <X :size="18" />
          </button>
        </div>
        <p class="modal-sub">Partagez vos retours pour améliorer l'application, suggérer de nouveaux morceaux ou signaler une coquille :</p>

        <!-- Success Toast Alert -->
        <div v-if="feedbackSuccessMsg" class="feedback-success-banner">
          <CheckCircle2 :size="16" class="text-teal flex-shrink-0" />
          <span>Merci pour votre suggestion ! Elle a bien été enregistrée.</span>
        </div>

        <!-- Submission Form -->
        <div class="feedback-form-box">
          <div class="form-row mb-2">
            <div class="form-group flex-1">
              <label>Votre prénom / Pupitre</label>
              <input v-model="feedbackAuthor" type="text" placeholder="Ex: Lucas (Caixa)" class="text-input" />
            </div>
            <div class="form-group">
              <label>Catégorie</label>
              <select v-model="feedbackCategory" class="text-input">
                <option value="suggestion">💡 Idée / Évolution</option>
                <option value="musique">🥁 Morceau / Rythme</option>
                <option value="bug">🐛 Bug / Affichage</option>
                <option value="autre">💬 Autre remarque</option>
              </select>
            </div>
          </div>

          <div class="form-group mb-2">
            <label>Votre message / suggestion</label>
            <textarea
              v-model="feedbackText"
              rows="3"
              placeholder="Ex: J'aimerais qu'on puisse changer la couleur des surdos ou ajouter un compte à rebours..."
              class="text-input textarea-input"
            ></textarea>
          </div>

          <!-- Optional Image Attachment -->
          <div class="feedback-image-uploader mb-3">
            <input ref="feedbackFileInput" type="file" accept="image/*" class="d-none" @change="handleFeedbackImage" />
            <div v-if="!feedbackImageBase64" class="d-flex align-items-center gap-2">
              <button type="button" class="btn-cancel btn-sm d-flex align-items-center gap-1" @click="feedbackFileInput?.click()">
                <Image :size="14" />
                <span>Joindre une capture / photo</span>
              </button>
              <span class="text-xs text-muted">(Optionnel, modérée avant affichage)</span>
            </div>
            <div v-else class="feedback-preview-box">
              <img :src="feedbackImageBase64" alt="Aperçu" class="feedback-img-preview" />
              <div class="d-flex flex-column gap-1 flex-1">
                <span class="text-xs text-teal font-weight-bold">Photo jointe ✓</span>
                <span class="text-xs text-muted">Visible après validation du modérateur</span>
              </div>
              <button type="button" class="btn-cancel btn-sm" @click="removeFeedbackImage">
                <X :size="13" />
              </button>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center">
            <button type="button" class="text-xs text-muted btn-admin-toggle" @click="adminMode = !adminMode">
              {{ adminMode ? '🔒 Mode utilisateur' : '⚙️ Modération' }}
            </button>
            <button class="btn-confirm send-feedback-btn" :disabled="!feedbackText.trim() && !feedbackImageBase64" @click="submitFeedback">
              <Send :size="14" />
              <span>Envoyer l'avis</span>
            </button>
          </div>
        </div>

        <!-- Existing Community Suggestions List -->
        <div class="feedback-history-section mt-4">
          <div class="history-section-header d-flex justify-content-between align-items-center">
            <span class="history-title">Retours et idées récents ({{ feedbackList.length }})</span>
            <span v-if="adminMode" class="badge-admin">MODE MODÉRATION ACTIF</span>
          </div>

          <div class="feedback-list-scroll">
            <div v-for="item in feedbackList" :key="item.id" class="feedback-item-card">
              <div class="feedback-item-top">
                <div class="d-flex align-items-center gap-2">
                  <strong class="feedback-author">{{ item.author }}</strong>
                  <span :class="['feedback-cat-tag', `tag-${item.category}`]">
                    {{ item.category === 'suggestion' ? '💡 Idée' : item.category === 'musique' ? '🥁 Rythme' : item.category === 'bug' ? '🐛 Bug' : '💬 Autre' }}
                  </span>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span class="feedback-date">{{ item.date }}</span>
                  <button class="feedback-del-btn" title="Supprimer" @click="deleteFeedback(item.id)">
                    <X :size="12" />
                  </button>
                </div>
              </div>
              <p v-if="item.text" class="feedback-text">{{ item.text }}</p>

              <!-- Image Display (If approved or in Admin Mode) -->
              <div v-if="item.image" class="feedback-attached-image-box mt-2">
                <template v-if="item.approved || adminMode">
                  <img :src="item.image" alt="Capture jointe" class="feedback-attached-img" />
                  <div v-if="adminMode" class="admin-approval-bar">
                    <span :class="['status-chip', item.approved ? 'approved' : 'pending']">
                      {{ item.approved ? '✓ Approuvée (Publique)' : '⏳ En attente d\'approbation' }}
                    </span>
                    <button class="btn-approve-toggle" @click="toggleFeedbackApproval(item.id)">
                      {{ item.approved ? 'Masquer' : 'Approuver la photo' }}
                    </button>
                  </div>
                </template>
                <div v-else class="image-pending-placeholder">
                  <ImageIcon :size="14" class="text-muted" />
                  <span>Image en cours de modération</span>
                </div>
              </div>
            </div>
            <div v-if="feedbackList.length === 0" class="empty-feedbacks">
              Aucun avis déposé pour le moment. Soyez le premier à contribuer !
            </div>
          </div>
        </div>

        <div class="modal-buttons mt-3">
          <button class="btn-cancel w-100" @click="showFeedbackModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- EXPORT / IMPORT / QR CODE / RESET MODAL -->
    <div v-if="showExportImportModal" class="modal-overlay" @click.self="showExportImportModal = false">
      <div class="modal-card export-import-modal-card">
        <div class="modal-header-row mb-2">
          <div class="d-flex align-items-center gap-2">
            <Share2 :size="18" class="text-teal" />
            <h3 class="modal-title m-0">Gestion du Répertoire & Partage</h3>
          </div>
          <button class="modal-close-icon" @click="showExportImportModal = false">
            <X :size="18" />
          </button>
        </div>
        <p class="modal-sub">Sauvegardez, exportez, importez ou restaurez vos morceaux et vos playlists :</p>

        <!-- Navigation Tabs -->
        <div class="modal-tabs-row mb-3">
          <button
            :class="['tab-pill', exportImportTab === 'scan' ? 'active' : '']"
            @click="exportImportTab = 'scan'; startQrCameraScanner()"
          >
            <Camera :size="14" />
            <span>Scanner QR Code</span>
          </button>
          <button
            :class="['tab-pill', exportImportTab === 'qrcode' ? 'active' : '']"
            @click="exportImportTab = 'qrcode'; generateSpecificTuneQrCode(shareTuneTarget || currentTune)"
          >
            <QrCode :size="14" />
            <span>Afficher QR Code</span>
          </button>
          <button
            :class="['tab-pill', exportImportTab === 'import' ? 'active' : '']"
            @click="exportImportTab = 'import'; stopQrCameraScanner()"
          >
            <FileUp :size="14" />
            <span>Importer JSON</span>
          </button>
          <button
            :class="['tab-pill', exportImportTab === 'export' ? 'active' : '']"
            @click="exportImportTab = 'export'; stopQrCameraScanner()"
          >
            <FileDown :size="14" />
            <span>Exporter</span>
          </button>
          <button
            :class="['tab-pill', 'danger-tab', exportImportTab === 'reset' ? 'active' : '']"
            @click="exportImportTab = 'reset'; stopQrCameraScanner()"
          >
            <RotateCcw :size="14" />
            <span>Réinitialiser</span>
          </button>
        </div>

        <!-- TAB 0: SCAN QR CODE VIA CAMERA -->
        <div v-if="exportImportTab === 'scan'" class="tab-content-box text-center">
          <h4 class="subhead-title justify-content-center mb-1"><Camera :size="16" class="text-teal" /> Scanner un QR Code de Morceau</h4>
          <p class="hint-text mb-2">Visez le QR Code affiché sur le smartphone ou la partition d'un autre musicien :</p>
          
          <div id="qr-reader-video-box" class="camera-scanner-frame"></div>
          
          <div v-if="scanErrorMsg" class="scanner-error-banner mt-2">
            <AlertTriangle :size="14" class="flex-shrink-0" />
            <span>{{ scanErrorMsg }}</span>
          </div>

          <div class="d-flex justify-content-center gap-2 mt-3">
            <button class="action-btn-outline" @click="startQrCameraScanner">
              <RotateCcw :size="14" />
              <span>Redémarrer la caméra</span>
            </button>
          </div>
        </div>

        <!-- TAB 1: EXPORT -->
        <div v-if="exportImportTab === 'export'" class="tab-content-box">
          <div class="export-card mb-3">
            <h4 class="subhead-title mb-1"><FileDown :size="16" class="text-teal" /> Télécharger une sauvegarde complète</h4>
            <p class="hint-text mb-2">
              Télécharge l'intégralité de votre répertoire ({{ Object.keys(tunes).length }} morceaux et {{ playlists.length }} playlists) sous forme de fichier JSON autonome.
            </p>
            <button class="action-btn-primary" @click="downloadExportFile">
              <Download :size="14" />
              <span>Télécharger le fichier .json</span>
            </button>
          </div>

          <div class="export-card">
            <h4 class="subhead-title mb-1"><Link :size="16" class="text-teal" /> Morceau actuel : {{ currentTune.displayName || currentTune.name }}</h4>
            <p class="hint-text mb-2">Exportez uniquement ce morceau pour l'envoyer à vos musiciens.</p>
            <button
              class="action-btn-outline"
              @click="downloadSingleTune(currentTune)"
            >
              <Download :size="14" />
              <span>Télécharger {{ currentTune.displayName || currentTune.name }} (.json)</span>
            </button>
          </div>
        </div>

        <!-- TAB 2: IMPORT -->
        <div v-if="exportImportTab === 'import'" class="tab-content-box">
          <div v-if="!isMaestro" class="warning-card mb-3">
            <div class="d-flex align-items-center gap-2 text-warning mb-1">
              <Lock :size="16" />
              <h4 class="subhead-title text-warning m-0">Mode Maestro Requis pour injection globale</h4>
            </div>
            <p class="hint-text mb-2">
              L'importation globale sur le serveur pour tous les musiciens nécessite le Mode Maestro. Sans mot de passe Maestro, l'import reste uniquement local sur votre navigateur.
            </p>
            <button class="action-btn-primary" @click="showMaestroModal = true">
              <Crown :size="14" />
              <span>Activer le Mode Maestro</span>
            </button>
          </div>

          <!-- 1. Import from File -->
          <div class="export-card mb-3">
            <h4 class="subhead-title mb-1"><FileUp :size="16" class="text-teal" /> Importer depuis un fichier JSON</h4>
            <p class="hint-text mb-2">Sélectionnez un fichier .json exporté depuis Batucada Studio :</p>
            <input ref="importFileRef" type="file" accept=".json" class="d-none" @change="handleImportFile" />
            <button class="action-btn-primary" @click="importFileRef?.click()">
              <Upload :size="14" />
              <span>Choisir un fichier .json</span>
            </button>
          </div>

          <!-- 2. Import from URL -->
          <div class="export-card mb-3">
            <h4 class="subhead-title mb-1"><Link :size="16" class="text-teal" /> Importer depuis une URL</h4>
            <p class="hint-text mb-1">Collez l'adresse d'un fichier JSON distant :</p>
            <div class="d-flex gap-2">
              <input v-model="importUrlText" type="url" placeholder="https://example.com/repertoire.json" class="text-input flex-1" />
              <button class="btn-confirm" :disabled="!importUrlText.trim()" @click="handleImportUrl">Charger</button>
            </div>
          </div>

          <!-- 3. Import Raw JSON Text -->
          <div class="export-card">
            <h4 class="subhead-title mb-1"><Edit3 :size="16" class="text-teal" /> Coller du texte JSON brut</h4>
            <textarea v-model="importJsonText" rows="3" placeholder="Collez le code JSON ici..." class="text-input textarea-input mb-2"></textarea>
            <button class="btn-confirm" :disabled="!importJsonText.trim()" @click="handleImportJsonText">Importer le texte</button>
          </div>
        </div>

        <!-- TAB 3: QR CODE -->
        <div v-if="exportImportTab === 'qrcode'" class="tab-content-box text-center">
          <h4 class="subhead-title justify-content-center mb-1"><QrCode :size="16" class="text-teal" /> Flasher pour partager : {{ currentTune.displayName || currentTune.name }}</h4>
          <p class="hint-text mb-3">Vos musiciens peuvent scanner ce QR code avec leur smartphone pour charger instantanément la partition et les patterns :</p>
          <div v-if="qrcodeDataUrl" class="qrcode-wrapper mb-3">
            <img :src="qrcodeDataUrl" alt="QR Code Morceau" class="qrcode-img" />
          </div>
          <div class="d-flex justify-content-center gap-2">
            <button class="action-btn-outline" @click="generateTuneQrCode">
              <RotateCcw :size="14" />
              <span>Régénérer</span>
            </button>
          </div>
        </div>

        <!-- TAB 4: RESET / CLEAR -->
        <div v-if="exportImportTab === 'reset'" class="tab-content-box">
          <div class="warning-card mb-3">
            <div class="d-flex align-items-center gap-2 text-warning mb-1">
              <RotateCcw :size="16" />
              <h4 class="subhead-title text-warning m-0">Rétablir le répertoire par défaut</h4>
            </div>
            <p class="hint-text mb-2">
              Remet à zéro et réinstalle les <strong>52 morceaux d'origine</strong> de Batucada Studio (standards, Afoxe, Samba Reggae, etc.).
            </p>
            <button class="action-btn-outline" @click="resetToDefaultTunes">
              <span>Restaurer les 52 morceaux</span>
            </button>
          </div>

          <div class="danger-zone-card">
            <div class="d-flex align-items-center gap-2 text-danger mb-1">
              <AlertTriangle :size="16" />
              <h4 class="subhead-title text-danger m-0">Zone Danger : Tout supprimer</h4>
            </div>
            <p class="hint-text mb-2">
              Supprime l'intégralité des morceaux et compositions enregistrés sur votre session pour repartir d'une page blanche.
            </p>
            <button class="action-btn-small danger" @click="clearAllTunes">
              <Trash2 :size="14" />
              <span>Effacer tous les morceaux</span>
            </button>
          </div>
        </div>

        <div class="modal-buttons mt-4">
          <button class="btn-cancel w-100" @click="showExportImportModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- KEYBOARD SHORTCUTS HELP MODAL -->
    <div v-if="showKeyboardHelpModal" class="modal-overlay" @click.self="showKeyboardHelpModal = false">
      <div class="modal-card shortcuts-modal-card">
        <div class="modal-header-row mb-3">
          <div class="d-flex align-items-center gap-2">
            <Keyboard :size="18" class="text-teal" />
            <h3 class="modal-title m-0">Raccourcis Clavier</h3>
          </div>
          <button class="modal-close-icon" @click="showKeyboardHelpModal = false">
            <X :size="18" />
          </button>
        </div>
        <p class="modal-sub">Naviguez, éditez et contrôlez la répétition à toute vitesse depuis votre clavier d'ordinateur :</p>

        <div class="shortcuts-grid">
          <div class="shortcut-row">
            <kbd class="key-badge">Espace</kbd>
            <span class="shortcut-desc">Lecture / Pause du morceau</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">M</kbd>
            <span class="shortcut-desc">Activer / Changer le mode métronome</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">S</kbd>
            <span class="shortcut-desc">Basculer entre Mode Écoute ↔️ Studio</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">G</kbd>
            <span class="shortcut-desc">Ouvrir / Fermer le mode Groovy Beat</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">L</kbd>
            <span class="shortcut-desc">Activer / Désactiver le Mode LIVE Aléatoire</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">F</kbd>
            <span class="shortcut-desc">Activer / Quitter le Focus Mode Plein Écran</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">T</kbd>
            <span class="shortcut-desc">TAP Tempo au rythme</span>
          </div>
          <div class="shortcut-row">
            <div class="d-flex gap-1">
              <kbd class="key-badge">↑</kbd>
              <kbd class="key-badge">↓</kbd>
            </div>
            <span class="shortcut-desc">Augmenter / Diminuer le Tempo (+/- 5 BPM)</span>
          </div>
          <div class="shortcut-row">
            <div class="d-flex gap-1">
              <kbd class="key-badge">←</kbd>
              <kbd class="key-badge">→</kbd>
            </div>
            <span class="shortcut-desc">Changer de Break / Séquence (Pattern)</span>
          </div>
          <div class="shortcut-row">
            <kbd class="key-badge">?</kbd>
            <span class="shortcut-desc">Afficher cette aide des raccourcis</span>
          </div>
        </div>

        <div class="modal-buttons mt-4">
          <button class="btn-confirm w-100" @click="showKeyboardHelpModal = false">Fermer (Échap)</button>
        </div>
      </div>
    </div>

    <!-- GUIDE & SOLFÈGE HELP MODAL -->
    <div v-if="showGuideModal" class="modal-overlay" @click.self="showGuideModal = false">
      <div class="modal-card doc-modal-card">
        <div class="modal-header-row mb-3">
          <div class="d-flex align-items-center gap-2">
            <BookOpen :size="18" class="text-teal" />
            <h3 class="modal-title m-0">Aide & Guide Solfégique</h3>
          </div>
          <button class="modal-close-icon" @click="showGuideModal = false">
            <X :size="18" />
          </button>
        </div>

        <div class="doc-modal-content">
          <section class="doc-section">
            <h4 class="doc-heading text-teal">🥁 Notations des Coups & Frappes</h4>
            <div class="doc-strokes-grid">
              <div v-for="(info, key) in STROKE_LABELS" :key="key" class="doc-stroke-item">
                <span class="doc-stroke-key" :style="{ backgroundColor: info.color }">{{ key }}</span>
                <div class="doc-stroke-details">
                  <strong>{{ info.label }}</strong>
                  <span class="text-muted text-xs">{{ info.desc }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="doc-section">
            <h4 class="doc-heading text-teal">🎼 Signatures Rythmiques & Solfège</h4>
            <ul class="doc-list">
              <li><strong>4/4 (Binaire standard) :</strong> 4 temps de 4 doubles-croches par mesure (16 pas / mesure).</li>
              <li><strong>6/8 (Ternaire) :</strong> 2 temps ternaires de 3 croches par mesure (6 pas / mesure).</li>
              <li><strong>3/4 (Valse binaire) :</strong> 3 temps de 2 croches par mesure (6 pas / mesure).</li>
              <li><strong>4/4 Triolets (time: 12) :</strong> 4 temps ternaires de 3 croches (12 subdivisions par temps).</li>
            </ul>
          </section>

          <section class="doc-section">
            <h4 class="doc-heading text-teal">🚀 Fonctionnalités Clés</h4>
            <ul class="doc-list">
              <li><strong>Groovy Beat :</strong> Highway verticale à 60fps avec anticipation des notes à 75%.</li>
              <li><strong>Mode LIVE :</strong> Enchaîne aléatoirement les breaks avec alerte visuelle et lookahead fluide.</li>
              <li><strong>Mode Focus :</strong> Cliquez directement sur le highway pour épurer l'interface au maximum.</li>
              <li><strong>Décompte 1-2-3-4 :</strong> Préparez votre entrée en mesure avec 4 clics préparatoires.</li>
            </ul>
          </section>
        </div>

        <div class="modal-buttons mt-4">
          <button class="btn-confirm w-100" @click="showGuideModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- CHANGELOG MODAL -->
    <div v-if="showChangelogModal" class="modal-overlay" @click.self="showChangelogModal = false">
      <div class="modal-card doc-modal-card">
        <div class="modal-header-row mb-3">
          <div class="d-flex align-items-center gap-2">
            <History :size="18" class="text-teal" />
            <h3 class="modal-title m-0">Journal des Modifications (Changelog)</h3>
          </div>
          <button class="modal-close-icon" @click="showChangelogModal = false">
            <X :size="18" />
          </button>
        </div>

        <div class="doc-modal-content changelog-scroll-area">
          <div class="changelog-version-block">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="build-badge version-badge">v1.4.3 (Actuelle)</span>
              <span class="text-xs text-muted">26 Août 2026</span>
            </div>
            <ul class="doc-list">
              <li><strong>Indice de Build & Version :</strong> Affichage en temps réel de la version et de l'horodatage précis de build dans les Réglages.</li>
              <li><strong>Guide & Changelog Intégrés :</strong> Consultation directe de l'aide solfégique et de l'historique des versions depuis l'application.</li>
              <li><strong>Cycle Bouton Accompagnants (Groovy Beat) :</strong> 1er appui = Tout activer, 2ème appui = Tiroir de mixage, 3ème appui = Couper tous les accompagnements.</li>
              <li><strong>Lookahead Continu en Mode Live :</strong> Préparation continue du prochain motif évitant toute rupture d'affichage sur le ruban vertical.</li>
              <li><strong>Résolution Solfégique 6/8 & 12 :</strong> Calibrage parfait du tempo et des longueurs de notes pour les morceaux et breaks en triolets (Coupé-Décalé, Bhangra, Walc(z)...).</li>
            </ul>
          </div>

          <div class="changelog-version-block mt-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="build-badge">v1.4.2</span>
              <span class="text-xs text-muted">25 Août 2026</span>
            </div>
            <ul class="doc-list">
              <li><strong>Ancrage Fixe du Header :</strong> Navigation haute permanente en haut d'écran sans perte lors du défilement.</li>
            </ul>
          </div>

          <div class="changelog-version-block mt-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="build-badge">v1.4.1</span>
              <span class="text-xs text-muted">25 Août 2026</span>
            </div>
            <ul class="doc-list">
              <li><strong>Correction Solfégique des 52 Morceaux :</strong> Élimination des décalages sur Bhangra, Coupé-Décalé, Angela Davis, Bomba, etc.</li>
            </ul>
          </div>

          <div class="changelog-version-block mt-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="build-badge">v1.4.0</span>
              <span class="text-xs text-muted">25 Août 2026</span>
            </div>
            <ul class="doc-list">
              <li><strong>Flash Titre (~0.5s) :</strong> Transition stylisée lors des bascules de mode (Écoute, Studio, Groovy Beat, Focus).</li>
              <li><strong>Mode Focus Épuré au clic :</strong> Passage en immersion totale en cliquant sur la piste de jeu.</li>
              <li><strong>Design Responsive 2 Lignes :</strong> Cartes de breaks structurées et lisibles sur mobile.</li>
            </ul>
          </div>
        </div>

        <div class="modal-buttons mt-4">
          <button class="btn-confirm w-100" @click="showChangelogModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- MAESTRO AUTHENTICATION & MANAGEMENT MODAL -->
    <div v-if="showMaestroModal" class="modal-overlay" @click.self="showMaestroModal = false">
      <div class="modal-card maestro-modal-card">
        <div class="modal-header-row mb-3">
          <div class="d-flex align-items-center gap-2">
            <Crown :size="20" class="text-pink" />
            <h3 class="modal-title m-0">Espace Maestro</h3>
          </div>
          <button class="modal-close-icon" @click="showMaestroModal = false">
            <X :size="18" />
          </button>
        </div>

        <!-- Mode Non Connecté (Saisie du PIN) -->
        <div v-if="!isMaestro" class="maestro-auth-body">
          <p class="modal-sub">
            Le <strong>Mode Maestro</strong> permet de gérer la bibliothèque officielle de morceaux (ajouts, modifications, suppressions définitives) pour l'ensemble des musiciens connectés au serveur.
          </p>

          <div class="form-group mb-3">
            <label class="d-flex align-items-center gap-1 mb-1">
              <KeyRound :size="14" class="text-pink" /> Code PIN Maestro :
            </label>
            <input
              v-model="maestroPinInput"
              type="password"
              placeholder="Saisissez votre code PIN..."
              class="text-input text-center font-mono"
              autofocus
              @keyup.enter="verifyMaestroPin"
            />
            <div v-if="maestroPinError" class="text-danger mt-1 text-sm">{{ maestroPinError }}</div>
          </div>

          <div class="modal-buttons mt-3">
            <button class="btn-cancel" @click="showMaestroModal = false">Annuler</button>
            <button class="btn-confirm maestro-unlock-btn" @click="verifyMaestroPin">
              <Unlock :size="14" />
              <span>Déverrouiller</span>
            </button>
          </div>
        </div>

        <!-- Mode Connecté (Statut & Actions Maestro) -->
        <div v-else class="maestro-active-body">
          <div class="maestro-status-card mb-3">
            <div class="d-flex align-items-center gap-2 text-pink mb-1">
              <ShieldCheck :size="18" />
              <strong class="text-md">Mode Maestro Actif</strong>
            </div>
            <p class="hint-text mb-0">
              Vous avez tous les privilèges pour composer, renommer, injecter et supprimer des morceaux sur le serveur.
            </p>
          </div>

          <!-- Modifier le code PIN -->
          <div v-if="maestroChangePinMode" class="change-pin-box mb-3">
            <h4 class="subhead-title mb-2"><KeyRound :size="15" class="text-teal" /> Modifier le code PIN</h4>
            <div class="form-group mb-2">
              <label class="text-xs text-muted mb-1">Code PIN Actuel :</label>
              <input v-model="maestroOldPinInput" type="password" class="text-input font-mono" />
            </div>
            <div class="form-group mb-2">
              <label class="text-xs text-muted mb-1">Nouveau Code PIN (min 4 car.) :</label>
              <input v-model="maestroNewPinInput" type="password" class="text-input font-mono" />
            </div>
            <div v-if="maestroPinError" class="text-danger mt-1 mb-2 text-sm">{{ maestroPinError }}</div>
            <div class="d-flex gap-2">
              <button class="action-btn-outline" @click="maestroChangePinMode = false">Annuler</button>
              <button class="action-btn-primary" @click="changeMaestroPin">Sauvegarder le PIN</button>
            </div>
          </div>

          <div v-else class="d-flex flex-column gap-2 mb-3">
            <button class="action-btn-outline justify-content-center" @click="syncTunesToServer">
              <RotateCcw :size="14" />
              <span>{{ isSyncingWithServer ? 'Synchronisation...' : 'Forcer la synchronisation avec le serveur' }}</span>
            </button>
            <button class="action-btn-outline justify-content-center" @click="maestroChangePinMode = true">
              <KeyRound :size="14" />
              <span>Changer le code PIN Maestro</span>
            </button>
          </div>

          <div class="modal-buttons mt-3">
            <button class="action-btn-small danger w-100 justify-content-center" @click="lockMaestro">
              <Lock :size="14" />
              <span>Verrouiller le Mode Maestro (Repasser Élève)</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- NEW TUNE MODAL POPUP -->
    <div v-if="showNewTuneModal" class="modal-overlay" @click.self="showNewTuneModal = false">
      <div class="modal-card">
        <h3 class="modal-title">Créer un nouveau morceau</h3>
        <p class="modal-sub">Définissez le nom et le tempo de base pour commencer la composition :</p>
        
        <div class="form-group mb-3">
          <label>Nom du Morceau</label>
          <input v-model="newTuneName" type="text" placeholder="Ex: Samba de Janeiro, Afro Break..." class="text-input" autofocus />
        </div>

        <div class="form-row mb-4">
          <div class="form-group">
            <label>Tempo initial (BPM)</label>
            <input v-model.number="newTuneBpm" type="number" min="50" max="220" class="text-input" />
          </div>
          <div class="form-group">
            <label>Mesure</label>
            <select v-model.number="newTuneSignature" class="text-input">
              <option :value="4">4/4 (Standard 16 temps)</option>
              <option :value="3">6/8 (Ternaire 12 temps)</option>
            </select>
          </div>
        </div>

        <div class="modal-buttons">
          <button class="btn-cancel" @click="showNewTuneModal = false">Annuler</button>
          <button class="btn-confirm" @click="confirmCreateNewTune">Créer & Composer</button>
        </div>
      </div>
    </div>

    <!-- FLOATING MASTER PLAYER BAR (FIXED BOTTOM ANCHORED) -->
    <footer class="player-bottom-bar">
      <!-- Thin Upper Track Banner (Current Song & Pattern Name) -->
      <div class="player-top-track-ribbon" @click="currentTab = 'musician'">
        <span class="ribbon-song-title">{{ currentTune.displayName || currentTune.name }}</span>
        <span class="ribbon-separator">•</span>
        <span class="ribbon-pattern-name">{{ currentPattern?.displayName || currentPatternKey }}</span>
      </div>

      <div class="player-bottom-inner">
        <!-- Left: BPM Tempo Controls (Positioned to the left of Play) -->
        <div class="player-left-col">
          <div class="tempo-control-group">
            <button class="tempo-step-btn" title="Diminuer tempo (-5)" @click="setBpmValue(bpm - 5)">-5</button>
            <div class="tempo-display">
              <span class="bpm-num">{{ bpm }}</span>
              <span class="bpm-unit">BPM</span>
            </div>
            <button class="tempo-step-btn" title="Augmenter tempo (+5)" @click="setBpmValue(bpm + 5)">+5</button>
            <button class="tap-btn d-none-mobile" title="Tap Tempo" @click="tapTempo">TAP</button>
          </div>
        </div>

        <!-- Center: Master Play Button (Strictly in the absolute center) -->
        <div class="player-center-col">
          <button
            :class="['master-play-circle', isPlaying ? 'playing' : '']"
            title="Lecture / Pause (Espace)"
            @click="togglePlay"
          >
            <Square v-if="isPlaying" :size="20" fill="currentColor" />
            <Play v-else :size="22" fill="currentColor" style="margin-left: 3px;" />
          </button>
        </div>

        <!-- Right: Visual Action Icons -->
        <div class="player-right-col">
          <div class="quick-actions">
            <!-- Metronome Visual Button with Active State Color & Direct Volume Popover -->
            <div class="metronome-control-wrapper">
              <button
                :class="['icon-toggle-btn', metronomeMode !== 'off' ? `active-${metronomeMode}` : '']"
                :title="metronomeMode === 'off' ? 'Activer métronome (Normal)' : metronomeMode === 'measure' ? 'Basculer métronome (Séquence)' : 'Désactiver métronome'"
                @click="cycleMetronome"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="metronome-svg">
                  <path d="m5 20 5-16h4l5 16H5z" />
                  <path :class="['metronome-needle', (isPlaying && metronomeMode !== 'off') ? 'needle-swing' : '']" d="M12 18 12 5" />
                  <circle cx="12" cy="11" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                </svg>
              </button>
              <button
                class="metronome-vol-trigger-btn"
                title="Régler le volume du métronome"
                @click.stop="showMetronomeVolPopover = !showMetronomeVolPopover"
              >
                <Volume2 :size="11" />
              </button>

              <!-- Floating Volume Slider Popover -->
              <div v-if="showMetronomeVolPopover" class="metronome-vol-popover" @click.stop>
                <div class="metronome-popover-header">
                  <span class="popover-title">Volume Clic</span>
                  <strong class="text-teal">{{ Math.round(metronomeVolume * 100) }}%</strong>
                </div>
                <input
                  :value="metronomeVolume"
                  type="range"
                  min="0"
                  max="1.2"
                  step="0.05"
                  class="modern-slider"
                  @input="(e) => updateMetronomeVolume(parseFloat((e.target as HTMLInputElement).value))"
                />
              </div>
            </div>

            <!-- Playlists Button -->
            <button
              :class="['icon-toggle-btn', currentTab === 'playlists' ? 'active' : '']"
              title="Playlists"
              @click="currentTab = currentTab === 'playlists' ? 'musician' : 'playlists'"
            >
              <ListMusic :size="17" />
            </button>

            <!-- Settings / Mixer & Feedback Button -->
            <button
              :class="['icon-toggle-btn', currentTab === 'mixer' ? 'active' : '']"
              title="Ouvrir le mixeur, réglages & avis"
              @click="currentTab = currentTab === 'mixer' ? 'musician' : 'mixer'"
            >
              <Sliders :size="17" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* DYNAMIC THEMES (DARK & LIGHT) */
.theme-dark {
  --bg-app: #0f141c;
  --bg-navbar: rgba(17, 24, 37, 0.94);
  --bg-card: #161f2e;
  --bg-card-inner: #1a2436;
  --bg-card-hover: #202d42;
  --border-color: rgba(255, 255, 255, 0.07);
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --accent-color: #14b8a6;
  --accent-contrast: #042f2e;
}

/* Thèmes spécifiques par mode */
/* 1. Mode Écoute : Cyan / Saphir élégant */
.app-shell.mode-theme-musician {
  --accent-color: #14b8a6;
  --accent-contrast: #042f2e;
}

/* 2. Mode Studio : Ambre / Or de composition */
.app-shell.mode-theme-studio {
  --accent-color: #f59e0b;
  --accent-contrast: #451a03;
}

/* 3. Mode Groovy Beat : Émeraude / Lime électrisant */
.app-shell.mode-theme-groovy {
  --accent-color: #10b981;
  --accent-contrast: #022c22;
}

.theme-light {
  --bg-app: #f8fafc;
  --bg-navbar: rgba(255, 255, 255, 0.96);
  --bg-card: #ffffff;
  --bg-card-inner: #f1f5f9;
  --bg-card-hover: #e2e8f0;
  --border-color: rgba(0, 0, 0, 0.08);
  --text-main: #0f172a;
  --text-muted: #64748b;
  --accent-color: #0d9488;
  --accent-contrast: #ffffff;
}

.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  position: relative;
  background-color: var(--bg-app);
  color: var(--text-main);
  user-select: none;
  transition: background-color 0.2s, color 0.2s;
}

/* Header (Fixed Top Anchored) */
.navbar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  background: var(--bg-navbar);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}

.navbar-inner-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1320px;
  width: 100%;
  gap: 12px;
  box-sizing: border-box;
}

.brand-area {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 0;
}

.brand-avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

.brand-emoji-glow {
  font-size: 1.75rem;
  line-height: 1;
  display: inline-block;
  filter: drop-shadow(0 0 10px rgba(20, 184, 166, 0.8)) drop-shadow(0 0 20px rgba(236, 72, 153, 0.5));
  animation: emojiFloatGlow 3s infinite ease-in-out alternate;
  cursor: pointer;
  transform-origin: center;
}

@keyframes emojiFloatGlow {
  0% {
    transform: translateY(0) rotate(-3deg) scale(1);
    filter: drop-shadow(0 0 8px rgba(20, 184, 166, 0.7)) drop-shadow(0 0 15px rgba(236, 72, 153, 0.4));
  }
  50% {
    transform: translateY(-2px) rotate(3deg) scale(1.06);
    filter: drop-shadow(0 0 14px rgba(20, 184, 166, 0.95)) drop-shadow(0 0 25px rgba(236, 72, 153, 0.7));
  }
  100% {
    transform: translateY(0) rotate(-2deg) scale(1.02);
    filter: drop-shadow(0 0 10px rgba(20, 184, 166, 0.8)) drop-shadow(0 0 18px rgba(236, 72, 153, 0.5));
  }
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-emoji {
  font-size: 1.3rem;
  line-height: 1;
}

.brand-text-block {
  min-width: 0;
}

.brand-title {
  font-size: 0.95rem;
  font-weight: 800;
  margin: 0;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-sub {
  font-size: 0.68rem;
  color: var(--text-muted);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hero-mode-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 9999px;
  border: 1px solid rgba(236, 72, 153, 0.4);
  background: rgba(236, 72, 153, 0.15);
  color: #f43f5e;
  font-size: 0.74rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(236, 72, 153, 0.25);
  transition: transform 0.15s, background 0.2s, box-shadow 0.2s;
  flex-shrink: 0;
  box-sizing: border-box;
}

.hero-mode-trigger:hover {
  transform: scale(1.04);
  background: rgba(236, 72, 153, 0.25);
  box-shadow: 0 0 18px rgba(236, 72, 153, 0.45);
}

.hero-mode-trigger:active {
  transform: scale(0.95);
}

.organic-play-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec4899, #8b5cf6);
  color: #fff;
  flex-shrink: 0;
}

.organic-play-icon.mini {
  width: 18px;
  height: 18px;
}

.organic-play-icon.micro {
  width: 14px;
  height: 14px;
  background: transparent;
  color: inherit;
}

.organic-play-svg {
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.8));
  margin-left: 1px;
}

.organic-aura {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  animation: organicRipple 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  pointer-events: none;
}

@keyframes organicPulse {
  0% { transform: scale(0.92) translateX(-0.5px); }
  100% { transform: scale(1.15) translateX(0.5px); }
}

@keyframes organicRipple {
  0% { transform: scale(0.8); opacity: 0.9; }
  100% { transform: scale(1.6); opacity: 0; }
}

.quick-header-tools {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tool-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  box-sizing: border-box;
}

.tool-btn:hover {
  color: var(--text-main);
  border-color: var(--accent-color);
}

.tool-btn.active {
  border-color: var(--accent-color);
  background: rgba(20, 184, 166, 0.15);
  color: var(--accent-color);
}

/* Header Switcher & Button styles */
.maestro-badge-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(236, 72, 153, 0.3);
  background: rgba(236, 72, 153, 0.1);
  color: #ec4899;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}

.maestro-badge-btn:hover {
  background: rgba(236, 72, 153, 0.2);
  border-color: rgba(236, 72, 153, 0.5);
  box-shadow: 0 0 12px rgba(236, 72, 153, 0.25);
}

.maestro-badge-btn.active {
  background: linear-gradient(135deg, #ec4899, #8b5cf6);
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 0 16px rgba(236, 72, 153, 0.4);
}

.maestro-crown-icon {
  filter: drop-shadow(0 0 4px rgba(236, 72, 153, 0.5));
}

.text-pink {
  color: #ec4899 !important;
}

.maestro-status-card {
  background: rgba(236, 72, 153, 0.08);
  border: 1px solid rgba(236, 72, 153, 0.25);
  border-radius: 12px;
  padding: 14px;
}

.danger-delete-tune-btn {
  color: #ef4444 !important;
  border-color: rgba(239, 68, 68, 0.4) !important;
  background: rgba(239, 68, 68, 0.1) !important;
}

.danger-delete-tune-btn:hover {
  background: rgba(239, 68, 68, 0.25) !important;
  border-color: #ef4444 !important;
}

.header-modes-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(15, 23, 42, 0.6);
  padding: 3px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 10px;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.mode-tab-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.06);
}

.mode-tab-btn.btn-tab-groovy {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.35);
}

.mode-tab-btn.btn-tab-groovy:hover {
  background: rgba(16, 185, 129, 0.25);
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
  color: #34d399;
}

.mode-tab-btn.btn-tab-musician.active {
  background: rgba(20, 184, 166, 0.2);
  color: #14b8a6;
  border-color: rgba(20, 184, 166, 0.4);
  box-shadow: 0 0 12px rgba(20, 184, 166, 0.25);
}

.mode-tab-btn.btn-tab-studio.active {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(239, 68, 68, 0.3));
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}

.mode-tab-btn.btn-tab-game.active {
  background: rgba(234, 179, 8, 0.2);
  color: #facc15;
  border-color: rgba(234, 179, 8, 0.5);
  box-shadow: 0 0 12px rgba(234, 179, 8, 0.25);
}

.back-nav-circle-btn, .close-view-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.back-nav-circle-btn:hover, .close-view-btn:hover {
  background: rgba(20, 184, 166, 0.2);
  border-color: #14b8a6;
  color: #fff;
  transform: scale(1.05);
}

.mode-switch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}

.mode-switch-btn.is-musician {
  background: rgba(20, 184, 166, 0.15);
  color: #14b8a6;
  border-color: rgba(20, 184, 166, 0.4);
}
.mode-switch-btn.is-musician:hover {
  background: rgba(20, 184, 166, 0.25);
  box-shadow: 0 0 15px rgba(20, 184, 166, 0.3);
}

.mode-switch-btn.is-studio {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #ffffff;
  border-color: rgba(245, 158, 11, 0.6);
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.4);
}
.mode-switch-btn.is-studio:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.mode-icon-spin {
  animation: pulseRotate 2s infinite ease-in-out;
}

@keyframes pulseRotate {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

@media (max-width: 600px) {
  /* Dynamic Island / Top Center Notch / Punch-hole camera protection */
  .navbar-inner-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-content: space-between;
    padding: 0 4px;
    column-gap: 28px; /* Safe center clearance for punch-hole camera */
  }

  .brand-area {
    justify-self: start;
  }

  .header-right-group {
    justify-self: end;
  }

  .hero-top-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    gap: 8px;
  }

  .hero-selectors-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
  }

  .hero-selectors-group .hero-select {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    font-size: 0.72rem;
    padding: 6px 6px;
  }

  .hero-top-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: 100%;
    margin-top: 2px;
  }

  .brand-text-block {
    display: none;
  }
  .groovy-btn-text, .mode-nav-label {
    display: none;
  }
  .mode-tab-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    justify-content: center;
    border-radius: 50%;
  }
  .quick-header-tools {
    gap: 4px;
  }
  .tool-btn {
    width: 32px;
    height: 32px;
    padding: 0;
  }
}

.brand-area {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.brand-avatar-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-emoji {
  font-size: 1.4rem;
}

.brand-text-block {
  min-width: 0;
}

.brand-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-mode-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #3b82f6 100%);
  background-size: 200% 200%;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(236, 72, 153, 0.4), 0 0 25px rgba(139, 92, 246, 0.25);
  animation: glowingGradient 3s ease infinite;
  transition: transform 0.15s, box-shadow 0.2s;
}

.hero-mode-trigger:hover {
  transform: scale(1.04);
  box-shadow: 0 0 20px rgba(236, 72, 153, 0.6), 0 0 35px rgba(139, 92, 246, 0.4);
}

.hero-mode-trigger:active {
  transform: scale(0.95);
}

.organic-play-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(4px);
  flex-shrink: 0;
}

.organic-play-icon.mini {
  width: 18px;
  height: 18px;
}

.organic-play-icon.micro {
  width: 14px;
  height: 14px;
  background: transparent;
}

.organic-play-svg {
  filter: drop-shadow(0 0 4px #ffffff);
  animation: organicPulse 1.2s ease-in-out infinite alternate;
}

.organic-aura {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  animation: organicRipple 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  pointer-events: none;
}

@keyframes organicPulse {
  0% { transform: scale(0.92) translateX(-0.5px); }
  100% { transform: scale(1.15) translateX(0.5px); }
}

@keyframes organicRipple {
  0% { transform: scale(0.8); opacity: 0.9; }
  100% { transform: scale(1.6); opacity: 0; }
}

.quick-header-tools {
  display: flex;
  gap: 4px;
}

.tool-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.tool-btn:hover {
  color: var(--text-main);
  border-color: var(--accent-color);
}
.tool-btn.active {
  border-color: var(--accent-color);
  background: rgba(20, 184, 166, 0.15);
  color: var(--accent-color);
}

/* Main Body */
.main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px 18px;
  padding-top: 74px;
  padding-bottom: 90px;
  max-width: 1320px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  overflow-x: hidden;
  min-height: 100vh;
}

.layout-grid {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  width: 100%;
  flex: 1;
  box-sizing: border-box;
  align-items: stretch;
}

.sidebar-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.tunes-scroll-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0;
  min-height: 200px;
  overflow-y: auto;
  padding-right: 4px;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 900px) {
  .layout-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sidebar-card {
    height: auto;
  }

  .tunes-scroll-area {
    max-height: 380px;
    min-height: 220px;
    flex: none;
  }
}

/* Cards */
.glass-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.card-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 10px;
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.subhead-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
}

/* Action Buttons */
.action-btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-color);
  color: var(--accent-contrast);
  border: none;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s;
}

.btn-create-tune {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: linear-gradient(135deg, #14b8a6, #0d9488);
  color: #ffffff;
  border: none;
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(20, 184, 166, 0.25);
  transition: all 0.15s;
}

.action-btn-outline {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: #38bdf8;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
}

.hero-banner-btn {
  color: #ec4899;
  border-color: rgba(236, 72, 153, 0.3);
  background: rgba(236, 72, 153, 0.08);
}

.pdf-export-btn {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
}

.action-btn-small {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: var(--accent-color);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.action-btn-small.danger {
  color: #f43f5e;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card-inner);
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
}

.search-input {
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 0.85rem;
  width: 100%;
  outline: none;
}

.chips-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}
.chips-scroll::-webkit-scrollbar {
  display: none;
}

.chip-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  border-radius: 9999px;
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.chip-btn.active {
  background: var(--accent-color);
  color: var(--accent-contrast);
  font-weight: 700;
  border-color: var(--accent-color);
}

.tunes-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.count-badge {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.tune-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s;
}

.tune-item-card:hover {
  background: var(--bg-card-hover);
}

.tune-item-card.selected {
  background: rgba(20, 184, 166, 0.12);
  border-color: var(--accent-color);
}

.tune-info-box {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.tune-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tune-cat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  overflow: hidden;
  max-height: 24px;
}

.micro-badge {
  font-size: 0.62rem;
  background: rgba(100, 116, 139, 0.2);
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.pattern-count-badge {
  font-size: 0.68rem;
  color: var(--text-muted);
  background: var(--bg-app);
  padding: 3px 6px;
  border-radius: 6px;
  flex-shrink: 0;
  margin-left: 8px;
}

/* Desk / Practice Card */
.desk-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.tune-banner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  gap: 10px;
  flex-wrap: wrap;
}

.tune-banner-left {
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tune-heading {
  font-size: 1.25rem;
  font-weight: 800;
  margin: 0;
  color: var(--text-main);
}

.category-pill {
  font-size: 0.68rem;
  font-weight: 600;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 9999px;
}

.pattern-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 4px 0 0 0;
}

.links-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tune-notes-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(20, 184, 166, 0.08);
  border: 1px solid rgba(20, 184, 166, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.8rem;
  color: var(--text-main);
}

/* Studio Bar */
.studio-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(20, 184, 166, 0.08);
  border: 1px solid rgba(20, 184, 166, 0.2);
  padding: 10px 12px;
  border-radius: 10px;
  width: 100%;
  box-sizing: border-box;
}

.studio-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.studio-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: var(--text-muted);
}

.studio-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.studio-actions .action-btn-small {
  padding: 6px 10px;
  font-size: 0.72rem;
}

.studio-structure-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.studio-param-box {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 8px;
}

.studio-param-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
}

.studio-param-select {
  background: transparent;
  border: none;
  color: var(--accent-color);
  font-size: 0.75rem;
  font-weight: 800;
  outline: none;
  cursor: pointer;
}

.studio-param-select option {
  background: #0f172a;
  color: #fff;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.patterns-pills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pattern-pill-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-main);
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.pattern-pill-btn.active {
  background: var(--accent-color);
  color: var(--accent-contrast);
  font-weight: 700;
  border-color: var(--accent-color);
}

/* Solo Box */
.practice-solo-box {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px;
}

.solo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.solo-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent-color);
}

.text-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.7rem;
  cursor: pointer;
  text-decoration: underline;
}

.solo-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.inst-solo-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.inst-solo-chip.active {
  border-color: var(--inst-color);
  background: rgba(20, 184, 166, 0.15);
  color: var(--text-main);
}

.hero-chip-btn {
  border: none;
  background: rgba(236, 72, 153, 0.2);
  color: #ec4899;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
  cursor: pointer;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.solo-tag {
  font-size: 0.6rem;
  background: var(--accent-color);
  color: var(--accent-contrast);
  padding: 1px 3px;
  border-radius: 3px;
  font-weight: 700;
}

/* Matrix Table */
.matrix-card {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.matrix-scroll-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}

.matrix-table {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: max-content;
  padding-bottom: 4px;
}

.matrix-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.inst-cell-header {
  width: 90px;
  min-width: 90px;
  background: var(--bg-card-inner);
  border-left: 4px solid #64748b;
  border-radius: 6px;
  padding: 5px 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  left: 0;
  z-index: 5;
}

.inst-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-main);
}

.mute-mini-btn {
  border: none;
  background: var(--bg-app);
  color: var(--text-muted);
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
}

.mute-mini-btn.muted {
  background: #f43f5e;
  color: #fff;
}

.steps-row {
  display: flex;
  gap: 3px;
}

.step-btn {
  width: 30px;
  height: 36px;
  border-radius: 5px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  font-family: monospace;
  font-weight: 700;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: none !important;
  flex-shrink: 0;
}

.step-btn.beat-divider {
  border-left: 2px solid #64748b;
}

.step-btn.has-stroke {
  background: var(--accent);
  color: #0f172a;
  border-color: var(--accent);
}

.step-btn.cursor-active {
  outline: 2px solid #ffffff !important;
  outline-offset: 1px;
  z-index: 10;
  filter: brightness(1.4);
}

.strokes-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.stroke-tag {
  font-family: monospace;
  font-weight: 700;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: var(--accent-color);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.7rem;
}

.legend-desc {
  font-size: 0.7rem;
  color: var(--text-muted);
}

/* FULLSCREEN GUITAR HERO VERTICAL TRAINER OVERLAY */
.hero-trainer-modal {
  position: fixed;
  inset: 0;
  background: #080c14;
  z-index: 5000;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 10px));
  box-sizing: border-box;
  font-family: 'Orbitron', 'Teko', sans-serif, system-ui;
  letter-spacing: 0.04em;
}

/* Minimalist Top Nav */
.hero-top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(17, 24, 37, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 12px;
}

.hero-selectors-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.hero-select {
  background: #161f2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: normal;
  padding: 6px 10px;
  border-radius: 8px;
  outline: none;
  max-width: 33%;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.hero-select.inst-select {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.hero-close-round-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.hero-close-round-btn:hover {
  background: #f43f5e;
  color: #fff;
}

/* Vertical Highway Runway Base */
.hero-vertical-highway {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 6px 0;
  overflow: hidden;
  background: radial-gradient(circle at center, rgba(20, 184, 166, 0.08) 0%, rgba(8, 12, 20, 0.98) 80%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
}

.hero-vertical-highway.clickable-arena {
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.hero-vertical-highway.clickable-arena:hover {
  border-color: rgba(20, 184, 166, 0.4);
  box-shadow: inset 0 0 30px rgba(20, 184, 166, 0.08);
}

.focus-exit-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.focus-round-btn.exit-btn.close-variant:hover {
  background: #f43f5e;
  border-color: #f43f5e;
}

.hero-close-round-btn.hero-back-btn:hover {
  background: #38bdf8;
  border-color: #38bdf8;
  color: #0b1120;
}

/* Global Mode Flash Overlay Styles */
.global-mode-flash-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(4, 7, 13, 0.35);
  backdrop-filter: blur(4px);
}

.mode-flash-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 40px;
  background: rgba(15, 23, 42, 0.92);
  border: 1.5px solid var(--flash-glow, #14b8a6);
  border-radius: 24px;
  box-shadow: 0 0 50px var(--flash-glow, #14b8a6), 0 20px 40px rgba(0, 0, 0, 0.8);
  text-align: center;
  transform-origin: center center;
}

.mode-flash-icon-box {
  color: #ffffff;
  margin-bottom: 8px;
  filter: drop-shadow(0 0 12px var(--flash-glow, #14b8a6));
}

.mode-flash-title {
  font-family: 'Orbitron', 'Teko', sans-serif, system-ui;
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  margin: 0;
  text-transform: uppercase;
  text-shadow: 0 0 20px var(--flash-glow, #14b8a6);
}

.mode-flash-line {
  width: 70px;
  height: 4px;
  border-radius: 9999px;
  margin-top: 10px;
  box-shadow: 0 0 10px var(--flash-glow, #14b8a6);
}

/* Animation Transitions */
.hero-top-slide-enter-active,
.hero-top-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hero-top-slide-enter-from,
.hero-top-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
  max-height: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
}

.mode-splash-anim-enter-active {
  transition: all 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.mode-splash-anim-leave-active {
  transition: all 0.22s ease-out;
}

.mode-splash-anim-enter-from {
  opacity: 0;
  transform: scale(0.65) translateY(15px);
}

.mode-splash-anim-leave-to {
  opacity: 0;
  transform: scale(1.18) translateY(-10px);
}

/* Corner Watermark BPM Display (Bottom-Right, Italic, Beat Pulsing Glow) */
.hero-corner-bpm-watermark {
  position: absolute;
  bottom: 22px;
  right: 22px;
  display: flex;
  align-items: baseline;
  gap: 4px;
  pointer-events: none;
  z-index: 5;
  opacity: 0.18;
  transition: opacity 0.08s ease-out, transform 0.08s ease-out;
  user-select: none;
}

.hero-corner-bpm-watermark.beat-glow-pulse {
  opacity: 0.55;
  transform: scale(1.08);
  filter: drop-shadow(0 0 16px rgba(20, 184, 166, 0.9));
}

.watermark-number {
  font-family: 'Orbitron', sans-serif;
  font-size: 3.2rem;
  font-weight: 900;
  font-style: italic;
  line-height: 1;
  color: #14b8a6;
  letter-spacing: -0.04em;
}

.watermark-unit {
  font-family: 'Orbitron', sans-serif;
  font-size: 1rem;
  font-weight: 800;
  font-style: italic;
  color: #38bdf8;
  letter-spacing: 0.1em;
}

/* Tempo - / + Quick Buttons in Bottom Bar */
.hero-tempo-step-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hero-step-circle-btn {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: var(--bg-card-inner);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s;
  flex-shrink: 0;
}
.hero-step-circle-btn:active {
  transform: scale(0.92);
}

/* Big Round TAP Tempo Button */
.hero-round-tap-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  border: 2px solid var(--accent-color);
  background: rgba(20, 184, 166, 0.15);
  color: var(--accent-color);
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(20, 184, 166, 0.3);
  transition: transform 0.1s, background 0.15s;
  flex-shrink: 0;
}
.hero-round-tap-btn:active {
  transform: scale(0.92);
  background: var(--accent-color);
  color: var(--accent-contrast);
}

/* Background Giant Watermark de la Marque with High Placement & Dynamic Beat Movement */
.brand-watermark {
  position: absolute;
  top: 32%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 78%;
  max-width: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  opacity: 0.15;
  user-select: none;
  filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.4));
  transition: transform 0.08s ease-out, opacity 0.08s ease-out;
}

.brand-watermark.brand-beat-bounce {
  transform: translate(-50%, -50%) scale(1.18) rotate(1deg);
  opacity: 0.38;
  filter: drop-shadow(0 0 40px rgba(236, 72, 153, 0.95)) drop-shadow(0 0 20px rgba(20, 184, 166, 0.8));
}

.brand-watermark-img {
  width: 100%;
  height: auto;
  object-fit: contain;
}

/* Low Performance Mode Global Optimizations (Zero GPU overhead) */
.low-perf-card,
.build-info-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card-inner);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
}

.build-info-card {
  cursor: default;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.build-badges-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.build-badge {
  font-family: monospace;
  font-size: 0.78rem;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 700;
}

.version-badge {
  background: rgba(20, 184, 166, 0.15);
  color: #14b8a6;
  border: 1px solid rgba(20, 184, 166, 0.4);
}

.timestamp-badge {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.low-perf-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-right: 14px;
}

.low-perf-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-main);
}

.low-perf-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.35;
}

/* When Low Performance Mode is Active */
.app-shell.low-perf-active * {
  box-shadow: none !important;
  text-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.app-shell.low-perf-active .brand-watermark {
  filter: none !important;
  transition: none !important;
}

.app-shell.low-perf-active .brand-watermark.brand-beat-bounce {
  transform: translate(-50%, -50%) !important;
  opacity: 0.15 !important;
}

.app-shell.low-perf-active .organic-aura,
.app-shell.low-perf-active .drum-svg,
.app-shell.low-perf-active .drum-svg-dynamic {
  animation: none !important;
}

/* Prominent Focus Mode Button on Right (avec le Logo Graphique de la Marque) */
.focus-mode-btn-prominent {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 35%, #06b6d4 70%, #10b981 100%);
  background-size: 300% 300%;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(236, 72, 153, 0.6);
  animation: hyperFastGlow 1.8s ease-in-out infinite alternate, neonPulse 0.9s ease-in-out infinite alternate;
  transition: transform 0.15s;
  flex-shrink: 0;
  padding: 4px;
  overflow: hidden;
  box-sizing: border-box;
}

.brand-glow-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.brand-logo-btn {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.9));
  animation: logoPulseBeat 0.6s ease-in-out infinite alternate;
}

@keyframes logoPulseBeat {
  0% { transform: scale(0.92) rotate(-2deg); }
  100% { transform: scale(1.12) rotate(2deg); }
}

.focus-mode-btn-prominent:hover {
  transform: scale(1.08);
}
.focus-mode-btn-prominent:active {
  transform: scale(0.92);
}

/* Metronome Hero & Focus Buttons */
.metronome-hero-btn {
  width: 42px;
  height: 42px;
  min-width: 42px;
  min-height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.metronome-hero-btn.active-measure {
  background: rgba(20, 184, 166, 0.22);
  border-color: #14b8a6;
  color: #14b8a6;
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.6);
}

.metronome-hero-btn.active-phrase {
  background: rgba(236, 72, 153, 0.22);
  border-color: #ec4899;
  color: #ec4899;
  box-shadow: 0 0 16px rgba(236, 72, 153, 0.6);
}

.metro-mode-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.focus-round-btn.clic-focus-btn.active-measure {
  background: rgba(20, 184, 166, 0.25);
  border-color: #14b8a6;
  color: #14b8a6;
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.6);
}

.focus-round-btn.clic-focus-btn.active-phrase {
  background: rgba(236, 72, 153, 0.25);
  border-color: #ec4899;
  color: #ec4899;
  box-shadow: 0 0 16px rgba(236, 72, 153, 0.6);
}

.metronome-needle {
  transform-origin: 12px 18px;
  transition: transform 0.1s ease-in-out;
}

.metronome-needle.needle-swing {
  animation: metronomeTick 0.5s ease-in-out infinite alternate;
}

@keyframes metronomeTick {
  0% { transform: rotate(-24deg); }
  100% { transform: rotate(24deg); }
}

/* Target Zone Positioned at 75% (3/4 down) for Better Anticipation */
.hero-vertical-target-zone {
  position: absolute;
  top: 75%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  z-index: 30;
  pointer-events: none;
}

.target-cross-line {
  position: absolute;
  top: 50%;
  left: -200px;
  right: -200px;
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, rgba(20, 184, 166, 0.6) 50%, transparent 100%);
  transform: translateY(-50%);
  z-index: -1;
}

.hit-glow-ring {
  width: 54px;
  height: 54px;
  min-width: 54px;
  min-height: 54px;
  border-radius: 50%;
  border: 3px solid #fff;
  background: rgba(15, 23, 42, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: transform 0.05s ease-out;
  box-sizing: border-box;
  overflow: hidden;
}

.hit-glow-ring.pulse {
  transform: scale(1.25);
  filter: brightness(1.6);
}

.target-stroke-label {
  font-size: 1.35rem;
  line-height: 1;
  font-weight: 900;
  font-family: 'Orbitron', 'Teko', monospace;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
}

.hit-technique-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(20, 184, 166, 0.35);
  padding: 4px 12px;
  border-radius: 9999px;
  white-space: nowrap;
  position: absolute;
  bottom: -6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  transition: transform 0.06s ease-out, border-color 0.08s, box-shadow 0.08s;
  z-index: 40;
}

.hit-technique-banner.hit-anim {
  transform: scale(1.14);
  border-color: #ffffff;
  box-shadow: 0 0 20px rgba(20, 184, 166, 0.8), 0 0 35px rgba(236, 72, 153, 0.5);
}

.technique-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px currentColor;
}

.technique-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.76rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.04em;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
}

/* Floating Controls Cluster Bottom-Left (FX Eco & TAP) */
.hero-bottom-left-cluster {
  position: absolute;
  bottom: 14px;
  left: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 35;
}

/* Floating FX / Eco Toggle Button (Above TAP) */
.hero-floating-fx-btn {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: transform 0.08s ease-out, background 0.12s, border-color 0.12s;
  box-sizing: border-box;
}

.hero-floating-fx-btn.fx-active {
  border: 1.5px solid #a855f7;
  color: #c084fc;
  box-shadow: 0 0 14px rgba(168, 85, 247, 0.4);
}

.hero-floating-fx-btn.fx-disabled {
  border: 1.5px solid #64748b;
  color: #94a3b8;
  opacity: 0.85;
}

.hero-floating-fx-btn:active {
  transform: scale(0.9);
}

.hero-fx-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.52rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.04em;
}

/* Floating Big Round TAP Tempo Button inside Highway (Bottom-Left) */
.hero-floating-tap-btn {
  width: 52px;
  height: 52px;
  min-width: 52px;
  min-height: 52px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.9);
  border: 2px solid var(--accent-color);
  color: var(--accent-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: transform 0.08s ease-out, background 0.12s, box-shadow 0.12s;
  box-sizing: border-box;
}

.hero-floating-tap-btn:active {
  transform: scale(0.9);
  background: var(--accent-color);
  color: var(--accent-contrast);
  box-shadow: 0 0 24px rgba(20, 184, 166, 0.8);
}

.hero-tap-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  line-height: 1;
}

/* Floating SOLO Action Button inside Highway */
.hero-floating-solo-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.85);
  border: 1.5px solid #ec4899;
  color: #ec4899;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 35;
  box-shadow: 0 0 14px rgba(236, 72, 153, 0.4);
  backdrop-filter: blur(6px);
  transition: transform 0.12s ease-out, background 0.15s, color 0.15s;
}

.hero-floating-solo-btn:active {
  transform: scale(0.9);
  background: #ec4899;
  color: #fff;
}

/* Timeline Zoom Bar (100% Visual Compact Bar) */
.hero-zoom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(17, 24, 37, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 6px 12px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.zoom-slider {
  accent-color: var(--accent-color);
}

.hero-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hero-tool-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #161f2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.hero-tool-btn.active {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: rgba(20, 184, 166, 0.15);
}

.hero-countin-btn {
  position: relative;
}

.countin-num-badge {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.65rem;
  font-weight: 900;
  letter-spacing: -0.05em;
}

.countin-dot-active {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.count-in-overlay {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
}

.count-in-card {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 0 35px rgba(16, 185, 129, 0.4);
}

.count-in-number-glow {
  font-family: 'Orbitron', sans-serif;
  font-size: 4.5rem;
  font-weight: 900;
  color: #10b981;
  text-shadow: 0 0 25px rgba(16, 185, 129, 0.9);
  line-height: 1;
}

.count-in-label-sub {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.1em;
}

/* Accompaniment Drawer */
.hero-accompaniment-box {
  background: #161f2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px;
  margin-top: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

.accompaniment-title {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
}

.accompaniment-chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.acc-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #101724;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.acc-chip.active {
  border-color: var(--accent-color);
  color: #fff;
}

.acc-chip.muted {
  opacity: 0.45;
}

.acc-chip.is-lead {
  border-color: #ec4899;
}

.acc-status {
  font-size: 0.6rem;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: 4px;
  background: #1e293b;
}

.hero-bottom-right-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.focus-mode-btn-compact {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  min-width: 42px;
  min-height: 42px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 35%, #06b6d4 70%, #10b981 100%);
  background-size: 300% 300%;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 0 16px rgba(236, 72, 153, 0.6), 0 0 28px rgba(139, 92, 246, 0.4);
  animation: hyperFastGlow 1.8s ease-in-out infinite alternate, neonPulse 0.9s ease-in-out infinite alternate;
  transition: transform 0.1s;
  flex-shrink: 0;
}

.focus-mode-btn-compact:active {
  transform: scale(0.92);
}

.drum-fast-glow-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.drum-svg-dynamic {
  filter: drop-shadow(0 0 5px #ffffff);
  animation: dynamicDrumPulse 0.45s ease-in-out infinite alternate;
}

.stick-left-dynamic {
  transform-origin: 3px 3px;
  animation: dynamicLeftStick 0.3s ease-in-out infinite alternate;
}

.stick-right-dynamic {
  transform-origin: 21px 3px;
  animation: dynamicRightStick 0.3s ease-in-out infinite alternate 0.15s;
}

@keyframes dynamicDrumPulse {
  0% { transform: scale(0.92) rotate(-3deg); }
  100% { transform: scale(1.15) rotate(3deg); }
}

@keyframes dynamicLeftStick {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(24deg); }
}

@keyframes dynamicRightStick {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-24deg); }
}

@keyframes hyperFastGlow {
  0% { background-position: 0% 0%; filter: hue-rotate(0deg); }
  50% { background-position: 100% 100%; filter: hue-rotate(90deg); }
  100% { background-position: 0% 100%; filter: hue-rotate(180deg); }
}

@keyframes neonPulse {
  0% { box-shadow: 0 0 10px rgba(236, 72, 153, 0.5), 0 0 20px rgba(6, 182, 212, 0.3); }
  100% { box-shadow: 0 0 22px rgba(236, 72, 153, 0.9), 0 0 35px rgba(139, 92, 246, 0.7); }
}

/* Modal Backdrop & Glass Sheet for Accompaniment */
.hero-accompaniment-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  z-index: 6000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 14px;
}

.hero-accompaniment-sheet {
  background: #111a2a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 18px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.6);
  animation: slideUpSheet 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUpSheet {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.sheet-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sheet-title {
  font-size: 0.95rem;
  font-weight: 800;
  margin: 0;
  color: #fff;
}

.sheet-close-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sheet-desc {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 14px;
  line-height: 1.35;
}

.accompaniment-cards-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: 380px;
  overflow-y: auto;
}

.inst-acc-row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #182234;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.inst-acc-row-card.is-active {
  background: rgba(20, 184, 166, 0.12);
  border-color: var(--accent-color);
}

.inst-acc-row-card.is-muted {
  opacity: 0.5;
}

.inst-acc-row-card.is-solo-lead {
  border-color: #ec4899;
  background: rgba(236, 72, 153, 0.12);
}

.inst-acc-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.inst-acc-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.acc-vol-slider {
  width: 90px;
  height: 5px;
  accent-color: var(--accent-color);
}

.acc-vol-slider:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.dot-large {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.inst-acc-names {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inst-acc-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
}

.lead-badge {
  font-size: 0.58rem;
  font-weight: 800;
  color: #ec4899;
  letter-spacing: 0.05em;
}

/* iOS Style Toggle Switch */
.custom-toggle-switch {
  width: 44px;
  height: 24px;
  min-width: 44px;
  min-height: 24px;
  max-width: 44px;
  max-height: 24px;
  border-radius: 9999px;
  background: #334155;
  position: relative;
  transition: background-color 0.2s;
  flex-shrink: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.custom-toggle-switch.active {
  background: var(--accent-color);
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.custom-toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

/* Dedicated Visual Focus Mode Bar & Fixed Non-Deforming Round Buttons */
.focus-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  max-width: 420px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.focus-round-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  max-width: 44px;
  max-height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #161f2e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s, background 0.15s;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
}

.focus-round-btn:active {
  transform: scale(0.92);
}

.focus-round-btn.play-btn {
  background: var(--accent-color);
  color: var(--accent-contrast);
  border-color: var(--accent-color);
}
.focus-round-btn.play-btn.playing {
  background: #f43f5e;
  color: #fff;
  border-color: #f43f5e;
}

.focus-round-btn.clic-focus-btn {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--text-muted);
}
.focus-round-btn.clic-focus-btn.active {
  background: rgba(20, 184, 166, 0.25);
  border-color: var(--accent-color);
  color: var(--accent-color);
  box-shadow: 0 0 14px rgba(20, 184, 166, 0.4);
}

.focus-round-btn.exit-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  max-width: 36px;
  max-height: 36px;
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.4);
  color: #f43f5e;
}

.focus-round-btn.tempo-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  max-width: 36px;
  max-height: 36px;
  background: #1e293b;
}

.focus-left-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.focus-round-btn.focus-center-play {
  width: 52px;
  height: 52px;
  min-width: 52px;
  min-height: 52px;
  max-width: 52px;
  max-height: 52px;
  box-shadow: 0 0 20px rgba(20, 184, 166, 0.5);
}

.focus-round-btn.focus-center-play.playing {
  box-shadow: 0 0 20px rgba(244, 63, 94, 0.5);
}

/* Master Player Bottom Bar Centered Layout */
.master-center-player-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 2;
}

.master-play-circle {
  width: 46px;
  height: 46px;
  min-width: 46px;
  min-height: 46px;
  border-radius: 50%;
  border: none;
  background: var(--accent-color);
  color: var(--accent-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.4);
  flex-shrink: 0;
  transition: transform 0.1s, background 0.15s, box-shadow 0.15s;
}

.master-play-circle:active {
  transform: scale(0.92);
}

.master-play-circle.playing {
  background: #f43f5e;
  color: #fff;
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.4);
}

/* Image Attachment & Moderation Admin in Feedback */
.feedback-img-preview {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.feedback-preview-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(20, 184, 166, 0.08);
  border: 1px dashed rgba(20, 184, 166, 0.3);
  padding: 8px 12px;
  border-radius: 8px;
}

.feedback-attached-image-box {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 6px;
  border: 1px solid var(--border-color);
}

.feedback-attached-img {
  max-width: 100%;
  max-height: 220px;
  border-radius: 6px;
  display: block;
  object-fit: contain;
}

.admin-approval-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  gap: 8px;
}

.status-chip {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
}
.status-chip.approved { background: rgba(20, 184, 166, 0.2); color: #14b8a6; }
.status-chip.pending { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }

.btn-approve-toggle {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.image-pending-placeholder {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 6px;
}

.badge-admin {
  font-size: 0.65rem;
  font-weight: 800;
  background: #ec4899;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-admin-toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
}

.focus-tempo-cluster {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #0b111e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px 6px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.focus-bpm-indicator {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 0 4px;
}

.focus-bpm-val {
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--accent-color);
}

.focus-bpm-lbl {
  font-size: 0.6rem;
  color: #64748b;
  font-weight: 700;
}

/* Focus Mode Adjustments */
.hero-trainer-modal.focus-mode-active {
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 8px));
}

.hero-trainer-modal.focus-mode-active .hero-vertical-highway {
  margin: 0;
}

/* Vertical Ribbon Strip (Positioned at 75% down to match target zone) */
.hero-vertical-ribbon {
  position: absolute;
  top: 75%;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.hero-v-node {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  transition: none !important;
}

/* Beat Divider Bars across highway */
.beat-horizontal-bar {
  position: absolute;
  left: 5%;
  right: 5%;
  height: 3px;
  border-radius: 3px;
  z-index: 2;
  pointer-events: none;
}

.beat-horizontal-bar.first-beat {
  background: #f43f5e;
  background: linear-gradient(90deg, transparent 0%, #f43f5e 20%, #f43f5e 80%, transparent 100%);
  height: 5px;
  box-shadow: 0 0 16px #f43f5e, 0 0 8px #f43f5e;
}

.beat-horizontal-bar.other-beat {
  background: rgba(56, 189, 248, 0.7);
  background: linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.7) 20%, rgba(56, 189, 248, 0.7) 80%, transparent 100%);
  height: 3px;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
}

.v-note-bubble {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #182234;
  border: 2px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  flex-shrink: 0;
  z-index: 5;
}

.hero-v-node.has-v-note .v-note-bubble {
  background: var(--v-color);
  border-color: #ffffff;
  color: #0f172a;
  box-shadow: 0 0 16px var(--v-color);
}

.hero-v-node.is-rest .v-note-bubble {
  opacity: 0.25;
  width: 20px;
  height: 20px;
  border-style: dashed;
  background: transparent;
}

.hero-v-node.at-target .v-note-bubble {
  transform: scale(1.25);
  filter: brightness(1.8);
}

.v-note-stroke {
  font-size: 1.1rem;
  font-weight: 900;
  font-family: 'Orbitron', 'Teko', monospace;
}

/* Minimalist Bottom Controls */
.hero-bottom-controls {
  display: flex;
  flex-direction: column;
  background: var(--bg-navbar);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px;
  padding: 4px 12px calc(6px + env(safe-area-inset-bottom, 8px));
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  box-sizing: border-box;
  flex-shrink: 0;
}

.hero-master-play {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: var(--accent-color);
  color: var(--accent-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.4);
  flex-shrink: 0;
}

.hero-master-play.playing {
  background: #f43f5e;
  color: #fff;
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.4);
}

.hero-tempo-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #101724;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px 8px;
  border-radius: 10px;
}

.hero-bpm-display {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 0 6px;
}

.hero-bpm-num {
  font-size: 1rem;
  font-weight: 800;
  color: var(--accent-color);
}

.hero-bpm-unit {
  font-size: 0.65rem;
  color: #64748b;
}

/* Custom Branding Logo Picker */
.logo-custom-panel {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
}

.form-label-bold {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main);
  display: block;
  margin-bottom: 8px;
}

.logo-type-tabs {
  display: flex;
  gap: 6px;
}

.emoji-picker-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.emoji-btn {
  font-size: 1.3rem;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 4px 8px;
  cursor: pointer;
  transition: transform 0.1s;
}
.emoji-btn:hover {
  transform: scale(1.1);
}
.emoji-btn.selected {
  border-color: var(--accent-color);
  background: rgba(20, 184, 166, 0.15);
}

.custom-emoji-input {
  width: 50px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px;
  text-align: center;
  color: var(--text-main);
  font-size: 1rem;
}

.image-upload-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.d-none {
  display: none !important;
}

@media (max-width: 650px) {
  .d-none-mobile {
    display: none !important;
  }
}

/* PLAYLISTS VIEW */
.playlists-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
}

/* 🎮 GAME & HALL OF FAME LAYOUT */
.game-layout {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 18px;
}

@media (max-width: 950px) {
  .game-layout {
    grid-template-columns: 1fr;
  }
}

.badge-date {
  font-size: 0.72rem;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  display: inline-block;
  margin-top: 2px;
}

.game-difficulty-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.diff-pill {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.diff-pill:hover:not(:disabled) {
  background: var(--bg-card-hover);
  color: var(--text-main);
}

.diff-pill.active.easy {
  background: rgba(16, 185, 129, 0.15);
  border-color: #10b981;
  color: #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
}

.diff-pill.active.medium {
  background: rgba(245, 158, 11, 0.15);
  border-color: #f59e0b;
  color: #f59e0b;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
}

.diff-pill.active.hard {
  background: rgba(244, 63, 94, 0.15);
  border-color: #f43f5e;
  color: #f43f5e;
  box-shadow: 0 0 10px rgba(244, 63, 94, 0.2);
}

.challenge-brief-card {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.challenge-pattern-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.inst-tag {
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.brief-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.challenge-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  padding: 10px;
  border-radius: 10px;
}

.stat-lbl {
  display: block;
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.stat-val {
  font-size: 1.05rem;
}

.game-hud-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 10px 14px;
  text-align: center;
  margin-bottom: 12px;
}

.hud-lbl {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.hud-val {
  font-size: 1.2rem;
  font-weight: 800;
}

.game-feedback-lane {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.live-hit-badge {
  font-family: 'Orbitron', system-ui, sans-serif;
  font-size: 1.25rem;
  font-weight: 900;
  padding: 6px 18px;
  border: 2px solid;
  border-radius: 30px;
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 0 25px currentColor;
  display: flex;
  align-items: center;
  gap: 8px;
}

.timing-ms {
  font-size: 0.75rem;
  opacity: 0.85;
}

.pop-feedback-enter-active {
  animation: popIn 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.pop-feedback-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.pop-feedback-leave-to {
  opacity: 0;
  transform: scale(1.2) translateY(-10px);
}

@keyframes popIn {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.game-highway-container {
  position: relative;
  height: 260px;
  margin-bottom: 12px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #080c14;
}

.game-vertical-highway {
  height: 100%;
  margin: 0;
  border-radius: 0;
  border: none;
}

.game-count-in-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 12, 20, 0.85);
  backdrop-filter: blur(8px);
}

.game-interactive-zone {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-start-container {
  text-align: center;
}

.btn-start-game {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: none;
  padding: 16px 36px;
  border-radius: 40px;
  font-size: 1.15rem;
  font-weight: 800;
  font-family: 'Orbitron', system-ui;
  letter-spacing: 0.05em;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn-start-game:hover {
  transform: scale(1.05);
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.6);
}

.pulse-glow {
  animation: pulseGlow 2s infinite ease-in-out;
}

@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 35px rgba(16, 185, 129, 0.8); }
}

.game-touch-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 14px;
}

.game-active-play-container {
  width: 100%;
  display: flex;
  justify-content: center;
}

.game-big-hit-pad {
  width: 100%;
  max-width: 320px;
  height: 180px;
  border-radius: 24px;
  background: radial-gradient(circle at center, var(--pad-color, #14b8a6) 0%, rgba(15, 23, 42, 0.95) 100%);
  border: 3px solid var(--pad-color, #14b8a6);
  box-shadow: 0 0 35px rgba(20, 184, 166, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  user-select: none;
  touch-action: manipulation;
  transition: transform 0.05s ease;
}

.game-big-hit-pad:active {
  transform: scale(0.96);
  box-shadow: 0 0 50px var(--pad-color, #14b8a6), inset 0 0 30px #fff;
}

.hit-pad-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.pad-label {
  font-family: 'Orbitron', system-ui;
  font-size: 1.1rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.pad-sublabel {
  font-size: 0.7rem;
  opacity: 0.75;
  font-weight: 600;
}

/* LEADERBOARD TABLE */
.leaderboard-table-container {
  overflow-x: auto;
  max-height: 480px;
}

.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.leaderboard-table th {
  text-align: left;
  padding: 8px 10px;
  color: var(--text-muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-color);
}

.leaderboard-table td {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.hof-row:hover {
  background: var(--bg-card-hover);
}

.hof-row.rank-gold {
  background: rgba(245, 158, 11, 0.08);
}

.hof-row.rank-silver {
  background: rgba(148, 163, 184, 0.08);
}

.hof-row.rank-bronze {
  background: rgba(217, 119, 6, 0.08);
}

.grade-pill {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 6px;
  font-weight: 800;
  font-size: 0.72rem;
  font-family: 'Orbitron', system-ui;
}

.grade-s-plus { background: #ec4899; color: #fff; box-shadow: 0 0 8px #ec4899; }
.grade-s { background: #f59e0b; color: #000; font-weight: 900; }
.grade-a { background: #10b981; color: #fff; }
.grade-b { background: #3b82f6; color: #fff; }
.grade-c { background: #64748b; color: #fff; }

.hof-diff-tag {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
}
.hof-diff-tag.easy { background: rgba(16, 185, 129, 0.2); color: #10b981; }
.hof-diff-tag.medium { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.hof-diff-tag.hard { background: rgba(244, 63, 94, 0.2); color: #f43f5e; }

/* 🎮 FULLSCREEN IMMERSIVE GAME ARENA */
.game-fullscreen-modal {
  position: fixed;
  inset: 0;
  background: #080c14;
  z-index: 6000;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 10px));
  box-sizing: border-box;
  font-family: 'Orbitron', 'Teko', sans-serif, system-ui;
}

.game-fullscreen-top-hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(17, 24, 37, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 14px;
  gap: 12px;
}

.fs-hud-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fs-tune-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-inst-tag {
  font-size: 0.7rem;
  font-weight: 800;
  color: #fff;
  padding: 2px 7px;
  border-radius: 6px;
  text-transform: uppercase;
}

.fs-hud-center {
  display: flex;
  align-items: center;
  gap: 20px;
}

.fs-hud-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.fs-lbl {
  font-size: 0.6rem;
  color: var(--text-muted);
  font-weight: 700;
}

.fs-val {
  font-size: 1.1rem;
  font-weight: 800;
}

.game-fs-highway {
  flex: 1;
  margin: 10px 0;
  position: relative;
  overflow: hidden;
}

.game-ready-click-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(8, 12, 20, 0.88);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ready-click-card {
  text-align: center;
  padding: 24px 36px;
  border-radius: 20px;
  background: rgba(17, 24, 37, 0.95);
  border: 2px solid var(--accent-color);
}

.ready-title {
  font-size: 2.2rem;
  margin: 0 0 6px 0;
  font-weight: 900;
}

.ready-sub {
  font-size: 0.82rem;
  color: #cbd5e1;
  margin: 0;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.game-fs-feedback-lane {
  position: absolute;
  top: 18%;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 25;
  pointer-events: none;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.live-hit-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 180px;
  text-align: center;
  padding: 8px 22px;
  background: rgba(8, 12, 20, 0.95);
  border: 2px solid currentColor;
  border-radius: 30px;
  font-family: 'Orbitron', system-ui;
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  box-shadow: 0 4px 25px rgba(0, 0, 0, 0.7);
  white-space: nowrap;
}

.pop-feedback-enter-active {
  transition: opacity 0.1s ease, transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.pop-feedback-leave-active {
  transition: opacity 0.2s ease;
}

.pop-feedback-enter-from {
  opacity: 0;
  transform: scale(0.85);
}

.pop-feedback-leave-to {
  opacity: 0;
  transform: scale(1);
}

.game-fs-bottom-touch-bar {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

.game-fs-big-touch-btn {
  width: 100%;
  max-width: 480px;
  padding: 16px;
  border-radius: 30px;
  background: radial-gradient(circle at center, var(--pad-color, #14b8a6) 0%, rgba(15, 23, 42, 0.95) 100%);
  border: 2px solid var(--pad-color, #14b8a6);
  box-shadow: 0 0 25px rgba(20, 184, 166, 0.3);
  color: #fff;
  font-family: 'Orbitron', system-ui;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  transition: transform 0.05s ease;
}

.game-fs-big-touch-btn:active {
  transform: scale(0.97);
  box-shadow: 0 0 40px var(--pad-color, #14b8a6);
}

/* GAME RESULT MODAL */
.game-result-overlay {
  z-index: 7000;
}

.game-result-card {
  max-width: 500px;
  width: 92%;
  text-align: center;
  background: #0d1527;
  border: 2px solid rgba(20, 184, 166, 0.4);
  box-shadow: 0 0 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(20, 184, 166, 0.2);
  border-radius: 24px;
  padding: 24px;
}

.result-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.result-title {
  font-size: 1.6rem;
  margin: 0;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.result-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  padding: 12px 18px;
  margin-bottom: 16px;
}

.result-score-block {
  text-align: left;
}

.result-score-block .score-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 700;
  letter-spacing: 0.05em;
}

.result-score-block .final-score-val {
  font-size: 2.2rem;
  margin: 0;
  font-weight: 900;
  line-height: 1;
}

.result-grade-badge {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  font-weight: 900;
  font-family: 'Orbitron', sans-serif;
  border: 2px solid currentColor;
  box-shadow: 0 0 20px currentColor;
}

.submit-score-hero-box {
  background: linear-gradient(135deg, rgba(20, 184, 166, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%);
  border: 2px solid var(--accent-color);
  border-radius: 18px;
  padding: 16px;
  margin-top: 16px;
  text-align: left;
}

.submit-hero-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.form-hero-label {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.8rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.04em;
}

.hero-input-group {
  display: flex;
  gap: 8px;
}

.hero-text-input {
  flex: 1;
  background: #080c14;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 12px 14px;
  color: #fff;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.hero-text-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 15px rgba(20, 184, 166, 0.4);
}

.btn-hero-submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-color);
  color: #080c14;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  border: none;
  border-radius: 12px;
  padding: 0 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.1s ease, filter 0.2s ease;
}

.btn-hero-submit:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-hero-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-success-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid #22c55e;
  border-radius: 14px;
  padding: 12px 16px;
  margin-top: 14px;
  text-align: left;
}

.result-action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.btn-return-hof {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #1e293b;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 14px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-return-hof:hover {
  background: #334155;
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.btn-replay-game {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 10px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-replay-game:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.result-score-block {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 14px;
}

.score-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.final-score-val {
  font-size: 2.2rem;
  margin: 4px 0 0 0;
}

.result-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.breakdown-pill {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  padding: 6px 8px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  font-size: 0.74rem;
  gap: 2px;
}

.submit-score-section {
  text-align: left;
  background: rgba(20, 184, 166, 0.08);
  border: 1px solid rgba(20, 184, 166, 0.2);
  padding: 12px;
  border-radius: 10px;
}

.input-with-button {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.submit-success-alert {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid #10b981;
  color: #10b981;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

@media (max-width: 850px) {
  .playlists-layout {
    grid-template-columns: 1fr;
  }
}

.playlist-cards-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.playlist-select-card {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.playlist-select-card:hover {
  background: var(--bg-card-hover);
}

.playlist-select-card.selected {
  background: rgba(20, 184, 166, 0.12);
  border-color: var(--accent-color);
}

.pl-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pl-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-main);
}

.chevron-icon {
  color: var(--text-muted);
  transition: transform 0.15s;
}

.playlist-select-card.selected .chevron-icon {
  color: var(--accent-color);
  transform: translateX(3px);
}

.pl-meta-row {
  margin-top: 4px;
}

.pl-count-badge {
  font-size: 0.72rem;
  color: var(--text-muted);
  background: var(--bg-app);
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 600;
}

/* Setlist Container & Track Cards */
.setlist-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setlist-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 16px;
  transition: all 0.15s ease;
}

.setlist-item-card:hover {
  border-color: var(--accent-color);
  background: var(--bg-card-hover);
}

.setlist-item-card.current-active {
  border-color: var(--accent-color);
  background: rgba(20, 184, 166, 0.08);
}

.setlist-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.track-number {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: var(--accent-color);
  font-weight: 700;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.track-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.track-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.setlist-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-play-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--accent-color);
  color: var(--accent-contrast);
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.1s;
}
.track-play-btn:active {
  transform: scale(0.95);
}

.track-delete-btn {
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: #f43f5e;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.track-delete-btn:hover {
  background: #f43f5e;
  color: #fff;
}

.empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: var(--bg-app);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Modal Creation Dialog */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}

.modal-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  max-width: 460px;
  width: 100%;
  box-shadow: 0 10px 40px rgba(0,0,0,0.4);
}

.modal-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 6px;
}

.modal-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm {
  background: var(--accent-color);
  border: none;
  color: var(--accent-contrast);
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

/* Floating Player Bar with Thin Top Track Ribbon */
.player-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100vw;
  box-sizing: border-box;
  background: var(--bg-navbar);
  border-top: 1px solid var(--border-color);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  padding: 0 12px calc(6px + env(safe-area-inset-bottom, 10px));
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1000;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25);
}

.player-top-track-ribbon {
  width: 100%;
  max-width: 1320px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ribbon-song-title {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--accent-color);
  letter-spacing: 0.02em;
}

.ribbon-separator {
  font-size: 0.65rem;
  color: var(--text-muted);
  opacity: 0.6;
}

.ribbon-pattern-name {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-main);
}

.player-bottom-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  max-width: 1320px;
  width: 100%;
  gap: 8px;
  padding-top: 5px;
  box-sizing: border-box;
}

.player-left-col {
  display: flex;
  align-items: center;
  min-width: 0;
  justify-content: flex-start;
  overflow: hidden;
  padding-left: 8px;
}

.player-center-col {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}

.player-right-col {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  flex-shrink: 0;
  padding-right: 8px;
  height: 100%;
}

.master-play-circle {
  width: 46px;
  height: 46px;
  min-width: 46px;
  min-height: 46px;
  border-radius: 50%;
  border: none;
  background: var(--accent-color);
  color: var(--accent-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.4);
  flex-shrink: 0;
  transition: transform 0.1s, background 0.15s, box-shadow 0.15s;
}

.master-play-circle.playing {
  background: #f43f5e;
  color: #fff;
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.4);
}

.song-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.meta-title {
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-pattern {
  font-size: 0.64rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tempo-control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  padding: 3px 6px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.tempo-step-btn {
  border: none;
  background: var(--bg-card-inner);
  color: var(--text-main);
  font-weight: 800;
  padding: 5px 9px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: transform 0.1s, background 0.15s;
}

.tempo-step-btn:active {
  transform: scale(0.92);
  background: var(--accent-color);
  color: var(--accent-contrast);
}

.tempo-display {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 0 4px;
}

.bpm-num {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--accent-color);
}

.bpm-unit {
  font-size: 0.58rem;
  color: var(--text-muted);
}

.tap-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent-color);
  background: rgba(20, 184, 166, 0.12);
  color: var(--accent-color);
  font-weight: 800;
  padding: 4px 7px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s;
}

.tap-btn:active {
  transform: scale(0.92);
  background: var(--accent-color);
  color: var(--accent-contrast);
}

.quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 100%;
}

@media (max-width: 600px) {
  .player-bottom-inner {
    grid-template-columns: 1fr auto 1fr;
    gap: 6px;
  }
  .player-bottom-bar {
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 8px));
  }
  .player-left-col {
    padding-left: 4px;
  }
  .player-right-col {
    padding-right: 4px;
  }
  .tempo-control-group {
    padding: 2px 4px;
    gap: 3px;
  }
  .tempo-step-btn {
    padding: 4px 6px;
    font-size: 0.72rem;
  }
  .bpm-num {
    font-size: 0.82rem;
  }
  .master-play-circle {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
  }
  .quick-actions .icon-toggle-btn {
    width: 34px;
    height: 34px;
    padding: 0;
  }
}

.clic-toggle-btn {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  cursor: pointer;
}

.clic-toggle-btn.active-measure {
  background: rgba(20, 184, 166, 0.22);
  border-color: #14b8a6;
  color: #14b8a6;
  font-weight: 800;
}

.clic-toggle-btn.active-phrase {
  background: rgba(236, 72, 153, 0.22);
  border-color: #ec4899;
  color: #ec4899;
  font-weight: 800;
}

.metronome-control-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.metronome-vol-trigger-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0f172a;
  border: 1px solid var(--accent-color);
  color: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  box-shadow: 0 0 6px rgba(20, 184, 166, 0.4);
}

.metronome-vol-trigger-btn:hover {
  background: var(--accent-color);
  color: #0f172a;
}

.metronome-vol-popover {
  position: absolute;
  bottom: calc(100% + 12px);
  right: 0;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6), 0 0 15px rgba(20, 184, 166, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 10px 14px;
  width: 180px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metronome-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.popover-title {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.icon-toggle-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-toggle-btn.active-measure {
  background: rgba(20, 184, 166, 0.22);
  border-color: #14b8a6;
  color: #14b8a6;
  box-shadow: 0 0 14px rgba(20, 184, 166, 0.4);
}

.icon-toggle-btn.active-phrase {
  background: rgba(236, 72, 153, 0.22);
  border-color: #ec4899;
  color: #ec4899;
  box-shadow: 0 0 14px rgba(236, 72, 153, 0.4);
}

/* Mixer View */
.mixer-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 800px) {
  .mixer-layout {
    grid-template-columns: 100%;
  }
}

.faders-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fader-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--bg-card-inner);
  padding: 8px 12px;
  border-radius: 8px;
}

.fader-label {
  font-size: 0.75rem;
  font-weight: 700;
  width: 120px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.modern-slider {
  flex: 1;
  accent-color: var(--accent-color);
}

.fader-actions {
  display: flex;
  gap: 5px;
}

.mini-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
}

.mini-btn.danger {
  background: #f43f5e;
  color: #fff;
  border-color: #f43f5e;
}

.mini-btn.warning {
  background: var(--accent-color);
  color: var(--accent-contrast);
  border-color: var(--accent-color);
  font-weight: 700;
}

.hint-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.latency-control-box {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  padding: 12px 14px;
  border-radius: 12px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.latency-control-box .modern-slider {
  width: 100%;
  margin: 0;
  display: block;
}

.latency-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.text-input {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text-main);
  font-size: 0.82rem;
  outline: none;
}
.text-input:focus {
  border-color: var(--accent-color);
}

.textarea-input {
  resize: vertical;
  font-family: inherit;
}

/* ANIMATED TEXT AREAS & GLOWING TYPOGRAPHY */
.animated-gradient-text {
  background: linear-gradient(135deg, #14b8a6, #38bdf8, #ec4899, #14b8a6);
  background-size: 300% 300%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradientShift 6s ease infinite;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Animated interactive text boxes (Inputs, Notes, Banners) */
.tune-notes-banner {
  background: linear-gradient(135deg, rgba(20, 184, 166, 0.08), rgba(56, 189, 248, 0.05));
  border: 1px solid rgba(20, 184, 166, 0.25);
  box-shadow: 0 4px 15px rgba(20, 184, 166, 0.06);
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tune-notes-banner::after {
  content: '';
  position: absolute;
  top: 0;
  left: -150%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  transform: skewX(-25deg);
  animation: textShimmerSweep 5s infinite;
  pointer-events: none;
}

@keyframes textShimmerSweep {
  0% { left: -150%; }
  35% { left: 150%; }
  100% { left: 150%; }
}

.tune-notes-banner:hover {
  border-color: rgba(20, 184, 166, 0.45);
  box-shadow: 0 6px 20px rgba(20, 184, 166, 0.12);
  transform: translateY(-1px);
}

.text-input, .textarea-input {
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background-color 0.25s ease, transform 0.15s ease;
}

.text-input:focus, .textarea-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.18), 0 4px 12px rgba(0, 0, 0, 0.1);
  background-color: var(--bg-card);
}

/* ANIMATED INTERACTIVE TOOLTIP TOUR STYLES */
.tooltip-tour-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 15, 26, 0.65);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.25s ease-out;
}

.tooltip-tour-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-color);
  border-radius: 16px;
  padding: 18px 20px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 25px rgba(20, 184, 166, 0.25);
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: popInTooltip 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
}

@keyframes popInTooltip {
  0% { transform: scale(0.9) translateY(10px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

.tooltip-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tooltip-badge {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--accent-color);
  background: rgba(20, 184, 166, 0.15);
  padding: 3px 9px;
  border-radius: 9999px;
}

.tooltip-title {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0 0 6px 0;
}

.tooltip-text {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.tooltip-dots-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.tooltip-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.btn-sm {
  padding: 6px 12px !important;
  font-size: 0.75rem !important;
  border-radius: 8px !important;
}

.ml-auto {
  margin-left: auto;
}

/* FEEDBACK & SUGGESTIONS MODAL STYLES */
.feedback-modal-card {
  max-width: 540px;
  width: 92%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 22px;
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.feedback-success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(20, 184, 166, 0.15);
  border: 1px solid rgba(20, 184, 166, 0.35);
  color: #14b8a6;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 14px;
  animation: fadeInDown 0.3s ease;
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.feedback-form-box {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
}

.send-feedback-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #ec4899, #f43f5e);
  border: none;
  box-shadow: 0 4px 14px rgba(236, 72, 153, 0.3);
}
.send-feedback-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feedback-history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.history-section-header {
  margin-bottom: 8px;
}

.history-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.feedback-list-scroll {
  max-height: 190px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.feedback-item-card {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 12px;
  transition: transform 0.15s, border-color 0.15s;
}
.feedback-item-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.feedback-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}

.feedback-author {
  font-size: 0.8rem;
  color: var(--text-main);
}

.feedback-cat-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 9999px;
}
.tag-suggestion { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.tag-musique { background: rgba(20, 184, 166, 0.15); color: #14b8a6; }
.tag-bug { background: rgba(244, 63, 94, 0.15); color: #f43f5e; }
.tag-autre { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }

.feedback-date {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.feedback-del-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
}
.feedback-del-btn:hover {
  color: #f43f5e;
}

.feedback-text {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
  white-space: pre-wrap;
}

.empty-feedbacks {
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-muted);
  padding: 20px 0;
}

/* Empty Catalog State */
.empty-catalog-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  text-align: center;
}

.empty-catalog-content {
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-icon-large {
  font-size: 3.5rem;
  animation: pulseRotate 2.5s infinite ease-in-out;
}

.empty-heading {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.empty-text {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.tutorial-launcher-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card-inner);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  gap: 12px;
  transition: all 0.2s ease;
}

.tut-launcher-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.tutorial-launcher-card .action-btn-primary,
.tutorial-launcher-card .action-btn-outline {
  flex-shrink: 0;
  white-space: nowrap;
}

@media (max-width: 580px) {
  .tutorial-launcher-card,
  .low-perf-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .tutorial-launcher-card .action-btn-primary,
  .tutorial-launcher-card .action-btn-outline {
    align-self: stretch;
    justify-content: center;
  }
}

.feedback-launcher-card {
  border-left: 3px solid #ec4899;
}
.feedback-action-btn {
  background: linear-gradient(135deg, #ec4899, #f43f5e);
  box-shadow: 0 2px 10px rgba(236, 72, 153, 0.3);
}

.text-pink {
  color: #ec4899 !important;
}

/* Dynamic Pattern Pill with Repeat Selector */
.pattern-live-help-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(236, 72, 153, 0.12);
  border: 1px solid rgba(236, 72, 153, 0.3);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 700;
  color: #ec4899;
}

.patterns-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 6px;
}

/* Patterns & Breaks Cards in 2 Unified Lines */
.patterns-pills-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  margin-top: 4px;
}

@media (max-width: 600px) {
  .patterns-pills-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

.pattern-card-box {
  display: flex;
  flex-direction: column;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px 10px;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.pattern-card-box.is-selected {
  border-color: var(--accent-color);
  background: rgba(20, 184, 166, 0.08);
  box-shadow: 0 0 16px rgba(20, 184, 166, 0.18);
}

/* Ligne 1: Bouton titre du Pattern */
.pattern-main-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 4px 6px;
  color: var(--text-main);
  cursor: pointer;
  border-radius: 8px;
  text-align: left;
  transition: background 0.15s ease;
}

.pattern-main-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}

.pattern-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
  transition: background 0.2s, box-shadow 0.2s;
}

.pattern-card-box.is-selected .pattern-indicator-dot {
  background: var(--accent-color);
  box-shadow: 0 0 8px var(--accent-color);
}

.pattern-pill-title {
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.pattern-card-box.is-selected .pattern-pill-title {
  color: var(--accent-color);
}

/* Ligne 2: Options Live bien alignées */
.pattern-card-options-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.pattern-repeat-badge-box {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1.2;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 3px 8px;
  border-radius: 8px;
  min-width: 0;
}

.pattern-prio-badge-box {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 3px 8px;
  border-radius: 8px;
  min-width: 0;
}

.repeat-tag-label {
  font-size: 0.65rem;
  font-weight: 800;
  color: #ec4899;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.prio-tag-label {
  font-size: 0.65rem;
  flex-shrink: 0;
}

.pattern-repeat-select,
.pattern-prio-select {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  outline: none;
  cursor: pointer;
  padding: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.pattern-repeat-select {
  color: #cbd5e1;
}

.pattern-prio-select {
  color: #f59e0b;
}

.pattern-repeat-select option,
.pattern-prio-select option {
  background: #0f172a;
  color: #fff;
}

/* 3-Step Hero Accompaniment Action Button */
.hero-acc-tri-btn.state-active {
  background: rgba(20, 184, 166, 0.15);
  border-color: rgba(20, 184, 166, 0.4);
  color: #14b8a6;
}

.hero-acc-tri-btn.state-drawer {
  background: var(--accent-color);
  color: var(--accent-contrast);
  box-shadow: 0 0 14px rgba(20, 184, 166, 0.5);
}

.hero-acc-tri-btn.state-muted {
  background: rgba(244, 63, 94, 0.2) !important;
  border-color: #f43f5e !important;
  color: #f43f5e !important;
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.6) !important;
  animation: pulseMutedRed 1.5s infinite alternate;
}

@keyframes pulseMutedRed {
  0% { box-shadow: 0 0 10px rgba(244, 63, 94, 0.4); }
  100% { box-shadow: 0 0 20px rgba(244, 63, 94, 0.8); }
}

.acc-muted-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f43f5e;
}

.now-playing-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.repeat-tag-label {
  font-size: 0.62rem;
  font-weight: 800;
  color: #ec4899;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.pattern-repeat-select {
  background: transparent;
  border: none;
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  outline: none;
  cursor: pointer;
  padding: 0;
}

.pattern-repeat-select option {
  background: #0f172a;
  color: #fff;
}

/* Organic Styled LIVE Mode Button (Matching Groovy Beat font & aura) */
.hero-live-mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 9999px;
  background: rgba(236, 72, 153, 0.15);
  border: 1px solid rgba(236, 72, 153, 0.4);
  color: #f43f5e;
  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 12px rgba(236, 72, 153, 0.25);
}

.hero-live-mode-toggle:hover {
  transform: scale(1.04);
  background: rgba(236, 72, 153, 0.25);
  box-shadow: 0 0 18px rgba(236, 72, 153, 0.45);
}

.hero-live-mode-toggle.active {
  background: linear-gradient(135deg, #ec4899, #f43f5e);
  color: #fff;
  border-color: #ec4899;
  box-shadow: 0 0 20px rgba(236, 72, 153, 0.6);
  animation: liveAuraPulse 1.8s infinite alternate ease-in-out;
}

@keyframes liveAuraPulse {
  0% { transform: scale(1); box-shadow: 0 0 12px rgba(236, 72, 153, 0.5); }
  100% { transform: scale(1.03); box-shadow: 0 0 24px rgba(236, 72, 153, 0.9); }
}

.live-pulse-badge {
  display: flex;
  align-items: center;
  gap: 5px;
}

.live-dot-glow {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f43f5e;
  box-shadow: 0 0 8px #f43f5e;
}

.hero-live-mode-toggle.active .live-dot-glow {
  background: #fff;
  box-shadow: 0 0 8px #fff;
}

.live-brand-text {
  letter-spacing: 0.05em;
}

.live-on-tag {
  font-size: 0.62rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 900;
}

/* BIG ANIMATED NEXT PATTERN ANNOUNCEMENT (Pep's, Tilt & Pulse) */
.hero-incoming-announcement {
  position: absolute;
  top: 14%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 120;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.announce-content-card {
  background: rgba(10, 15, 29, 0.95);
  border: 2px solid #ec4899;
  box-shadow: 0 0 45px rgba(236, 72, 153, 0.75), inset 0 0 25px rgba(236, 72, 153, 0.35);
  padding: 14px 32px;
  border-radius: 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: announcePopTilt 1.2s infinite alternate ease-in-out;
  transform-origin: center center;
}

@keyframes announcePopTilt {
  0% { transform: scale(0.98) rotate(-1.5deg); }
  50% { transform: scale(1.04) rotate(0deg); }
  100% { transform: scale(1.02) rotate(1.5deg); }
}

.announce-eyebrow {
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: #ec4899;
  text-shadow: 0 0 12px rgba(236, 72, 153, 0.9);
}

.announce-pattern-title {
  font-size: 2.1rem;
  font-weight: 900;
  margin: 2px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 1.15;
}

.announce-countdown-dots {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.dot-bounce {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ec4899;
  animation: bounceDot 0.5s infinite alternate ease-in-out;
}

.dot-bounce:nth-child(2) { animation-delay: 0.15s; }
.dot-bounce:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounceDot {
  0% { transform: scale(0.7); opacity: 0.4; }
  100% { transform: scale(1.5); opacity: 1; box-shadow: 0 0 14px #ec4899; }
}

.announce-pop-enter-active,
.announce-pop-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.announce-pop-enter-from,
.announce-pop-leave-to {
  transform: translateX(-50%) scale(0.5) rotate(-10deg);
  opacity: 0;
}

.announce-repeats-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(20, 184, 166, 0.2);
  border: 1px solid rgba(20, 184, 166, 0.5);
  color: #14b8a6;
  font-size: 0.78rem;
  font-weight: 800;
  padding: 3px 12px;
  border-radius: 9999px;
  margin: 2px 0 4px;
}

/* Subtle & Frameless Splash "GO !" Animation */
.hero-go-splash-overlay {
  position: absolute;
  top: 26%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 150;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.go-splash-card {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  animation: goSplashPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes goSplashPop {
  0% { transform: scale(0.4) rotate(-6deg); opacity: 0; }
  40% { transform: scale(1.15) rotate(2deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 0.95; }
}

.go-sparkle-icon {
  font-size: 1.4rem;
  animation: pulseRotate 0.6s infinite alternate ease-in-out;
}

.go-text-gradient {
  font-size: 3.8rem;
  font-weight: 900;
  margin: 0;
  color: #14b8a6;
  text-shadow: 0 0 35px rgba(20, 184, 166, 0.9), 0 0 60px rgba(236, 72, 153, 0.8), 0 2px 10px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.08em;
  font-family: inherit;
}

.go-pattern-sub {
  font-size: 0.85rem;
  font-weight: 800;
  color: #ffffff;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(20, 184, 166, 0.4);
  padding: 2px 12px;
  border-radius: 9999px;
  box-shadow: 0 0 15px rgba(20, 184, 166, 0.3);
}

.go-splash-anim-enter-active,
.go-splash-anim-leave-active {
  transition: all 0.25s ease-out;
}

.go-splash-anim-enter-from {
  transform: translateX(-50%) scale(0.3);
  opacity: 0;
}
.go-splash-anim-leave-to {
  transform: translateX(-50%) scale(1.3);
  opacity: 0;
}

/* Edit Name Mini Button */
.edit-name-mini-btn {
  background: rgba(20, 184, 166, 0.12);
  border: 1px solid rgba(20, 184, 166, 0.3);
  color: #14b8a6;
  border-radius: 6px;
  padding: 3px 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.edit-name-mini-btn:hover {
  background: var(--accent-color);
  color: var(--accent-contrast);
}

.tune-import-export-btn {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.tune-import-export-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* Export / Import Modal Styles */
.export-import-modal-card {
  max-width: 520px;
  width: 92%;
}

.modal-tabs-row {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  overflow-x: auto;
}

.tab-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-inner);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.tab-pill.active {
  background: var(--accent-color);
  color: var(--accent-contrast);
  border-color: var(--accent-color);
}

.tab-pill.danger-tab.active {
  background: #f43f5e;
  border-color: #f43f5e;
  color: #fff;
}

.export-card, .warning-card, .danger-zone-card {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
}

.warning-card {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.05);
}

.danger-zone-card {
  border-color: rgba(244, 63, 94, 0.4);
  background: rgba(244, 63, 94, 0.05);
}

.text-warning {
  color: #f59e0b !important;
}

.text-danger {
  color: #f43f5e !important;
}

.qrcode-wrapper {
  background: #0f172a;
  padding: 12px;
  border-radius: 12px;
  display: inline-block;
  border: 1px solid var(--border-color);
}

.qrcode-img {
  max-width: 220px;
  height: auto;
  display: block;
  margin: 0 auto;
}

/* QR Camera Scanner Frame & Error Banner */
.camera-scanner-frame {
  max-width: 320px;
  width: 100%;
  min-height: 250px;
  margin: 0 auto;
  border-radius: 14px;
  overflow: hidden;
  border: 2px solid var(--accent-color);
  background: #000;
}

.scanner-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.4);
  color: #f43f5e;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.76rem;
}

.tune-card-right-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.tune-qr-share-mini-btn {
  background: rgba(20, 184, 166, 0.12);
  border: 1px solid rgba(20, 184, 166, 0.3);
  color: #14b8a6;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.tune-qr-share-mini-btn:hover {
  background: var(--accent-color);
  color: var(--accent-contrast);
  transform: scale(1.1);
}

.text-center {
  text-align: center;
}

.justify-content-center {
  justify-content: center;
}

/* Keyboard Shortcuts Modal Styles */
.shortcuts-modal-card {
  max-width: 480px;
  width: 92%;
}

.shortcuts-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  gap: 12px;
}

.key-badge {
  background: #0f172a;
  color: #14b8a6;
  border: 1px solid rgba(20, 184, 166, 0.35);
  border-radius: 5px;
  padding: 3px 8px;
  font-family: monospace;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}

/* Documentation & Changelog Modal Styles */
.doc-modal-card {
  max-width: 580px;
  width: 94%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.doc-modal-content {
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.doc-section {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
}

.doc-heading {
  font-size: 0.88rem;
  font-weight: 700;
  margin: 0 0 10px 0;
}

.doc-strokes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}

.doc-stroke-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 8px;
  border-radius: 6px;
}

.doc-stroke-key {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  font-weight: 800;
  font-size: 0.75rem;
  color: #fff;
  flex-shrink: 0;
}

.doc-stroke-details {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.doc-stroke-details strong {
  font-size: 0.76rem;
  color: var(--text-main);
}

.doc-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.doc-list li {
  margin-bottom: 6px;
}

.doc-list li strong {
  color: var(--text-main);
}

.changelog-version-block {
  background: var(--bg-card-inner);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
}

.shortcut-desc {
  font-size: 0.8rem;
  color: var(--text-main);
  text-align: right;
}

.text-teal {
  color: var(--accent-color) !important;
}
</style>
