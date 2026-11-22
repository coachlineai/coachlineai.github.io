# CoachLine account and creator page setup

Implemented with Supabase Auth, Postgres row-level security and Storage on the existing free organization. Only the publishable key is shipped to browsers. Passwords are handled by Supabase Auth. The static site uses SDK-managed browser sessions, not HTTP-only server cookies.

## Remaining dashboard configuration before account testing

Project: kvpngwwaemdjwchslcov.

- Site URL: https://coachlineai.github.io
- Allowed redirect URLs: https://coachlineai.github.io/signin.html and https://coachlineai.github.io/reset-password.html
- Keep email confirmation enabled.
- Set server-side minimum password length to 12 (the form already enforces 12).
- Configure and verify email delivery before opening signups beyond the organization. Supabase's default email sender is limited; do not disable verification to work around email delivery.
- Register the initial creator through signup.html, enter a password directly, confirm the email, then sign in. Its reserved page is assigned by the private invitation only after email verification. No creator credentials have been created by this deployment.

## Data and publishing

`profiles` stores display names, never passwords. `page_members` is server-managed ownership. `creator_pages` holds private drafts. `published_pages` holds public snapshots. New verified creators receive a blank page with a neutral placeholder.

Draft images are in private `page-drafts` storage. Publish copies selected images to immutable paths in public `page-public` storage, then updates the public snapshot. Public image URLs can remain accessible after replacement; a future deletion workflow must clean old assets. Uploads are capped at 5 MB and resized to WebP, but total storage still needs monitoring. Do not upgrade billing without approval.

My Page opens the editor. Save draft does not publish. Publish requires a valid name, phone and links. Concurrent stale saves fail instead of overwriting another tab's work. Logout removes the current session; RLS checks live auth sessions as well as the JWT user ID.

## Verification

`npm test` checks HTML escaping, unsafe link rejection, phone formatting and publish validation. Database transaction checks passed for account isolation, private drafts, stale versions, publishing, missing-session denial and anonymous public reads. All test rows were rolled back.

Real email confirmation, password reset, authenticated browser editing and end-to-end logout must be tested after dashboard authentication settings are completed. Payments, client messaging, AI and analytics remain disconnected and are labeled accordingly.

## Dependencies

Run `npm ci`, then `npx esbuild cms/sdk-entry.js --bundle --format=esm --minify --outfile=vendor/supabase.js` to rebuild the pinned Supabase SDK. Never put a service-role or secret key in this repository.
