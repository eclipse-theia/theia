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

import '../../src/browser/style/session-storage-preference.css';

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { codicon } from '@theia/core/lib/browser';
import { Path } from '@theia/core/lib/common/path';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import {
    PreferenceLeafNodeRenderer,
    PreferenceNodeRenderer
} from '@theia/preferences/lib/browser/views/components/preference-node-renderer';
import { PreferenceLeafNodeRendererContribution } from '@theia/preferences/lib/browser/views/components/preference-node-renderer-creator';
import { Preference } from '@theia/preferences/lib/browser/util/preference-types';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import {
    SessionStorageScope,
    SessionStorageTypeDetails,
    SessionStorageValue
} from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { SessionStorageDefaultsProvider } from '@theia/ai-chat/lib/browser/session-storage-defaults-provider';
import debounce = require('@theia/core/shared/lodash.debounce');

/**
 * Callbacks provided by the renderer to delegates for preference management.
 */
export interface InputRowDelegateContext {
    getValue(): SessionStorageValue;
    /** Set preference with debounce. Pass the full value; defaults will be stripped automatically. */
    setPreferenceDebounced(value: SessionStorageValue): void;
    /** Set preference immediately. Pass the full value; defaults will be stripped automatically. */
    setPreferenceImmediately(value: SessionStorageValue): void;
    updateResetButtonStates(): void;
    handleValueChange(): void;
    flushDebouncedPreference(): void;
}

/**
 * Delegate interface that encapsulates the behavior for a path input row,
 * avoiding fieldId-based switching in the renderer.
 */
export interface InputRowDelegate {
    /** Get the input element for this row */
    getInput(): HTMLInputElement | undefined;
    /** Set the input element for this row */
    setInput(input: HTMLInputElement): void;
    /** Get the default value for this path */
    getDefaultValue(): string;
    /** Check if this input should be active for the given scope */
    isActiveForScope(scope: SessionStorageScope): boolean;
    /** Get the current path value from a preference value */
    getPathFromValue(value: SessionStorageValue): string;
    /** Handle input change event */
    handleInputChange(): void;
    /** Handle input blur event */
    handleInputBlur(): void;
    /** Handle reset button click */
    handleReset(): void;
    /** Update the reset button disabled state */
    updateResetButtonState(currentValue: SessionStorageValue): void;
    /** Sync input value from preference if not focused */
    syncFromPreference(value: SessionStorageValue): void;
    /** Set the message element for this row (used for errors and info) */
    setMessageElement(element: HTMLElement): void;
    /** Get the message element for this row */
    getMessageElement(): HTMLElement | undefined;
    /** Set the row element for this input */
    setRow(row: HTMLElement): void;
    /** Get the row element for this input */
    getRow(): HTMLElement | undefined;
    /** Validate the input value. Returns error message or undefined if valid */
    validate(value: string): string | undefined;
    /** Get the info message to show when this path is not active for the current scope */
    getInactiveInfoMessage(): string;
}

@injectable()
export class SessionStoragePreferenceRenderer extends PreferenceLeafNodeRenderer<SessionStorageValue, HTMLDivElement> {

    @inject(SessionStorageDefaultsProvider)
    protected readonly defaultsProvider: SessionStorageDefaultsProvider;

    protected scopeSelectRef = React.createRef<SelectComponent>();
    protected expandedSection: HTMLDivElement;
    protected disclosureButton: HTMLElement;
    protected isExpanded = false;
    protected reactRoot: Root;

    protected delegateContext: InputRowDelegateContext = this.createDelegateContext();
    protected workspacePathDelegate: InputRowDelegate = this.createWorkspacePathDelegate();
    protected globalPathDelegate: InputRowDelegate = this.createGlobalPathDelegate();

    /**
     * Initialize dynamic defaults asynchronously. This is called lazily when the UI is created,
     * not in @postConstruct() to avoid issues with InversifyJS synchronous instantiation.
     */
    protected async initDynamicDefaults(): Promise<void> {
        await this.defaultsProvider.initialize();
        this.updatePlaceholders();
    }

    protected updatePlaceholders(): void {
        // Update placeholder texts with computed defaults
        const workspaceInput = this.workspacePathDelegate.getInput();
        if (workspaceInput) {
            workspaceInput.placeholder = this.defaultsProvider.getDefaultWorkspacePath();
        }
        const globalInput = this.globalPathDelegate.getInput();
        if (globalInput) {
            globalInput.placeholder = this.defaultsProvider.getDefaultGlobalPath();
        }
    }

    protected createDelegateContext(): InputRowDelegateContext {
        return {
            getValue: () => this.getValueWithDefaults(),
            setPreferenceDebounced: value => this.debouncedSetPreference(this.stripDefaultValues(value) as SessionStorageValue | undefined),
            setPreferenceImmediately: value => this.setPreferenceImmediately(this.stripDefaultValues(value) as SessionStorageValue | undefined),
            updateResetButtonStates: () => this.updateResetButtonStates(),
            handleValueChange: () => this.handleValueChange(),
            flushDebouncedPreference: () => this.debouncedSetPreference.flush()
        };
    }

    /**
     * Get the current preference value merged with dynamic defaults.
     * This handles the case where sparse serialization stores only non-default properties.
     */
    protected getValueWithDefaults(): SessionStorageValue {
        return this.defaultsProvider.mergeWithDefaults(this.getValue() ?? undefined);
    }

    /**
     * Strip properties that have their default values from the preference object.
     * This ensures that only non-default values are written to settings.json.
     * Returns undefined if all values are at their defaults (so the preference is removed entirely).
     */
    protected stripDefaultValues(value: SessionStorageValue): Partial<SessionStorageValue> | undefined {
        const defaultScope: SessionStorageScope = 'workspace';
        const result: Partial<SessionStorageValue> = {};
        let hasNonDefault = false;

        if (value.scope !== defaultScope) {
            result.scope = value.scope;
            hasNonDefault = true;
        }

        if (value.workspacePath !== this.defaultsProvider.getDefaultWorkspacePath()) {
            result.workspacePath = value.workspacePath;
            hasNonDefault = true;
        }

        if (value.globalPath !== this.defaultsProvider.getDefaultGlobalPath()) {
            result.globalPath = value.globalPath;
            hasNonDefault = true;
        }

        return hasNonDefault ? result : undefined;
    }

    protected createWorkspacePathDelegate(): InputRowDelegate {
        return this.createPathDelegate(
            () => this.defaultsProvider.getDefaultWorkspacePath(),
            scope => scope === 'workspace',
            value => value.workspacePath,
            (currentValue, newInputValue) => ({ ...currentValue, workspacePath: newInputValue }),
            (value: string) => {
                if (!value.trim()) {
                    return SessionStorageValue.Labels.pathRequired();
                }
                const path = new Path(value);
                if (path.isAbsolute) {
                    return SessionStorageValue.Labels.workspacePathInvalidRelative();
                }
                // Check for workspace escape: normalize and check for leading ..
                const normalized = path.normalize();
                if (normalized.toString().startsWith('..')) {
                    return SessionStorageValue.Labels.workspacePathEscapesWorkspace();
                }
                return undefined;
            },
            () => SessionStorageValue.Labels.pathNotUsedForScope(SessionStorageValue.Labels.scopeGlobal())
        );
    }

    protected createGlobalPathDelegate(): InputRowDelegate {
        return this.createPathDelegate(
            () => this.defaultsProvider.getDefaultGlobalPath(),
            scope => scope === 'global',
            value => value.globalPath,
            (currentValue, newInputValue) => ({ ...currentValue, globalPath: newInputValue }),
            (value: string) => {
                if (!value.trim()) {
                    return SessionStorageValue.Labels.pathRequired();
                }
                const path = new Path(value);
                if (!path.isAbsolute) {
                    return SessionStorageValue.Labels.globalPathInvalidAbsolute();
                }
                return undefined;
            },
            () => SessionStorageValue.Labels.pathNotUsedForScope(SessionStorageValue.Labels.scopeWorkspace())
        );
    }

    /** Create a delegate to handle UI interactions in the storage path input for one of the supported scopes. */
    protected createPathDelegate(
        getDefaultValue: () => string,
        isActiveForScope: (scope: SessionStorageScope) => boolean,
        getPathFromValue: (value: SessionStorageValue) => string,
        updatePreferenceValue: (currentValue: SessionStorageValue, newInputValue: string) => SessionStorageValue,
        validateFn: (value: string) => string | undefined,
        getInactiveInfoMessage: () => string
    ): InputRowDelegate {
        let input: HTMLInputElement | undefined;
        let messageElement: HTMLElement | undefined;
        let row: HTMLElement | undefined;
        const context = this.delegateContext;

        const showMessage = (message: string, severity: 'error' | 'info'): void => {
            if (messageElement && row) {
                messageElement.textContent = message;
                messageElement.classList.remove('error', 'info');
                messageElement.classList.add(severity);
                if (!messageElement.parentElement) {
                    row.appendChild(messageElement);
                }
            }
        };

        const hideMessage = (): void => {
            messageElement?.remove();
        };

        /** Update the message based on validation and scope */
        const updateMessage = (scope: SessionStorageScope): void => {
            if (!input) {
                return;
            }
            const error = validateFn(input.value);
            if (error) {
                showMessage(error, 'error');
            } else if (!isActiveForScope(scope)) {
                showMessage(getInactiveInfoMessage(), 'info');
            } else {
                hideMessage();
            }
        };

        return {
            getInput: () => input,
            setInput: (element: HTMLInputElement) => { input = element; },
            getDefaultValue,
            isActiveForScope,
            getPathFromValue,
            setMessageElement: (element: HTMLElement) => { messageElement = element; },
            getMessageElement: () => messageElement,
            getInactiveInfoMessage,
            setRow: (element: HTMLElement) => { row = element; },
            getRow: () => row,
            validate: validateFn,

            handleInputChange: () => {
                if (!input) {
                    return;
                }
                const currentValue = context.getValue();
                const error = validateFn(input.value);
                if (error) {
                    showMessage(error, 'error');
                } else {
                    // Update message (may show info or hide)
                    updateMessage(currentValue.scope);
                    // Only update preference if valid
                    const newValue = updatePreferenceValue(currentValue, input.value);
                    context.setPreferenceDebounced(newValue);
                }
                context.updateResetButtonStates();
            },

            handleInputBlur: () => {
                context.flushDebouncedPreference();
                context.handleValueChange();
            },

            handleReset: () => {
                if (!input) {
                    return;
                }
                const defaultValue = getDefaultValue();
                input.value = defaultValue;

                const currentValue = context.getValue();
                updateMessage(currentValue.scope);

                const newValue = updatePreferenceValue(currentValue, defaultValue);
                context.setPreferenceImmediately(newValue);
                context.updateResetButtonStates();
            },

            updateResetButtonState: (currentValue: SessionStorageValue) => {
                if (!input) {
                    return;
                }
                const resetButton = row?.querySelector('.session-storage-reset-button') as HTMLButtonElement | null;
                if (resetButton) {
                    const isDefault = input.value === getDefaultValue();
                    resetButton.disabled = isDefault;
                }
            },

            syncFromPreference: (value: SessionStorageValue) => {
                if (input) {
                    if (document.activeElement !== input) {
                        input.value = getPathFromValue(value);
                    }
                    updateMessage(value.scope);
                }
            }
        };
    }

    protected get scopeOptions(): SelectOption[] {
        return [
            {
                value: 'workspace',
                label: SessionStorageValue.Labels.scopeWorkspace(),
                detail: 'default',
                description: SessionStorageValue.Labels.scopeWorkspaceDescription()
            },
            {
                value: 'global',
                label: SessionStorageValue.Labels.scopeGlobal(),
                description: SessionStorageValue.Labels.scopeGlobalDescription()
            }
        ];
    }

    protected createInteractable(parent: HTMLElement): void {
        // Initialize dynamic defaults asynchronously - will update UI when ready
        this.initDynamicDefaults();

        const container = document.createElement('div');
        container.classList.add('session-storage-preference-container');
        this.interactable = container;

        // Scope dropdown section
        const scopeSection = document.createElement('div');
        scopeSection.classList.add('session-storage-scope-section');

        const scopeSelectContainer = document.createElement('div');
        scopeSelectContainer.classList.add('session-storage-scope-select');
        scopeSection.appendChild(scopeSelectContainer);

        const currentValue = this.getValue();
        const selectedIndex = currentValue?.scope === 'global' ? 1 : 0;

        const selectComponent = React.createElement(SelectComponent, {
            options: this.scopeOptions,
            defaultValue: selectedIndex,
            onChange: (option, index) => this.onScopeSelectionChange(option.value as SessionStorageScope),
            ref: this.scopeSelectRef
        });

        this.reactRoot = createRoot(scopeSelectContainer);
        this.reactRoot.render(selectComponent);

        container.appendChild(scopeSection);

        // Disclosure triangle and expanded section
        const disclosureRow = document.createElement('div');
        disclosureRow.classList.add('session-storage-disclosure-row');

        this.disclosureButton = document.createElement('span');
        this.disclosureButton.classList.add('session-storage-disclosure-button');
        this.disclosureButton.innerHTML = `<i class="${codicon('chevron-right')}"></i>`;
        this.disclosureButton.onclick = () => this.toggleExpanded();
        this.disclosureButton.setAttribute('role', 'button');
        this.disclosureButton.setAttribute('tabindex', '0');
        this.disclosureButton.onkeydown = e => {
            if (e.key === 'Enter' || e.key === ' ') {
                this.toggleExpanded();
                e.preventDefault();
            }
        };
        disclosureRow.appendChild(this.disclosureButton);

        const disclosureLabel = document.createElement('span');
        disclosureLabel.classList.add('session-storage-disclosure-label');
        disclosureLabel.textContent = SessionStorageValue.Labels.pathSettings();
        disclosureLabel.onclick = () => this.toggleExpanded();
        disclosureRow.appendChild(disclosureLabel);

        container.appendChild(disclosureRow);

        // Expanded section with path inputs
        this.expandedSection = document.createElement('div');
        this.expandedSection.classList.add('session-storage-expanded-section', 'hidden');

        // Workspace path input
        const workspacePathRow = this.createPathInputRow(
            this.workspacePathDelegate,
            SessionStorageValue.Labels.workspacePathLabel(),
            SessionStorageValue.Labels.workspacePathDescription(),
            currentValue?.workspacePath ?? this.workspacePathDelegate.getDefaultValue(),
            !this.workspacePathDelegate.isActiveForScope(currentValue?.scope ?? 'workspace'),
            this.defaultsProvider.getDefaultWorkspacePath()
        );
        this.expandedSection.appendChild(workspacePathRow);

        // Global path input
        const globalPathRow = this.createPathInputRow(
            this.globalPathDelegate,
            SessionStorageValue.Labels.globalPathLabel(),
            SessionStorageValue.Labels.globalPathDescription(),
            currentValue?.globalPath ?? this.globalPathDelegate.getDefaultValue(),
            !this.globalPathDelegate.isActiveForScope(currentValue?.scope ?? 'workspace'),
            this.defaultsProvider.getDefaultGlobalPath()
        );
        this.expandedSection.appendChild(globalPathRow);

        container.appendChild(this.expandedSection);

        parent.appendChild(container);
    }

    /** Create a row for input of the storage path for one of the supported scopes. */
    protected createPathInputRow(
        delegate: InputRowDelegate,
        label: string,
        description: string,
        value: string,
        isInactive: boolean,
        placeholder: string
    ): HTMLDivElement {
        const row = document.createElement('div');
        row.classList.add('session-storage-path-row');

        const labelElement = document.createElement('label');
        labelElement.classList.add('session-storage-path-label');
        labelElement.textContent = label;
        row.appendChild(labelElement);

        const descriptionElement = document.createElement('span');
        descriptionElement.classList.add('session-storage-path-description');
        descriptionElement.textContent = description;
        row.appendChild(descriptionElement);

        const inputContainer = document.createElement('div');
        inputContainer.classList.add('session-storage-path-input-container');

        const input = document.createElement('input');
        input.type = 'text';
        input.classList.add('theia-input', 'session-storage-path-input');
        input.value = value;
        input.placeholder = placeholder;
        input.oninput = () => delegate.handleInputChange();
        input.onblur = () => delegate.handleInputBlur();

        delegate.setInput(input);

        inputContainer.appendChild(input);

        // Reset button
        const resetButton = document.createElement('button');
        resetButton.classList.add('theia-button', 'session-storage-reset-button');
        resetButton.title = SessionStorageValue.Labels.resetToDefault();
        resetButton.innerHTML = `<i class="${codicon('discard')}"></i>`;
        resetButton.disabled = value === delegate.getDefaultValue();
        resetButton.onclick = () => delegate.handleReset();
        inputContainer.appendChild(resetButton);

        // Message element for errors and info (with severity class)
        const messageElement = document.createElement('div');
        messageElement.classList.add('session-storage-message');
        delegate.setMessageElement(messageElement);

        delegate.setRow(row);

        row.appendChild(inputContainer);

        // Show info message initially if this path is not active for the current scope
        if (isInactive) {
            messageElement.textContent = delegate.getInactiveInfoMessage();
            messageElement.classList.add('info');
            row.appendChild(messageElement);
        }

        return row;
    }

    protected toggleExpanded(): void {
        this.isExpanded = !this.isExpanded;
        if (this.isExpanded) {
            this.expandedSection.classList.remove('hidden');
            this.disclosureButton.innerHTML = `<i class="${codicon('chevron-down')}"></i>`;
        } else {
            this.expandedSection.classList.add('hidden');
            this.disclosureButton.innerHTML = `<i class="${codicon('chevron-right')}"></i>`;
        }
    }

    protected onScopeSelectionChange(newScope: SessionStorageScope): void {
        const currentValue = this.getValueWithDefaults();
        const newValue: SessionStorageValue = {
            ...currentValue,
            scope: newScope
        };
        this.setPreferenceImmediately(this.stripDefaultValues(newValue) as SessionStorageValue | undefined);

        this.updateInputActiveStates(newScope);
        this.updateResetButtonStates();
    }

    protected updateInputActiveStates(scope: SessionStorageScope): void {
        const value = this.getValueWithDefaults();
        for (const delegate of this.getInputRowDelegates()) {
            delegate.syncFromPreference(value);
        }
    }

    protected getInputRowDelegates(): InputRowDelegate[] {
        return [this.workspacePathDelegate, this.globalPathDelegate];
    }

    protected debouncedSetPreference = debounce((value: SessionStorageValue | undefined) => {
        this.setPreferenceImmediately(value);
    }, 500, { leading: false, trailing: true });

    protected updateResetButtonStates(): void {
        const currentValue = this.getValueWithDefaults();

        for (const delegate of this.getInputRowDelegates()) {
            delegate.updateResetButtonState(currentValue);
        }
    }

    protected getFallbackValue(): SessionStorageValue {
        return this.defaultsProvider.getDefaultValue();
    }

    protected doHandleValueChange(): void {
        this.updateInspection();
        const newValue = this.getValueWithDefaults();
        this.updateModificationStatus(newValue);

        // Update scope dropdown
        if (this.scopeSelectRef.current) {
            const selectedIndex = newValue.scope === 'global' ? 1 : 0;
            this.scopeSelectRef.current.value = selectedIndex;
        }

        // Update path inputs if not focused, and update enabled states
        for (const delegate of this.getInputRowDelegates()) {
            delegate.syncFromPreference(newValue);
        }

        this.updateResetButtonStates();
    }

    override dispose(): void {
        this.debouncedSetPreference.cancel();
        if (this.reactRoot) {
            this.reactRoot.unmount();
        }
        super.dispose();
    }
}

@injectable()
export class SessionStoragePreferenceRendererContribution extends PreferenceLeafNodeRendererContribution {
    static ID = 'session-storage-preference-renderer';
    id = SessionStoragePreferenceRendererContribution.ID;

    canHandleLeafNode(node: Preference.LeafNode): number {
        const typeDetails = node.preference.data.typeDetails;
        return SessionStorageTypeDetails.is(typeDetails) ? 10 : 0;
    }

    createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer {
        return container.get(SessionStoragePreferenceRenderer);
    }
}
