import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TUNES_FILE = path.join(DATA_DIR, 'tunes.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const STATIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html')) 
  ? path.join(__dirname, 'public') 
  : path.join(__dirname, 'dist');

// Assurer l'existence du dossier data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialiser les scores / Hall of Fame
function getScores() {
  try {
    if (fs.existsSync(SCORES_FILE)) {
      const data = fs.readFileSync(SCORES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Erreur lecture scores.json:', err);
  }
  return {};
}

function saveScores(scoresData) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scoresData, null, 2), 'utf-8');
}

// Initialiser le mot de passe Maestro par défaut si absent
function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Erreur lecture config.json:', err);
  }
  const defaultConfig = { maestroPin: '1234' };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  return defaultConfig;
}

// Initialiser les morceaux depuis tunesData.json initial si tunes.json n'existe pas encore
function getTunes() {
  try {
    if (fs.existsSync(TUNES_FILE)) {
      const data = fs.readFileSync(TUNES_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
    // Fallback: charger initial data
    const initialFile = path.join(__dirname, 'src', 'tunesData.json');
    const fallbackRoot = path.join(__dirname, 'tunesData.json');
    const targetFile = fs.existsSync(initialFile) ? initialFile : fallbackRoot;
    if (fs.existsSync(targetFile)) {
      const initialData = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
      fs.writeFileSync(TUNES_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      return initialData;
    }
  } catch (err) {
    console.error('Erreur lecture tunes.json:', err);
  }
  return {};
}

function saveTunes(tunesData) {
  fs.writeFileSync(TUNES_FILE, JSON.stringify(tunesData, null, 2), 'utf-8');
}

function saveConfig(configData) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2), 'utf-8');
}

// MIME types pour le serveur de fichiers statiques
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm'
};

const server = http.createServer((req, res) => {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Maestro-Pin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- API ENDPOINTS ---

  // 1. GET /api/tunes -> Récupérer la bibliothèque partagée
  if (req.method === 'GET' && pathname === '/api/tunes') {
    const tunes = getTunes();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, tunes }));
    return;
  }

  // --- HALL OF FAME / SCORES ---
  // GET /api/scores -> Récupérer le Hall of Fame
  if (req.method === 'GET' && pathname === '/api/scores') {
    const scores = getScores();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, scores }));
    return;
  }

  // POST /api/scores -> Enregistrer un nouveau score
  if (req.method === 'POST' && pathname === '/api/scores') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { dateKey, level, playerName, score, accuracy, maxCombo, grade, totalNotes, perfects, greats, goods, misses } = payload;
        
        if (!dateKey || !level || !playerName || typeof score !== 'number') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Données de score invalides' }));
          return;
        }

        const scores = getScores();
        if (!scores[dateKey]) scores[dateKey] = {};
        if (!scores[dateKey][level]) scores[dateKey][level] = [];

        const newEntry = {
          id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          playerName: String(playerName).trim().substring(0, 20) || 'Anonyme',
          score: Math.round(score),
          accuracy: Number(accuracy) || 0,
          maxCombo: Number(maxCombo) || 0,
          grade: grade || 'C',
          totalNotes: totalNotes || 0,
          perfects: perfects || 0,
          greats: greats || 0,
          goods: goods || 0,
          misses: misses || 0,
          timestamp: new Date().toISOString()
        };

        scores[dateKey][level].push(newEntry);
        // Trier par score décroissant puis accuracy décroissant
        scores[dateKey][level].sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
        // Garder le top 50 par date et niveau
        scores[dateKey][level] = scores[dateKey][level].slice(0, 50);

        saveScores(scores);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, scores, newEntry }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erreur enregistrement score' }));
      }
    });
    return;
  }

  // 2. POST /api/maestro/verify -> Vérifier le mot de passe
  if (req.method === 'POST' && pathname === '/api/maestro/verify') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const config = getConfig();
        if (payload.pin === config.maestroPin) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, authorized: true }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Code PIN incorrect' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Format JSON invalide' }));
      }
    });
    return;
  }

  // 3. POST /api/maestro/change-pin -> Modifier le mot de passe Maestro
  if (req.method === 'POST' && pathname === '/api/maestro/change-pin') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const config = getConfig();
        if (payload.currentPin !== config.maestroPin) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Code PIN actuel incorrect' }));
          return;
        }
        if (!payload.newPin || payload.newPin.trim().length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Le nouveau code PIN doit faire au moins 4 caractères' }));
          return;
        }
        config.maestroPin = payload.newPin.trim();
        saveConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Code PIN modifié avec succès' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erreur lors de la modification' }));
      }
    });
    return;
  }

  // Middleware sécurité pour les modifications Maestro
  function checkMaestroAuth(req) {
    const pin = req.headers['x-maestro-pin'];
    const config = getConfig();
    return pin === config.maestroPin;
  }

  // 4. POST /api/maestro/save-tunes -> Sauvegarder toute la bibliothèque
  if (req.method === 'POST' && pathname === '/api/maestro/save-tunes') {
    if (!checkMaestroAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Non autorisé. Mode Maestro requis.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.tunes || typeof payload.tunes !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Données de morceaux manquantes' }));
          return;
        }
        saveTunes(payload.tunes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Bibliothèque mise à jour avec succès pour tout le groupe' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erreur écriture serveur' }));
      }
    });
    return;
  }

  // 5. POST /api/maestro/upsert-tune -> Ajouter ou mettre à jour un morceau
  if (req.method === 'POST' && pathname === '/api/maestro/upsert-tune') {
    if (!checkMaestroAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Non autorisé. Mode Maestro requis.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.tune || !payload.tune.name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Morceau invalide' }));
          return;
        }
        const tunes = getTunes();
        tunes[payload.tune.name] = payload.tune;
        saveTunes(tunes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Morceau ${payload.tune.name} sauvegardé pour tout le groupe` }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erreur écriture serveur' }));
      }
    });
    return;
  }

  // 6. DELETE /api/maestro/delete-tune/:name -> Supprimer un morceau
  if (req.method === 'DELETE' && pathname.startsWith('/api/maestro/delete-tune/')) {
    if (!checkMaestroAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Non autorisé. Mode Maestro requis.' }));
      return;
    }
    const tuneName = decodeURIComponent(pathname.replace('/api/maestro/delete-tune/', ''));
    const tunes = getTunes();
    if (tunes[tuneName]) {
      delete tunes[tuneName];
      saveTunes(tunes);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Morceau "${tuneName}" supprimé du serveur` }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Morceau non trouvé' }));
    }
    return;
  }

  // 7. POST /api/maestro/reset-default -> Rétablir le catalogue de base 52 morceaux
  if (req.method === 'POST' && pathname === '/api/maestro/reset-default') {
    if (!checkMaestroAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Non autorisé. Mode Maestro requis.' }));
      return;
    }
    try {
      const initialFile = path.join(__dirname, 'tunesData.json');
      if (fs.existsSync(initialFile)) {
        const initialData = JSON.parse(fs.readFileSync(initialFile, 'utf-8'));
        saveTunes(initialData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tunes: initialData, message: 'Catalogue réinitialisé sur le serveur' }));
        return;
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Erreur réinitialisation' }));
      return;
    }
  }

  // --- SERVEUR STATIQUE ---
  let requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = path.join(STATIC_DIR, requestedPath);
  
  // Vérifier si le fichier demandé existe
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (readErr, content) => {
    if (readErr) {
      console.error('Erreur lecture fichier:', filePath, readErr);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Erreur serveur interne');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🥁 Batucada Studio Server actif sur http://0.0.0.0:${PORT}`);
});
