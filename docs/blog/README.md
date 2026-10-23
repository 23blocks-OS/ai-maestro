# Blog

The blog is static HTML under `docs/blog/`, published with the rest of the site (`docs/`, GitHub Pages, `.nojekyll`).

## Adding a post

1. Copy `human-agent-interaction.html` to `docs/blog/<slug>.html`. The head (title, description, canonical and Open Graph URLs, the `Article` schema with `headline` and `datePublished`) and the `<article>` body are the parts to change; the nav, footer and styles stay.
2. Add a card for it at the top of `docs/blog/index.html`.
3. Add an `<entry>` at the top of `docs/blog/feed.xml` and move `<updated>` forward.
4. Add the URL to `docs/sitemap.xml` and a line to `docs/ai-index.html`.
5. Add a `CHANGELOG.md` entry (every PR to main carries a version bump: `./scripts/bump-version.sh patch`).

Write what you know and say how sure you are. Link primary sources, say which you read and which you only saw as a snippet, and keep claims about our own product to what we have measured. The first post is the model.
