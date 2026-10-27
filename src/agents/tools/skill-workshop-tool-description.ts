import { SKILL_AUTHORING_STANDARDS_PROMPT } from "../../skills/workshop/skill-authoring-standards.js";

export const SKILL_WORKSHOP_DESCRIPTION = `Your learned skills: reusable procedures saved as <name>/SKILL.md that load in future sessions. Changes apply immediately, are versioned, and are shown to the user.
Actions: list | view name [file_path] [version] | create name content | patch name old_text new_text [file_path] | write_file name file_path content | remove_file name file_path | archive name (absorbed_into or reason) | restore name [version].
- create: content is the full SKILL.md: frontmatter name (= name) and description (aim for ≤160 bytes, triggers first), then the procedure.
- patch: replaces one exact, unique old_text; view first and copy the text exactly. Prefer patch over rewrites.
- file_path: SKILL.md or files under references/, templates/, scripts/, assets/. remove_file deletes one of those support files; archive removes a whole skill.
- reason: one short line saying what changed; shown to the user.
- restore without version undoes the last change.

${SKILL_AUTHORING_STANDARDS_PROMPT}`;
