/**
 * FASHN Try-On Proxy  (quality-tuned)
 * -----------------------------------
 * A small Node.js backend that connects the "Sleeves" AR app to the FASHN API.
 *
 * The app calls exactly two routes:
 *   POST /api/tryon/start          body: { model_image, garment_image, category, mode }
 *                                  header: X-Fashn-Api-Key: <key>   -> { id }
 *   GET  /api/tryon/status/:id     header: X-Fashn-Api-Key: <key>   -> { status, output, error }
 *
 * Quality notes (why results now match fashn.ai better):
 *   - Defaults to FASHN's "quality" mode, which their docs say specifically
 *     restores the true appearance of arms/hands/neck (fixes "black hands").
 *   - Sends adjust_hands + restore_background to clean up hand artifacts and
 *     keep the original background.
 *   - Uses num_samples: 1 and png output for the sharpest single result.
 * The app's "mode" selector (performance / balanced / quality) is still
 * respected; if it sends nothing, we use quality.
 */

const express = require('express');
const cors = require('cors');

const app = express();

const FASHN_BASE_URL = process.env.FASHN_BASE_URL || 'https://api.fashn.ai/v1';
const PORT = process.env.PORT || 3001;

// Default quality mode. Override with FASHN_MODE=balanced for faster/cheaper runs.
const DEFAULT_MODE = process.env.FASHN_MODE || 'quality';

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '30mb' }));

function getApiKey(req) {
  return (
    req.get('X-Fashn-Api-Key') ||
    req.get('x-fashn-api-key') ||
    process.env.FASHN_API_KEY ||
    ''
  ).trim();
}

// FASHN mode: 'performance' | 'balanced' | 'quality'. Default to quality.
function normalizeMode(mode) {
  const allowed = ['performance', 'balanced', 'quality'];
  return allowed.includes(mode) ? mode : DEFAULT_MODE;
}

// FASHN category: 'auto' | 'tops' | 'bottoms' | 'one-pieces'. Default auto.
function normalizeCategory(category) {
  const allowed = ['auto', 'tops', 'bottoms', 'one-pieces'];
  return allowed.includes(category) ? category : 'auto';
}

// ---- POST /api/tryon/start : submit a prediction to FASHN ----
app.post('/api/tryon/start', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing FASHN API key.' });
  }

  const { model_image, garment_image, category, mode } = req.body || {};
  if (!model_image || !garment_image) {
    return res
      .status(400)
      .json({ error: 'Both model_image and garment_image are required.' });
  }

  const payload = {
    model_name: 'tryon-v1.6',
    inputs: {
      model_image,                       // data-URI (base64) or public URL
      garment_image,                     // data-URI (base64) or public URL
      category: normalizeCategory(category),
      mode: normalizeMode(mode),         // 'quality' by default (restores hands/arms/neck)
      garment_photo_type: 'auto',
      segmentation_free: true,           // v1.6's built-in hand/body preservation
      moderation_level: 'permissive',
      num_samples: 1,
      output_format: 'png',              // highest quality output
    },
  };

  try {
    const fashnResp = await fetch(`${FASHN_BASE_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await fashnResp.json().catch(() => ({}));

    if (!fashnResp.ok) {
      const msg =
        data.message || data.error || `FASHN error (HTTP ${fashnResp.status})`;
      return res.status(fashnResp.status).json({ error: msg });
    }
    if (!data.id) {
      return res.status(502).json({ error: 'FASHN did not return a prediction id.' });
    }
    return res.json({ id: data.id });
  } catch (err) {
    console.error('start error:', err);
    return res.status(500).json({ error: 'Proxy could not reach the FASHN API.' });
  }
});

// ---- GET /api/tryon/status/:id : poll a prediction ----
app.get('/api/tryon/status/:id', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing FASHN API key.' });
  }

  const { id } = req.params;

  try {
    const fashnResp = await fetch(`${FASHN_BASE_URL}/status/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = await fashnResp.json().catch(() => ({}));

    if (!fashnResp.ok) {
      const msg =
        data.message || data.error || `FASHN error (HTTP ${fashnResp.status})`;
      return res.status(fashnResp.status).json({ error: msg });
    }

    return res.json({
      id: data.id,
      status: data.status,
      output: data.output || null,
      error: data.error || null,
    });
  } catch (err) {
    console.error('status error:', err);
    return res.status(500).json({ error: 'Proxy could not reach the FASHN API.' });
  }
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'fashn-proxy', mode: DEFAULT_MODE, fashn: FASHN_BASE_URL });
});

app.listen(PORT, () => {
  console.log(`FASHN proxy listening on http://localhost:${PORT}`);
  console.log(`Default mode: ${DEFAULT_MODE}  ->  ${FASHN_BASE_URL}`);
});
