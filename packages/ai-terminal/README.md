<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI TERMINAL EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-terminal` extension contributes an overlay to the terminal view.\
The overlay can be used to ask a dedicated `TerminalAgent` for suggestions of terminal commands.

It also provides the `shellExecute` tool that allows AI agents to run commands on the host system.

## Shell Execution Tool

The `shellExecute` tool enables AI agents to execute shell commands on the host system with user confirmation.

### Security

By default, every command requires explicit user approval. The tool is marked with `confirmAlwaysAllow`, which shows an additional warning dialog when users try to enable auto-approval.

> **Warning**: This tool has full system access. Only enable auto-approval in isolated environments (containers, VMs).

### Features

- Execute any shell command (bash on Linux/macOS, cmd/PowerShell on Windows)
- Configurable working directory and timeout (default 2 min, max 10 min)
- Output truncation (first/last 50 lines) for large outputs
- Cancellation support

## Additional Information

- [API documentation for `@theia/ai-terminal`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai_terminal.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
