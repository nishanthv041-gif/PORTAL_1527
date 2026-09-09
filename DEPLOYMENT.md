# Vercel Deployment & Rollback Guide

## Incident Response & Rollback Process
If a bad deployment is pushed to production, you can instantly rollback to the previous stable version using the Vercel Dashboard:
1. Go to the **Vercel Dashboard** and select this project.
2. Click on the **Deployments** tab.
3. Find the previous successful deployment in the list.
4. Click the **three dots (⋮)** menu on that deployment and select **Promote to Production** (or **Assign Custom Domains**).
5. Confirm the action. This performs an instant, zero-downtime rollback without requiring a new build.

Once the immediate incident is mitigated, investigate the issue in a local environment or preview branch before pushing a fix.

## Production Checklist Items
For settings configured in the Vercel Dashboard (not in code):
* **Deployment Protection**: Recommend enabling password or SSO protection for Preview deployments.
* **Firewall / WAF**: Enable basic bot-blocking rules if on a Pro plan.
* **Fluid Compute**: Toggle this ON in Project Settings to reduce cold starts.
* **Spend Management**: Set sensible alert thresholds (e.g., $10 or $20 depending on your plan limit) to avoid surprise bills.
* **Regions**: Ensure the Serverless Function Region in Vercel matches your database hosting region to minimize latency.
