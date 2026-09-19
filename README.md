# Site Sage

## Local development

```bash
npm start
```

Open the URL printed by the server. If port `3000` is busy, the server chooses the next available port.

## GitHub Pages deployment

The repository includes a GitHub Actions workflow that publishes the `public` interface. In GitHub, open **Settings > Pages > Build and deployment**, set **Source** to **GitHub Actions**, then push to `main` or run the workflow manually from the **Actions** tab.

GitHub Pages cannot run the Node API in `server.js`. To make the deployed interface fully functional:

1. Deploy `server.js` to a Node host such as Render, Railway, or Fly.io.
2. In `public/index.html`, set `window.SITE_SAGE_API_URL` to that service URL.
3. Configure the deployed API with `OPENAI_API_KEY` if AI-generated answers are required.
4. Push the change and wait for GitHub Pages to rebuild.

The frontend uses relative asset paths, so it works correctly at repository URLs such as `/gen/`.# gen