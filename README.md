# FASHN Try-On Proxy

A minimal Node.js/Express backend that connects the **Sleeves** AR app to the
**FASHN** virtual try-on API. The browser sends the user's photo and the scanned
garment; this proxy forwards them to FASHN, polls until the try-on is ready, and
returns the result image URL that renders on page 3 of the app.

## Why this exists

The app cannot call FASHN directly because:

1. The FASHN API key must stay on the server, never in browser code.
2. The browser is blocked by CORS from calling `api.fashn.ai`.
3. FASHN is asynchronous — you submit a job, then poll its status until done.

## Endpoints (the app depends on these exact routes)

| Method | Route                     | Body / Header                                         | Returns                      |
| ------ | ------------------------- | ----------------------------------------------------- | ---------------------------- |
| POST   | `/api/tryon/start`        | `{ model_image, garment_image, category, mode }` + `X-Fashn-Api-Key` | `{ id }`      |
| GET    | `/api/tryon/status/:id`   | `X-Fashn-Api-Key` header                              | `{ status, output, error }`  |

`model_image` and `garment_image` arrive as base64 data-URIs from the browser and
are forwarded to FASHN as-is (FASHN accepts base64 data-URIs).

## Run locally

```bash
cd fashn-proxy
npm install
# Option A: let the app pass the key from its Settings panel (no .env needed)
npm start
# Option B: keep the key on the server
cp .env.example .env   # then edit FASHN_API_KEY
npm start
```

The server starts on `http://localhost:3001` — which is exactly the default
"Proxy server address" in the app's Settings on page 2. Enter your FASHN API key
in the app's Settings and you're ready.

Requires **Node.js 18+** (uses the built-in global `fetch`).

## Deploy (so it works from the hosted app)

`http://localhost:3001` only works while you test on the same machine. To use the
hosted app at `arrapp.netlify.app`, deploy this proxy somewhere with HTTPS
(Render, Railway, Fly.io, a VPS, etc.), then put that HTTPS URL into the app's
"Proxy server address" field.

Render example:
1. Push this folder to a Git repo.
2. New Web Service → build `npm install`, start `npm start`.
3. Add env var `FASHN_API_KEY` (optional) and `CORS_ORIGIN=https://arrapp.netlify.app`.
4. Copy the service URL (e.g. `https://your-proxy.onrender.com`) into the app.

> Note: browsers block a secure (https) page from calling an insecure (http)
> address. If your app is served over https, your proxy must be https too.

## How it maps to the app flow

1. User scans a garment QR from the TZIR store → app loads that garment image.
2. User picks a photo (gallery / camera / avatar).
3. App base64-encodes both images and POSTs them to `/api/tryon/start`.
4. Proxy calls FASHN `/v1/run` (model `tryon-v1.6`) and returns the prediction id.
5. App polls `/api/tryon/status/:id`; proxy calls FASHN `/v1/status/:id`.
6. When `status: "completed"`, the `output[0]` image URL renders on page 3.
