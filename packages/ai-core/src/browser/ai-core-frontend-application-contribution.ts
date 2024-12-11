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
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Agent } from '../common';
import { AgentService } from '../common/agent-service';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';

@injectable()
export class AICoreFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(ContributionProvider) @named(Agent)
    protected readonly agentsProvider: ContributionProvider<Agent>;

    onStart(): void {
        this.agentsProvider.getContributions().forEach(agent => {
            this.agentService.registerAgent(agent);
        });
    }

    onStop(): void {
    }
}
