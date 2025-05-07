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

import { nls } from '@theia/core';
import { ConfirmDialog, ReactWidget, codicon } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    CustomizedPromptFragment,
    PromptFragment,
    isCustomizedPromptFragment,
    isBuiltInPromptFragment,
    PromptService,
    BuiltInPromptFragment
} from '@theia/ai-core/lib/common/prompt-service';
import * as React from '@theia/core/shared/react';
import '../../../src/browser/style/index.css';
import { AgentService } from '@theia/ai-core/lib/common/agent-service';
import { Agent } from '@theia/ai-core/lib/common/agent';

/**
 * Widget for configuring AI prompt fragments and system prompts.
 * Allows users to view, create, edit, and manage various types of prompt
 * fragments including their customizations and variants.
 */
@injectable()
export class AIPromptFragmentsConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-prompt-fragments-configuration';
    static readonly LABEL = nls.localize('theia/ai/core/promptFragmentsConfiguration/label', 'Prompt Fragments');

    /**
     * Stores all available prompt fragments by ID
     */
    protected promptFragmentMap: Map<string, PromptFragment[]> = new Map<string, PromptFragment[]>();

    /**
     * Stores system prompts and their variant IDs
     */
    protected systemPromptsMap: Map<string, string[]> = new Map<string, string[]>();

    /**
     * Currently active prompt fragments
     */
    protected activePromptFragments: PromptFragment[] = [];

    /**
     * Tracks expanded state of prompt fragment sections in the UI
     */
    protected expandedPromptFragmentIds: Set<string> = new Set();

    /**
     * Tracks expanded state of prompt content display
     */
    protected expandedPromptFragmentTemplates: Set<string> = new Set();

    /**
     * Tracks expanded state of system prompt sections
     */
    protected expandedSystemPromptIds: Set<string> = new Set();

    /**
     * All available agents that may use prompts
     */
    protected availableAgents: Agent[] = [];

    /**
     * Maps system prompt IDs to their currently active variant IDs
     */
    protected activeVariantIds: Map<string, string | undefined> = new Map();

    /**
     * Maps system prompt IDs to their default variant IDs
     */
    protected defaultVariantIds: Map<string, string | undefined> = new Map();

    @inject(PromptService) protected promptService: PromptService;
    @inject(AgentService) protected agentService: AgentService;

    @postConstruct()
    protected init(): void {
        this.id = AIPromptFragmentsConfigurationWidget.ID;
        this.title.label = AIPromptFragmentsConfigurationWidget.LABEL;
        this.title.caption = AIPromptFragmentsConfigurationWidget.LABEL;
        this.title.closable = true;
        this.addClass('ai-configuration-tab-content');
        this.loadPromptFragments();
        this.loadAgents();

        this.toDispose.pushAll([
            this.promptService.onPromptsChange(() => {
                this.loadPromptFragments();
            }),
            this.promptService.onActiveVariantChange(notification => {
                this.activeVariantIds.set(notification.systemPromptId, notification.variantId);
                this.update();
            }),
            this.agentService.onDidChangeAgents(() => {
                this.loadAgents();
            })
        ]);
    }

    /**
     * Loads all prompt fragments and system prompts from the prompt service.
     * Preserves UI expansion states and updates variant information.
     */
    protected async loadPromptFragments(): Promise<void> {
        this.promptFragmentMap = this.promptService.getAllPrompts();
        this.systemPromptsMap = this.promptService.getSystemPrompts();
        this.activePromptFragments = this.promptService.getActivePrompts();

        // Preserve expansion state when reloading
        const existingExpandedFragmentIds = new Set(this.expandedPromptFragmentIds);
        const existingExpandedSystemPromptIds = new Set(this.expandedSystemPromptIds);
        const existingExpandedTemplates = new Set(this.expandedPromptFragmentTemplates);

        // If no sections were previously expanded, expand all by default
        if (existingExpandedFragmentIds.size === 0) {
            this.expandedPromptFragmentIds = new Set(Array.from(this.promptFragmentMap.keys()));
        } else {
            // Keep existing expansion state but remove entries for fragments that no longer exist
            this.expandedPromptFragmentIds = new Set(
                Array.from(existingExpandedFragmentIds).filter(id => this.promptFragmentMap.has(id))
            );
        }

        if (existingExpandedSystemPromptIds.size === 0) {
            this.expandedSystemPromptIds = new Set(Array.from(this.systemPromptsMap.keys()));
        } else {
            // Keep existing expansion state but remove entries for system prompts that no longer exist
            this.expandedSystemPromptIds = new Set(
                Array.from(existingExpandedSystemPromptIds).filter(id => this.systemPromptsMap.has(id))
            );
        }

        // For templates, preserve existing expanded states - don't expand by default
        this.expandedPromptFragmentTemplates = new Set(
            Array.from(existingExpandedTemplates).filter(id => {
                const [fragmentId] = id.split('_');
                return this.promptFragmentMap.has(fragmentId);
            })
        );

        // Update variant information (active/default) for system prompts
        for (const systemPromptId of this.systemPromptsMap.keys()) {
            const activeId = await this.promptService.getActiveVariantId(systemPromptId);
            const defaultId = await this.promptService.getDefaultVariantId(systemPromptId);
            this.activeVariantIds.set(systemPromptId, activeId);
            this.defaultVariantIds.set(systemPromptId, defaultId);
        }

        this.update();
    }

    /**
     * Loads all available agents from the agent service
     */
    protected loadAgents(): void {
        this.availableAgents = this.agentService.getAllAgents();
        this.update();
    }

    /**
     * Finds agents that use a specific system prompt
     * @param systemPromptId ID of the system prompt to match
     * @returns Array of agents that use the system prompt
     */
    protected getAgentsUsingSystemPromptId(systemPromptId: string): Agent[] {
        return this.availableAgents.filter((agent: Agent) =>
            agent.systemPrompts.find(systemPrompt => systemPrompt.id === systemPromptId)
        );
    }

    protected toggleSystemPromptExpansion = (systemPromptId: string): void => {
        if (this.expandedSystemPromptIds.has(systemPromptId)) {
            this.expandedSystemPromptIds.delete(systemPromptId);
        } else {
            this.expandedSystemPromptIds.add(systemPromptId);
        }
        this.update();
    };

    protected togglePromptFragmentExpansion = (promptFragmentId: string): void => {
        if (this.expandedPromptFragmentIds.has(promptFragmentId)) {
            this.expandedPromptFragmentIds.delete(promptFragmentId);
        } else {
            this.expandedPromptFragmentIds.add(promptFragmentId);
        }
        this.update();
    };

    protected toggleTemplateExpansion = (fragmentKey: string, event: React.MouseEvent): void => {
        event.stopPropagation();
        if (this.expandedPromptFragmentTemplates.has(fragmentKey)) {
            this.expandedPromptFragmentTemplates.delete(fragmentKey);
        } else {
            this.expandedPromptFragmentTemplates.add(fragmentKey);
        }
        this.update();
    };

    /**
     * Call the edit action for the provided customized prompt fragment
     * @param promptFragment Fragment to edit
     * @param event Mouse event
     */
    protected editPromptCustomization = (promptFragment: CustomizedPromptFragment, event: React.MouseEvent): void => {
        event.stopPropagation();
        this.promptService.editCustomization(promptFragment.id, promptFragment.customizationId);
    };

    /**
     * Determines if a prompt fragment is currently the active one for its ID
     * @param promptFragment The prompt fragment to check
     * @returns True if this prompt fragment is the active customization
     */
    protected isActiveCustomization(promptFragment: PromptFragment): boolean {
        const activePromptFragment = this.activePromptFragments.find(activePrompt => activePrompt.id === promptFragment.id);
        if (!activePromptFragment) {
            return false;
        }

        if (isCustomizedPromptFragment(activePromptFragment) && isCustomizedPromptFragment(promptFragment)) {
            return (
                activePromptFragment.id === promptFragment.id &&
                activePromptFragment.template === promptFragment.template &&
                activePromptFragment.customizationId === promptFragment.customizationId &&
                activePromptFragment.priority === promptFragment.priority
            );
        }

        if (isBuiltInPromptFragment(activePromptFragment) && isBuiltInPromptFragment(promptFragment)) {
            return (
                activePromptFragment.id === promptFragment.id &&
                activePromptFragment.template === promptFragment.template
            );
        }

        return false;
    }

    /**
     * Resets a prompt fragment to use a specific customization (with confirmation dialog)
     * @param customization customization to reset to
     * @param event Mouse event
     */
    protected resetToPromptFragment = async (customization: PromptFragment, event: React.MouseEvent): Promise<void> => {
        event.stopPropagation();

        if (isCustomizedPromptFragment(customization)) {
            // Get the customization type to show in the confirmation dialog
            const type = await this.promptService.getCustomizationType(customization.id, customization.customizationId);

            const dialog = new ConfirmDialog({
                title: 'Reset to Customization',
                msg: `Are you sure you want to reset the prompt fragment "${customization.id}" to use the ${type} customization?
                    This will remove all higher-priority customizations.`,
                ok: 'Reset',
                cancel: 'Cancel'
            });

            const shouldReset = await dialog.open();
            if (shouldReset) {
                await this.promptService.resetToCustomization(customization.id, customization.customizationId);
            }
        } else {
            const dialog = new ConfirmDialog({
                title: 'Reset to Built-in',
                msg: `Are you sure you want to reset the prompt fragment "${customization.id}" to its built-in version? This will remove all customizations.`,
                ok: 'Reset',
                cancel: 'Cancel'
            });

            const shouldReset = await dialog.open();
            if (shouldReset) {
                await this.promptService.resetToBuiltIn(customization.id);
            }
        }
    };

    /**
     * Creates a new customization for a built-in prompt fragment
     * @param promptFragment Built-in prompt fragment to customize
     * @param event Mouse event
     */
    protected createPromptFragmentCustomization = (promptFragment: BuiltInPromptFragment, event: React.MouseEvent): void => {
        event.stopPropagation();
        this.promptService.createCustomization(promptFragment.id);
    };

    /**
     * Deletes a customization with confirmation dialog
     * @param customization Customized prompt fragment to delete
     * @param event Mouse event
     */
    protected deletePromptFragmentCustomization = async (customization: CustomizedPromptFragment, event: React.MouseEvent): Promise<void> => {
        event.stopPropagation();

        // First get the customization type and description to show in the confirmation dialog
        const type = await this.promptService.getCustomizationType(customization.id, customization.customizationId) || '';
        const description = await this.promptService.getCustomizationDescription(customization.id, customization.customizationId) || '';

        const dialog = new ConfirmDialog({
            title: 'Remove Customization',
            msg: `Are you sure you want to remove the ${type} customization for prompt fragment "${customization.id}"${description ? ` (${description})` : ''}?`,
            ok: 'Remove',
            cancel: 'Cancel'
        });

        const shouldDelete = await dialog.open();
        if (shouldDelete) {
            await this.promptService.removeCustomization(customization.id, customization.customizationId);
        }
    };

    /**
     * Removes all prompt customizations (resets to built-in versions) with confirmation
     */
    protected removeAllCustomizations = async (): Promise<void> => {
        const dialog = new ConfirmDialog({
            title: 'Reset All Customizations',
            msg: 'Are you sure you want to reset all prompt fragments to their built-in versions? This will remove all customizations.',
            ok: 'Reset All',
            cancel: 'Cancel'
        });

        const shouldReset = await dialog.open();
        if (shouldReset) {
            this.promptFragmentMap.forEach(fragments => {
                this.promptService.resetToBuiltIn(fragments[0].id);
            });
        }
    };

    /**
     * Main render method for the widget
     * @returns Complete UI for the configuration widget
     */
    protected render(): React.ReactNode {
        const nonSystemPromptFragments = this.getNonSystemPromptFragments();

        return (
            <div className='ai-prompt-fragments-configuration'>
                <div className="prompt-fragments-header">
                    <h2>Prompt Fragments</h2>
                    <div className="global-actions">
                        <button
                            className="global-action-button"
                            onClick={this.removeAllCustomizations}
                            title="Reset all customizations"
                        >
                            Reset all prompt fragments <span className={codicon('clear-all')}></span>
                        </button>
                    </div>
                </div>

                <div className="system-prompts-container">
                    <h3 className="section-header">System Prompts</h3>
                    {Array.from(this.systemPromptsMap.entries()).map(([systemPromptId, variantIds]) =>
                        this.renderSystemPrompt(systemPromptId, variantIds)
                    )}
                </div>

                {nonSystemPromptFragments.size > 0 && <div className="prompt-fragments-container">
                    <h3 className="section-header">Other Prompt Fragments</h3>
                    {Array.from(nonSystemPromptFragments.entries()).map(([promptFragmentId, fragments]) =>
                        this.renderPromptFragment(promptFragmentId, fragments)
                    )}
                </div>}

                {this.promptFragmentMap.size === 0 && (
                    <div className="no-fragments">
                        <p>No prompt fragments available.</p>
                    </div>
                )}
            </div>
        );
    }

    /**
     * Renders a system prompt with its variants
     * @param systemPromptId ID of the system prompt
     * @param variantIds Array of variant IDs
     * @returns React node for the system prompt group
     */
    protected renderSystemPrompt(systemPromptId: string, variantIds: string[]): React.ReactNode {
        const isSectionExpanded = this.expandedSystemPromptIds.has(systemPromptId);

        // Get active and default variant IDs from our class properties
        const activeVariantId = this.activeVariantIds.get(systemPromptId);
        const defaultVariantId = this.defaultVariantIds.get(systemPromptId);

        // Get variant fragments grouped by ID
        const variantGroups = new Map<string, PromptFragment[]>();

        // First, collect all actual fragments for each variant ID
        for (const variantId of variantIds) {
            if (this.promptFragmentMap.has(variantId)) {
                variantGroups.set(variantId, this.promptFragmentMap.get(variantId)!);
            }
        }

        const relatedAgents = this.getAgentsUsingSystemPromptId(systemPromptId);

        return (
            <div className="prompt-fragment-section" key={`system-${systemPromptId}`}>
                <div
                    className={`prompt-fragment-header ${isSectionExpanded ? 'expanded' : ''}`}
                    onClick={() => this.toggleSystemPromptExpansion(systemPromptId)}
                >
                    <div className="prompt-fragment-title">
                        <span className="expansion-icon">{isSectionExpanded ? '▼' : '▶'}</span>
                        <h2>{systemPromptId}</h2>
                    </div>
                    {relatedAgents.length > 0 && (
                        <div className="agent-chips-container">
                            {relatedAgents.map(agent => (
                                <span key={agent.id} className="agent-chip" title={`Used by agent: ${agent.name}`} onClick={e => e.stopPropagation()}>
                                    <span className={codicon('copilot')}></span>
                                    {agent.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {isSectionExpanded && (
                    <div className="prompt-fragment-body">
                        <div className="prompt-fragment-description">
                            <p>Variants of this system prompt:</p>
                        </div>
                        {Array.from(variantGroups.entries()).map(([variantId, fragments]) => {
                            const isVariantExpanded = this.expandedPromptFragmentIds.has(variantId);

                            return (
                                <div key={variantId} className={`prompt-fragment-section ${activeVariantId === variantId ? 'active-variant' : ''}`}>
                                    <div
                                        className={`prompt-fragment-header ${isVariantExpanded ? 'expanded' : ''}`}
                                        onClick={() => this.togglePromptFragmentExpansion(variantId)}
                                    >
                                        <div className="prompt-fragment-title">
                                            <span className="expansion-icon">{isVariantExpanded ? '▼' : '▶'}</span>
                                            <h4>{variantId}</h4>
                                            {defaultVariantId === variantId && (
                                                <span className="badge default-variant" title="Default variant">Default</span>
                                            )}
                                            {activeVariantId === variantId && (
                                                <span className="active-indicator" title="Active variant">Active</span>
                                            )}
                                        </div>
                                    </div>
                                    {isVariantExpanded && (
                                        <div className='prompt-fragment-body'>
                                            <div className="prompt-fragment-description">
                                                <p>Customizations of this prompt fragment:</p>
                                            </div>
                                            {fragments.map(fragment => this.renderPromptFragmentCustomization(fragment))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    /**
     * Gets fragments that aren't part of any system prompt
     * @returns Map of fragment IDs to their customizations
     */
    protected getNonSystemPromptFragments(): Map<string, PromptFragment[]> {
        const nonSystemPromptFragments = new Map<string, PromptFragment[]>();
        const allVariantIds = new Set<string>();

        // Collect all variant IDs from system prompts
        this.systemPromptsMap.forEach((variants, _) => {
            variants.forEach(variantId => allVariantIds.add(variantId));
        });

        // Add system prompt main IDs
        this.systemPromptsMap.forEach((_, systemPromptId) => {
            allVariantIds.add(systemPromptId);
        });

        // Filter the fragment map to only include non-system prompt fragments
        this.promptFragmentMap.forEach((fragments, promptFragmentId) => {
            if (!allVariantIds.has(promptFragmentId)) {
                nonSystemPromptFragments.set(promptFragmentId, fragments);
            }
        });

        return nonSystemPromptFragments;
    }

    /**
     * Renders a prompt fragment with all of its customizations
     * @param promptFragmentId ID of the prompt fragment
     * @param customizations Array of the customizations
     * @returns React node for the prompt fragment
     */
    protected renderPromptFragment(promptFragmentId: string, customizations: PromptFragment[]): React.ReactNode {
        const isSectionExpanded = this.expandedPromptFragmentIds.has(promptFragmentId);

        return (
            <div className={'prompt-fragment-group'} key={promptFragmentId}>
                <div
                    className={`prompt-fragment-header ${isSectionExpanded ? 'expanded' : ''}`}
                    onClick={() => this.togglePromptFragmentExpansion(promptFragmentId)}
                >
                    <div className="prompt-fragment-title">
                        <span className="expansion-icon">{isSectionExpanded ? '▼' : '▶'}</span>
                        {promptFragmentId}
                    </div>
                </div>
                {isSectionExpanded && (
                    <div className="prompt-fragment-body">
                        {customizations.map(fragment => this.renderPromptFragmentCustomization(fragment))}
                    </div>
                )}
            </div>
        );
    }

    /**
     * Renders a single prompt fragment customization with its controls and content
     * @param promptFragment The prompt fragment to render
     * @returns React node for the prompt fragment
     */
    protected renderPromptFragmentCustomization(promptFragment: PromptFragment): React.ReactNode {
        const isCustomized = isCustomizedPromptFragment(promptFragment);
        const isActive = this.isActiveCustomization(promptFragment);
        // Create a unique key for this fragment to track expansion state
        const fragmentKey = `${promptFragment.id}_${isCustomized ? promptFragment.customizationId : 'built-in'}`;
        const isTemplateExpanded = this.expandedPromptFragmentTemplates.has(fragmentKey);

        return (
            <div
                className={`prompt-customization ${isActive ? 'active-variant' : ''}`}
                key={fragmentKey}
            >
                <div className="prompt-customization-header">
                    <div className="prompt-customization-title">
                        <React.Suspense fallback={<div>Loading...</div>}>
                            <CustomizationTypeBadge promptFragment={promptFragment} promptService={this.promptService} />
                        </React.Suspense>
                        {isActive && (
                            <span className="active-indicator" title="Active customization">Active</span>
                        )}
                    </div>
                    <div className="prompt-customization-actions">
                        {!isCustomized && (
                            <button
                                className="template-action-button config-button"
                                onClick={e => this.createPromptFragmentCustomization(promptFragment, e)}
                                title="Create Customization"
                            >
                                <span className={codicon('add')}></span>
                            </button>
                        )}
                        {isCustomized && (
                            <button
                                className="source-uri-button"
                                onClick={e => this.editPromptCustomization(promptFragment, e)}
                                title={'Edit template'}
                            >
                                <span className={codicon('edit')}></span>
                            </button>
                        )}
                        {!isActive && (
                            <button
                                className="template-action-button reset-button"
                                onClick={e => this.resetToPromptFragment(promptFragment, e)}
                                title={`Reset to this ${!isCustomized ? 'built-in' : 'customization'}`}
                            >
                                <span className={codicon('discard')}></span>
                            </button>
                        )}
                        {isCustomized && (
                            <button
                                className="template-action-button delete-button"
                                onClick={e => this.deletePromptFragmentCustomization(promptFragment, e)}
                                title="Delete Customization"
                            >
                                <span className={codicon('trash')}></span>
                            </button>
                        )}
                    </div>
                </div>

                {isCustomized && (
                    <React.Suspense fallback={<div>Loading...</div>}>
                        <DescriptionBadge promptFragment={promptFragment} promptService={this.promptService} />
                    </React.Suspense>
                )}

                <div className="template-content-container">
                    <div
                        className="template-toggle-button"
                        onClick={e => this.toggleTemplateExpansion(fragmentKey, e)}
                    >
                        <span className="template-expansion-icon">{isTemplateExpanded ? '▼' : '▶'}</span>
                        <span>Prompt Template Text</span>
                    </div>

                    {isTemplateExpanded && (
                        <div className="template-content">
                            <pre>{promptFragment.template}</pre>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

/**
 * Props for the CustomizationTypeBadge component
 */
interface CustomizationTypeBadgeProps {
    promptFragment: PromptFragment;
    promptService: PromptService;
}

/**
 * Displays a badge indicating the type of a prompt fragment customization (built-in, user, workspace)
 */
const CustomizationTypeBadge: React.FC<CustomizationTypeBadgeProps> = ({ promptFragment, promptService }) => {
    const [typeLabel, setTypeLabel] = React.useState<string>('unknown');

    React.useEffect(() => {
        const fetchCustomizationType = async () => {
            if (isCustomizedPromptFragment(promptFragment)) {
                const customizationType = await promptService.getCustomizationType(promptFragment.id, promptFragment.customizationId);
                setTypeLabel(`${customizationType ? customizationType + ' customization' : 'Customization'}`);
            } else {
                setTypeLabel('Built-in');
            }
        };

        fetchCustomizationType();
    }, [promptFragment, promptService]);

    return <span>{typeLabel}</span>;
};

/**
 * Props for the DescriptionBadge component
 */
interface CustomizationDescriptionBadgeProps {
    promptFragment: CustomizedPromptFragment;
    promptService: PromptService;
}

/**
 * Displays the description of a customized prompt fragment if available
 */
const DescriptionBadge: React.FC<CustomizationDescriptionBadgeProps> = ({ promptFragment, promptService }) => {
    const [description, setDescription] = React.useState<string>('');

    React.useEffect(() => {
        const fetchDescription = async () => {
            const customizationDescription = await promptService.getCustomizationDescription(
                promptFragment.id,
                promptFragment.customizationId
            );
            setDescription(customizationDescription || '');
        };

        fetchDescription();
    }, [promptFragment.id, promptFragment.customizationId, promptService]);

    return <span className="prompt-customization-description">{description}</span>;
};
