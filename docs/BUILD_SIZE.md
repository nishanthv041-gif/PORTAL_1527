# AWS Amplify Build Output Size Budget & Architecture

> **Hard Limit:** 230,686,720 bytes (220.00 MiB)  
> **Warning Threshold:** 199,229,440 bytes (190.00 MiB)  
> **Failure Threshold:** 214,958,080 bytes (205.00 MiB)  
> **Current Packaged Size:** ~30.03 MB (31,484,787 bytes)  
> **Available Headroom:** **~189.97 MB (86.35% Headroom)**  
> **Verification Guard:** `scripts/check-build-size.mjs`

---

## 1. Background

AWS Amplify Hosting enforces a strict 220 MiB ceiling (`230,686,720 bytes`) on the build artifact bundle packaged under `artifacts.baseDirectory: .next`.
If the packaged files exceed this limit, Amplify halts deployment with:
```text
CustomerError: The size of the build output (232099862) exceeds the max allowed size of 230686720 bytes.
```

---

## 2. Architecture of the Fix

### A. Preserving Build Cache without Bloating Artifacts
- **The Problem:** Next.js Turbopack generates between 135 MB and 450 MB of RocksDB cache files in `.next/cache`. If packaged into `.next`, this alone pushes the deployment over the limit.
- **The Solution:** In [`amplify.yml`](../amplify.yml):
  1. `preBuild`: Restores cache from `.amplify-cache/cache` into `.next/cache` if available.
  2. `build`: Executes `npm run build` with fast incremental caching.
  3. `postBuild`: Moves `.next/cache` into `.amplify-cache/cache` before Amplify packages `.next`.
  4. `cache.paths`: Caches `.amplify-cache/**/*` and `node_modules/**/*`.

### B. Stripping Server Source Maps
- Next.js 16 compiles server chunks with `.map` files (totalling ~62 MB).
- In [`next.config.ts`](../next.config.ts) and `amplify.yml`, all `*.map` files in `.next/server` are excluded from the runtime deployment package.

### C. Slimming Prisma Runtime Query Engines
- In [`prisma/schema.prisma`](../prisma/schema.prisma), `binaryTargets` is optimized to:
  ```prisma
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
  ```
- AWS Amplify Hosting runs Amazon Linux 2023 (`rhel-openssl-3.0.x`), while local dev uses `native`. Unused binaries for Debian, Alpine musl, and RHEL 1.0.x (saving ~50 MB) are omitted.

### D. Asset Deduplication
- Identical duplicates in `public/` (e.g. redundant logo copies, uncompressed traineddata) were eliminated.

---

## 3. Mandatory Rules for Contributors

1. **No Heavy Libraries in Shared Modules:**
   - Never import `xlsx`, `pdfkit`, `tesseract.js`, or `@google/generative-ai` at the top level of shared modules (`backend/auth/authOptions.ts`, `backend/db/prisma.ts`, `lib/time.ts`).
   - Use dynamic imports (`await import('xlsx')`) inside specific action handlers or API route endpoints.

2. **Compress Images & Media:**
   - Any new image placed in `public/` must be optimized (WebP / AVIF preferred).
   - Never commit raw uncompressed camera photos or heavy datasets to `public/`.
   - Never commit duplicate versions of logos or fonts.

3. **Check Build Size Locally Before Pushing:**
   - Run `npm run build && node scripts/check-build-size.mjs`.
   - If the packaged size exceeds 190 MB, review your imports and dependencies before submitting.

