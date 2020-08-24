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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { postConstruct, injectable, inject } from 'inversify';
import * as React from 'react';
import { Disposable } from 'vscode-jsonrpc';
import {
    ReactWidget,
    PreferenceService,
    PreferenceDataProperty,
    PreferenceScope,
    CompositeTreeNode,
    SelectableTreeNode,
    PreferenceItem,
    LabelProvider,
} from '@theia/core/lib/browser';
import { Message, } from '@theia/core/lib/browser/widgets/widget';
import { SinglePreferenceDisplayFactory } from './components/single-preference-display-factory';
import { Preference } from '../util/preference-types';
import { PreferencesEventService } from '../util/preference-event-service';
import { PreferencesTreeProvider } from '../preference-tree-provider';

@injectable()
export class PreferencesEditorWidget extends ReactWidget {
    static readonly ID = 'settings.editor';
    static readonly LABEL = 'Settings Editor';

    protected properties: { [key: string]: PreferenceDataProperty; };
    protected currentDisplay: CompositeTreeNode;
    protected activeScope: number = PreferenceScope.User;
    protected activeURI: string = '';
    protected activeScopeIsFolder: boolean = false;
    protected scrollContainerRef: React.RefObject<HTMLDivElement> = React.createRef();
    protected hasRendered = false;
    protected _preferenceScope: Preference.SelectedScopeDetails = Preference.DEFAULT_SCOPE;

    @inject(PreferencesEventService) protected readonly preferencesEventService: PreferencesEventService;
    @inject(PreferenceService) protected readonly preferenceValueRetrievalService: PreferenceService;
    @inject(PreferencesTreeProvider) protected readonly preferenceTreeProvider: PreferencesTreeProvider;
    @inject(SinglePreferenceDisplayFactory) protected readonly singlePreferenceFactory: SinglePreferenceDisplayFactory;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    @postConstruct()
    protected init(): void {
        this.onRender.push(Disposable.create(() => this.hasRendered = true));
        this.id = PreferencesEditorWidget.ID;
        this.title.label = PreferencesEditorWidget.LABEL;
        this.preferenceValueRetrievalService.onPreferenceChanged((preferenceChange): void => {
            this.update();
        });
        this.preferencesEventService.onDisplayChanged.event(didChangeTree => this.handleChangeDisplay(didChangeTree));
        this.preferencesEventService.onNavTreeSelection.event(e => this.scrollToEditorElement(e.nodeID));
        this.currentDisplay = this.preferenceTreeProvider.currentTree;
        this.properties = this.preferenceTreeProvider.propertyList;
        this.update();
    }

    set preferenceScope(preferenceScopeDetails: Preference.SelectedScopeDetails) {
        this._preferenceScope = preferenceScopeDetails;
        this.handleChangeScope(this._preferenceScope);
    }

    protected callAfterFirstRender(callback: Function): void {
        if (this.hasRendered) {
            callback();
        } else {
            this.onRender.push(Disposable.create(() => callback()));
        }
    }

    protected onAfterAttach(msg: Message): void {
        this.callAfterFirstRender(() => {
            super.onAfterAttach(msg);
            this.node.addEventListener('scroll', this.onScroll);
        });
    }

    protected render(): React.ReactNode {
        const visibleCategories = this.currentDisplay.children.filter(category => category.visible);
        return (
            <div className="settings-main">
                <div ref={this.scrollContainerRef} className="settings-main-scroll-container" id="settings-main-scroll-container">
                    {!!visibleCategories.length ? visibleCategories.map(category => this.renderCategory(category as Preference.Branch)) : this.renderNoResultMessage()}
                </div>
            </div>
        );
    }

    protected handleChangeDisplay = (didGenerateNewTree: boolean): void => {
        if (didGenerateNewTree) {
            this.currentDisplay = this.preferenceTreeProvider.currentTree;
            this.properties = this.preferenceTreeProvider.propertyList;
            this.node.scrollTop = 0;
        }
        this.update();
    };

    protected onScroll = (): void => {
        const scrollContainer = this.node;
        const scrollIsTop = scrollContainer.scrollTop === 0;
        const visibleChildren: string[] = [];
        this.addFirstVisibleChildId(scrollContainer, visibleChildren);
        if (visibleChildren.length) {
            this.preferencesEventService.onEditorScroll.fire({
                firstVisibleChildId: visibleChildren[0],
                isTop: scrollIsTop
            });
        }
    };

    protected addFirstVisibleChildId(container: Element, array: string[]): void {
        const children = container.children;
        for (let i = 0; i < children.length && !array.length; i++) {
            const id = children[i].getAttribute('data-id');
            if (id && this.isInView(children[i] as HTMLElement, container as HTMLElement)) {
                array.push(id);
            } else if (!array.length) {
                this.addFirstVisibleChildId(children[i], array);
            }
        }
    }

    protected isInView(e: HTMLElement, parent: HTMLElement): boolean {
        const scrollTop = this.node.scrollTop;
        const scrollCheckHeight = 0.7;
        return this.compare(e.offsetTop).isBetween(scrollTop, scrollTop + parent.offsetHeight) ||
            this.compare(scrollTop).isBetween(e.offsetTop, e.offsetTop + (e.offsetHeight * scrollCheckHeight));
    }

    protected compare = (value: number): { isBetween: (a: number, b: number) => boolean; } => ({
        isBetween: (a: number, b: number): boolean => (
            (value >= a && value <= b) || (value >= b && value <= a)
        )
    });

    protected handleChangeScope = ({ scope, uri, activeScopeIsFolder }: Preference.SelectedScopeDetails): void => {
        this.activeScope = Number(scope);
        this.activeURI = uri;
        this.activeScopeIsFolder = activeScopeIsFolder === 'true';
        this.update();
    };

    protected renderCategory(category: Preference.Branch): React.ReactNode {
        const children = category.children.concat(category.leaves).sort((a, b) => this.sort(a.id, b.id));
        return category.visible && (
            <ul
                className="settings-section"
                key={`${category.id}-editor`}
                id={`${category.id}-editor`}
            >
                <li className="settings-section-title" data-id={category.id}>{this.labelProvider.getName(category)}</li>
                {children.map((preferenceNode: SelectableTreeNode | Preference.Branch) => {
                    if (Preference.Branch.is(preferenceNode)) {
                        return this.renderCategory(preferenceNode);
                    }
                    const values = this.preferenceValueRetrievalService.inspect<PreferenceItem>(preferenceNode.id, this.activeURI);
                    const preferenceNodeWithValueInAllScopes = { ...preferenceNode, preference: { data: this.properties[preferenceNode.id], values } };
                    return this.singlePreferenceFactory.render(preferenceNodeWithValueInAllScopes);
                })}
            </ul>
        );
    }

    protected renderNoResultMessage(): React.ReactNode {
        return <div className="settings-no-results-announcement">That search query has returned no results.</div>;
    }

    protected scrollToEditorElement(nodeID: string): void {
        if (nodeID) {
            const el = document.getElementById(`${nodeID}-editor`);
            if (el) {
                // Timeout to allow render cycle to finish.
                setTimeout(() => el.scrollIntoView());
            }
        }
    }

    /**
     * Sort two strings.
     *
     * @param a the first string.
     * @param b the second string.
     */
    protected sort(a: string, b: string): number {
        return a.localeCompare(b, undefined, { ignorePunctuation: true });
    }
}
