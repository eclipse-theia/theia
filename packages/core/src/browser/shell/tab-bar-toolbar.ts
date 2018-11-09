/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, named } from 'inversify';
import { Widget, BaseWidget } from '../widgets';
import { LabelParser, LabelIcon } from '../label-parser';
import { ContributionProvider } from '../../common/contribution-provider';
import { FrontendApplicationContribution } from '../frontend-application';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { CommandRegistry, CommandService } from '../../common/command';

/**
 * Factory for instantiating tab-bar toolbars.
 */
export const TabBarToolbarFactory = Symbol('TabBarToolbarFactory');
export interface TabBarToolbarFactory {
    (commandService: CommandService, labelParser: LabelParser): TabBarToolbar;
}

/**
 * Tab-bar toolbar widget representing the active [tab-bar toolbar items](TabBarToolbarItem).
 */
export class TabBarToolbar extends BaseWidget {

    protected readonly items: Map<TabBarToolbarItem, HTMLElement> = new Map();
    protected readonly toDisposeOnUpdate: DisposableCollection = new DisposableCollection();

    constructor(protected readonly commandService: CommandService, protected readonly labelParser: LabelParser) {
        super();
        this.toDispose.push(Disposable.create(() => this.removeItems()));
        this.addClass(TabBarToolbar.Styles.TAB_BAR_TOOLBAR);
        this.addClass(TabBarToolbar.Styles.TAB_BAR_TOOLBAR_HIDDEN);
    }

    updateItems(...items: TabBarToolbarItem[]): void {
        const copy = items.slice().sort(TabBarToolbarItem.PRIORITY_COMPARATOR).reverse();
        if (this.areSame(copy, Array.from(this.items.keys()))) {
            return;
        }
        this.toDisposeOnUpdate.dispose();
        this.removeItems();
        this.createItems(...copy);
    }

    protected removeItems(): void {
        for (const element of this.items.values()) {
            const { parentElement } = element;
            if (parentElement) {
                parentElement.removeChild(element);
            }
        }
        this.items.clear();
    }

    protected createItems(...items: TabBarToolbarItem[]): void {
        for (const item of items) {
            const itemContainer = document.createElement('div');
            itemContainer.classList.add(TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM);
            for (const labelPart of this.labelParser.parse(item.text)) {
                const child = document.createElement('div');
                const listener = () => this.commandService.executeCommand(item.command);
                child.addEventListener('click', listener);
                this.toDisposeOnUpdate.push(Disposable.create(() => itemContainer.removeEventListener('click', listener)));
                if (typeof labelPart !== 'string' && LabelIcon.is(labelPart)) {
                    const className = `fa fa-${labelPart.name}${labelPart.animation ? ' fa-' + labelPart.animation : ''}`;
                    child.classList.add(...className.split(' '));
                } else {
                    child.innerText = labelPart;
                }
                if (item.tooltip) {
                    child.title = item.tooltip;
                }
                itemContainer.appendChild(child);
            }
            this.node.appendChild(itemContainer);
            this.items.set(item, itemContainer);
        }
        if (this.items.size === 0) {
            this.addClass(TabBarToolbar.Styles.TAB_BAR_TOOLBAR_HIDDEN);
        } else {
            this.removeClass(TabBarToolbar.Styles.TAB_BAR_TOOLBAR_HIDDEN);
        }
    }

    /**
     * `true` if `left` and `right` contains the same items in the same order. Otherwise, `false`.
     * We consider two items the same, if the IDs of the corresponding items are the same.
     */
    protected areSame(left: TabBarToolbarItem[], right: TabBarToolbarItem[]): boolean {
        if (left.length === right.length) {
            for (let i = 0; i < left.length; i++) {
                if (left[0].id !== right[0].id) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

}

export namespace TabBarToolbar {

    export namespace Styles {

        export const TAB_BAR_TOOLBAR = 'p-TabBar-toolbar';
        export const TAB_BAR_TOOLBAR_ITEM = 'item';
        export const TAB_BAR_TOOLBAR_HIDDEN = 'hidden';

    }

}

/**
 * Clients should implement this interface if they want to contribute to the tab-bar toolbar.
 */
export const TabBarToolbarContribution = Symbol('TabBarToolbarContribution');
export interface TabBarToolbarContribution {

    registerToolbarItems(registry: TabBarToolbarRegistry): void;

}

/**
 * Representation of an item in the tab
 */
export interface TabBarToolbarItem {

    /**
     * The unique ID of the toolbar item.
     */
    readonly id: string;

    /**
     * The command to execute.
     */
    readonly command: string;

    /**
     * Text of the item.
     *
     * Shamelessly copied and reused from `status-bar`:
     *
     * More details about the available `fontawesome` icons and CSS class names can be hound [here](http://fontawesome.io/icons/).
     * To set a text with icon use the following pattern in text string:
     * ```typescript
     * $(fontawesomeClasssName)
     * ```
     *
     * To use animated icons use the following pattern:
     * ```typescript
     * $(fontawesomeClassName~typeOfAnimation)
     * ````
     * The type of animation can be either `spin` or `pulse`.
     * Look [here](http://fontawesome.io/examples/#animated) for more information to animated icons.
     */
    readonly text: string;

    /**
     * Function that evaluates to `true` if the toolbar item is visible for the given widget. Otherwise, `false`.
     */
    readonly isVisible: (widget: Widget) => boolean;

    /**
     * Priority among the items. Can be negative. The smaller the number the left-most the item will be placed in the toolbar. It is `0` by default.
     */
    readonly priority?: number;

    /**
     * Optional tooltip for the item.
     */
    readonly tooltip?: string;

}

export namespace TabBarToolbarItem {

    /**
     * Compares the items by `priority` in ascending. Undefined priorities will be treated as `0`.
     */
    export const PRIORITY_COMPARATOR = (left: TabBarToolbarItem, right: TabBarToolbarItem) => (left.priority || 0) - (right.priority || 0);

}

/**
 * Main, shared registry for tab-bar toolbar items.
 */
@injectable()
export class TabBarToolbarRegistry implements FrontendApplicationContribution {

    protected items: Map<string, TabBarToolbarItem> = new Map();

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(ContributionProvider)
    @named(TabBarToolbarContribution)
    protected readonly contributionProvider: ContributionProvider<TabBarToolbarContribution>;

    onStart(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const contribution of contributions) {
            contribution.registerToolbarItems(this);
        }
    }

    /**
     * Registers the given item. Throws an error, if the corresponding command cannot be found or an item has been already registered for the desired command.
     *
     * @param item the item to register.
     */
    registerItem(item: TabBarToolbarItem): void {
        const { id } = item;
        if (this.items.has(id)) {
            throw new Error(`A toolbar item is already registered with the '${id}' ID.`);
        }
        this.items.set(id, item);
    }

    /**
     * Returns an array of tab-bar toolbar items which are visible when the `widget` argument is the current one.
     *
     * By default returns with all items where the command is enabled and `item.isVisible` is `true`.
     */
    visibleItems(widget: Widget): TabBarToolbarItem[] {
        return Array.from(this.items.values())
            .filter(item => this.commandRegistry.isEnabled(item.command))
            .filter(item => item.isVisible(widget));
    }

}
