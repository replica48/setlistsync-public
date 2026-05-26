# SetlistSync

A real-time band collaboration app for managing songs, setlists, and live performances. Self-host on your own Firebase project.

---

## What it does

SetlistSync keeps bands in sync — literally. A designated conductor controls song navigation during rehearsals and performances, and every member's screen updates in real time. Outside of live mode, the app serves as a shared song library and setlist manager.

**Core features:**
- **Live mode** — conductor-led setlist navigation with member ready-states and tempo alerts, synced across all devices in real time
- **Song library** — lyrics and chord editing with a rich text editor, chord diagrams, transposition, and PDF chord chart support
- **Setlist management** — multiple setlists per band, drag-to-reorder, break items
- **Band roles** — Leader / Member / Viewer permissions with invite links
- **Practice mode** — solo practice view for individual songs
- **Offline mode** — full band data cached locally for use without a connection
- **PDF import** — upload chord charts; OCR extracts lyrics/chords from PDFs automatically

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Material UI |
| Rich text | Lexical |
| Music theory | Tonal, @tombatossals/chords-db |
| PDF | react-pdf, Tesseract.js (OCR) |
| Database | Firebase Firestore |
| Auth | Firebase Auth |
| Storage | Firebase Cloud Storage |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Hosting | Firebase Hosting |
| CI/CD | GitHub Actions |

---

## Self-hosting

### Prerequisites

- Node.js 22+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project with Firestore, Auth, Storage, and Functions enabled

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project
2. Enable **Authentication** (Email/Password provider)
3. Enable **Firestore Database**
4. Enable **Cloud Storage**
5. Enable **Cloud Functions** (requires Blaze pay-as-you-go plan)
6. Register a **Web app** to get your SDK config values

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/setlistsync-public.git
cd setlistsync-public
npm install
cd functions && npm install && cd ..
```

### 3. Configure environment variables

Copy the example files and fill in your values:

```bash
cp .env.example .env
cp functions/.env.example functions/.env
```

Edit `.env` with your Firebase web SDK config (found in project settings → Your apps → Web app).

Edit `functions/.env` with a random secret for offline data signing:

```bash
# Generate a random secret:
openssl rand -hex 32
```

### 4. Set your Firebase project ID

Edit `.firebaserc` and replace `your-firebase-project-id` with your actual project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### 5. Deploy Firebase rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 6. Build and deploy

```bash
npm run build
firebase deploy
```

Your app will be live at `https://your-project-id.web.app`.

---

## Local development

Start the Firebase emulators and dev server in two terminals:

```bash
# Terminal 1
firebase emulators:start

# Terminal 2
npm run dev
```

To connect the app to local emulators, uncomment the emulator block near the top of `src/App.jsx`.

---

## GitHub Actions (optional CI/CD)

The workflow in `.github/workflows/deploy.yml` deploys automatically on push to `main`. Configure these GitHub secrets in your repository settings:

| Secret | Where to find it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase project settings → Your apps |
| `VITE_FIREBASE_AUTH_DOMAIN` | Same |
| `VITE_FIREBASE_PROJECT_ID` | Same |
| `VITE_FIREBASE_STORAGE_BUCKET` | Same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Same |
| `VITE_FIREBASE_APP_ID` | Same |
| `VITE_FIREBASE_MEASUREMENT_ID` | Same |
| `CRYPTO_SECRET` | The random string you generated above |
| `GCP_SA_KEY` | Firebase project settings → Service accounts → Generate new private key |

---

## Firebase setup notes

- **Firestore rules** (`firestore.rules`) — role-based access control enforced at the database level
- **Storage rules** (`storage.rules`) — only band editors can upload; 50 MB file size limit per file
- **Cloud Functions** handle role sync, leadership succession, storage tracking, and offline data signing
- **Custom auth tokens** carry band-role claims used by Firestore and Storage rules; call `getScopedAuthToken` when switching bands

---

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) — personal and non-commercial use only.
