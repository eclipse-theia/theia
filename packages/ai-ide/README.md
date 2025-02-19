<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI IDE Agents EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-ide` package consolidates various AI agents for use within IDEs like the Theia IDE.

## Agents

The package includes the following agents:

- **Orchestrator Chat Agent**: Analyzes user requests and determines which specific chat agent is best suited to handle each request. It seamlessly delegates tasks to the appropriate agent, ensuring users receive the most relevant assistance. It used as the default agent if no other agent is specified.

- **Universal Chat Agent**: Provides general programming support. It answers broad programming-related questions and serves as a fallback for generic inquiries, without specific access to the user context or workspace. This agent is used as the preferred fallback in case the default agent is not available.

- **Coder Agent**: Assists software developers with code-related tasks in the Theia IDE. It utilizes AI to provide recommendations and improvements, leveraging a suite of functions to interact with the workspace.

- **Command Chat Agent**: This agent helps users execute commands within the Theia IDE based on user requests. It identifies the correct command from Theia's command registry and facilitates its execution, providing users with a seamless command interaction experience.

- **Architect Agent**: The agent is able to inspect the current files of the workspace, including their content, to answer questions.

## Configuration View

The package provides a configuration view that enables you to adjust settings related to the behavior of AI agents. This view is implemented in the files located at packages/ai-ide/src/browser/ai-configuration and offers customization of default parameters, feature toggles, and additional preferences for the AI IDE.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
