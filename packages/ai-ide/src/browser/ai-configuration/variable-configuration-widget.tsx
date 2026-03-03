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

import { Agent, AgentService, AIVariable, AIVariableService } from '@theia/ai-core/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { AIAgentConfigurationWidget } from './agent-configuration-widget';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { nls } from '@theia/core';
import { AIListDetailConfigurationWidget } from './base/ai-list-detail-configuration-widget';

@injectable()
export class AIVariableConfigurationWidget extends AIListDetailConfigurationWidget<AIVariable> {

    static readonly ID = 'ai-variable-configuration-container-widget';
    static readonly LABEL = nls.localizeByDefault('Variables');

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    @postConstruct()
    protected init(): void {
        this.id = AIVariableConfigurationWidget.ID;
        this.title.label = AIVariableConfigurationWidget.LABEL;
        this.title.closable = false;
        this.addClass('ai-configuration-widget');

        this.loadItems().then(() => this.update());
        this.toDispose.push(this.variableService.onDidChangeVariables(async () => {
            await this.loadItems();
            this.update();
        }));
    }

    protected async loadItems(): Promise<void> {
        this.items = this.variableService.getVariables().sort((a, b) => a.name.localeCompare(b.name));
        if (this.items.length > 0 && !this.selectedItem) {
            this.selectedItem = this.items[0];
        }
    }

    protected getItemId(variable: AIVariable): string {
        return variable.id;
    }

    protected getItemLabel(variable: AIVariable): string {
        return variable.name;
    }

    protected override getEmptySelectionMessage(): string {
        return nls.localize('theia/ai/ide/variableConfiguration/selectVariable', 'Please select a Variable.');
    }

    protected renderItemDetail(variable: AIVariable): React.ReactNode {
        return (
            <div>
                <div className="settings-section-title settings-section-category-title">
                    {variable.name}
                    <pre className='ai-id-label'>Id: {variable.id}</pre>
                </div>

                {variable.description && (
                    <div style={{
                        marginBottom: 'calc(var(--theia-ui-padding) * 2)',
                        color: 'var(--theia-descriptionForeground)',
                        lineHeight: '1.5'
                    }}>
                        {variable.description}
                    </div>
                )}

                {this.renderArgs(variable)}
                {this.renderReferencedVariables(variable)}
            </div>
        );
    }

    protected renderArgs(variable: AIVariable): React.ReactNode | undefined {
        if (variable.args === undefined || variable.args.length === 0) {
            return undefined;
        }

        return (
            <>
                <div className="settings-section-subcategory-title">
                    {nls.localize('theia/ai/ide/variableConfiguration/variableArgs', 'Arguments')}
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: 'calc(var(--theia-ui-padding) / 2) var(--theia-ui-padding)',
                    alignItems: 'start',
                    marginBottom: 'calc(var(--theia-ui-padding) * 2)'
                }}>
                    {variable.args.map(arg => (
                        <React.Fragment key={arg.name}>
                            <span style={{ fontWeight: 500 }}>{arg.name}:</span>
                            <span style={{ color: 'var(--theia-descriptionForeground)' }}>
                                {arg.description}
                            </span>
                        </React.Fragment>
                    ))}
                </div>
            </>
        );
    }

    protected renderReferencedVariables(variable: AIVariable): React.ReactNode | undefined {
        const agents = this.getAgentsForVariable(variable);
        if (agents.length === 0) {
            return undefined;
        }

        return (
            <>
                <div className="settings-section-subcategory-title">
                    {nls.localize('theia/ai/ide/variableConfiguration/usedByAgents', 'Used by Agents')}
                </div>
                <ul className="variable-agent-list">
                    {agents.map(agent => (
                        <li key={agent.id} className="variable-agent-item" onClick={() => this.showAgentConfiguration(agent)}>
                            <span>{agent.name}</span>
                            <i className={codicon('chevron-right')}></i>
                        </li>
                    ))}
                </ul>
            </>
        );
    }

    protected showAgentConfiguration(agent: Agent): void {
        this.aiConfigurationSelectionService.setActiveAgent(agent);
        this.aiConfigurationSelectionService.selectConfigurationTab(AIAgentConfigurationWidget.ID);
    }

    protected getAgentsForVariable(variable: AIVariable): Agent[] {
        return this.agentService.getAgents().filter(a => a.variables?.includes(variable.id));
    }
}
