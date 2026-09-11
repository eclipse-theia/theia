// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AgentService } from '@theia/ai-core/lib/common';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { COMMIT_MESSAGE_AGENT_ID } from './commit-message-agent';
import { CommitMessageCommands } from './commit-message-commands';
import { CommitMessageRunner } from './commit-message-runner';

@injectable()
export class CommitMessageCommandContribution implements CommandContribution {

    @inject(CommitMessageRunner)
    protected readonly runner: CommitMessageRunner;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(CommitMessageCommands.GENERATE_FROM_STAGED, this.commandHandlerFactory({
            execute: () => this.execute(),
            isEnabled: () => this.isEnabled()
        }));
    }

    protected execute(): void | Promise<void> {
        if (this.runner.isRunning()) {
            this.runner.cancel();
            return;
        }
        return this.runner.run();
    }

    protected isEnabled(): boolean {
        const repository = this.scmService.selectedRepository;
        return !!repository
            && repository.input.enabled
            && this.agentService.isEnabled(COMMIT_MESSAGE_AGENT_ID);
    }
}
