/**
 * Contract tests for the dsh-code-video plugin.
 *
 * They run without a DSH host: the Cordis context is faked down to the one
 * service the plugin touches (`ctx.skills`). What they protect is the packaging
 * contract — a manifest the plugin manager can reconcile, a skill name the
 * registry accepts, and a body whose injected paths actually exist on disk.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { apply, createSkillDefinition, inject, name } from '../lib/index.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

test('manifest is a reconcilable DSH bundle', () => {
  const manifest = JSON.parse(read('package.json'));

  assert.equal(manifest.name, 'dsh-code-video');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.main, 'lib/index.js');
  assert.equal(manifest.types, 'lib/types/index.d.ts');
  assert.equal(manifest.license, 'MIT');

  // The plugin manager only adds a dependency to dsh.profile.bundles when the
  // package declares dsh.bundle.patch and that file parses.
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } });
  assert.match(manifest.engines.dsh, /0\.2\./, 'must declare a supported DSH line');

  const patch = read('cordis.patch.yml');
  assert.match(patch, /-\s*insert:/, 'patch must be a top-level insert list');
  assert.match(patch, /name:\s*dsh-code-video/, 'patch must mount this package by name');
  assert.match(patch, /id:\s*code-video/);

  // Everything the skill body points at has to ship in the tarball.
  for (const entry of ['lib', 'cordis.patch.yml', 'AGENTS.md', 'SKILL.md', 'references', 'template']) {
    assert.ok(manifest.files.includes(entry), `files must include ${entry}`);
  }
});

test('plugin identity matches the Cordis row', () => {
  assert.equal(name, 'code-video');
  assert.deepEqual(inject, ['skills']);
  assert.equal(typeof apply, 'function');
});

test('skill definition satisfies the registry grammar', () => {
  const skill = createSkillDefinition();

  assert.equal(skill.name, 'promo-video-maker');
  assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(skill.description.length > 0, 'catalog needs a description');
  assert.equal(skill.source, 'bundled');
  assert.deepEqual(skill.resourceBase, { kind: 'directory', path: ROOT });
  assert.equal(typeof skill.content, 'string');
  assert.ok(skill.content.length > 2000, 'body must inline the production spec');
});

test('body inlines the spec and injects resolvable absolute paths', () => {
  const skill = createSkillDefinition();

  // Upstream spec, verbatim.
  assert.match(skill.content, /# 产品宣传视频制作器 · 工作流/);
  assert.match(skill.content, /## 四条总原则/);
  assert.match(skill.content, /节奏：底线 \+ 密度/);

  // Paths the model is told to use, as absolute paths under the package.
  assert.match(skill.content, new RegExp(escapeRegExp(join(ROOT, 'template'))));
  assert.match(skill.content, new RegExp(escapeRegExp(join(ROOT, 'references'))));

  // No unresolved templating may leak into the prompt.
  assert.doesNotMatch(skill.content, /\{\{|\}\}/);
});

test('apply registers exactly one skill and returns nothing', () => {
  const registered = [];
  const ctx = { skills: { register: (skill) => (registered.push(skill), () => {}) } };

  assert.equal(apply(ctx), undefined);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, 'promo-video-maker');
});

test('an incomplete package fails loudly instead of registering a broken skill', () => {
  const empty = mkdtempSync(join(tmpdir(), 'dsh-code-video-'));
  try {
    assert.throws(() => createSkillDefinition(empty), /dsh-code-video: missing SKILL\.md/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('an invalid skill name is rejected before it reaches the registry', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-code-video-'));
  try {
    mkdirSync(join(fixture, 'template'), { recursive: true });
    mkdirSync(join(fixture, 'references'), { recursive: true });
    writeFileSync(join(fixture, 'template', 'package.json'), '{}');
    writeFileSync(join(fixture, 'references', '需求问询.md'), '# fixture');
    writeFileSync(join(fixture, 'AGENTS.md'), '# spec');
    writeFileSync(join(fixture, 'SKILL.md'), '---\nname: Not_A_Name\ndescription: fixture\n---\n# body\n');

    assert.throws(() => createSkillDefinition(fixture), /invalid skill name/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

/**
 * Escape a literal string for use inside a RegExp.
 * @param value - literal text.
 * @returns the escaped pattern source.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
