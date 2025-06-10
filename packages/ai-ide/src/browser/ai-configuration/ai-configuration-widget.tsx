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

import { BaseWidget, BoxLayout, codicon, DockPanel, WidgetManager } from '@theia/core/lib/browser';
import { TheiaDockPanel } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIAgentConfigurationWidget } from './agent-configuration-widget';
import { AIVariableConfigurationWidget } from './variable-configuration-widget';
import { AIToolsConfigurationWidget } from './tools-configuration-widget';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { nls } from '@theia/core';
import { AIMCPConfigurationWidget } from './mcp-configuration-widget';
import { AITokenUsageConfigurationWidget } from './token-usage-configuration-widget';
import { AIPromptFragmentsConfigurationWidget } from './prompt-fragments-configuration-widget';

@injectable()
export class AIConfigurationContainerWidget extends BaseWidget {

    static readonly ID = 'ai-configuration';
    static readonly LABEL = nls.localize('theia/ai/core/aiConfiguration/label', 'AI Configuration [Alpha]');
    protected dockpanel: DockPanel;

    @inject(TheiaDockPanel.Factory)
    protected readonly dockPanelFactory: TheiaDockPanel.Factory;
    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;
    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    protected agentsWidget: AIAgentConfigurationWidget;
    protected variablesWidget: AIVariableConfigurationWidget;
    protected mcpWidget: AIMCPConfigurationWidget;
    protected tokenUsageWidget: AITokenUsageConfigurationWidget;
    protected promptFragmentsWidget: AIPromptFragmentsConfigurationWidget;
    protected toolsWidget: AIToolsConfigurationWidget;

    @postConstruct()
    protected init(): void {
        this.id = AIConfigurationContainerWidget.ID;
        this.title.label = AIConfigurationContainerWidget.LABEL;
        this.title.closable = true;
        this.addClass('theia-settings-container');
        this.title.iconClass = codicon('hubot');
        this.initUI();
        this.initListeners();
    }

    protected async initUI(): Promise<void> {
        const layout = (this.layout = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 }));
        this.dockpanel = this.dockPanelFactory({
            mode: 'multiple-document',
            spacing: 0
        });
        BoxLayout.setStretch(this.dockpanel, 1);
        layout.addWidget(this.dockpanel);
        this.dockpanel.addClass('ai-configuration-widget');

        this.agentsWidget = await this.widgetManager.getOrCreateWidget(AIAgentConfigurationWidget.ID);
        this.variablesWidget = await this.widgetManager.getOrCreateWidget(AIVariableConfigurationWidget.ID);
        this.mcpWidget = await this.widgetManager.getOrCreateWidget(AIMCPConfigurationWidget.ID);
        this.tokenUsageWidget = await this.widgetManager.getOrCreateWidget(AITokenUsageConfigurationWidget.ID);
        this.promptFragmentsWidget = await this.widgetManager.getOrCreateWidget(AIPromptFragmentsConfigurationWidget.ID);
        this.toolsWidget = await this.widgetManager.getOrCreateWidget(AIToolsConfigurationWidget.ID);

        this.dockpanel.addWidget(this.agentsWidget);
        this.dockpanel.addWidget(this.variablesWidget, { mode: 'tab-after', ref: this.agentsWidget });
        this.dockpanel.addWidget(this.mcpWidget, { mode: 'tab-after', ref: this.variablesWidget });
        this.dockpanel.addWidget(this.tokenUsageWidget, { mode: 'tab-after', ref: this.mcpWidget });
        this.dockpanel.addWidget(this.promptFragmentsWidget, { mode: 'tab-after', ref: this.tokenUsageWidget });
        this.dockpanel.addWidget(this.toolsWidget, { mode: 'tab-after', ref: this.promptFragmentsWidget });

        this.update();
    }

    protected initListeners(): void {
        this.aiConfigurationSelectionService.onDidSelectConfiguration(widgetId => {
            if (widgetId === AIAgentConfigurationWidget.ID) {
                this.dockpanel.activateWidget(this.agentsWidget);
            } else if (widgetId === AIVariableConfigurationWidget.ID) {
                this.dockpanel.activateWidget(this.variablesWidget);
            } else if (widgetId === AIMCPConfigurationWidget.ID) {
                this.dockpanel.activateWidget(this.mcpWidget);
            } else if (widgetId === AITokenUsageConfigurationWidget.ID) {
                this.dockpanel.activateWidget(this.tokenUsageWidget);
            } else if (widgetId === AIPromptFragmentsConfigurationWidget.ID) {
                this.dockpanel.activateWidget(this.promptFragmentsWidget);
            } else if (widgetId === AIToolsConfigurationWidget.ID) {
                this.dockpanel.activateWidget(this.toolsWidget);
            }
        });
    }
}
