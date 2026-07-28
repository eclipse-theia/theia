<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI TOOL SKETCHPAD EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-tool-sketchpad` extension lets you prototype LLM tools at runtime without writing or rebuilding any code.

When designing custom AI agents, most aspects of agent behavior (system prompts, LLMs, skills, MCPs) can already be adjusted at runtime. Custom tools were the remaining gap. This extension closes it by letting you define _sketched tools_ declaratively: name, description, input parameters, and return behavior. The tool implementation is deliberately left out.

## Usage

Open the **AI Tool Sketchpad** view (available once AI features are enabled) to create, edit, and delete sketched tools. Each tool defines:

- **Name** and **Description** exposed to the LLM.
- **Parameters**, including nested object and array parameters.
- A **Return Mode**:
  - `Static Return Value` always returns a fixed string.
  - `Ask At Runtime` opens a quick input at invocation time so you can supply the return value on the fly.

Sketched tools are registered in the `ToolInvocationRegistry` and become immediately available to any AI agent or chat session. Definitions are persisted as YAML and reloaded live when edited externally.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
