# 🔐 API Key Rotation Checklist

> **URGENT** — Real API keys were committed to git history in `backend/.env.example`
> (commit `efa7f6c`). Treat all keys below as **compromised**. Rotate them immediately.

---

## Status Overview

| # | Service | Variable | Status |
|---|---------|----------|--------|
| 1 | Moralis | `MORALIS_API_KEY` | ⬜ Not rotated |
| 2 | Helius | `HELIUS_API_KEY` | ⬜ Not rotated |
| 3 | CoinGecko | `COINGECKO_API_KEY` | ⬜ Not rotated |
| 4 | OpenAI | `OPENAI_API_KEY` | ⬜ Not rotated |

---

## Key-by-Key Rotation Steps

### 1. Moralis API Key
- **Variable:** `MORALIS_API_KEY`
- **Exposed key prefix:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT token)
- **Rotate at:** https://admin.moralis.io/ → Settings → API Keys
- **Steps:**
  - [ ] Log in to https://admin.moralis.io/
  - [ ] Navigate to **Settings → API Keys**
  - [ ] Revoke / regenerate the current key
  - [ ] Copy the new key into `backend/.env` under `MORALIS_API_KEY`
  - [ ] Confirm the app still works with the new key

---

### 2. Helius API Key
- **Variable:** `HELIUS_API_KEY`
- **Exposed key prefix:** `af12b5b6-90a7-...` (UUID format)
- **Rotate at:** https://dev.helius.xyz/ → Dashboard → API Keys
- **Steps:**
  - [ ] Log in to https://dev.helius.xyz/
  - [ ] Navigate to the **API Keys** section of your dashboard
  - [ ] Delete the old key and create a new one
  - [ ] Copy the new key into `backend/.env` under `HELIUS_API_KEY`
  - [ ] Confirm Solana balance fetching still works

---

### 3. CoinGecko API Key
- **Variable:** `COINGECKO_API_KEY`
- **Exposed key prefix:** `CG-mBkezhh6...`
- **Rotate at:** https://www.coingecko.com/en/api/pricing → My API Keys
- **Steps:**
  - [ ] Log in to https://www.coingecko.com/
  - [ ] Go to **Developer Dashboard → API Keys**
  - [ ] Delete the old Pro key and generate a new one
  - [ ] Copy the new key into `backend/.env` under `COINGECKO_API_KEY`
  - [ ] Confirm price data is still fetching correctly

---

### 4. OpenAI API Key
- **Variable:** `OPENAI_API_KEY`
- **Exposed key prefix:** `sk-proj-R4jo12JL...` ⚠️ **Highest risk — billable usage possible**
- **Rotate at:** https://platform.openai.com/api-keys
- **Steps:**
  - [ ] Log in to https://platform.openai.com/
  - [ ] Go to **API Keys** section
  - [ ] Click **Revoke** on the exposed key immediately
  - [ ] Check **Usage** tab for any unexpected charges from unauthorized use
  - [ ] Create a new key and copy it into `backend/.env` under `OPENAI_API_KEY`
  - [ ] Consider setting a **usage limit** to cap unexpected spend
  - [ ] Confirm the AI Advisor feature still works

---

## Git History Cleanup (Required)

The keys are still visible in git history even though the files are now fixed.
You must purge them from history if this repo is or will be public.

### Option A — BFG Repo Cleaner (Recommended, faster)
```bash
# 1. Download BFG: https://rtyley.github.io/bfg-repo-cleaner/
# 2. Create a file listing strings to replace
echo "MORALIS_API_KEY_VALUE" > secrets.txt
echo "HELIUS_API_KEY_VALUE" >> secrets.txt
echo "COINGECKO_API_KEY_VALUE" >> secrets.txt
echo "OPENAI_API_KEY_VALUE" >> secrets.txt

# 3. Run BFG to replace all secrets in history
java -jar bfg.jar --replace-text secrets.txt

# 4. Clean up and force-push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

### Option B — git filter-repo (Modern alternative)
```bash
pip install git-filter-repo
git filter-repo --sensitive-data-removal
# Follow prompts to remove specific strings
```

- [ ] Purge secrets from git history (Option A or B above)
- [ ] Force-push the cleaned history to remote
- [ ] Notify any collaborators to re-clone the repository

---

## Files Fixed in This Session

| File | Change Made |
|------|-------------|
| `backend/.env.example` | All real key values replaced with empty placeholders |
| `.gitignore` | Already correctly ignores `.env` (no change needed) |
| `rotate_keys_checklist.md` | This file — tracks rotation progress |

---

## Notes

- `ADVISOR_MODEL=gpt-4o-mini` is **not a secret** — it's a config value and was left as-is in `.env.example`
- `backend/.env` itself was **never committed to git** (confirmed via `git ls-files`) — only `.env.example` was the problem
- After rotating all keys, update `backend/.env` with the new values and **never copy real keys into `.env.example`**
