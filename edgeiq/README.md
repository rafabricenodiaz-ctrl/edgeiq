# ⚡ EDGEIQ — Sports Intelligence Platform

AI-powered betting picks & fantasy props for NBA, NFL, EPL, La Liga, MLS, Liga MX.
Built for South Carolina — DraftKings, FanDuel, BetMGM, Caesars, ESPN Bet, PrizePicks, Underdog all supported.

---

## 🚀 Deploy in 5 Minutes (Free)

### Step 1 — Get your Anthropic API Key
1. Go to https://console.anthropic.com
2. Sign up / log in
3. Click **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`)

---

### Step 2 — Put the project on GitHub
1. Go to https://github.com and sign up free
2. Click **New Repository** → name it `edgeiq` → Create
3. Upload all these project files to the repo
   - Easiest way: drag & drop the entire folder into the GitHub web interface

---

### Step 3 — Deploy to Vercel (free hosting)
1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New Project**
3. Select your `edgeiq` GitHub repo
4. Vercel auto-detects it as a Vite project — no changes needed
5. **Before clicking Deploy**, click **Environment Variables** and add:
   - Key: `VITE_ANTHROPIC_API_KEY`
   - Value: your API key from Step 1
6. Click **Deploy** — done in ~60 seconds!
7. Vercel gives you a live URL like `https://edgeiq.vercel.app`

---

## 📱 Install on iPhone (Home Screen App)

1. Open your Vercel URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share button** (box with arrow at bottom)
3. Scroll down → tap **"Add to Home Screen"**
4. Name it **EDGEIQ** → tap **Add**
5. The app icon appears on your home screen — opens fullscreen like a native app!

---

## 💻 Install on Desktop (Windows/Mac)

1. Open your Vercel URL in **Chrome** or **Edge**
2. Look for the **install icon** in the address bar (computer with down arrow)
3. Click it → **Install**
4. EDGEIQ opens in its own window with no browser chrome

If you don't see the install icon:
- Chrome: Menu (⋮) → **Cast, save, and share** → **Install page as app**
- Edge: Menu (…) → **Apps** → **Install this site as an app**

---

## 🛠 Run Locally (optional)

If you want to run it on your own computer first:

```bash
# Install Node.js from https://nodejs.org (LTS version)

# Then in your terminal:
cd edgeiq
npm install
cp .env.example .env.local
# Edit .env.local and paste your API key

npm run dev
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
edgeiq/
├── src/
│   ├── App.jsx          ← Main app (all screens & AI logic)
│   └── main.jsx         ← React entry point
├── public/
│   ├── icons/           ← App icons (home screen)
│   ├── apple-touch-icon.png
│   └── favicon.ico
├── index.html           ← HTML shell
├── vite.config.js       ← Build config + PWA setup
├── vercel.json          ← Vercel routing config
├── package.json         ← Dependencies
└── .env.example         ← API key template
```

---

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | Your Anthropic API key (required) |

---

## ⚖️ Legal Note

You are located in **South Carolina**. The following are legal there:
- **Sportsbooks**: DraftKings, FanDuel, BetMGM, Caesars, ESPN Bet
- **Fantasy/Props**: PrizePicks, Underdog Fantasy, Sleeper, Yahoo DFS

Must be 21+ for sportsbooks, 18+ for fantasy. Please gamble responsibly.
