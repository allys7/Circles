# Project guidance

## Documentation responsibilities

Keep `README.md` short and welcoming: explain what Circles does, show the app, and link here. Put setup instructions, implementation details, event rules, verification, and deployment guidance in this file. Update these notes when the corresponding behavior changes.

## Project and architecture

Circles is a React + TypeScript single-page app built with Vite. Luxon handles event time zones. The published app is entirely static: no server, accounts, database, runtime configuration, or browser local storage. Node and pnpm are development/build tools; visitors only need a browser with JavaScript enabled.

Source map:

- `src/App.tsx`: validates and sorts events, renders countdowns, and refreshes the clock every second and on focus/visibility changes.
- `src/events.json`: the persisted list of configured events.
- `src/events.ts`: event types, validation, time-zone conversion, date formatting, and countdown arithmetic.
- `src/theme.css`: shared color and font custom properties.
- `src/styles.css`: document defaults and responsive countdown styles.
- `src/EventEditor.tsx` and `src/editor.css`: development-only event editor.
- `scripts/event-editor.ts`: Vite development middleware that writes the event file.
- `vite.config.ts`: validates event data, configures React and the event editor, and sets relative asset URLs.
- `tests/countdown.test.ts`: countdown, date, validation, and daylight-saving behavior.
- `tests/event-editor.test.ts`: event persistence and rejection of foreign or invalid writes.
- `.github/workflows/verify.yml`: read-only test and build checks for pull requests to `main`.
- `.github/workflows/deploy.yml`: test, build, and GitHub Pages deployment.
- `.github/screenshot.png`: actual app screenshot embedded in the README.
- `public/favicon.svg`: the white smiley on an amber background used in browser tabs.
- `public/sharing-card.png`: the 1200 × 630 PNG artwork for shared links.

Keep generated `dist/` and `node_modules/` out of source control; both are ignored. Edit source files rather than generated assets.

## Styling

Document styles provide a shared fade duration for focus, validation, tooltip feedback, and the editor dialog and backdrop on open. Keyboard focus outlines sit flush with the control. The fade duration is zero when the visitor prefers reduced motion.

Use plain CSS with one declaration per line. Keep layout, responsive rules, and interaction states in the stylesheet for the UI they style. Put shared colors and font choices in `src/theme.css` and keep editor-only theme values at the top of `src/editor.css` so they ship only in development.

For a theme variant, override the relevant custom properties on the element that owns the themed UI. For example, a class on an event article can override `--color-muted` for the event date and status text. Override page background and inherited text color on the document root for a page-wide theme.

## Toolchain and local development

Use Node.js 24+ and pnpm 11.25.0, as specified in `package.json`. If needed, install pnpm with `npm install -g pnpm@11.25.0`.

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. The development and preview servers bind to `127.0.0.1` by default.

The **Edit events** button exists only in development. Add, edit, or remove events, then choose **Save events** to write `src/events.json` and reload the page. Choose **Cancel** beside **Save events** to discard unsaved edits. You can also edit that JSON file directly. Save operations change the real source file; commit and push it to publish event changes. The deployed page cannot write to a GitHub repository.

## Event data contract

`src/events.json` must contain an array of at most 100 events. An empty array displays the empty state.

```json
[
  {
    "id": "wedding",
    "name": "Our wedding",
    "date": "2027-06-06",
    "timeZone": "America/Chicago"
  },
  {
    "id": "ceremony",
    "name": "The ceremony",
    "date": "2027-06-06",
    "time": "15:30",
    "timeZone": "America/Chicago"
  }
]
```

This is a format example. See `src/events.json` for the configured events.

- `id`: required nonempty string, unique after trimming.
- `name`: required string, 1 to 120 characters after trimming. The editor highlights blank names, including whitespace-only values.
- `date`: required valid calendar date in `YYYY-MM-DD` format.
- `time`: optional 24-hour `HH:mm` string. Omit it for midnight at the **start** of the event date. In the editor, a blank time is saved by omitting this field. Hover over or focus **optional** for the midnight reminder.
- `timeZone`: required valid IANA time zone. The editor dropdown lists the browser's supported time zones and `UTC`, keeps an existing event's zone selectable, and defaults new events to `America/Chicago`.

Validation normalizes IDs and names by trimming them and retains only the supported fields. The same validation runs in the app, editor save endpoint, and Vite configuration; invalid hand-edited data prevents startup/build.

## Time-zone and countdown behavior

Enter each event in its own time zone, including daylight saving time. Visitors see the equivalent date in their own local zone. When the displayed date or time differs, Circles labels it **Local** and shows the original value and IANA zone on a smaller **Event** line. The page displays the time only when the event defines one, including an explicit `00:00`. Every visitor counts down to the same instant. For example, a date-only June 6 event in Chicago displays June 5 in Los Angeles, with June 6 and `America/Chicago` on the Event line. It reaches zero at 10 PM in Los Angeles. Display formatting uses the `en-US` locale.

Nonexistent spring clock-change times are rejected. Repeated autumn times consistently use the first occurrence. Preserve these rules when changing date logic; avoid relying on the visitor's local time zone to interpret event input.

Events are sorted by target instant. Countdowns use 24-hour days and round remaining seconds up so zero means the event has actually arrived. At the target, every timer switches to **Time since** and counts completed seconds from zero using the same 24-hour days. Both modes follow the current clock, including when it moves backward.

## Event editor boundary

Keep editing confined to development. `App.tsx` lazy-loads the editor behind `import.meta.env.DEV`; Vite removes it from production. The event editor plugin uses `apply: 'serve'` and `configureServer`, so the save endpoint is absent from the production build and preview server.

`PUT /__local/events` requires all of the following:

- A loopback peer address and a local host header (`127.0.0.1`, `localhost`, or `[::1]`, with an optional port).
- An `Origin` matching `http://` plus the host header.
- `X-Local-Editor: 1` and `Content-Type: application/json`.
- A body no larger than 65,536 bytes containing valid event data.

The endpoint writes normalized, indented JSON with a trailing newline and invalidates Vite's cached event module before the editor reloads. Do not weaken these checks or add a production write API for routine event editing.

## Verification and production preview

The **Verify pull request** workflow checks pull requests targeting `main`. Reproduce its install, test, and build steps with the declared Node and pnpm versions, then use `pnpm preview` to inspect the build locally.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm preview
```

`pnpm test` uses Node's test runner for countdowns, dates, event validation, and editor save requests. `pnpm build` runs `tsc --noEmit`, validates the event file through Vite configuration, and generates `dist/`.

Run the Chromium browser suite after changes to the public UI, editor, or production build behavior:

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

The browser tests start their own loopback servers, copy the app into disposable workspaces, and leave the configured event list untouched. They cover the countdown and editor flows, plus production preview and static serving under a repository path.

For code or event-data changes, run the existing tests and build. Inspect the production preview for relevant visual changes and confirm that it has no **Edit events** button. Check the mobile layout when changing page styles. For documentation-only changes, check links, examples, and screenshot rendering; additional automated tests are unnecessary.

Refresh `.github/screenshot.png` from a running production preview when the public appearance changes. Capture the actual page without editor controls or browser chrome, inspect the saved image, and keep the README's relative image link working. Countdown values naturally reflect the capture time.

## GitHub Pages deployment

1. Push the project to a GitHub repository's `main` branch, including `pnpm-lock.yaml`.
2. In **Settings > Pages > Build and deployment**, choose **GitHub Actions** as the source.
3. The included workflow installs dependencies with `pnpm install --frozen-lockfile`, runs tests, builds, uploads `dist/`, and deploys to Pages. It runs on pushes to `main` and can also be started manually from Actions. Update the branch filter if the repository uses a different default branch.

Vite's `base: './'` generates relative asset URLs, supporting both repository paths such as `https://username.github.io/repository/` and root/custom domains without hard-coding a repository name. No client-side router is used. GitHub Pages serves only `dist/`.

### Sharing previews

`index.html` holds the sharing metadata. Once the current GitHub Pages URL is confirmed live, add the absolute page URL as `og:url` and the canonical link. Use the absolute URL for `sharing-card.png` in `og:image` and `twitter:image`, and set `twitter:card` to `summary_large_image`. Set the Open Graph image type to `image/png`, width to `1200`, and height to `630`. Use “Circles and its tagline beside a smiling purple circle” for the image alt text. After deploying, verify that the HTML contains those tags and that the image URL serves `image/png`.

### Verify a hosted release

1. Confirm GitHub Actions is the Pages source in repository settings. Find the run for the intended release commit and check that tests, build, artifact upload, and deployment succeeded. Open the HTTPS URL reported by that run's `github-pages` environment.
2. Verify the configured events, chronological ordering, local dates and times, ticking countdowns, and absence of **Edit events**. Reload at the deployed path, check the browser console and network panel for errors, and inspect desktop and narrow mobile layouts. Repeat the smoke check in a second browser or on another device when practical.
3. Check the README screenshot and the page's JavaScript-disabled message. Use local production verification for any write-endpoint checks.
4. Record the deployment URL, commit SHA, workflow run, browsers checked, and any outstanding issues. If the intended commit has no successful deployment, identify the pending or failed step before reporting the release status.
