import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { resetDemoStateIfNeeded } from './demoReset'

// Avant tout montage : efface l'état local périmé si le build a changé
// (démo GitHub Pages — remise à zéro une seule fois par publication).
resetDemoStateIfNeeded()

createApp(App).mount('#app')
