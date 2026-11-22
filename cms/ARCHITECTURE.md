# CoachLine creator pages

The public profile stays at `matthias.html`. The authenticated editor lives at `page-editor.html`; dashboard My Page opens that editor. Public visitors never see the editor toolbar.

## Data boundaries

- Supabase Auth owns creator identities. The dashboard checks the authenticated user before showing account data.
- `creator_profiles` stores account display names, keyed by auth user ID.
- `creator_pages` stores private draft content, slug, and timestamps. A separate `page_members` table controls which creators can edit each page.
- `published_pages` stores only the last published snapshot. Public read access is allowed here, never on drafts or membership tables.
- Image drafts go into a private storage bucket; published images get separate immutable paths in a public bucket. Saving a draft does not overwrite an image used by the published version.
- All tables use row-level security. Only page members can save or publish a page. Client-supplied owner IDs and display names do not confer access.

## Editor

Toolbar: Save draft, Exit, desktop/mobile preview, View live, Publish.

Fields: photo upload, photo positioning, creator name, handle, bio, messaging phone number, button text, and repeatable social links. Each link has a platform, label, HTTPS URL, optional uploaded custom logo, reorder, and remove controls.

The preview uses the same rendering component as the public page. Text is rendered with textContent, URLs are restricted to HTTPS or the validated SMS target, and uploaded images are decoded and re-encoded to raster images. Save errors leave the editor dirty; publish success is shown only after server confirmation. Version checks prevent silently overwriting another editor's changes.

## Authentication

Replace the current demo-only sign-in handlers with Supabase authentication. Email/password can work without configuring a Google Cloud OAuth client. Google sign-in requires its client ID, secret, and redirect configuration before that button can be enabled.

Existing Matthias page ownership must be assigned to confirmed creator email addresses. New users receive their own page, never edit rights to Matthias's page.
