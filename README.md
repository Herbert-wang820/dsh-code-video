# dsh-code-video

A DeepSeek Harness plugin that packages **[promo-video-maker](https://github.com/liyupi/ai-promo-video-maker)** —
a production workflow that turns one sentence ("make a trailer for https://example.com") into a finished 4K
promo video: research → questions → style frames → 4K screenshots → beat-synced score → AI voiceover →
mix → automatic gates → Remotion render.

中文文档：[README.zh.md](README.zh.md)

![Case: black-and-white comic style](docs/images/case-mianshiya.jpg)

## What it is

The upstream project is an agent skill: `SKILL.md` is the entry point, `AGENTS.md` is the ~30 KB production
spec, and `template/` plus `references/` are the resources the agent reads while it works. This repository
wraps that skill in a standard DSH plugin, so it installs through the host's plugin manager instead of
being cloned next to every project.

Installing the plugin registers one model-invocable skill, `promo-video-maker`. There is no new UI, no
background service and no runtime dependency: the plugin composes the skill body from the packaged
`SKILL.md` + `AGENTS.md` and injects its own absolute install path, so the agent never has to guess where
`template/` and `references/` live inside a pnpm profile.

## What you get

| Path in the package | What it is |
|---|---|
| `AGENTS.md` | The production spec: 10-stage workflow, pacing rules, gates, script index |
| `SKILL.md` | Skill frontmatter (name + routing description) and the short entry point |
| `references/` | 8 stage handbooks: discovery questions, style menu, asset sourcing, music & beat grid, voiceover, QA checklist, pitfalls, post-mortems |
| `template/` | The Reusable Remotion 4 + React 19 project, the web player, and ~15 Python scripts (4K screenshots, beat analysis, mixing, gates) |
| `docs/images/` | Reference stills from the upstream case studies |

Any product with a screen or a body of work qualifies: app, website, SaaS, open-source project, course,
AI model, community or event.

## Requirements

- DeepSeek Harness `>= 0.2.0` (the plugin declares `engines.dsh`), Node.js 20+.
- For actually producing a video, on the machine running the agent:
  - Node.js 18+, **ffmpeg**, Python 3.9+
  - `pip install -r <package>/template/requirements.txt`
  - optionally `playwright install chromium` (4K page screenshots)
- Optional: an `ELEVENLABS_API_KEY` in `<workspace>/.env` or the environment, for AI voiceover, per-scene
  scoring and transcription checks. Without it the workflow falls back to a royalty-free music library
  plus large captions.

## Install

```sh
dsh plugin --profile web add github:Herbert-wang820/dsh-code-video
```

Use your own profile name if it is not `web`. A local checkout works too:

```sh
dsh plugin --profile web add /path/to/dsh-code-video
```

Then restart the host and refresh the page. The package ships `lib/` prebuilt and declares no install
scripts, so installation needs no build step or script approval.

Verify: the skill catalog should list `promo-video-maker`, and asking the agent to "make a promo video for
<product>" should make it load that skill.

If you have a host that mounts a plugin page, the row id is `code-video`; disable it there if you would
rather supply the same skill from `~/.dsh/skills`.

## Use

Say one sentence, then answer the questions:

```text
帮我给 https://example.com 做一支宣传片
给这个开源项目做一支 1 分钟的介绍视频
我们的 App 下周上线，做一支能发抖音的竖屏宣传片
```

The agent researches the product, then asks two rounds of structured questions (format and length,
audience, style, narrative, opening hook, voice, screenshot access, licensing, CTA). Style is chosen from
3–4 generated style frames, not from a preset. After you confirm `需求确认.md`, it works autonomously and
only comes back for things only you can do: logging into a site, listening to music/voice candidates, or
verifying facts.

Deliverables land in `<workspace>/宣传片/<中文项目名>/`:

```text
宣传片 4K.mp4     需求确认.md     调研笔记.md     网页版/     工程/
```

## The workflow it drives

1. Environment check — `python3 <package>/template/scripts/doctor.py` (checks Node, ffmpeg, Python deps,
   Playwright, CJK fonts, ElevenLabs key; installs nothing)
2. Pre-research — confirm the product actually exists officially before building on it
3. Requirement inquiry — the only mandatory human gate, with visual style frames
4. Scaffold — copy `template/`, write `timing.json` (the single source of truth for timing), theme, fonts
5. Deep research — 4K screenshots via Playwright, every fact sourced in `调研笔记.md`
6. Music and beat grid — ElevenLabs scoring or Mixkit library, `music.py analyze/grid/bars`
7. Scenes — one React component per scene, absolute time in, `null` outside its window
8. Voice and mix — `elevenlabs.py vo` generates, transcribes and checks every line; `mix.py` ducks music
9. QA loop — `check:assets`, `lint`, per-scene stills reviewed by eye, then `check_video.py`
10. Export and revisions — 4K render, gate, hand-off; audio-only changes swap the track without re-rendering

Pacing rules are explicit (open with the pain point within 3 s, first peak within 5 s, ≥ 0.65 s per quick
cut, ≥ 1.3 s per named shot, URLs on screen ≥ 3 s, 45–60 s total, at least 8 real screenshots).

## How the plugin works

```
package.json      dsh.bundle.patch → ./cordis.patch.yml
cordis.patch.yml  one loader row: { id: code-video, name: dsh-code-video }
lib/index.js      Cordis plugin: ctx.skills.register(createSkillDefinition())
```

- `name = 'code-video'`, `inject = ['skills']`, `apply(ctx)` registers exactly one skill.
- The body is `preamble + AGENTS.md`, where the preamble resolves `<工具目录>` (this package) and
  `<输出目录>` (`<workspace>/宣传片`) to concrete paths and spells out the differences from the
  clone-style usage.
- `source: 'bundled'`, `resourceBase` = package root, so relative resources resolve for discovery
  consumers that show file previews.
- Missing `SKILL.md`, `AGENTS.md`, `template/package.json` or `references/需求问询.md` fails plugin load
  with an actionable message instead of registering a half-broken skill.

**Skill precedence:** runtime registrations rank 250. A project-level `.dsh/skills/promo-video-maker`
(rank 100) still wins over this plugin; a user-level `~/.dsh/skills/promo-video-maker` copy (rank 400) is
shadowed by it. If you maintain a hand-edited copy in `~/.dsh/skills`, disable this row or rename that
copy's `name`.

## Development

```sh
npm test        # contract tests: manifest, registration payload, injected paths, failure modes
```

The test suite runs without a DSH host (it fakes `ctx.skills`) and additionally verifies that every path
the generated body mentions exists in the package. `lib/` is hand-written ESM; there is no build step.

Updating from upstream:

```sh
cp <upstream>/{AGENTS.md,SKILL.md,CLAUDE.md,.env.example} .
cp -R <upstream>/references <upstream>/template .
npm test
```

## Compatibility and licensing

- DSH `>= 0.2.0 < 0.3.0` (`engines.dsh`), Node.js 20+.
- This plugin: MIT.
- The packaged workflow and template come from [liyupi/ai-promo-video-maker](https://github.com/liyupi/ai-promo-video-maker)
  (MIT, Copyright © 2026 程序员鱼皮). See [NOTICE](NOTICE) for what was changed.
- **Remotion license:** Remotion is free for individuals and companies of up to 3 people; larger teams
  need a company license — see [remotion.dev/license](https://www.remotion.dev/license).
- ElevenLabs free-tier output is not licensed for commercial use.
- Media you feed into a video is your responsibility; the workflow records each asset's source in
  `调研笔记.md` and asks you about licensing boundaries up front.
