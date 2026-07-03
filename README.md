# Google Drive Sync — Fork Changelog

This fork of [stravo1/obsidian-gdrive-sync](https://github.com/stravo1/obsidian-gdrive-sync)
uses this README as a running log of the commits made here, newest first. Each
entry says **what** the commit changed and **why**.

> Build note: the compiled `main.js` is gitignored. Build it with
> `node esbuild.config.mjs production`, then place `main.js` next to
> `manifest.json` in the plugin folder. (`npm run build` currently fails on two
> pre-existing TypeScript errors in the upstream code — the `short-unique-id`
> import and `Workspace.activeEditor` — which are unrelated to these commits;
> the esbuild command above skips that type-check gate.)

---

## `62a90a2` — fix: stop refresh loop from starving file I/O and mass-deleting notes

**Symptom.** With the plugin enabled, opening a note would hang for several
seconds, and it got worse the longer Obsidian stayed open. It felt like the
plugin was blocking the app.

**What was actually happening.** Profiling (a temporary main-thread stall
detector plus timers around the sync functions) showed the UI thread was *never*
blocked — so it was not a CPU / "frozen app" problem. It was **file-I/O
starvation**: the editor's own read to display the note you clicked was queued
behind a large, ever-growing backlog of file reads issued by the plugin. As
evidence, writing the ~1 KB `data.json` settings file (`saveData`) was measured
taking **over 7 minutes** late in a session — a proxy for how badly the file-I/O
queue was backed up.

**Root cause.** The reconciliation step inside `refreshAll` (which runs every
`refreshTime`, default **every 5 seconds**) is meant to delete local files that
were removed from Google Drive. For every file **not** present in `cloudFiles`
it did a full `vault.read()`, and it fired them all off at once with a
fire-and-forget `.map(async ...)`. When `cloudFiles` is empty or only partially
populated — a fresh or failed initialization, or (in testing) a manually cleared
Drive vault — this reads a huge portion of the vault **on every tick**. Because
each burst takes longer than the 5 s interval to finish and the loop was never
awaited, `alreadyRefreshing` was already reset before the next tick, so new
bursts stacked on top of unfinished ones and the I/O queue grew without bound.

**Bonus hazard fixed.** That same loop is also a data-loss risk: with an empty
`cloudFiles` it would `vault.trash()` every local note that carries the sync
frontmatter — i.e. it could wipe the whole local vault.

**What changed (`main.ts` only):**

1. **Skip the reconcile/trash loop when `cloudFiles` is empty.** An empty cloud
   list is now treated as an error/uninitialized state rather than an
   instruction to delete every local note. This removes both the I/O storm *and*
   the mass-delete hazard. (Tradeoff: intentionally emptying Drive no longer
   propagates as "delete all local notes".)
2. **Make the loop sequential and awaited** (`for...of` instead of
   `.map(async ...)`), so `refreshAll` no longer returns while reads are still in
   flight, which stops 5 s ticks from stacking.
3. **Only rewrite `data.json` when the cloud file list actually changed** (via a
   new `lastSavedFilesListJSON` cache), instead of on every single tick.

**Result.** Note-opening is snappy again, `saveSettings` is back to
milliseconds, and no upload/download sync behavior was changed.
