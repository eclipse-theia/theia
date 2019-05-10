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

import { injectable, inject, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import { Disposable, MenuPath, SelectionService } from '../../common';
import { Key, KeyCode, KeyModifier } from '../keyboard/keys';
import { ContextMenuRenderer } from '../context-menu-renderer';
import { StatefulWidget } from '../shell';
import { EXPANSION_TOGGLE_CLASS, SELECTED_CLASS, COLLAPSED_CLASS, FOCUS_CLASS, Widget } from '../widgets';
import { TreeNode, CompositeTreeNode } from './tree';
import { TreeModel } from './tree-model';
import { ExpandableTreeNode } from './tree-expansion';
import { SelectableTreeNode, TreeSelection } from './tree-selection';
import { TreeDecoration, TreeDecoratorService } from './tree-decorator';
import { notEmpty } from '../../common/objects';
import { isOSX } from '../../common/os';
import { ReactWidget } from '../widgets/react-widget';
import * as React from 'react';
import { List, ListRowRenderer, ScrollParams, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import { TopDownTreeIterator } from './tree-iterator';
import { SearchBox, SearchBoxFactory, SearchBoxProps } from './search-box';
import { TreeSearch } from './tree-search';
import { ElementExt } from '@phosphor/domutils';
import { TreeWidgetSelection } from './tree-widget-selection';

const debounce = require('lodash.debounce');

export const TREE_CLASS = 'theia-Tree';
export const TREE_CONTAINER_CLASS = 'theia-TreeContainer';
export const TREE_NODE_CLASS = 'theia-TreeNode';
export const TREE_NODE_CONTENT_CLASS = 'theia-TreeNodeContent';
export const TREE_NODE_TAIL_CLASS = 'theia-TreeNodeTail';
export const TREE_NODE_SEGMENT_CLASS = 'theia-TreeNodeSegment';
export const TREE_NODE_SEGMENT_GROW_CLASS = 'theia-TreeNodeSegmentGrow';

export const EXPANDABLE_TREE_NODE_CLASS = 'theia-ExpandableTreeNode';
export const COMPOSITE_TREE_NODE_CLASS = 'theia-CompositeTreeNode';
export const TREE_NODE_CAPTION_CLASS = 'theia-TreeNodeCaption';

export const TreeProps = Symbol('TreeProps');
export interface TreeProps {

    /**
     * The path of the context menu that one can use to contribute context menu items to the tree widget.
     */
    readonly contextMenuPath?: MenuPath;

    /**
     * The size of the padding (in pixels) per hierarchy depth. The root element won't have left padding but
     * the padding for the children will be calculated as `leftPadding * hierarchyDepth` and so on.
     */
    readonly leftPadding: number;

    /**
     * `true` if the tree widget support multi-selection. Otherwise, `false`. Defaults to `false`.
     */
    readonly multiSelect?: boolean;

    /**
     * 'true' if the tree widget support searching. Otherwise, `false`. Defaults to `false`.
     */
    readonly search?: boolean

    /**
     * 'true' if the tree widget should be virtualized searching. Otherwise, `false`. Defaults to `true`.
     */
    readonly virtualized?: boolean

    /**
     * 'true' if the selected node should be auto scrolled only if the widget is active. Otherwise, `false`. Defaults to `false`.
     */
    readonly scrollIfActive?: boolean

    /**
     * `true` if a tree widget contributes to the global selection. Defaults to `false`.
     */
    readonly globalSelection?: boolean;
}

export interface NodeProps {

    /**
     * A root relative number representing the hierarchical depth of the actual node. Root is `0`, its children have `1` and so on.
     */
    readonly depth: number;

}

export const defaultTreeProps: TreeProps = {
    leftPadding: 8
};

export namespace TreeWidget {

    /**
     * Bare minimum common interface of the keyboard and the mouse event with respect to the key maskings.
     */
    export interface ModifierAwareEvent {
        readonly metaKey: boolean;
        readonly ctrlKey: boolean;
        readonly shiftKey: boolean;
    }

}

@injectable()
export class TreeWidget extends ReactWidget implements StatefulWidget {

    protected searchBox: SearchBox;
    protected searchHighlights: Map<string, TreeDecoration.CaptionHighlight>;

    @inject(TreeDecoratorService)
    protected readonly decoratorService: TreeDecoratorService;
    @inject(TreeSearch)
    protected readonly treeSearch: TreeSearch;
    @inject(SearchBoxFactory)
    protected readonly searchBoxFactory: SearchBoxFactory;

    protected decorations: Map<string, TreeDecoration.Data[]> = new Map();

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    protected shouldScrollToRow = true;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(TreeModel) readonly model: TreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
    ) {
        super();
        this.scrollOptions = {
            suppressScrollX: true,
            minScrollbarLength: 35
        };
        this.addClass(TREE_CLASS);
        this.node.tabIndex = 0;
    }

    @postConstruct()
    protected init(): void {
        if (this.props.search) {
            this.searchBox = this.searchBoxFactory(SearchBoxProps.DEFAULT);
            this.toDispose.pushAll([
                this.searchBox,
                this.searchBox.onTextChange(async data => {
                    await this.treeSearch.filter(data);
                    this.searchHighlights = this.treeSearch.getHighlights();
                    this.update();
                }),
                this.searchBox.onClose(data => this.treeSearch.filter(undefined)),
                this.searchBox.onNext(() => this.model.selectNextNode()),
                this.searchBox.onPrevious(() => this.model.selectPrevNode()),
                this.treeSearch,
                this.treeSearch.onFilteredNodesChanged(nodes => {
                    const node = nodes.find(SelectableTreeNode.is);
                    if (node) {
                        this.model.selectNode(node);
                    }
                }),
                this.model.onExpansionChanged(() => {
                    this.searchBox.hide();
                })
            ]);
        }
        this.toDispose.pushAll([
            this.model,
            this.model.onChanged(() => this.updateRows()),
            this.model.onSelectionChanged(() => this.updateScrollToRow({ resize: false })),
            this.model.onNodeRefreshed(() => this.updateDecorations()),
            this.model.onExpansionChanged(() => this.updateDecorations()),
            this.decoratorService,
            this.decoratorService.onDidChangeDecorations(() => this.updateDecorations())
        ]);
        setTimeout(() => {
            this.updateRows();
            this.updateDecorations();
        });
        if (this.props.globalSelection) {
            this.toDispose.pushAll([
                this.model.onSelectionChanged(() => {
                    if (this.node.contains(document.activeElement)) {
                        this.updateGlobalSelection();
                    }
                }),
                Disposable.create(() => {
                    const selection = this.selectionService.selection;
                    if (TreeWidgetSelection.isSource(selection, this)) {
                        this.selectionService.selection = undefined;
                    }
                })
            ]);
        }
    }

    protected updateGlobalSelection(): void {
        this.selectionService.selection = TreeWidgetSelection.create(this);
    }

    protected rows = new Map<string, TreeWidget.NodeRow>();
    protected updateRows = debounce(() => this.doUpdateRows(), 10);
    protected doUpdateRows(): void {
        const root = this.model.root;
        const rowsToUpdate: Array<[string, TreeWidget.NodeRow]> = [];
        if (root) {
            const depths = new Map<CompositeTreeNode | undefined, number>();
            let index = 0;
            for (const node of new TopDownTreeIterator(root, {
                pruneCollapsed: true,
                pruneSiblings: true
            })) {
                if (TreeNode.isVisible(node)) {
                    const parentDepth = depths.get(node.parent);
                    const depth = parentDepth === undefined ? 0 : TreeNode.isVisible(node.parent) ? parentDepth + 1 : parentDepth;
                    if (CompositeTreeNode.is(node)) {
                        depths.set(node, depth);
                    }
                    rowsToUpdate.push([node.id, {
                        index: index++,
                        node,
                        depth
                    }]);
                }
            }
        }
        this.rows = new Map(rowsToUpdate);
        this.updateScrollToRow();
    }

    protected scrollToRow: number | undefined;
    protected updateScrollToRow(updateOptions?: TreeWidget.ForceUpdateOptions): void {
        this.scrollToRow = this.getScrollToRow();
        this.forceUpdate(updateOptions);
    }

    protected getScrollToRow(): number | undefined {
        if (!this.shouldScrollToRow) {
            return undefined;
        }
        const selected = this.model.selectedNodes;
        const node: TreeNode | undefined = selected.find(SelectableTreeNode.hasFocus) || selected[0];
        const row = node && this.rows.get(node.id);
        return row && row.index;
    }

    protected readonly updateDecorations = debounce(() => this.doUpdateDecorations(), 150);
    protected async doUpdateDecorations(): Promise<void> {
        this.decorations = await this.decoratorService.getDecorations(this.model);
        this.forceUpdate();
    }

    /**
     * Force deep resizing and rendering of rows.
     * https://github.com/bvaughn/react-virtualized/blob/master/docs/List.md#recomputerowheights-index-number
     */
    protected forceUpdate({ resize }: TreeWidget.ForceUpdateOptions = { resize: true }): void {
        if (this.view && this.view.list) {
            if (resize && this.isVisible) {
                this.view.cache.clearAll();
                this.view.list.recomputeRowHeights();
            } else {
                this.view.list.forceUpdateGrid();
            }
        }
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        if (this.model.selectedNodes.length === 0) {
            const root = this.model.root;
            if (SelectableTreeNode.is(root)) {
                this.model.selectNode(root);
            } else if (CompositeTreeNode.is(root) && root.children.length >= 1) {
                const firstChild = root.children[0];
                if (SelectableTreeNode.is(firstChild)) {
                    this.model.selectNode(firstChild);
                }
            }
        }
        // it has to be called after nodes are selected
        if (this.props.globalSelection) {
            this.updateGlobalSelection();
        }
        this.forceUpdate();
    }

    protected onUpdateRequest(msg: Message): void {
        if (!this.isAttached || !this.isVisible) {
            return;
        }
        super.onUpdateRequest(msg);
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.forceUpdate();
    }

    protected render(): React.ReactNode {
        return React.createElement('div', this.createContainerAttributes(), this.renderTree(this.model));
    }

    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        return {
            className: TREE_CONTAINER_CLASS,
            onContextMenu: event => this.handleContextMenuEvent(this.getContainerTreeNode(), event)
        };
    }
    protected getContainerTreeNode(): TreeNode | undefined {
        return this.model.root;
    }

    protected view: TreeWidget.View | undefined;
    protected renderTree(model: TreeModel): React.ReactNode {
        if (model.root) {
            const rows = Array.from(this.rows.values());
            if (this.props.virtualized === false) {
                this.onRender.push(Disposable.create(() => this.scrollToSelected()));
                return rows.map(row => <div key={row.index}>{this.renderNodeRow(row)}</div>);
            }
            return <TreeWidget.View
                ref={view => this.view = (view || undefined)}
                width={this.node.offsetWidth}
                height={this.node.offsetHeight}
                rows={rows}
                renderNodeRow={this.renderNodeRow}
                scrollToRow={this.scrollToRow}
                handleScroll={this.handleScroll}
            />;
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    scrollArea: Element = this.node;
    protected scrollToSelected(): void {
        if (this.props.scrollIfActive === true && !this.node.contains(document.activeElement)) {
            return;
        }
        const focus = this.node.getElementsByClassName(FOCUS_CLASS)[0];
        if (focus) {
            ElementExt.scrollIntoViewIfNeeded(this.scrollArea, focus);
        } else {
            const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
            if (selected) {
                ElementExt.scrollIntoViewIfNeeded(this.scrollArea, selected);
            }
        }
    }

    protected readonly handleScroll = (info: ScrollParams) => {
        this.node.scrollTop = info.scrollTop;
    }

    protected readonly renderNodeRow = (row: TreeWidget.NodeRow) => this.doRenderNodeRow(row);
    protected doRenderNodeRow({ index, node, depth }: TreeWidget.NodeRow): React.ReactNode {
        return this.renderNode(node, { depth });
    }

    protected renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected readonly toggle = (event: React.MouseEvent<HTMLElement>) => this.doToggle(event);
    protected doToggle(event: React.MouseEvent<HTMLElement>) {
        const nodeId = event.currentTarget.getAttribute('data-node-id');
        if (nodeId) {
            const node = this.model.getNode(nodeId);
            this.handleClickEvent(node, event);
        }
        event.stopPropagation();
    }

    protected renderExpansionToggle(node: TreeNode, props: NodeProps): React.ReactNode {
        if (!this.isExpandable(node)) {
            // tslint:disable-next-line:no-null-keyword
            return null;
        }
        const classes = [TREE_NODE_SEGMENT_CLASS, EXPANSION_TOGGLE_CLASS];
        if (!node.expanded) {
            classes.push(COLLAPSED_CLASS);
        }
        const className = classes.join(' ');
        return <div
            data-node-id={node.id}
            className={className}
            style={{ paddingLeft: '4px' }}
            onClick={this.toggle}>
        </div>;
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        const tooltip = this.getDecorationData(node, 'tooltip').filter(notEmpty).join(' • ');
        const classes = [TREE_NODE_SEGMENT_CLASS];
        if (!this.hasTrailingSuffixes(node)) {
            classes.push(TREE_NODE_SEGMENT_GROW_CLASS);
        }
        const className = classes.join(' ');
        let attrs = this.decorateCaption(node, {
            className, id: node.id
        });
        if (tooltip.length > 0) {
            attrs = {
                ...attrs,
                title: tooltip
            };
        }
        const children: React.ReactNode[] = [];
        const caption = node.name;
        const highlight = this.getDecorationData(node, 'highlight')[0];
        if (highlight) {
            children.push(this.toReactNode(caption, highlight));
        }
        const searchHighlight = this.searchHighlights ? this.searchHighlights.get(node.id) : undefined;
        if (searchHighlight) {
            children.push(...this.toReactNode(caption, searchHighlight));
        } else if (!highlight) {
            children.push(caption);
        }
        return React.createElement('div', attrs, ...children);
    }

    protected toReactNode(caption: string, highlight: TreeDecoration.CaptionHighlight): React.ReactNode[] {
        let style: React.CSSProperties = {};
        if (highlight.color) {
            style = {
                ...style,
                color: highlight.color
            };
        }
        if (highlight.backgroundColor) {
            style = {
                ...style,
                backgroundColor: highlight.backgroundColor
            };
        }
        const createChildren = (fragment: TreeDecoration.CaptionHighlight.Fragment) => {
            const { data } = fragment;
            if (fragment.highligh) {
                return <mark className={TreeDecoration.Styles.CAPTION_HIGHLIGHT_CLASS} style={style}>{data}</mark>;
            } else {
                return data;
            }
        };
        return TreeDecoration.CaptionHighlight.split(caption, highlight).map(createChildren);
    }

    protected decorateCaption(node: TreeNode, attrs: React.HTMLAttributes<HTMLElement>): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const style = this.getDecorationData(node, 'fontData').filter(notEmpty).reverse().map(fontData => this.applyFontStyles({}, fontData)).reduce((acc, current) =>
            ({
                ...acc,
                ...current
            })
            , {});
        return {
            ...attrs,
            style
        };
    }

    protected hasTrailingSuffixes(node: TreeNode): boolean {
        return this.getDecorationData(node, 'captionSuffixes').filter(notEmpty).reduce((acc, current) => acc.concat(current), []).length > 0;
    }

    protected applyFontStyles(original: React.CSSProperties, fontData: TreeDecoration.FontData | undefined) {
        if (fontData === undefined) {
            return original;
        }
        let modified = original;
        const { color, style } = fontData;
        if (color) {
            modified = {
                ...modified,
                color
            };
        }
        if (style) {
            (Array.isArray(style) ? style : [style]).forEach(s => {
                switch (style) {
                    case 'bold':
                        modified = {
                            ...modified,
                            fontWeight: style
                        };
                        break;
                    case 'normal': // Fall through.
                    case 'oblique': // Fall through.
                    case 'italic':
                        modified = {
                            ...modified,
                            fontStyle: style
                        };
                        break;
                    case 'underline': // Fall through.
                    case 'line-through':
                        modified = {
                            ...modified,
                            textDecoration: style
                        };
                        break;
                    default:
                        throw new Error(`Unexpected font style: ${style}.`);
                }
            });
        }
        return modified;
    }

    protected renderCaptionAffixes(node: TreeNode, props: NodeProps, affixKey: 'captionPrefixes' | 'captionSuffixes'): React.ReactNode {
        const suffix = affixKey === 'captionSuffixes';
        const affixClass = suffix ? TreeDecoration.Styles.CAPTION_SUFFIX_CLASS : TreeDecoration.Styles.CAPTION_PREFIX_CLASS;
        const classes = [TREE_NODE_SEGMENT_CLASS, affixClass];
        const affixes = this.getDecorationData(node, affixKey).filter(notEmpty).reduce((acc, current) => acc.concat(current), []);
        const children: React.ReactNode[] = [];
        for (let i = 0; i < affixes.length; i++) {
            const affix = affixes[i];
            if (suffix && i === affixes.length - 1) {
                classes.push(TREE_NODE_SEGMENT_GROW_CLASS);
            }
            const style = this.applyFontStyles({}, affix.fontData);
            const className = classes.join(' ');
            const key = node.id + '_' + i;
            const attrs = {
                className,
                style,
                key
            };
            children.push(React.createElement('div', attrs, affix.data));
        }
        return <React.Fragment>{children}</React.Fragment>;
    }

    protected decorateIcon(node: TreeNode, icon: React.ReactNode | null): React.ReactNode {
        if (icon === null) {
            // tslint:disable-next-line:no-null-keyword
            return null;
        }

        const overlayIcons: React.ReactNode[] = [];
        new Map(this.getDecorationData(node, 'iconOverlay').reverse().filter(notEmpty)
            .map(overlay => [overlay.position, overlay] as [TreeDecoration.IconOverlayPosition, TreeDecoration.IconOverlay | TreeDecoration.IconClassOverlay]))
            .forEach((overlay, position) => {
                const iconClasses = [TreeDecoration.Styles.DECORATOR_SIZE_CLASS, TreeDecoration.IconOverlayPosition.getStyle(position)];
                const style = (color?: string) => color === undefined ? {} : { color };
                if (overlay.background) {
                    overlayIcons.push(<span key={node.id + 'bg'} className={this.getIconClass(overlay.background.shape, iconClasses)} style={style(overlay.background.color)}>
                    </span>);
                }
                const overlayIcon = (overlay as TreeDecoration.IconOverlay).icon || (overlay as TreeDecoration.IconClassOverlay).iconClass;
                overlayIcons.push(<span key={node.id} className={this.getIconClass(overlayIcon, iconClasses)} style={style(overlay.color)}></span>);
            });

        if (overlayIcons.length > 0) {
            return <div className={TreeDecoration.Styles.ICON_WRAPPER_CLASS}>{icon}{overlayIcons}</div>;
        }

        return icon;
    }

    protected renderTailDecorations(node: TreeNode, props: NodeProps): React.ReactNode {
        return <React.Fragment>
            {this.getDecorationData(node, 'tailDecorations').filter(notEmpty).reduce((acc, current) => acc.concat(current), []).map((decoration, index) => {
                const { tooltip } = decoration;
                const { data, fontData } = decoration as TreeDecoration.TailDecoration;
                const color = (decoration as TreeDecoration.TailDecorationIcon).color;
                const icon = (decoration as TreeDecoration.TailDecorationIcon).icon || (decoration as TreeDecoration.TailDecorationIconClass).iconClass;
                const className = [TREE_NODE_SEGMENT_CLASS, TREE_NODE_TAIL_CLASS].join(' ');
                const style = fontData ? this.applyFontStyles({}, fontData) : color ? { color } : undefined;
                const content = data ? data : icon ? <span key={node.id + 'icon' + index} className={this.getIconClass(icon)}></span> : '';
                return <div key={node.id + className + index} className={className} style={style} title={tooltip}>
                    {content}
                </div>;
            })}
        </React.Fragment>;
    }

    // Determine the classes to use for an icon
    // Assumes a Font Awesome name when passed a single string, otherwise uses the passed string array
    private getIconClass(iconName: string | string[], additionalClasses: string[] = []): string {
        const iconClass = (typeof iconName === 'string') ? ['a', 'fa', `fa-${iconName}`] : ['a'].concat(iconName);
        return iconClass.concat(additionalClasses).join(' ');
    }

    protected renderNode(node: TreeNode, props: NodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }
        const attributes = this.createNodeAttributes(node, props);
        const content = <div className={TREE_NODE_CONTENT_CLASS}>
            {this.renderExpansionToggle(node, props)}
            {this.decorateIcon(node, this.renderIcon(node, props))}
            {this.renderCaptionAffixes(node, props, 'captionPrefixes')}
            {this.renderCaption(node, props)}
            {this.renderCaptionAffixes(node, props, 'captionSuffixes')}
            {this.renderTailDecorations(node, props)}
        </div>;
        return React.createElement('div', attributes, content);
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const className = this.createNodeClassNames(node, props).join(' ');
        const style = this.createNodeStyle(node, props);
        return {
            className,
            style,
            onClick: event => this.handleClickEvent(node, event),
            onDoubleClick: event => this.handleDblClickEvent(node, event),
            onContextMenu: event => this.handleContextMenuEvent(node, event)
        };
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = [TREE_NODE_CLASS];
        if (CompositeTreeNode.is(node)) {
            classNames.push(COMPOSITE_TREE_NODE_CLASS);
        }
        if (this.isExpandable(node)) {
            classNames.push(EXPANDABLE_TREE_NODE_CLASS);
        }
        if (SelectableTreeNode.isSelected(node)) {
            classNames.push(SELECTED_CLASS);
        }
        if (SelectableTreeNode.hasFocus(node)) {
            classNames.push(FOCUS_CLASS);
        }
        return classNames;
    }

    protected getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        // If the node is a composite, a toggle will be rendered. Otherwise we need to add the width and the left, right padding => 18px
        const paddingLeft = `${props.depth * this.props.leftPadding + (this.isExpandable(node) ? 0 : 18)}px`;
        return {
            paddingLeft
        };
    }

    protected createNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        return this.decorateNodeStyle(node, this.getDefaultNodeStyle(node, props));
    }

    protected decorateNodeStyle(node: TreeNode, style: React.CSSProperties | undefined): React.CSSProperties | undefined {
        const backgroundColor = this.getDecorationData(node, 'backgroundColor').filter(notEmpty).shift();
        if (backgroundColor) {
            style = {
                ...(style || {}),
                backgroundColor
            };
        }
        return style;
    }

    protected isExpandable(node: TreeNode): node is ExpandableTreeNode {
        return ExpandableTreeNode.is(node);
    }

    protected getDecorations(node: TreeNode): TreeDecoration.Data[] {
        const decorations: TreeDecoration.Data[] = [];
        if (TreeDecoration.DecoratedTreeNode.is(node)) {
            decorations.push(node.decorationData);
        }
        if (this.decorations.has(node.id)) {
            decorations.push(...this.decorations.get(node.id));
        }
        return decorations.sort(TreeDecoration.Data.comparePriority);
    }

    protected getDecorationData<K extends keyof TreeDecoration.Data>(node: TreeNode, key: K): TreeDecoration.Data[K][] {
        return this.getDecorations(node).filter(data => data[key] !== undefined).map(data => data[key]).filter(notEmpty);
    }

    protected onAfterAttach(msg: Message): void {
        const up = [
            Key.ARROW_UP,
            KeyCode.createKeyCode({ first: Key.ARROW_UP, modifiers: [KeyModifier.Shift] })
        ];
        const down = [
            Key.ARROW_DOWN,
            KeyCode.createKeyCode({ first: Key.ARROW_DOWN, modifiers: [KeyModifier.Shift] })
        ];
        if (this.props.search) {
            if (this.searchBox.isAttached) {
                Widget.detach(this.searchBox);
            }
            Widget.attach(this.searchBox, this.node.parentElement!);
            this.addKeyListener(this.node, this.searchBox.keyCodePredicate.bind(this.searchBox), this.searchBox.handle.bind(this.searchBox));
            this.toDisposeOnDetach.push(Disposable.create(() => {
                Widget.detach(this.searchBox);
            }));
        }
        super.onAfterAttach(msg);
        this.addKeyListener(this.node, Key.ARROW_LEFT, event => this.handleLeft(event));
        this.addKeyListener(this.node, Key.ARROW_RIGHT, event => this.handleRight(event));
        this.addKeyListener(this.node, up, event => this.handleUp(event));
        this.addKeyListener(this.node, down, event => this.handleDown(event));
        this.addKeyListener(this.node, Key.ENTER, event => this.handleEnter(event));
        // tslint:disable-next-line:no-any
        this.addEventListener<any>(this.node, 'ps-scroll-y', (e: Event & { target: { scrollTop: number } }) => {
            if (this.view && this.view.list && this.view.list.Grid) {
                const { scrollTop } = e.target;
                this.view.list.Grid.handleScrollEvent({ scrollTop });
            }
        });
    }

    protected async handleLeft(event: KeyboardEvent): Promise<void> {
        if (!!this.props.multiSelect && (this.hasCtrlCmdMask(event) || this.hasShiftMask(event))) {
            return;
        }
        if (! await this.model.collapseNode()) {
            this.model.selectParent();
        }
    }

    protected async handleRight(event: KeyboardEvent): Promise<void> {
        if (!!this.props.multiSelect && (this.hasCtrlCmdMask(event) || this.hasShiftMask(event))) {
            return;
        }
        if (! await this.model.expandNode()) {
            this.model.selectNextNode();
        }
    }

    protected handleUp(event: KeyboardEvent): void {
        if (!!this.props.multiSelect && this.hasShiftMask(event)) {
            this.model.selectPrevNode(TreeSelection.SelectionType.RANGE);
        } else {
            this.model.selectPrevNode();
        }
    }

    protected handleDown(event: KeyboardEvent): void {
        if (!!this.props.multiSelect && this.hasShiftMask(event)) {
            this.model.selectNextNode(TreeSelection.SelectionType.RANGE);
        } else {
            this.model.selectNextNode();
        }
    }

    protected handleEnter(event: KeyboardEvent): void {
        this.model.openNode();
    }

    protected handleClickEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        if (node) {
            if (!!this.props.multiSelect) {
                const shiftMask = this.hasShiftMask(event);
                const ctrlCmdMask = this.hasCtrlCmdMask(event);
                if (SelectableTreeNode.is(node)) {
                    if (shiftMask) {
                        this.model.selectRange(node);
                    } else if (ctrlCmdMask) {
                        this.model.toggleNode(node);
                    } else {
                        this.model.selectNode(node);
                    }
                }
                if (this.isExpandable(node) && !shiftMask && !ctrlCmdMask) {
                    this.model.toggleNodeExpansion(node);
                }
            } else {
                if (SelectableTreeNode.is(node)) {
                    this.model.selectNode(node);
                }
                if (this.isExpandable(node) && !this.hasCtrlCmdMask(event) && !this.hasShiftMask(event)) {
                    this.model.toggleNodeExpansion(node);
                }
            }
            event.stopPropagation();
        }
    }

    protected handleDblClickEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        this.model.openNode(node);
        event.stopPropagation();
    }

    protected handleContextMenuEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        if (SelectableTreeNode.is(node)) {
            // Keep the selection for the context menu, if the widget support multi-selection and the right click happens on an already selected node.
            if (!this.props.multiSelect || !node.selected) {
                const type = !!this.props.multiSelect && this.hasCtrlCmdMask(event) ? TreeSelection.SelectionType.TOGGLE : TreeSelection.SelectionType.DEFAULT;
                this.model.addSelection({ node, type });
            }
            const contextMenuPath = this.props.contextMenuPath;
            if (contextMenuPath) {
                const { x, y } = event.nativeEvent;
                this.onRender.push(Disposable.create(() =>
                    setTimeout(() =>
                        this.contextMenuRenderer.render(contextMenuPath, { x, y })
                    )
                ));
            }
            this.update();
        }
        event.stopPropagation();
        event.preventDefault();
    }

    protected hasCtrlCmdMask(event: TreeWidget.ModifierAwareEvent): boolean {
        const { metaKey, ctrlKey } = event;
        return (isOSX && metaKey) || ctrlKey;
    }

    protected hasShiftMask(event: TreeWidget.ModifierAwareEvent): boolean {
        // Ctrl/Cmd mask overrules the Shift mask.
        if (this.hasCtrlCmdMask(event)) {
            return false;
        }
        return event.shiftKey;
    }

    protected deflateForStorage(node: TreeNode): object {
        // tslint:disable-next-line:no-any
        const copy = Object.assign({}, node) as any;
        if (copy.parent) {
            delete copy.parent;
        }
        if ('previousSibling' in copy) {
            delete copy.previousSibling;
        }
        if ('nextSibling' in copy) {
            delete copy.nextSibling;
        }
        if (CompositeTreeNode.is(node)) {
            copy.children = [];
            for (const child of node.children) {
                copy.children.push(this.deflateForStorage(child));
            }
        }
        return copy;
    }

    // tslint:disable-next-line:no-any
    protected inflateFromStorage(node: any, parent?: TreeNode): TreeNode {
        if (node.selected) {
            node.selected = false;
        }
        if (parent) {
            node.parent = parent;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children as TreeNode[]) {
                this.inflateFromStorage(child, node);
            }
        }
        return node;
    }

    storeState(): object {
        const decorations = this.decoratorService.deflateDecorators(this.decorations);
        let state: object = {
            decorations
        };
        if (this.model.root) {
            state = {
                ...state,
                root: this.deflateForStorage(this.model.root)
            };
        }
        return state;
    }

    restoreState(oldState: object): void {
        // tslint:disable-next-line:no-any
        const { root, decorations } = (oldState as any);
        if (root) {
            this.model.root = this.inflateFromStorage(root);
        }
        if (decorations) {
            this.decorations = this.decoratorService.inflateDecorators(decorations);
        }
    }

}
export namespace TreeWidget {
    export interface ForceUpdateOptions {
        resize: boolean
    }
    export interface NodeRow {
        index: number
        node: TreeNode
        /**
         * A root relative number representing the hierarchical depth of the actual node. Root is `0`, its children have `1` and so on.
         */
        depth: number
    }
    export interface ViewProps {
        width: number
        height: number
        scrollToRow?: number
        rows: NodeRow[]
        handleScroll: (info: ScrollParams) => void
        renderNodeRow: (row: NodeRow) => React.ReactNode
    }
    export class View extends React.Component<ViewProps> {
        list: List | undefined;
        readonly cache = new CellMeasurerCache({
            fixedWidth: true
        });
        render(): React.ReactNode {
            const { rows, width, height, scrollToRow, handleScroll } = this.props;
            return <List
                ref={list => this.list = (list || undefined)}
                width={width}
                height={height}
                rowCount={rows.length}
                rowHeight={this.cache.rowHeight}
                rowRenderer={this.renderTreeRow}
                scrollToIndex={scrollToRow}
                onScroll={handleScroll}
                tabIndex={-1}
                style={{
                    overflowY: 'visible',
                    overflowX: 'visible'
                }}
            />;
        }
        protected renderTreeRow: ListRowRenderer = ({ key, index, style, parent }) => {
            const row = this.props.rows[index]!;
            return <CellMeasurer
                cache={this.cache}
                columnIndex={0}
                key={key}
                parent={parent}
                rowIndex={index}>
                <div key={key} style={style}>{this.props.renderNodeRow(row)}</div>
            </CellMeasurer>;
        }
    }
}
