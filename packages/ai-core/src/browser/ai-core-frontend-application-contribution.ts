// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { PromptService } from '../common';
import { AgentService } from '../common/agent-service';

@injectable()
export class AICoreFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(PromptService)
    private readonly promptService: PromptService;

    onStart(): void {
        this.agentService.getAllAgents().forEach(a => {
            a.promptTemplates.forEach(t => {
                this.promptService.storePrompt(t.id, t.template);
            });
        });
    }

    onStop(): void {
    }
}
