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
import { debounce } from 'lodash';
import { Disposable } from 'vscode-jsonrpc';
import {
    ReactWidget,
    PreferenceService,
    CompositeTreeNode,
    SelectableTreeNode,
    PreferenceItem,
    TreeNode,
    ExpandableTreeNode,
    StatefulWidget,
} from '@theia/core/lib/browser';
import { Message, } from '@theia/core/lib/browser/widgets/widget';
import { SinglePreferenceDisplayFactory } from './components/single-preference-display-factory';
import { PreferenceTreeModel, PreferenceTreeNodeRow } from '../preference-tree-model';
import { Emitter } from '@theia/core';

const HEADER_CLASS = 'settings-section-category-title';
const SUBHEADER_CLASS = 'settings-section-subcategory-title';

export interface PreferencesEditorState {
    firstVisibleChildID: string,
}

@injectable()
export class PreferencesEditorWidget extends ReactWidget implements StatefulWidget {
    static readonly ID = 'settings.editor';
    static readonly LABEL = 'Settings Editor';

    protected readonly onEditorScrollEmitter = new Emitter<boolean>();
    /**
     * true = at top; false = not at top
     */
    readonly onEditorDidScroll = this.onEditorScrollEmitter.event;

    protected scrollContainerRef: React.RefObject<HTMLDivElement> = React.createRef();
    protected hasRendered = false;
    protected shouldScroll: boolean = true;
    protected lastUserSelection: string = '';
    protected isAtScrollTop: boolean = true;
    protected firstVisibleChildID: string = '';

    @inject(PreferenceService) protected readonly preferenceValueRetrievalService: PreferenceService;
    @inject(PreferenceTreeModel) protected readonly model: PreferenceTreeModel;
    @inject(SinglePreferenceDisplayFactory) protected readonly singlePreferenceFactory: SinglePreferenceDisplayFactory;

    @postConstruct()
    protected init(): void {
        this.onRender.push(Disposable.create(() => this.hasRendered = true));
        this.id = PreferencesEditorWidget.ID;
        this.title.label = PreferencesEditorWidget.LABEL;
        this.preferenceValueRetrievalService.onPreferenceChanged((): void => {
            this.update();
        });
        this.model.onFilterChanged(({ filterCleared }) => this.handleDisplayChange(filterCleared));
        this.model.onSelectionChanged(e => this.handleSelectionChange(e));
        this.update();
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
        const visibleNodes = Array.from(this.model.currentRows.values());
        return (
            <div className="settings-main">
                <div ref={this.scrollContainerRef} className="settings-main-scroll-container" id="settings-main-scroll-container">
                    {!this.model.totalVisibleLeaves ? this.renderNoResultMessage() : visibleNodes.map(nodeRow => {
                        if (!CompositeTreeNode.is(nodeRow.node)) {
                            return this.renderSingleEntry(nodeRow.node);
                        } else {
                            return this.renderCategoryHeader(nodeRow);
                        }
                    })}
                </div>
            </div>
        );
    }

    protected handleDisplayChange = (filterWasCleared: boolean = false): void => {
        const currentVisibleChild = this.firstVisibleChildID;
        this.update();
        const oldVisibleNode = this.model.currentRows.get(currentVisibleChild);
        // Scroll if the old visible node is visible in the new display. Otherwise go to top.
        if (!filterWasCleared && oldVisibleNode && !(CompositeTreeNode.is(oldVisibleNode.node) && oldVisibleNode.visibleChildren === 0)) {
            setTimeout(() => // set timeout to allow render to finish.
                Array.from(this.node.getElementsByTagName('li')).find(element => element.getAttribute('data-id') === currentVisibleChild)?.scrollIntoView());
        } else {
            this.node.scrollTop = 0;
        }
    };

    protected doOnScroll = (): void => {
        const scrollContainer = this.node;
        const { selectionAncestorID, expansionAncestorID } = this.findFirstVisibleChildID(scrollContainer) ?? {};
        if (selectionAncestorID !== this.lastUserSelection) {
            this.shouldScroll = false; // prevents event feedback loop.
            const selectionAncestor = this.model.getNode(selectionAncestorID) as SelectableTreeNode;
            const expansionAncestor = this.model.getNode(expansionAncestorID) as ExpandableTreeNode;
            if (expansionAncestor) {
                this.model.collapseAllExcept(expansionAncestor);
            }
            if (selectionAncestor) {
                this.model.selectNode(selectionAncestor);
            }
            this.shouldScroll = true;
        }
        if (this.isAtScrollTop && scrollContainer.scrollTop !== 0) {
            this.isAtScrollTop = false;
            this.onEditorScrollEmitter.fire(false); // no longer at top
        } else if (!this.isAtScrollTop && scrollContainer.scrollTop === 0) {
            this.isAtScrollTop = true;
            this.onEditorScrollEmitter.fire(true); // now at top
        }
        this.lastUserSelection = '';
    };

    onScroll = debounce(this.doOnScroll, 10);

    protected findFirstVisibleChildID(container: Element): { selectionAncestorID: string, expansionAncestorID: string; } | undefined {
        const children = container.getElementsByTagName('li');
        let selectionAncestorID: string = '';
        let expansionAncestorID: string = '';
        for (let i = 0; i < children.length; i++) {
            const currentChild = children[i];
            const id = currentChild.getAttribute('data-id');
            if (id) {
                if (currentChild.classList.contains(HEADER_CLASS)) {
                    selectionAncestorID = id;
                    expansionAncestorID = id;
                } else if (currentChild.classList.contains(SUBHEADER_CLASS)) {
                    selectionAncestorID = id;
                }
                if (this.isInView(currentChild as HTMLElement, container as HTMLElement)) {
                    this.firstVisibleChildID = id;
                    return { selectionAncestorID, expansionAncestorID };
                }
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

    protected renderSingleEntry(node: TreeNode): React.ReactNode {
        const values = this.preferenceValueRetrievalService.inspect<PreferenceItem>(node.id, this.model.currentScope.uri);
        const preferenceNodeWithValueInAllScopes = { ...node, preference: { data: this.model.propertyList[node.id], values } };
        return this.singlePreferenceFactory.render(preferenceNodeWithValueInAllScopes);
    }

    protected renderCategoryHeader({ node, visibleChildren }: PreferenceTreeNodeRow): React.ReactNode {
        if (visibleChildren === 0) {
            return undefined;
        }
        const isCategory = ExpandableTreeNode.is(node);
        const className = isCategory ? HEADER_CLASS : SUBHEADER_CLASS;
        return node.visible && (
            <ul
                className='settings-section'
                key={`${node.id}-editor`}
                id={`${node.id}-editor`}
            >
                <li className={`settings-section-title ${className}`} data-id={node.id}>{node.name}</li>
            </ul>
        );
    }

    protected renderNoResultMessage(): React.ReactNode {
        return <div className="settings-no-results-announcement">That search query has returned no results.</div>;
    }

    protected handleSelectionChange(selectionEvent: readonly Readonly<SelectableTreeNode>[]): void {
        if (this.shouldScroll) {
            const nodeID = selectionEvent[0]?.id;
            if (nodeID) {
                this.lastUserSelection = nodeID;
                const el = document.getElementById(`${nodeID}-editor`);
                if (el) {
                    // Timeout to allow render cycle to finish.
                    setTimeout(() => el.scrollIntoView());
                }
            }
        }
    }

    storeState(): PreferencesEditorState {
        return {
            firstVisibleChildID: this.firstVisibleChildID,
        };
    }

    restoreState(oldState: PreferencesEditorState): void {
        this.firstVisibleChildID = oldState.firstVisibleChildID;
        this.handleDisplayChange();
    }

}
