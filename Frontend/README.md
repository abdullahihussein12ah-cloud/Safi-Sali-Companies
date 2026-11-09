<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/11c4817c-6727-4a8c-b66e-fdf9aca37d94

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend API deployment

The frontend expects the API at `/api` by default. Local Vite development proxies that path to `http://127.0.0.1:5000`. When deploying the frontend separately from the API, set the build-time `VITE_API_URL` environment variable to the backend origin (for example, `https://api.example.com`) and rebuild the frontend. The backend must include the current routes, including `/api/workspace/recycling-bin`. Do not point `VITE_API_URL` at the frontend hosting origin unless that host is configured to proxy `/api` to the backend.
