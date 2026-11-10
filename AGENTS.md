<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Git & AWS Deployment Automation Rule

- **Always automatically push all changes to Git**: Whenever any files or code modifications are made, tested, or completed, the assistant MUST automatically stage all changes (`git add .`), create a clear commit (`git commit -m "..."`), and immediately push to remote (`git push origin main`).
- **Automatic AWS Deployment**: Pushing to `origin main` automatically triggers the AWS Amplify production build and deployment pipeline (`https://main.d3bt7u4517jg0f.amplifyapp.com`) and GitHub Actions CI/CD workflows.
- Never leave changes uncommitted or unpushed at the end of any turn or task.

