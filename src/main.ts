import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { resetDemoStateIfNeeded } from './demoReset'

// Avant tout montage : en mode démo seulement (VITE_DEMO=1), efface l'état
// local périmé — une fois par jour et/ou si le build a changé. Le build
// auto-hébergé (Docker) ne définit pas VITE_DEMO : aucune donnée réelle
// n'est effacée.
resetDemoStateIfNeeded()

createApp(App).mount('#app')
