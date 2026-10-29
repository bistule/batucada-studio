// Configuration de marque — point unique de personnalisation.
// Remplacez les valeurs ci-dessous pour adapter le logo et le nom affichés,
// sans toucher au code de l'application.
export const BRAND = {
  /** Nom affiché (fil d'ariane, PDF exporté, texte alternatif des images). */
  name: 'Batucada Studio',
  /** Image filigrane géante de l'arène (public/branding/logo-text.png). */
  logoText: `${import.meta.env.BASE_URL}branding/logo-text.png`,
  /** Image logo complet (public/branding/logo-full.png). */
  logoFull: `${import.meta.env.BASE_URL}branding/logo-full.png`,
  /** Image logo graphique / icône (public/branding/logo-graphic.png). */
  logoGraphic: `${import.meta.env.BASE_URL}branding/logo-graphic.png`,
} as const;
