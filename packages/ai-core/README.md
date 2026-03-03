<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI CORE EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-core` extension serves as the basis of all AI integration in Theia.
It manages the integration of language models and provides core concepts like agents, prompts, AI variables, and skills.

### Skills

Skills provide reusable instructions and domain knowledge for AI agents. A skill is a directory containing a `SKILL.md` file with YAML frontmatter (name, description) and markdown content.

#### Skill Directories

Skills are discovered from multiple locations, processed in priority order (first wins on duplicates):

1. **Workspace:** `.prompts/skills/` in the workspace root (project-specific skills)
2. **User-configured:** Directories listed in `ai-features.skills.skillDirectories` preference
3. **Global:** `~/.theia/skills/` (user defaults)

#### Skill Structure

Each skill must be in its own directory with the directory name matching the skill name:

```text
skills/
├── my-skill/
│   └── SKILL.md
└── another-skill/
    └── SKILL.md
```

#### Usage

- Add `{{skills}}` to an agent's prompt to inject available skills as XML (name and description)
- Agents can read full skill content using the `getSkillFileContent` tool with the skill name

Enablement of the Theia AI feature is managed via the AI preferences, contributed by `@theia/ai-core-ui`.
Either include `@theia/ai-core-ui` or bind the included preferences schemas in your Theia based application.

## Additional Information

- [API documentation for `@theia/ai-core`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-core.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
