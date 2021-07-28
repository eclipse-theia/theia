/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { PreferenceService, ContextMenuRenderer, PreferenceInspection, PreferenceScope, PreferenceProvider } from '@theia/core/lib/browser';
import { Preference, PreferenceMenus } from '../../util/preference-types';
import { PreferenceTreeLabelProvider } from '../../util/preference-tree-label-provider';
import { PreferencesScopeTabBar } from '../preference-scope-tabbar-widget';
import { Disposable } from '@theia/core/lib/common';
import { JSONValue } from '@theia/core/shared/@phosphor/coreutils';
import debounce = require('@theia/core/shared/lodash.debounce');
import { PreferenceTreeModel } from '../../preference-tree-model';
import { PreferencesSearchbarWidget } from '../preference-searchbar-widget';

export const PreferenceNodeRendererFactory = Symbol('PreferenceNodeRendererFactory');
export type PreferenceNodeRendererFactory = (node: Preference.TreeNode) => PreferenceNodeRenderer;
export const HEADER_CLASS = 'settings-section-category-title';
export const SUBHEADER_CLASS = 'settings-section-subcategory-title';

export interface GeneralPreferenceNodeRenderer extends Disposable {
    node: HTMLElement;
    id: string;
    group: string;
    nodeId: string;
    visible: boolean;
    insertBefore(nextSibling: HTMLElement): void;
    insertAfter(previousSibling: HTMLElement): void;
    appendTo(parent: HTMLElement): void;
    prependTo(parent: HTMLElement): void;
    handleValueChange?(): void;
    handleSearchChange?(isFiltered?: boolean): void;
    handleScopeChange?(isFiltered?: boolean): void;
    hide(): void;
    show(): void;
}

@injectable()
export abstract class PreferenceNodeRenderer implements Disposable, GeneralPreferenceNodeRenderer {
    @inject(Preference.Node) protected readonly preferenceNode: Preference.Node;
    @inject(PreferenceTreeLabelProvider) protected readonly labelProvider: PreferenceTreeLabelProvider;

    protected attached = false;

    _id: string;
    _group: string;
    _subgroup: string;
    protected domNode: HTMLElement;

    get node(): HTMLElement {
        return this.domNode;
    }

    get nodeId(): string {
        return this.preferenceNode.id;
    }

    get id(): string {
        return this._id;
    }

    get group(): string {
        return this._group;
    }

    get visible(): boolean {
        return !this.node.classList.contains('hidden');
    }

    @postConstruct()
    protected init(): void {
        this.setId();
        this.domNode = this.createDomNode();
    }

    protected setId(): void {
        const { id, group } = Preference.TreeNode.getGroupAndIdFromNodeId(this.preferenceNode.id);
        const segments = id.split('.');
        this._id = id;
        this._group = group;
        this._subgroup = (group === segments[0] ? segments[1] : segments[0]) ?? '';
    }

    protected abstract createDomNode(): HTMLElement;

    insertBefore(nextSibling: HTMLElement): void {
        nextSibling.insertAdjacentElement('beforebegin', this.domNode);
        this.attached = true;
    }

    insertAfter(previousSibling: HTMLElement): void {
        previousSibling.insertAdjacentElement('afterend', this.domNode);
    }

    appendTo(parent: HTMLElement): void {
        parent.appendChild(this.domNode);
    }

    prependTo(parent: HTMLElement): void {
        parent.prepend(this.domNode);
    }

    hide(): void {
        this.domNode.classList.add('hidden');
    }

    show(): void {
        this.domNode.classList.remove('hidden');
    }

    dispose(): void {
        this.domNode.remove();
    }
}

export class PreferenceHeaderRenderer extends PreferenceNodeRenderer {
    protected createDomNode(): HTMLElement {
        const wrapper = document.createElement('ul');
        wrapper.className = 'settings-section';
        wrapper.id = `${this.preferenceNode.id}-editor`;
        const isCategory = Preference.TreeNode.isTopLevel(this.preferenceNode);
        const hierarchyClassName = isCategory ? HEADER_CLASS : SUBHEADER_CLASS;
        const name = this.labelProvider.getName(this.preferenceNode);
        const label = document.createElement('li');
        label.classList.add('settings-section-title', hierarchyClassName);
        label.textContent = name;
        wrapper.appendChild(label);
        return wrapper;
    }
}

@injectable()
export abstract class PreferenceLeafNodeRenderer<ValueType extends JSONValue, InteractableType extends HTMLElement>
    extends PreferenceNodeRenderer
    implements Required<GeneralPreferenceNodeRenderer> {
    @inject(Preference.Node) protected readonly preferenceNode: Preference.LeafNode;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(ContextMenuRenderer) protected readonly menuRenderer: ContextMenuRenderer;
    @inject(PreferencesScopeTabBar) protected readonly scopeTracker: PreferencesScopeTabBar;
    @inject(PreferenceTreeModel) protected readonly model: PreferenceTreeModel;
    @inject(PreferencesSearchbarWidget) protected readonly searchbar: PreferencesSearchbarWidget;

    protected headlineWrapper: HTMLDivElement;
    protected gutter: HTMLDivElement;
    protected interactable: InteractableType;
    protected inspection: PreferenceInspection<ValueType> | undefined;
    protected isModifiedFromDefault = false;

    @postConstruct()
    protected init(): void {
        this.setId();
        this.updateInspection();
        this.domNode = this.createDomNode();
        this.updateModificationStatus();
    }

    protected updateInspection(): void {
        this.inspection = this.preferenceService.inspect<ValueType>(this.id, this.scopeTracker.currentScope.uri);
    }

    protected createDomNode(): HTMLLIElement {
        const wrapper = document.createElement('li');
        wrapper.classList.add('single-pref');
        wrapper.id = `${this.id}-editor`;
        wrapper.setAttribute('data-pref-id', this.id);
        wrapper.setAttribute('data-node-id', this.preferenceNode.id);

        const headlineWrapper = document.createElement('div');
        headlineWrapper.classList.add('pref-name');
        headlineWrapper.title = this.id;
        this.headlineWrapper = headlineWrapper;
        wrapper.appendChild(headlineWrapper);

        this.updateHeadline();

        const gutter = document.createElement('div');
        gutter.classList.add('pref-context-gutter');
        this.gutter = gutter;
        wrapper.appendChild(gutter);

        const cog = document.createElement('i');
        cog.className = 'codicon codicon-settings-gear settings-context-menu-btn';
        cog.setAttribute('aria-label', 'Open Context Menu');
        cog.setAttribute('role', 'button');
        cog.onclick = this.handleCogAction.bind(this);
        cog.onkeydown = this.handleCogAction.bind(this);
        cog.title = 'More actions...';
        gutter.appendChild(cog);

        const activeType = Array.isArray(this.preferenceNode.preference.data.type) ? this.preferenceNode.preference.data.type[0] : this.preferenceNode.preference.data.type;
        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('pref-content-container', activeType ?? 'open-json');
        wrapper.appendChild(contentWrapper);

        const { description, markdownDescription } = this.preferenceNode.preference.data;
        const descriptionToUse = markdownDescription || description;
        if (descriptionToUse) {
            const descriptionWrapper = document.createElement('div');
            descriptionWrapper.classList.add('pref-description');
            descriptionWrapper.textContent = descriptionToUse;
            contentWrapper.appendChild(descriptionWrapper);
        }

        const interactableWrapper = document.createElement('div');
        interactableWrapper.classList.add('pref-input');
        contentWrapper.appendChild(interactableWrapper);
        this.createInteractable(interactableWrapper);

        return wrapper;
    }

    protected handleCogAction({ currentTarget }: KeyboardEvent | MouseEvent): void {
        const value = Preference.getValueInScope(this.inspection, this.scopeTracker.currentScope.scope) ?? this.inspection?.defaultValue;
        const target = currentTarget as HTMLElement | undefined;
        if (target && value !== undefined) {
            this.showCog();
            const domRect = target.getBoundingClientRect();
            this.menuRenderer.render({
                menuPath: PreferenceMenus.PREFERENCE_EDITOR_CONTEXT_MENU,
                anchor: { x: domRect.left, y: domRect.bottom },
                args: [{ id: this.id, value }],
                onHide: () => this.hideCog()
            });
        }
    }

    protected addModifiedMarking(): void {
        this.gutter.classList.add('theia-mod-item-modified');
    }

    protected removeModifiedMarking(): void {
        this.gutter.classList.remove('theia-mod-item-modified');
    }

    protected showCog(): void {
        this.gutter.classList.add('show-cog');
    }

    protected hideCog(): void {
        this.gutter.classList.remove('show-cog');
    }

    protected updateModificationStatus(knownCurrentValue?: JSONValue): void {
        const wasModified = this.isModifiedFromDefault;
        const { inspection } = this;
        const valueInCurrentScope = knownCurrentValue ?? Preference.getValueInScope(inspection, this.scopeTracker.currentScope.scope);
        this.isModifiedFromDefault = valueInCurrentScope !== undefined && !PreferenceProvider.deepEqual(valueInCurrentScope, inspection?.defaultValue);
        if (wasModified !== this.isModifiedFromDefault) {
            this.gutter.classList.toggle('theia-mod-item-modified', this.isModifiedFromDefault);
        }
    }

    protected updateHeadline(filtered = this.model.isFiltered): void {
        const { headlineWrapper } = this;
        if (this.headlineWrapper.childElementCount === 0) {
            const name = this.labelProvider.getName(this.preferenceNode);
            const nameWrapper = document.createElement('span');
            nameWrapper.classList.add('preference-leaf-headline-name');
            nameWrapper.textContent = name;
            headlineWrapper.appendChild(nameWrapper);
        }
        const prefix = this.labelProvider.getPrefix(this.preferenceNode, filtered);
        const currentFirstChild = headlineWrapper.children[0];
        const currentFirstChildIsPrefix = currentFirstChild.classList.contains('preference-leaf-headline-prefix');
        if (prefix) {
            let prefixWrapper;
            if (currentFirstChildIsPrefix) {
                prefixWrapper = currentFirstChild;
            } else {
                prefixWrapper = document.createElement('span');
                prefixWrapper.classList.add('preference-leaf-headline-prefix');
                headlineWrapper.insertBefore(prefixWrapper, currentFirstChild);
            }
            prefixWrapper.textContent = prefix;
        } else if (currentFirstChildIsPrefix) {
            headlineWrapper.removeChild(currentFirstChild);
        }

        const currentLastChild = headlineWrapper.lastChild as HTMLElement;
        if (currentLastChild.classList.contains('preference-leaf-headline-suffix')) {
            this.compareOtherModifiedScopes(headlineWrapper, currentLastChild);
        } else {
            this.createOtherModifiedScopes(headlineWrapper);
        }
    }

    protected compareOtherModifiedScopes(headlineWrapper: HTMLDivElement, currentSuffix: HTMLElement): void {
        const modifiedScopes = this.getModifiedScopesAsStrings();
        if (modifiedScopes.length === 0) {
            headlineWrapper.removeChild(currentSuffix);
        } else {

            const modifiedMessagePrefix = currentSuffix.children[0] as HTMLElement;
            const newMessagePrefix = this.getModifiedMessagePrefix();
            if (modifiedMessagePrefix.textContent !== newMessagePrefix) {
                modifiedMessagePrefix.textContent = newMessagePrefix;
            }

            const [firstModifiedScope, secondModifiedScope] = modifiedScopes;

            const firstScopeMessage = currentSuffix.children[1] as HTMLElement;
            const secondScopeMessage = currentSuffix.children[2] as HTMLElement;
            firstScopeMessage.children[0].textContent = PreferenceScope[firstModifiedScope];
            this.addEventHandlerToModifiedScope(firstModifiedScope, firstScopeMessage.children[0] as HTMLElement);
            if (modifiedScopes.length === 1 && secondScopeMessage) {
                currentSuffix.removeChild(secondScopeMessage);
            } else if (modifiedScopes.length === 2 && !secondScopeMessage) {
                const newSecondMessage = this.createModifiedScopeMessage(secondModifiedScope);
                currentSuffix.appendChild(newSecondMessage);
            }
            // If both scopes are modified and both messages are present, do nothing.
        }
    }

    protected createOtherModifiedScopes(headlineWrapper: HTMLDivElement): void {
        const modifiedScopes = this.getModifiedScopesAsStrings();
        if (modifiedScopes.length !== 0) {
            const wrapper = document.createElement('i');
            wrapper.classList.add('preference-leaf-headline-suffix');
            headlineWrapper.appendChild(wrapper);

            const messagePrefix = this.getModifiedMessagePrefix();
            const messageWrapper = document.createElement('span');
            messageWrapper.classList.add('preference-other-modified-scope-alert');
            messageWrapper.textContent = messagePrefix;
            wrapper.appendChild(messageWrapper);
            modifiedScopes.forEach((scopeName, i) => {
                const scopeWrapper = this.createModifiedScopeMessage(scopeName);
                wrapper.appendChild(scopeWrapper);
            });
        }
    }

    protected createModifiedScopeMessage(scope: PreferenceScope): HTMLSpanElement {
        const scopeWrapper = document.createElement('span');
        scopeWrapper.classList.add('preference-modified-scope-wrapper');
        const scopeInteractable = document.createElement('span');
        scopeInteractable.classList.add('preference-scope-underlined');
        const scopeName = PreferenceScope[scope];
        this.addEventHandlerToModifiedScope(scope, scopeInteractable);
        scopeInteractable.textContent = scopeName;
        scopeWrapper.appendChild(scopeInteractable);
        return scopeWrapper;
    }

    protected getModifiedMessagePrefix(): string {
        return this.isModifiedFromDefault ? 'Also modified in: ' : 'Modified in: ';
    }

    protected addEventHandlerToModifiedScope(scope: PreferenceScope, scopeWrapper: HTMLElement): void {
        if (scope === PreferenceScope.User || scope === PreferenceScope.Workspace) {
            const eventHandler = () => {
                this.scopeTracker.setScope(scope);
                this.searchbar.updateSearchTerm(this.id);
            };
            scopeWrapper.onclick = eventHandler;
            scopeWrapper.onkeydown = eventHandler;
            scopeWrapper.tabIndex = 0;
        } else {
            scopeWrapper.onclick = null; // eslint-disable-line no-null/no-null
            scopeWrapper.onkeydown = null; // eslint-disable-line no-null/no-null
            scopeWrapper.tabIndex = -1;
        }
    }

    protected getModifiedScopesAsStrings(): PreferenceScope[] {
        const currentScopeInView = this.scopeTracker.currentScope.scope;
        const { inspection } = this;
        const modifiedScopes = [];
        if (inspection) {
            for (const otherScope of [PreferenceScope.User, PreferenceScope.Workspace]) {
                if (otherScope !== currentScopeInView) {
                    const valueInOtherScope = Preference.getValueInScope(inspection, otherScope);
                    if (valueInOtherScope !== undefined && !PreferenceProvider.deepEqual(valueInOtherScope, inspection.defaultValue)) {
                        modifiedScopes.push(otherScope);
                    }
                }
            }
        }
        return modifiedScopes;
    }

    protected getValue(): ValueType {
        let currentValue = Preference.getValueInScope(this.inspection, this.scopeTracker.currentScope.scope);
        if (currentValue === undefined) {
            currentValue = this.inspection?.defaultValue;
        }
        return currentValue ?? this.getFallbackValue();
    }

    protected setPreferenceWithDebounce = debounce(this.setPreferenceImmediately.bind(this), 500, { leading: false, trailing: true });

    protected setPreferenceImmediately(value: ValueType | undefined): Promise<void> {
        return this.preferenceService.set(this.id, value, this.scopeTracker.currentScope.scope, this.scopeTracker.currentScope.uri);
    }

    handleSearchChange(isFiltered = this.model.isFiltered): void {
        this.updateHeadline(isFiltered);
    }

    handleScopeChange(isFiltered = this.model.isFiltered): void {
        this.handleValueChange();
        this.updateHeadline(isFiltered);
    }

    handleValueChange(): void {
        this.doHandleValueChange();
        this.updateHeadline();
    }

    protected abstract createInteractable(container: HTMLElement): void;
    protected abstract getFallbackValue(): ValueType;
    protected abstract doHandleValueChange(): void;
}
