# Geek Typing — English Typing Practice

**Official site:** https://geek-typing.digdevbox.com  
**Repository:** https://github.com/yqh-core/geek-typing  
**Portfolio status:** FROZEN — critical security, availability and compatibility maintenance only. No feature expansion or market investment without an explicit portfolio decision.

Geek Typing is a browser-based typing and vocabulary practice app. It combines typing feedback, vocabulary study, review scheduling, progress summaries and offline-ready use. Existing Chinese exam-oriented vocabulary and bilingual content are legacy datasets, not a current localization roadmap.

## Product boundaries

- The current app is designed for individual browser-based practice; it does not provide account-based synchronization, social ranking or cloud backup.
- Learning progress is stored in browser storage; verify the current implementation before making data-retention or privacy claims.
- Preserve existing offline/PWA behavior and avoid adding telemetry or third-party requests without explicit review.
- New features, vocabulary expansion, SEO expansion and redesign are out of scope while FROZEN.

## Local development

A committed `package-lock.json` is present. Use the lockfile and npm:

```bash
npm ci
npm run dev
```

## Key checks

Commands below are present in the current `package.json`; select the checks relevant to the change:

```bash
npm run build
npm run lint
npm run test:e2e
npm run test:offline
npm run test:learning
npm run test:i18n
npm run content:validate
npm run gate:license
npm run verify:readme-facts
npm run release:gate
```

Do not assume this list is exhaustive. Use `npm run` and `package.json` as the source of truth. Production smoke tests and commands ending in `:prod` may contact the live site; run them only when the task and authorization justify it.

## Content licensing — important

Code and vocabulary/content assets do not all share the same license. Inspect each content package's `manifest.json` and `sources[].license` before copying or redistributing it. Some vocabulary datasets require attribution; some non-vocabulary learning materials are marked proprietary and non-redistributable. Run `npm run gate:license` before content-related release work.

## Screenshots and audit material

Existing UI screenshots and the detailed product audit package are under `docs/audit-package/`. Start with `docs/audit-package/README.md` when a task needs deeper product, accessibility, learning-model, content, security or acceptance context.

## Portfolio relationships

- [DigDevBox](https://digdevbox.com) — main developer-tools site.
- [Forge Notes](https://notes.digdevbox.com) — technical notes and supporting content.
- [Geek Typing](https://geek-typing.digdevbox.com) — this frozen legacy product.

Do not add cross-promotion or new acquisition work while the product remains frozen.

## Maintainer checklist

- [ ] Confirm the change is a critical maintenance fix, not feature expansion.
- [ ] Check existing issue/PR and current branch before editing.
- [ ] Preserve offline behavior, local progress and content-license boundaries.
- [ ] Run relevant unit/content/offline/browser checks and record exact results.
- [ ] Verify the production domain only with authorized, current evidence.
- [ ] Update this README and the control-repository execution record when operational facts change.

Historical audit and test evidence does not prove the current production build is verified.