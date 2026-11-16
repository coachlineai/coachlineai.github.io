# CoachLine

The CoachLine homepage at https://coachlineai.github.io/.

A responsive, dependency-free HTML/CSS/JavaScript marketing site. GitHub Pages deploys the main branch from the repository root. `.nojekyll` serves the files directly.

## Files

- `index.html`: homepage content and accessible page structure.
- `styles.css`: shared layouts, responsive styles, typography, and animations.
- `hero.css`: the coach-facing hero and creator setup preview styles.
- `app.js`: navigation, scroll chapters, carousel, sample chats, the inline earnings calculator, and FAQs.
- `assets/`: self-hosted images and fonts.

## Preview locally

Run `python3 -m http.server 8000` from the repository root and open http://localhost:8000/.

## Product status

This is a frontend product preview. Chat conversations are scripted and run locally in the page. The sign-up and sign-in screens are frontend previews and do not create accounts, send email, or connect to social accounts. There is no authentication, AI inference, billing, analytics, or messaging integration. The proposed revenue split is 80% for the creator and 20% for CoachLine, before fees and expenses.

## Design and asset notes

The visual reference requested for this homepage is https://get.manychat.com/. The layout and animations are implemented independently with CoachLine copy and original UI illustrations. The current hero is the project’s approved AI-generated gym portrait (`assets/hero-coach-curl.webp`). The original reference hero files remain in the repository but are no longer used. The smaller coach image is also an AI-generated illustration from the project. Fonts are Archivo Black, DM Sans, and IBM Plex Mono from Google Fonts; their OFL license notices are included under assets/FONT-LICENSES.txt.

## Creator earnings section

The earnings calculator replaces the old comparison section; the three-step section has been removed. Navigation links scroll to Features, Channels, Earnings, Demo, and FAQs and highlight the current section. The calculator animates into view once and respects reduced motion and the animation pause control. Estimates use the proposed 80/20 revenue split, with inputs constrained to nonnegative values, whole paying-client counts, and prices rounded to cents. No payment or income is guaranteed.

## Interactive conversation examples

The footer has one Navigation group with Features, Channels, Earnings, Demo, and FAQ, using the original footer typography and column position. The demo phone supports mouse dragging, wheel scrolling, touch scrolling, and keyboard scrolling. The explanatory sidebar and replay control have been removed. Conversation changes reset the thread to the top so photos stay visible and new scripted messages do not interrupt reading.

- Workout: a Tuesday leg-day example with exercises, sets, reps, warm-up, and rest guidance.
- Meal: a realistic salad attachment followed by a conversation about visible ingredients and portion details.
- Equipment: the supplied squat-rack photo, a short explanation, and a YouTube shortcut to Squat University’s “The Official Squat Form Checklist”: https://www.youtube.com/watch?v=Uv_DKDl7EjA.

### New image assets

`assets/demo-salad.webp` was generated with the built-in image generation tool in generate mode, then resized and converted to WebP for the site. Prompt: “Use case: photorealistic-natural. Asset type: an example client photo attachment inside a fitness coaching text conversation. Generate a single realistic candid smartphone snapshot of lunch: a casual white ceramic bowl of grilled chicken salad on a light wood kitchen table, romaine and mixed greens, cherry tomato halves, cucumber slices, sliced grilled chicken breast, avocado pieces, with a small cup of olive-oil vinaigrette beside the bowl. Slightly angled overhead iPhone viewpoint, bowl fully visible, everyday imperfect arrangement, natural window light, subtle phone-camera grain, unstyled and believable as a quick photo someone texts their fitness coach. Square composition, no people, no lettering, no labels, no app UI, no watermark. Preserve photographic detail; do not make an advertising food shoot.”

`assets/demo-squat-rack.webp` is the reference photo supplied by the project owner, converted to WebP. These static attachments are example content; the site does not process uploaded client photos.

## Creator account screens

`signin.html` and `signup.html` use the split-screen layout from the user-provided Manychat reference, with CoachLine branding, purple controls, and an original fitness illustration. `auth.css` and `auth.js` provide responsive layout, email validation, screen switching, legal preview dialogs, and explicit unavailable states. All homepage marketing CTAs link to sign-up; the Sign In link goes to sign-in. Section navigation and demo tabs retain their navigation behavior. The previous creator and chat CTA modals have been removed.

Authentication is not implemented. The email form and Google, Instagram, TikTok, and Apple controls show an honest coming-soon response and never transmit or persist entered information. A future authentication service must implement these flows before account access is available.

`assets/auth-coaching.webp` is an original transparent illustration generated with the built-in image generation tool in generate mode, then resized and converted to WebP while preserving alpha. Prompt: “Use case: illustration-story. Asset type: original spot illustration for CoachLine fitness creator sign-in and sign-up pages. Create a bold playful flat editorial illustration of one stylized muscular arm bent upward, confidently holding a small dumbbell, over a rounded chat bubble shape. Simple geometric silhouette, crisp vector-like edges, a few large color blocks, minimal detail, no outlines, no shadows, no texture. Use CoachLine colors: deep indigo #4344c7, vibrant purple #8725c8, bright yellow #fff100, hot pink #f000d8, and a little black. This should feel like a contemporary friendly software-brand illustration combining fitness coaching with messaging. Full arm and dumbbell visible, balanced square composition with generous transparent space around the silhouette. Transparent background. No words, letters, logos, watermarks, or UI. No waving hand.”
