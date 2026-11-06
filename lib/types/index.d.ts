/**
 * Type declarations for dsh-code-video.
 *
 * The runtime imports nothing, so these types are deliberately structural: they
 * describe the slice of the Cordis context and of `@deepseek-ai/dsh-skill` that
 * the plugin touches, without forcing a peer dependency on either package.
 */

/** Payload accepted by `ctx.skills.register()`. */
export interface SkillRegistration {
  /** Kebab-case skill name; DSH addresses the skill by this exact string. */
  name: string;
  /** Routing description shown in the model-facing skill catalog. */
  description: string;
  /** Full Markdown instruction body. */
  content: string;
  /** Discovery source bucket reported to the catalog. */
  source: string;
  /** Directory the body's relative resources resolve against. */
  resourceBase: { kind: 'directory'; path: string };
}

/** Minimal Cordis context slice used by {@link apply}. */
export interface PluginContext {
  skills: {
    register(skill: SkillRegistration): () => void;
  };
}

/** Cordis plugin name. */
export declare const name: 'code-video';

/** Services required before `apply` runs. */
export declare const inject: readonly string[];

/**
 * Build the skill definition from the packaged SKILL.md and AGENTS.md.
 * @param root - package root; tests may point it at a fixture directory.
 * @throws when the package is incomplete or declares an invalid skill name.
 */
export declare function createSkillDefinition(root?: string): SkillRegistration;

/**
 * Register the packaged `promo-video-maker` skill.
 * @param ctx - Cordis context providing the skill registry.
 */
export declare function apply(ctx: PluginContext): void;
