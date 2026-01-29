// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-chat/lib/browser/agent-delegation-tool';
import { RUN_TASK_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class WithAppTesterCommandContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.registerWithAppTesterCommand();
    }

    protected registerWithAppTesterCommand(): void {
        const commandTemplate = this.buildCommandTemplate();

        this.promptService.addBuiltInPromptFragment({
            id: 'with-apptester',
            template: commandTemplate,
            isCommand: true,
            commandName: 'with-apptester',
            commandDescription: nls.localize(
                'theia/ai-ide/withAppTesterCommand/description',
                'Delegate testing to the AppTester agent (requires agent mode)'
            ),
            commandAgents: ['Coder']
        });
    }

    protected buildCommandTemplate(): string {
        return `After implementing the changes, delegate to the AppTester agent to test the implementation. The changes need to be applied and built.

    Use the ~{${AGENT_DELEGATION_FUNCTION_ID}} tool to delegate to the AppTester agent.

    **Agent ID:** 'AppTester'
    **Prompt:** Provide a description of what was implemented and should be tested, including:
    - Summary of changes made
    - Expected behavior
    - Areas to focus testing on
    - **Application URL:** Specify the exact URL if known (e.g., http://localhost:3000)
    - **Application Status:** Clearly specify whether the application has started, or if the AppTester needs to launch it
    - **Launch Configuration:** If known, specify which launch configuration to use
    - **UI Navigation Instructions:** If the feature requires opening a specific view, panel, menu, or using the command palette, provide explicit instructions

    Example prompt format:
    \`\`\`
    I have implemented [description of changes].

    Expected behavior: [what should happen]

    Application URL: http://localhost:3000
    Application status: The application is running.
    (OR: Application status: Not started yet. Use launch configuration "[config-name]" to start it.)
    IMPORTANT: You CANNOT start the application using the ${RUN_TASK_FUNCTION_ID} tool, as it will block the delegation.

    UI Navigation: To test this feature, you need to [e.g., "click the AI Chat icon in the left sidebar to open the AI Chat View",
    or "open the Command Palette and run 'Open Settings'", or "the feature should be visible immediately on the main page"].

    Please test the implementation focusing on [specific areas].
    \`\`\`

    **IMPORTANT:** Include as much information as possible (URL, port, launch config, UI navigation steps)
    to guide the AppTester efficiently.

    The AppTester will verify the implementation and report any issues found.`;
    }
}
