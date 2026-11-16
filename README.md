# CoachLine

The CoachLine homepage at https://coachlineai.github.io/.

A responsive, dependency-free HTML/CSS/JavaScript marketing site. GitHub Pages deploys the main branch from the repository root. `.nojekyll` serves the files directly.

## Files

- `index.html`: homepage content and accessible page structure.
- `styles.css`: shared layouts, responsive styles, typography, and animations.
- `hero.css`: the coach-facing hero and creator setup preview styles.
- `app.js`: navigation, scroll chapters, carousel, sample chats, pricing calculator, and FAQs.
- `assets/`: self-hosted images and fonts.

## Preview locally

Run `python3 -m http.server 8000` from the repository root and open http://localhost:8000/.

## Product status

This is a frontend product preview. Chat conversations are scripted and run locally in the page. The creator setup form is also a local preview and does not create or save accounts. There is no authentication, AI inference, billing, analytics, or messaging integration. The proposed revenue split is 80% for the creator and 20% for CoachLine, before fees and expenses.

## Design and asset notes

The visual reference requested for this homepage is https://get.manychat.com/. The layout and animations are implemented independently with CoachLine copy and original UI illustrations. The current hero is the project’s approved AI-generated gym portrait (`assets/hero-coach-curl.webp`). The original reference hero files remain in the repository but are no longer used. The smaller coach image is also an AI-generated illustration from the project. Fonts are Archivo Black, DM Sans, and IBM Plex Mono from Google Fonts; their OFL license notices are included under assets/FONT-LICENSES.txt.
