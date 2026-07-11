# AI CSV Lead Importer

Upload any messy CSV lead export (Facebook Ads, Google Ads, a real-estate CRM, a manual spreadsheet — whatever) and have AI automatically map it to a fixed CRM schema, validate it, and return clean, import-ready records. Built for the GrowEasy Software Developer assignment.

## How it works

1. **Upload** — user drops/selects a CSV on the frontend.
2. **Parse** — the file is parsed client-side (preview) and again on the server (`csvParser.service.js`) using PapaParse, with headers kept exactly as-is (no assumptions about column names).
3. **AI mapping** — rows are sent to Groq (`aiExtractor.service.js`) in batches of 25. The model maps each row's existing values onto a fixed target schema (name, email, phone, location, CRM status, etc.) without inventing data.
4. **Validation** — `validator.service.js` enforces the schema: required email/mobile, enum checks on `crm_status` and `data_source`, date sanity checks. Records that fail are moved to a "skipped" list with a reason.
5. **Streaming progress** — the backend streams `meta` / `progress` / `result` events over Server-Sent Events (SSE) so the frontend can show live batch-by-batch progress instead of one long blocking request.
6. **Review & retry** — the frontend shows imported vs. skipped records in a modal, lets the user download the mapped CSV, and can retry only the rows that failed because of an AI/API error (not rows that were legitimately skipped, e.g. no email or phone).

## Tech stack

**Frontend:** Next.js (App Router, `"use client"`), TypeScript, Tailwind CSS, Framer Motion, `react-dropzone`, PapaParse, `lucide-react`.

**Backend:** Node.js, Express-style controller, Multer (in-memory file upload), PapaParse, Groq SDK (`llama-3.3-70b-versatile` by default).

## Project structure

```
frontend/
  app/.../CsvImporterPage.jsx   # Upload page, dropzone, dark mode toggle
  components/ImportModal.jsx   # Preview → importing → result modal, SSE consumer

backend/
  controllers/import.controller.js   # /api/import and /api/import/retry (SSE)
  services/csvParser.service.js      # CSV -> rows (no fixed headers assumed)
  services/aiExtractor.service.js    # Batches rows through Groq, retries failed batches
  services/validator.service.js      # Schema enforcement + skip reasons
```

## Target CRM schema

Every imported record is normalized to these fields:

`created_at, name, email, country_code, mobile_without_country_code, company, city, state, country, lead_owner, crm_status, crm_note, data_source, possession_time, description`

- `crm_status` ∈ `GOOD_LEAD_FOLLOW_UP | DID_NOT_CONNECT | BAD_LEAD | SALE_DONE`
- `data_source` ∈ `leads_on_demand | meridian_tower | eden_park | varah_swamy | sarjapur_plots`
- A record is **kept** only if it has an email or a mobile number; everything else is best-effort and left blank (`""`) rather than guessed.

## Setup

### Backend

```bash
cd backend
npm install
```

Create a `.env` file:

```
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile   # optional, this is the default
PORT=5000
```

Make sure your Express app wires up Multer for the upload route, e.g.:

```js
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/import", upload.single("file"), importCsv);
app.post("/api/import/retry", express.json(), retryImport);
```

Run it:

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
```

Create a `.env.local` file:

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Run it:

```bash
npm run dev
```

Open `http://localhost:3000`, drop a CSV, review the preview, click **Confirm import**, and watch the live batch progress. When it finishes you can toggle between Imported/Skipped, download the mapped CSV, or retry only the AI-failed batches.

## API

### `POST /api/import`

`multipart/form-data`, field name `file` (CSV). Streams SSE events:

- `meta` — `{ totalRows, totalBatches, batchSize }`
- `progress` — `{ stage: "start" | "done" | "failed", batchIndex, totalBatches, batchSize, error? }`
- `result` — `{ totalRows, totalImported, totalSkipped, imported, skipped }`
- `error` — `{ message }`

### `POST /api/import/retry`

`application/json`, body `{ rows: object[] }` — re-runs AI extraction + validation for a specific set of original rows (used to retry only AI-failed batches). Streams the same SSE event set.

## Notes / assumptions

- All AI mapping is deterministic (`temperature: 0`) and instructed never to fabricate values — fields it isn't confident about are left empty rather than guessed.
- A batch is only marked failed (and retryable) if the AI call itself errors or returns a mismatched record count — never for rows that are legitimately skipped (e.g. missing email/mobile).
- Dark mode preference is persisted in `localStorage` on the frontend.
