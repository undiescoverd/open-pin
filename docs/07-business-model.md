# 07 — Hosting and payment options

How Waypost could add online storage for published guides, how FramePin does it, and the ways Waypost could charge. Nothing here is decided yet: it feeds Phase 6 (Sharing) and the open questions on selling in [04-roadmap.md](04-roadmap.md).

**Status:** options and a recommendation. Prices and provider fees haven't been checked; look them up before setting a price.

## Where Waypost is today

- Projects live in the browser's private storage (OPFS) with a small IndexedDB list. Nothing is uploaded; `.waypost` files are the backup ([02-architecture.md](02-architecture.md#storage)).
- Share exports a static folder or zip (`packages/export/src/bundle.ts`) that the person uploads to any static host.
- Phase 6 plans **Publish online**: connect a host once, then one click gives a link and an embed code. The first host is an open question.

External storage such as Cloudflare R2 answers that question. It's a place for published guides, not for projects.

## Storage options

### A. The person's own R2 bucket (no accounts)

- The person pastes an account ID, an access key and secret, and a bucket name into settings. They're kept in IndexedDB.
- On publish, the editor uploads the same files the bundle already builds, through R2's S3 API (a small signing helper such as `aws4fetch`). Upload becomes a third destination next to `zipBundle` and `writeBundle`.
- The bucket needs a CORS rule and a public URL (`r2.dev` or a custom domain). Guides are embedded cross-origin and segments need byte-range requests, which R2 serves.
- Each file gets the right `Content-Type` and `Cache-Control`. Republishing writes to the same key prefix, so the link stays; leftover step files are deleted.
- **For:** keeps "no server, buy once", and costs us nothing to run.
- **Against:** setting up a bucket, a scoped token and CORS is hard for a non-technical person, and the secret lives in the browser (acceptable only because it's their own token, limited to one bucket).
- **Size:** a few days of code, plus a guided setup with a pre-filled CORS rule and a "Test connection" button.

### B. We host on our own R2 (accounts, or close to it)

- The editor asks a small Cloudflare Worker for presigned upload URLs and uploads straight to R2. This is the true one-click experience Phase 6 asks for.
- The Worker needs an identity. The licence key can be it: the key proves a purchase, and the Worker issues a per-guide secret so republishing keeps the same link. Real accounts are only needed for managing guides across devices or recovering them.
- **The real work is around the code:** quotas, abuse and takedowns (we'd host other people's recordings), deletion and privacy obligations, and running costs. R2 has no egress fees, but storage and requests still cost money, which sits badly with a one-off price. It also ends the "no server" claim.
- **Size:** about two weeks, closer to a month with the first version of the backend.

### C. Syncing projects to the cloud

Not recommended. Projects hold the full source video, so uploads are huge; it needs accounts, conflict handling and multi-device logic, and it breaks the privacy promise. `.waypost` files already cover backup and moving between computers.

## How FramePin does it

From [01-feature-analysis.md](01-feature-analysis.md); the hosting details are inferred from FramePin's public copy.

- Editing runs locally in Chrome.
- Publishing uploads only the generated step media, not the recording. FramePin hosts it and serves the guide, the standalone link and the two-line embed.
- Building and previewing are free without an account, as are MP4, PDF and screenshot exports.
- A 14-day trial unlocks publishing. The paid Creator and Pro plans limit live guides and monthly publishing, and only Pro has per-step analytics. Paid plans also host a compressed PDF and the step images at fixed links.

In effect people pay for hosting, embedding and analytics, which is why FramePin needs accounts and a backend.

### Should Waypost copy it?

Not at the start. Copy the product, not the payment and backend structure:

- A hosted subscription only works if recurring revenue covers recurring costs (storage, bandwidth, support, abuse). A one-off price can't carry costs that keep growing.
- Hosting means accounts, billing, plan limits, takedowns and privacy obligations: a second business beside the editor.
- Waypost's pitch is "buy once, no subscription, nothing leaves your browser". Hosting by default undercuts it.
- Copying the hosted model means competing on price with a product that's already there.

## Payment structures

| Model | How it works | Fit for Waypost |
|---|---|---|
| **One-off purchase** (current plan) | Pay once, keep the app, usually with a licence key. | Matches the pitch, no backend. Income stops after the sale, so it needs a steady flow of new buyers. |
| **One-off plus paid upgrades** | Version 1 is bought once; major versions cost a discounted upgrade. | Keeps "buy once" and brings income when big features ship. Common for desktop tools. |
| **One-off plus a year of updates** | Keep the app forever, with updates for 12 months; a smaller renewal buys more. | A good balance. Nobody is locked out, and people who value updates keep funding them. |
| **Subscription** | A monthly or yearly fee to keep using it. | Predictable, but it's what Waypost positions against. Only makes sense if it includes hosting. |
| **Freemium** | A free tier (watermarked exports, a cap on steps or projects) and a paid unlock. | Builds an audience without sales. Support and upkeep for the free tier come from people who don't pay. |
| **Free trial** | Everything for 7 to 14 days, then it locks. | Simple to explain. In a browser app it relies on the online licence check. |
| **Usage-based** | Pay per export, per published guide or per GB hosted. | Only fits the hosted option; offline editing can't be metered well. |
| **Hosting add-on** | Editor bought once; optional paid hosting for people who don't want their own bucket. | Recurring income without making the editor a subscription. |
| **Tiers** | Solo, Team or Agency prices, by seats or commercial use. | Worth adding once there are users; teams and agencies pay more for the same app. |
| **Lifetime deal / early-bird** | A discounted one-off price for early buyers, often capped. | Good for the first months, for cash and feedback. Decide up front what "lifetime" covers. |
| **Pay what you want / sponsorship** | A suggested price, or GitHub Sponsors. | Only suits an open-source project, which conflicts with going private. |

## Recommendation

1. **Launch** as a one-off purchase with a year of updates, plus an early-bird lifetime price for the first buyers.
2. **Licences** from Lemon Squeezy or Paddle: they issue and check keys, handle VAT and host the checkout. The "year of updates" is an update-expiry date on the key. The key is checked online once and cached, so the editor works offline.
3. **Phase 6 publishing** with the person's own storage (option A): R2 first, behind a generic upload destination so S3 and Cloudflare Pages direct upload can follow. Put the effort into a painless setup.
4. **Later, only if people ask:** the optional hosting add-on (option B, with the licence key as identity) and a team tier.
5. **Avoid:** a pure subscription for the editor, and usage-based pricing.

## Still to decide

- The price, and whether there's a free trial, a free tier with a watermark, or neither.
- What a locked or expired copy can still do (for example, edit and preview but not export).
- Whether the repository goes private (open question 5 in the roadmap).
- Whether Waypost should ever run a hosting business. If not, step 4 is dropped for good.
