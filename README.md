# RecipeFlow Zero

A free, local-first PWA combining recipe capture/cooking workflows with target-driven meal planning. It is inspired by the *categories of functionality* in recipe managers and automatic meal planners, but contains no ReciMe/Eat This Much proprietary code, branding, data, or assets.

## v0.2 highlights
- Personal profile + goal-based BMR/TDEE calorie and macro suggestions
- Manual target overrides
- Dietary patterns, allergies, dislikes, likes and cuisine preferences
- Automatic weekly meal generation from your recipe library
- Pantry-aware grocery list and personal price book
- Offline-first IndexedDB; external services are enhancements, not requirements
- Optional Supabase magic-link sync
- Optional Cloudflare Worker importer
- GitHub Pages-ready PWA

## Deploy on GitHub Pages
This repo includes `.github/workflows/pages.yml`. In GitHub Settings → Pages, choose **GitHub Actions** as the source if it is not selected automatically.

## Supabase
Create a free Supabase project, run `supabase/schema.sql`, then paste the Project URL and anon/publishable key into Settings.

## Cloudflare Worker
Deploy `worker/worker.js` using `worker/wrangler.toml`, then paste its Worker URL into Settings.

## Nutrition note
Energy targets are estimates, not medical advice. The app uses a Mifflin-St Jeor-style BMR estimate, activity multipliers, conservative goal adjustments, and manual overrides.
