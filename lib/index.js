/**
 * dsh-code-video — DeepSeek Harness plugin that ships the `promo-video-maker` skill.
 *
 * The upstream project (https://github.com/liyupi/ai-promo-video-maker) is an agent
 * skill: SKILL.md is the entry point, AGENTS.md is the full production spec, and
 * `template/` + `references/` are resources the agent reads while it works. As an
 * installed DSH plugin the package lives inside the profile's node_modules, so the
 * skill body is composed at load time: the spec is inlined and the package's
 * absolute path is injected, leaving the model with no path to guess.
 *
 * @module dsh-code-video
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis plugin name. */
export const name = 'code-video';

/** Services required before `apply` runs: the skill registry that stores the definition. */
export const inject = ['skills'];

/** Public skill-name grammar, mirroring `@deepseek-ai/dsh-skill`. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Package root: `lib/index.js` → `lib` → package root. */
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Resolve every path the composed skill body mentions.
 * @param root - package root.
 * @returns absolute paths used by the skill body and by the integrity check.
 */
function resolvePaths(root) {
  return {
    root,
    skill: join(root, 'SKILL.md'),
    spec: join(root, 'AGENTS.md'),
    template: join(root, 'template'),
    templateManifest: join(root, 'template', 'package.json'),
    references: join(root, 'references'),
    inquiryReference: join(root, 'references', '需求问询.md'),
    images: join(root, 'docs', 'images'),
  };
}

/**
 * Read a packaged resource, failing with an actionable message.
 * @param file - absolute path to read.
 * @param label - human-readable name used in the error.
 * @returns file contents as UTF-8.
 */
function readRequired(file, label) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(
      `dsh-code-video: cannot read ${label} at ${file}. The package is incomplete — reinstall the plugin ` +
        `(dsh plugin --profile <profile> add dsh-code-video) and restart the host.`,
      { cause: error },
    );
  }
}

/**
 * Split YAML-style frontmatter from a Markdown document.
 * Only flat `key: value` pairs are needed by SKILL.md, so a full YAML parser is
 * deliberately avoided: the plugin keeps zero runtime dependencies.
 * @param markdown - document text.
 * @returns parsed metadata and the remaining body.
 */
function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { metadata: {}, body: markdown };
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (pair === null) continue;
    let value = pair[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    metadata[pair[1]] = value;
  }
  return { metadata, body: markdown.slice(match[0].length) };
}

/**
 * Build the plugin-specific preamble that binds the generic spec to this install.
 * @param skillName - registered skill name.
 * @param paths - resolved package paths.
 * @returns Markdown placed before the inlined spec.
 */
function buildPreamble(skillName, paths) {
  return [
    `本 Skill 由 DSH 插件 \`dsh-code-video\` 提供（skill 名：\`${skillName}\`）。`,
    '',
    '完整工作规范（AGENTS.md）已内联在下面，**不需要先读其他文件才能开工**；各阶段的详细方法在 `<工具目录>/references/` 里按需读取。',
    '',
    '## 包内路径（已解析为绝对路径，直接照用）',
    '',
    '| 占位符 | 本机绝对路径 | 用途 |',
    '|---|---|---|',
    `| \`<工具目录>\` | \`${paths.root}\` | 本插件包根目录：规范、参考资料、模板都在这里 |`,
    '| `<输出目录>` | `<工作区根目录>/宣传片` | 每个产品在这里建一个中文子目录 |',
    `| 模板 | \`${paths.template}\` | 新项目唯一的骨架来源：复制到 \`<输出目录>/<中文项目名>/工程\` 后 npm install |`,
    `| 参考文档 | \`${paths.references}\` | 需求问询、风格方向、素材获取、音乐卡点、配音、校验清单、踩坑记录、案例复盘 |`,
    `| 示例图 | \`${paths.images}\` | README 用的成片画面，制作时不用管 |`,
    '',
    '插件形态与「克隆用法」的三点差异：',
    '',
    '1. 包内没有 `outputs/` 目录；成品一律写到 `<输出目录>`（当前工作区下的 `宣传片/`）。',
    '2. `<工具目录>` 由 DSH 插件管理器管理（pnpm 安装进 profile），**只读使用，不要把任何项目文件写进去**；升级插件时整个目录会被替换。',
    '3. 环境体检脚本在 `<工具目录>/template/scripts/doctor.py`，Python 依赖在 `<工具目录>/template/requirements.txt`。',
    '',
    '上游项目：https://github.com/liyupi/ai-promo-video-maker （MIT，本插件是其 DSH 封装）。',
    '',
    '---',
    '',
  ].join('\n');
}

/**
 * Compose the full skill body: preamble, then the production spec verbatim.
 * @param skillName - registered skill name.
 * @param paths - resolved package paths.
 * @returns Markdown instruction body.
 */
function composeContent(skillName, paths) {
  const spec = readRequired(paths.spec, 'AGENTS.md (the production spec)');
  return `${buildPreamble(skillName, paths)}${spec}`;
}

/**
 * Verify that the resources the body points at are actually present.
 * @param paths - resolved package paths.
 */
function assertResources(paths) {
  const required = [
    [paths.skill, 'SKILL.md'],
    [paths.spec, 'AGENTS.md'],
    [paths.templateManifest, 'template/package.json'],
    [paths.inquiryReference, 'references/需求问询.md'],
  ];
  for (const [file, label] of required) {
    if (!existsSync(file)) {
      throw new Error(
        `dsh-code-video: missing ${label} at ${file}. The package is incomplete — reinstall the plugin ` +
          `(dsh plugin --profile <profile> add dsh-code-video) and restart the host.`,
      );
    }
  }
}

/**
 * Build the skill definition registered into `ctx.skills`.
 *
 * `source: 'bundled'` marks it as packaged content. It resolves at runtime rank
 * (250), so a project-level `.dsh/skills` copy (rank 100) still wins, while a
 * user-level `~/.dsh/skills` copy (rank 400) is shadowed by this package.
 *
 * @param root - package root; only tests pass a different directory.
 * @returns the registration payload for `ctx.skills.register()`.
 */
export function createSkillDefinition(root = PACKAGE_ROOT) {
  const paths = resolvePaths(root);
  assertResources(paths);

  const { metadata } = parseFrontmatter(readRequired(paths.skill, 'SKILL.md'));
  const skillName = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  if (!SKILL_NAME.test(skillName)) {
    throw new Error(
      `dsh-code-video: SKILL.md declares an invalid skill name (${JSON.stringify(metadata.name ?? null)}); ` +
        'expected kebab-case such as "promo-video-maker".',
    );
  }
  const description = typeof metadata.description === 'string' ? metadata.description.trim() : '';
  if (description.length === 0) {
    throw new Error('dsh-code-video: SKILL.md declares no description; the skill catalog needs one.');
  }

  return {
    name: skillName,
    description,
    content: composeContent(skillName, paths),
    source: 'bundled',
    resourceBase: { kind: 'directory', path: paths.root },
  };
}

/**
 * Register the packaged skill. Called once per plugin load.
 * @param ctx - Cordis context; `ctx.skills` is the registry from `@deepseek-ai/dsh-skill`.
 */
export function apply(ctx) {
  ctx.skills.register(createSkillDefinition());
}
