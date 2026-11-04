async function measureLiveSite() {
  console.log("=== STEP 1b: MEASURING LIVE SITE (https://nipoportal.vercel.app) ===");

  const urls = [
    "https://nipoportal.vercel.app/",
    "https://nipoportal.vercel.app/login",
    "https://nipoportal.vercel.app/login/admin",
    "https://nipoportal.vercel.app/login/teacher",
    "https://nipoportal.vercel.app/login/parent",
    "https://nipoportal.vercel.app/api/health",
  ];

  for (const url of urls) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { redirect: "manual" });
      const t1 = performance.now();
      const serverTiming = res.headers.get("server-timing") || "none";
      const xVercelCache = res.headers.get("x-vercel-cache") || "none";
      console.log(`${url.padEnd(46)} -> HTTP ${res.status} | Total: ${Math.round(t1 - t0)}ms | Cache: ${xVercelCache}`);
    } catch (e: any) {
      console.log(`${url.padEnd(46)} -> ERROR: ${e.message}`);
    }
  }
}

measureLiveSite().catch(console.error);

