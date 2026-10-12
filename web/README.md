# CloutCall web

Next.js 16 app (App Router, Cache Components) using viem against Monad.

```bash
npm install
node scripts/gen-abi.mjs          # after `forge build` in ../contracts
node scripts/sync-env.mjs 10143   # writes .env.local from ../deployments/10143.json
npm run dev
```

See the root README for the full setup.
