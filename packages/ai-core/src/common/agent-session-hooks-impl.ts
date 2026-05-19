// *****************************************************************************
// Copyright (C) 2026 Ericsson and Others.
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

import { ContributionProvider, Emitter } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AgentSessionHookData, AgentSessionHookProvider, AgentSessionHookRegistry } from './agent-session-hooks';

@injectable()
export class AgentSessionHookRegistryImpl implements AgentSessionHookRegistry {

    @inject(ContributionProvider) @named(AgentSessionHookProvider)
    protected readonly providers: ContributionProvider<AgentSessionHookProvider>;

    protected readonly emitter = new Emitter<AgentSessionHookData>();
    readonly onHookEvent = this.emitter.event;

    @postConstruct()
    protected init(): void {
        for (const provider of this.providers.getContributions()) {
            provider.onHookEvent(event => this.emitter.fire(event));
        }
    }

    fireEvent(data: AgentSessionHookData): void {
        this.emitter.fire(data);
    }
}
