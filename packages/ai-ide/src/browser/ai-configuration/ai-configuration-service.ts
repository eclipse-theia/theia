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

import { Agent } from '@theia/ai-core/lib/common';
import { Emitter } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class AIConfigurationSelectionService {
    protected activeAgent?: Agent;

    protected readonly onDidSelectConfigurationEmitter = new Emitter<string>();
    onDidSelectConfiguration = this.onDidSelectConfigurationEmitter.event;

    protected readonly onDidAgentChangeEmitter = new Emitter<Agent | undefined>();
    onDidAgentChange = this.onDidAgentChangeEmitter.event;

    public getActiveAgent(): Agent | undefined {
        return this.activeAgent;
    }

    public setActiveAgent(agent?: Agent): void {
        this.activeAgent = agent;
        this.onDidAgentChangeEmitter.fire(agent);
    }

    public selectConfigurationTab(widgetId: string): void {
        this.onDidSelectConfigurationEmitter.fire(widgetId);
    }
}
