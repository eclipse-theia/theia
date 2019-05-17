/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as PQueue from 'p-queue';
import { Drag } from '@phosphor/dragdrop';
import { Message } from '@phosphor/messaging';
import { IIterator, iter, toArray } from '@phosphor/algorithm';
import { DisposableCollection } from '../common/disposable';
import { ViewContainerPart } from './view-container';
import { SplitLayout, Widget, LayoutItem, addEventListener, SplitPanel } from './widgets';

export class ViewContainerLayout extends SplitLayout {

    protected readonly defaultHeights = new Map<Widget, number>();
    protected readonly beforeCollapseHeights = new Map<Widget, number>();
    protected readonly animationQueue = new PQueue({ autoStart: true, concurrency: 1 });
    protected readonly toDisposeOnDetach = new DisposableCollection();
    protected readonly mouseDownListener = (event: MouseEvent) => {
        if (this.parent instanceof SplitPanel) {
            if (event.button !== 0) {
                return;
            }
            const { target } = event;
            if (target instanceof Node) {
                const index = this.handles.findIndex(h => h.contains(target));
                if (index === -1) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();

                document.addEventListener('mouseup', this.mouseUpListener.bind(this), true);
                document.addEventListener('mousemove', this.mouseMoveListener.bind(this), true);
                document.addEventListener('keydown', this.parent, true);
                document.addEventListener('contextmenu', this.parent, true);
                let delta;
                const handle = this.handles[index];
                const rect = handle.getBoundingClientRect();
                if (this.orientation === 'horizontal') {
                    delta = event.clientX - rect.left;
                } else {
                    delta = event.clientY - rect.top;
                }
                const style = window.getComputedStyle(handle);
                const override = Drag.overrideCursor(style.cursor || 'auto');
                // tslint:disable-next-line:no-any
                (this.parent as any)._pressData = { index, delta, override };
            }
        }
    }
    protected mouseMoveListener = (event: MouseEvent) => {
        if (this.parent instanceof SplitPanel) {
            // tslint:disable-next-line:no-any
            const pressData = (this.parent as any)._pressData;
            if (!pressData) {
                return;
            }
            const index = pressData.index as number;
            event.preventDefault();
            event.stopPropagation();
            let newPosition;
            const rect = this.parent.node.getBoundingClientRect();
            if (this.orientation === 'horizontal') {
                newPosition = event.clientX - rect.left - pressData.delta;
            } else {
                newPosition = event.clientY - rect.top - pressData.delta;
            }

            if (this.orientation === 'horizontal') {
                this.moveHandle(index, newPosition);
                return; // Expand/Collapse is not yet supported with horizontal orientation.
            }

            const hasNextOpen = this.items.filter((_, i) => i > index).map(({ widget }) => widget).some(widget => !this.isCollapsed(widget));
            const hasPrevOpen = this.items.filter((_, i) => i < index).map(({ widget }) => widget).some(widget => !this.isCollapsed(widget));

            // Pushing down.
            let indexToAdjust = index;
            if (event.movementY > 0) {
                if (this.isCollapsed(this.items[index].widget)) {
                    for (let i = index - 1; i >= 0; i--) {
                        if (!this.isCollapsed(this.items[i].widget)) {
                            indexToAdjust = i;
                            break;
                        }
                    }
                    if (index === indexToAdjust || !hasNextOpen) {
                        return; // Cannot push down.
                    }
                }
                this.moveHandle(indexToAdjust, newPosition - ((index - indexToAdjust) * 22));
            } else if (event.movementY < 0) {
                // When pulling down we have to check the next item, and not the current one with `index`.
                // Note: there is always a next item, because we should never adjust the last handle, it is hidden.
                if (this.isCollapsed(this.items[index + 1].widget)) {
                    indexToAdjust = this.items.findIndex((item, i) => i > index + 1 && !this.isCollapsed(item.widget));
                    if (indexToAdjust === -1 || !hasPrevOpen) {
                        return; // Cannot pull up.
                    }
                    this.moveHandle(indexToAdjust - 1, newPosition + ((indexToAdjust - 1 - index) * 22));
                } else {
                    this.moveHandle(indexToAdjust, newPosition);
                }
            }
        }
    }
    protected mouseUpListener = () => {
        if (this.parent instanceof SplitPanel) {
            // tslint:disable-next-line:no-any
            const pressData = (this.parent as any)._pressData;
            if (!pressData) {
                return;
            }
            pressData.override.dispose();
            // tslint:disable-next-line
            (this.parent as any)._pressData = null;
            document.removeEventListener('mouseup', this.mouseUpListener.bind(this), true);
            document.removeEventListener('mousemove', this.mouseMoveListener.bind(this), true);
            document.removeEventListener('keydown', this.parent, true);
            document.removeEventListener('contextmenu', this.parent, true);
        }
    }

    constructor(protected options: ViewContainerLayout.Options) {
        super(options);
    }

    iter(): IIterator<Widget> {
        const widgets = this.items.map(item => item.widget);
        return iter(widgets);
    }

    get widgets(): ReadonlyArray<Widget> {
        return toArray(this.iter());
    }

    moveWidget(fromIndex: number, toIndex: number): void {
        // Note: internally, the `widget` argument is not used. See: `node_modules/@phosphor/widgets/lib/splitlayout.js`.
        // tslint:disable-next-line:no-any
        super.moveWidget(fromIndex, toIndex, undefined as any);
    }

    protected get items(): ReadonlyArray<LayoutItem> {
        // tslint:disable-next-line:no-any
        return (this as any)._items as Array<LayoutItem>;
    }

    protected isCollapsed(widget: Widget): boolean {
        if (this.options.isCollapsed) {
            return this.options.isCollapsed(widget);
        }
        if (widget instanceof ViewContainerPart) {
            return widget.collapsed;
        }
        return false;
    }

    protected minHeight(widget: Widget): number {
        if (this.options.minHeight) {
            return this.options.minHeight(widget);
        }
        if (widget instanceof ViewContainerPart) {
            return widget.minHeight;
        }
        return 100;
    }

    /**
     * The last handle is always hidden, we cannot get the `offsetTop` of the `HTMLDivElement`.
     * Instead, we get the `offsetHeight` of the parent `node`.
     */
    protected handlePosition(index: number): number {
        return index === this.handles.length - 1
            ? this.parent!.node.offsetHeight
            : this.handles[index].offsetTop;
    }

    protected onFitRequest(msg: Message): void {
        super.onFitRequest(msg);
        requestAnimationFrame(() => {
            for (let i = 0; i < this.items.length; i++) {
                const { widget } = this.items[i];
                const { offsetHeight } = widget.node;
                if (!this.defaultHeights.has(widget) && typeof offsetHeight === 'number' && offsetHeight > 0) {
                    this.defaultHeights.set(widget, offsetHeight);
                    // TODO: Adjust when container is resized!
                    // offsetHeight * (oldSize / newSize)
                }
            }
        });
    }

    protected onAfterAttach(msg: Message): void {
        if (this.parent) {
            this.toDisposeOnDetach.push(addEventListener(this.parent.node, 'mousedown', this.mouseDownListener.bind(this), true));
        }
        super.onAfterAttach(msg);
    }

    protected onAfterDetach(msg: Message): void {
        if (!this.toDisposeOnDetach.disposed) {
            this.toDisposeOnDetach.dispose();
        }
        super.onAfterDetach(msg);
    }

    removeWidget(widget: Widget): void {
        this.defaultHeights.delete(widget);
        this.beforeCollapseHeights.delete(widget);
        super.removeWidget(widget);
    }

    removeWidgetAt(index: number): void {
        // tslint:disable-next-line:no-any
        const widget = (this as any)._widgets[index];
        if (widget) {
            this.defaultHeights.delete(widget);
            this.beforeCollapseHeights.delete(widget);
        }
        super.removeWidgetAt(index);
    }

    dispose(): void {
        if (!this.animationQueue.isPaused) {
            this.animationQueue.pause();
        }
        this.animationQueue.clear();
        super.dispose();
    }

    async animateHandle(index: number, position: number): Promise<void> {
        this.animationQueue.add(() => new Promise<void>(animationResolve => {
            const start = this.handlePosition(index);
            const end = position;
            const done = (f: number, t: number) => start < end ? f >= t : t >= f;
            const step = () => start < end ? 40 : -40; // TODO: `Math.sign`
            const moveHandle = (p: number) => new Promise<void>(resolve => {
                if (start < end) {
                    if (p > end) {
                        this.moveHandle(index, end);
                    } else {
                        this.moveHandle(index, p);
                    }
                } else {
                    if (p < end) {
                        this.moveHandle(index, end);
                    } else {
                        this.moveHandle(index, p);
                    }
                }
                resolve();
            });
            let currentPosition = start;
            const next = () => {
                if (!done(currentPosition, end)) {
                    moveHandle(currentPosition += step()).then(() => {
                        window.requestAnimationFrame(next);
                    });
                } else {
                    animationResolve();
                }
            };
            next();
        }));
    }

    toggleCollapsed(index: number): void {
        // Cannot collapse with horizontal orientation.
        if (this.orientation === 'horizontal') {
            return;
        }

        const { widget } = this.items[index];
        const collapsed = this.isCollapsed(widget);
        if (collapsed) {
            this.handles[index].classList.add('collapsed');
        } else {
            this.handles[index].classList.remove('collapsed');
        }
        // Do not store the height of the "stretched item". Otherwise, we mess up the "hint height".
        // Store the height only if there are other expanded items.
        if (collapsed && this.items.some(item => !this.isCollapsed(item.widget))) {
            this.beforeCollapseHeights.set(widget, widget.node.offsetHeight);
        }

        const adjuster = this.createAdjuster();
        const animations = adjuster.adjustHandles(index);
        for (const { handleIndex, position } of animations) {
            this.animateHandle(handleIndex, position);
        }

    }

    private createAdjuster(): ViewContainerLayout.HandleAdjuster {
        if (!this.parent) {
            return new ViewContainerLayout.NoopHandleAdjuster();
        }
        const fullHeight = this.parent.node.offsetHeight;
        const items = this.handles.map((_, i) => ({
            defaultHeight: this.defaultHeights.get(this.items[i].widget) || -1,
            beforeCollapseHeight: this.beforeCollapseHeights.get(this.items[i].widget),
            minHeight: this.minHeight(this.items[i].widget),
            position: this.handlePosition(i),
            collapsed: this.isCollapsed(this.items[i].widget)
        }));
        return new ViewContainerLayout.HandleAdjuster(fullHeight, items);
    }

}

/**
 * Calculates the desired pixel position of the handles when expanding/collapsing the items in the layout.
 */
export namespace ViewContainerLayout {

    export interface Options extends SplitLayout.IOptions {
        isCollapsed?(widget: Widget): boolean;
        minHeight?(widget: Widget): number;
    }

    export class HandleAdjuster {

        constructor(
            readonly fullHeight: number,
            readonly items: ReadonlyArray<Readonly<{
                defaultHeight: number,
                beforeCollapseHeight?: number,
                minHeight: number,
                position: number,
                collapsed: boolean
            }>>
        ) {

        }

        adjustHandles(index: number): ReadonlyArray<Readonly<{ handleIndex: number, position: number }>> {
            if (this.items[index].collapsed) {
                const prevExpandedIndex = this.prevExpanded(index);
                if (prevExpandedIndex !== -1) {
                    const position = this.items[index].position - ((index - prevExpandedIndex) * (this.headerHeight + this.handleHeight));
                    return [{ handleIndex: prevExpandedIndex, position }];
                } else {
                    const nextExpandedIndex = this.nextExpanded(index);
                    const position = (index === 0 ? 0 : this.items[index - 1].position) + ((nextExpandedIndex - index) * this.headerHeight);
                    return [{ handleIndex: Math.max(nextExpandedIndex - 1, 0), position }];
                }
            } else {
                const animations: Array<{ handleIndex: number, position: number }> = [];
                const expandedItems = this.items.filter(item => !item.collapsed);
                if (expandedItems.length === 1) {
                    const position = this.fullHeight - ((this.items.length - 1 - index) * this.headerHeight);
                    return [{ handleIndex: index, position }];
                } else {
                    let heightHint = this.items[index].beforeCollapseHeight;
                    if (heightHint === undefined || heightHint <= this.headerHeight) {
                        heightHint = this.items[index].defaultHeight;
                    }
                    if (heightHint < this.items[index].minHeight) {
                        heightHint = this.items[index].minHeight;
                    }

                    // Can open upwards?
                    // This is net widget height without headers, handlers and the entire layout thingies.
                    const availableAboveHeight = this.items[index].position
                        - ((index + 1) * this.headerHeight) // Headers.
                        - (index * this.handleHeight) // Heights. One less than the headers, the last handler is `display: none`.
                        - this.items
                            .filter((_, i) => i < index)
                            .filter(item => !item.collapsed)
                            .map(({ minHeight }) => minHeight)
                            .reduce((sum, curr) => sum + curr, 0); // Minimum required heights for the opened parts.

                    const availableBelowHeight = this.fullHeight
                        - this.items[index].position
                        - ((this.items.length - index) * (this.headerHeight + this.handleHeight))
                        - this.items
                            .filter((_, i) => i > index)
                            .filter(item => !item.collapsed)
                            .map(({ minHeight }) => minHeight)
                            .reduce((sum, curr) => sum + curr, 0); // Minimum required heights for the opened parts.
                    const prevExpandedIndex = this.prevExpanded(index);
                    // XXX: Should we check the available space below and compare the heights instead? Bigger space would win.
                    // Currently, we just try to use the space above and fall back to down if upwards is not feasible.
                    const canUseAboveHeight = prevExpandedIndex !== -1 && availableAboveHeight > 0;

                    if (canUseAboveHeight) {
                        animations.push({
                            handleIndex: index - 1,
                            position: this.items[index].position - Math.min(heightHint, availableAboveHeight) - 2
                        });
                    } else {
                        animations.push({
                            handleIndex: index,
                            position: this.items[index].position + Math.min(heightHint, availableBelowHeight) - this.headerHeight
                        });
                    }

                    const { handleIndex } = animations[0];
                    if (canUseAboveHeight) {
                        for (let i = handleIndex; i >= 0; i--) {
                            if (!this.items[i].collapsed) {
                                const handleToAdjustIndex = this.prevExpanded(i);
                                if (handleToAdjustIndex === -1) {
                                    break; // No more place above.
                                }
                                const handleToAdjustPosition = this.items[handleToAdjustIndex].position;
                                const adjustedHandlerPosition = animations[animations.length - 1].position;
                                if (adjustedHandlerPosition - handleToAdjustPosition < this.items[handleToAdjustIndex].minHeight) {
                                    animations.push({
                                        handleIndex: handleToAdjustIndex,
                                        position: adjustedHandlerPosition - this.items[handleToAdjustIndex].minHeight
                                    });
                                } else {
                                    // If the previous was OK, we no need to adjust above.
                                    // TODO: balance items. Right now we just push up the handles just to fit into the `minHeight`.
                                    break;
                                }
                            }
                        }
                    } else {
                        for (let i = index + 1; i < this.items.length - 1; i++) {
                            if (!this.items[i].collapsed) {
                                const { position } = this.items[i];
                                const adjustedHandlerPosition = animations[animations.length - 1].position;
                                if (position - adjustedHandlerPosition < this.items[i].minHeight) {
                                    animations.push({
                                        handleIndex: i,
                                        position: adjustedHandlerPosition + this.items[i].minHeight
                                    });
                                }
                            } else {
                                break;
                            }
                        }
                    }
                    return canUseAboveHeight ? animations.reverse() : animations;
                }
            }
        }

        protected get headerHeight(): number {
            return ViewContainerPart.HEADER_HEIGHT;
        }

        protected get handleHeight(): number {
            return 2;
        }

        protected prevExpanded(from: number): number {
            for (let i = from - 1; i >= 0; i--) {
                if (!this.items[i].collapsed) {
                    return i;
                }
            }
            return -1;
        }

        protected nextExpanded(from: number): number {
            for (let i = from + 1; i < this.items.length; i++) {
                if (!this.items[i].collapsed) {
                    return i;
                }
            }
            return this.items.length - 1; // TODO: Perhaps for consistency, -1 would be better.
        }

    }

    export class NoopHandleAdjuster extends HandleAdjuster {

        constructor() {
            super(0, []);
        }

        toggleCollapsed() {
            return [];
        }

    }

}
