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
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { LanguageModelAliasRegistry, LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { LanguageModel, LanguageModelRegistry } from '@theia/ai-core/lib/common/language-model';
import { nls } from '@theia/core/lib/common/nls';
import { AIConfigurationSelectionService } from './ai-configuration-service';

export interface ModelAliasesConfigurationProps {
    languageModelAliasRegistry: LanguageModelAliasRegistry;
    languageModelRegistry: LanguageModelRegistry;
}

@injectable()
export class ModelAliasesConfigurationWidget extends ReactWidget {
    static readonly ID = 'model-aliases-configuration-widget';
    static readonly LABEL = nls.localize('theia/ai/core/modelAliasesConfiguration/label', 'Model Aliases');

    @inject(LanguageModelAliasRegistry)
    protected readonly languageModelAliasRegistry: LanguageModelAliasRegistry;
    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;
    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    protected aliases: LanguageModelAlias[] = [];
    protected languageModels: LanguageModel[] = [];

    @postConstruct()
    protected init(): void {
        this.id = ModelAliasesConfigurationWidget.ID;
        this.title.label = ModelAliasesConfigurationWidget.LABEL;
        this.title.closable = false;

        this.loadAliases();
        this.languageModelRegistry.getLanguageModels().then(models => {
            this.languageModels = models ?? [];
            this.update();
        });

        this.toDispose.push(this.languageModelAliasRegistry.onDidChange(() => this.loadAliases()));
        this.toDispose.push(this.languageModelRegistry.onChange(() => this.reloadLanguageModels()));
        this.toDispose.push(this.aiConfigurationSelectionService.onDidAliasChange(() => this.update()));
    }

    protected loadAliases(): void {
        this.aliases = this.languageModelAliasRegistry.getAliases();
        // Set the initial selection if not set
        if (this.aliases.length > 0 && !this.aiConfigurationSelectionService.getSelectedAliasId()) {
            this.aiConfigurationSelectionService.setSelectedAliasId(this.aliases[0].id);
        }
        this.update();
    }

    protected reloadLanguageModels(): void {
        this.languageModelRegistry.getLanguageModels().then(models => {
            this.languageModels = models ?? [];
            this.update();
        });
    }

    protected handleAliasClick = (aliasId: string): void => {
        this.aiConfigurationSelectionService.setSelectedAliasId(aliasId);
    };

    protected handleModelIdChange = (alias: LanguageModelAlias, event: React.ChangeEvent<HTMLSelectElement>): void => {
        const newModelId = event.target.value || undefined;
        const updatedAlias: LanguageModelAlias = {
            ...alias,
            selectedModelId: newModelId
        };
        this.languageModelAliasRegistry.addAlias(updatedAlias); // will trigger listeners
    };

    render(): React.ReactNode {
        const selectedAliasId = this.aiConfigurationSelectionService.getSelectedAliasId();
        const selectedAlias = this.aliases.find(alias => alias.id === selectedAliasId);
        return (
            <div className="ai-agent-configuration-main">
                <div className="configuration-agents-list preferences-tree-widget theia-TreeContainer" style={{ width: '25%' }}>
                    <ul>
                        {this.aliases.map(alias => (
                            <li
                                key={alias.id}
                                className={`theia-TreeNode theia-CompositeTreeNode${alias.id === selectedAliasId ? ' theia-mod-selected' : ''}`}
                                onClick={() => this.handleAliasClick(alias.id)}
                            >
                                <span>{alias.id}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="configuration-agent-panel preferences-editor-widget">
                    {selectedAlias ? this.renderAliasDetail(selectedAlias, this.languageModels) : (
                        <div>
                            {nls.localize('theia/ai/core/modelAliasesConfiguration/selectAlias', 'Please select a Model Alias.')}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    protected renderAliasDetail(alias: LanguageModelAlias, languageModels: LanguageModel[]): React.ReactNode {
        return (
            <div>
                <div className="settings-section-title settings-section-category-title" style={{ paddingLeft: 0, paddingBottom: 10 }}>
                    <span>{nls.localize('theia/ai/core/modelAliasesConfiguration/alias', 'Alias')}: <b>{alias.id}</b></span>
                </div>
                <div style={{ marginBottom: 20 }}>
                    <label>{nls.localize('theia/ai/core/modelAliasesConfiguration/selectedModelId', 'Selected Model')}:</label>
                    <select
                        className="theia-select"
                        value={alias.selectedModelId ?? ''}
                        onChange={event => this.handleModelIdChange(alias, event)}
                    >
                        <option value="">{nls.localize('theia/ai/core/modelAliasesConfiguration/fallback', '[Fallback to defaults]')}</option>
                        {languageModels.map(model => (
                            <option key={model.id} value={model.id}>{model.name ?? model.id}</option>
                        ))}
                    </select>
                </div>
                <div style={{ marginBottom: 10 }}>
                    <label>{nls.localize('theia/ai/core/modelAliasesConfiguration/defaults', 'Default Model IDs (priority order)')}:</label>
                    <ol>
                        {(alias.defaultModelIds || []).map((id, idx) => (
                            <li key={id}>
                                <code>{id}</code>
                                {idx === 0 && !alias.selectedModelId ? (
                                    nls.localize('theia/ai/core/modelAliasesConfiguration/currentFallback', '(current)')
                                ) : undefined}
                            </li>
                        ))}

                    </ol>
                    <div style={{ fontStyle: 'italic', color: 'var(--theia-descriptionForeground)', marginTop: 8 }}>
                        {nls.localize(
                            'theia/ai/core/modelAliasesConfiguration/defaultsHierarchy',
                            'When no model is explicitly selected, the first model will be used. If unavailable, fallback is in listed order.'
                        )}
                    </div>
                </div>
            </div>
        );
    }
}
