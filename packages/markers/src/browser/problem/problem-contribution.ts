// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import debounce = require('@theia/core/shared/lodash.debounce');
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    FrontendApplication, FrontendApplicationContribution, CompositeTreeNode, SelectableTreeNode, Widget, codicon,
    TreeNode, TreeSelection
} from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { PROBLEM_KIND, ProblemMarker } from '../../common/problem-marker';
import { ProblemManager, ProblemStat } from './problem-manager';
import { ProblemWidget, PROBLEMS_WIDGET_ID } from './problem-widget';
import { ProblemTreeModel } from './problem-tree-model';
import { MarkerNode, MarkerInfoNode } from '../marker-tree';
import { MenuPath, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { ProblemSelection } from './problem-selection';
import { nls } from '@theia/core/lib/common/nls';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

export const PROBLEMS_CONTEXT_MENU: MenuPath = [PROBLEM_KIND];

export namespace ProblemsMenu {
    export const CLIPBOARD = [...PROBLEMS_CONTEXT_MENU, '1_clipboard'];
    export const PROBLEMS = [...PROBLEMS_CONTEXT_MENU, '2_problems'];
}

export namespace ProblemsCommands {
    export const COLLAPSE_ALL: Command = {
        id: 'problems.collapse.all'
    };
    export const COLLAPSE_ALL_TOOLBAR: Command = {
        id: 'problems.collapse.all.toolbar',
        iconClass: codicon('collapse-all')
    };
    export const COPY = Command.toDefaultLocalizedCommand({
        id: 'problems.copy',
        category: 'Problems',
        label: 'Copy'
    });
    export const COPY_MESSAGE = Command.toDefaultLocalizedCommand({
        id: 'problems.copy.message',
        category: 'Problems',
        label: 'Copy Message'
    });
    export const COPY_AS_TEXT = Command.toLocalizedCommand({
        id: 'problems.copy.as.text',
        category: 'Problems',
        label: 'Copy as Text'
    }, 'theia/markers/copyAsText', nls.getDefaultKey('Problems'));
    export const SELECT_ALL = Command.toDefaultLocalizedCommand({
        id: 'problems.select.all',
        category: 'Problems',
        label: 'Select All'
    });
    export const EXPORT = Command.toLocalizedCommand({
        id: 'problems.export',
        category: 'Problems',
        label: 'Export',
        iconClass: codicon('arrow-circle-up', true)
    }, 'theia/markers/export', nls.getDefaultKey('Problems'));
    export const CLEAR_ALL = Command.toLocalizedCommand({
        id: 'problems.clear.all',
        category: 'Problems',
        label: 'Clear All',
        iconClass: codicon('clear-all')
    }, 'theia/markers/clearAll', nls.getDefaultKey('Problems'));
}

@injectable()
export class ProblemContribution extends AbstractViewContribution<ProblemWidget> implements FrontendApplicationContribution, TabBarToolbarContribution, KeybindingContribution {

    @inject(ProblemManager) protected readonly problemManager: ProblemManager;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(MessageService) protected readonly messageService: MessageService;

    constructor() {
        super({
            widgetId: PROBLEMS_WIDGET_ID,
            widgetName: nls.localizeByDefault('Problems'),
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'problemsView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+m'
        });
    }

    onStart(app: FrontendApplication): void {
        this.updateStatusBarElement();
        this.problemManager.onDidChangeMarkers(this.updateStatusBarElement);
        const problemsFocusKey = this.contextKeyService.createKey<boolean>('problemsFocus', false);
        const updateFocusKey = () => {
            problemsFocusKey.set(this.shell.activeWidget instanceof ProblemWidget);
        };
        updateFocusKey();
        this.shell.onDidChangeActiveWidget(updateFocusKey);
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }

    protected updateStatusBarElement = debounce(() => this.setStatusBarElement(this.problemManager.getProblemStat()), 10);
    protected setStatusBarElement(problemStat: ProblemStat): void {
        this.statusBar.setElement('problem-marker-status', {
            text: problemStat.infos <= 0
                ? `$(codicon-error) ${problemStat.errors} $(codicon-warning) ${problemStat.warnings}`
                : `$(codicon-error) ${problemStat.errors} $(codicon-warning) ${problemStat.warnings} $(codicon-info) ${problemStat.infos}`,
            alignment: StatusBarAlignment.LEFT,
            priority: 10,
            command: this.toggleCommand ? this.toggleCommand.id : undefined,
            tooltip: this.getStatusBarTooltip(problemStat)
        });
    }

    /**
     * Get the tooltip to be displayed when hovering over the problem statusbar item.
     * - Displays `No Problems` when no problems are present.
     * - Displays a human-readable label which describes for each type of problem stat properties,
     * their overall count and type when any one of these properties has a positive count.
     * @param stat the problem stat describing the number of `errors`, `warnings` and `infos`.
     *
     * @return the tooltip to be displayed in the statusbar.
     */
    protected getStatusBarTooltip(stat: ProblemStat): string {
        if (stat.errors <= 0 && stat.warnings <= 0 && stat.infos <= 0) {
            return nls.localizeByDefault('No Problems');
        }
        const tooltip: string[] = [];
        if (stat.errors > 0) {
            tooltip.push(nls.localizeByDefault('{0} Errors', stat.errors));
        }
        if (stat.warnings > 0) {
            tooltip.push(nls.localizeByDefault('{0} Warnings', stat.warnings));
        }
        if (stat.infos > 0) {
            tooltip.push(nls.localizeByDefault('{0} Infos', stat.infos));
        }
        return tooltip.join(', ');

    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(ProblemsCommands.COLLAPSE_ALL, {
            execute: () => this.collapseAllProblems()
        });
        commands.registerCommand(ProblemsCommands.COLLAPSE_ALL_TOOLBAR, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: widget => this.withWidget(widget, () => this.collapseAllProblems())
        });

        commands.registerCommand(ProblemsCommands.COPY, {
            isEnabled: () => this.withWidget(undefined, () => true),
            isVisible: () => this.withWidget(undefined, widget => this.getSelectedMarkerNodes(widget).length > 0),
            execute: () => this.withWidget(undefined, widget => {
                const selections = this.getSelectedMarkerNodes(widget)
                    .map(node => ({ marker: node.marker }));
                if (selections.length > 0) {
                    this.copy(selections);
                }
            })
        });
        commands.registerCommand(ProblemsCommands.COPY_MESSAGE, {
            isEnabled: () => this.withWidget(undefined, () => true),
            isVisible: () => this.withWidget(undefined, widget => this.getSelectedMarkerNodes(widget).length > 0),
            execute: () => this.withWidget(undefined, widget => {
                const selections = this.getSelectedMarkerNodes(widget)
                    .map(node => ({ marker: node.marker }));
                if (selections.length > 0) {
                    this.copyMessage(selections);
                }
            })
        });
        commands.registerCommand(ProblemsCommands.COPY_AS_TEXT, {
            isEnabled: () => this.withWidget(undefined, () => true),
            isVisible: () => this.withWidget(undefined, () => true),
            execute: () => this.withWidget(undefined, widget => {
                const selectedSet = new Set(widget.model.selectedNodes);
                if (selectedSet.size > 0) {
                    this.copyAsText(widget, widget.model.root, selectedSet);
                }
            })
        });
        commands.registerCommand(ProblemsCommands.SELECT_ALL, {
            isEnabled: () => this.withWidget(undefined, () => true),
            isVisible: () => this.withWidget(undefined, () => true),
            execute: () => this.withWidget(undefined, widget => this.selectAllProblems(widget))
        });
        commands.registerCommand(ProblemsCommands.EXPORT, {
            isEnabled: () => this.withWidget(undefined, () => true),
            isVisible: () => this.withWidget(undefined, () => true),
            execute: async () => {
                await this.withWidget(undefined, async widget => await this.exportProblems(widget));
            }
        });
        commands.registerCommand(ProblemsCommands.CLEAR_ALL, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: widget => this.withWidget(widget, () => this.problemManager.cleanAllMarkers())
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(ProblemsMenu.CLIPBOARD, {
            commandId: ProblemsCommands.COPY.id,
            label: nls.localizeByDefault('Copy'),
            order: '0'
        });
        menus.registerMenuAction(ProblemsMenu.CLIPBOARD, {
            commandId: ProblemsCommands.COPY_MESSAGE.id,
            label: nls.localizeByDefault('Copy Message'),
            order: '1'
        });
        menus.registerMenuAction(ProblemsMenu.CLIPBOARD, {
            commandId: ProblemsCommands.COPY_AS_TEXT.id,
            order: '2'
        });
        menus.registerMenuAction(ProblemsMenu.CLIPBOARD, {
            commandId: ProblemsCommands.EXPORT.id,
            order: '3'
        });
        menus.registerMenuAction(ProblemsMenu.PROBLEMS, {
            commandId: ProblemsCommands.COLLAPSE_ALL.id,
            label: nls.localizeByDefault('Collapse All'),
            order: '2'
        });
        menus.registerMenuAction(ProblemsMenu.PROBLEMS, {
            commandId: ProblemsCommands.SELECT_ALL.id,
            label: nls.localizeByDefault('Select All'),
            order: '3'
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: ProblemsCommands.COLLAPSE_ALL_TOOLBAR.id,
            command: ProblemsCommands.COLLAPSE_ALL_TOOLBAR.id,
            tooltip: nls.localizeByDefault('Collapse All'),
            priority: 0,
        });
        toolbarRegistry.registerItem({
            id: ProblemsCommands.CLEAR_ALL.id,
            command: ProblemsCommands.CLEAR_ALL.id,
            tooltip: ProblemsCommands.CLEAR_ALL.label,
            priority: 1,
        });
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: ProblemsCommands.COPY.id,
            keybinding: 'ctrlcmd+c',
            when: 'problemsFocus'
        });
        keybindings.registerKeybinding({
            command: ProblemsCommands.SELECT_ALL.id,
            keybinding: 'ctrlcmd+a',
            when: 'problemsFocus'
        });
    }

    protected async collapseAllProblems(): Promise<void> {
        const { model } = await this.widget;
        const root = model.root as CompositeTreeNode;
        const firstChild = root.children[0];
        root.children.forEach(child => CompositeTreeNode.is(child) && model.collapseAll(child));
        if (SelectableTreeNode.is(firstChild)) {
            model.selectNode(firstChild);
        }
    }

    protected selectAllProblems(widget: ProblemWidget): void {
        const { model } = widget;
        const root = model.root as CompositeTreeNode;
        if (root) {
            model.clearSelection();
            this.selectAllNodes(root, model);
        }
    }

    protected selectAllNodes(node: TreeNode, model: ProblemTreeModel): void {
        if (SelectableTreeNode.is(node)) {
            model.addSelection({ node, type: TreeSelection.SelectionType.TOGGLE });
        }
        if (CompositeTreeNode.is(node) && node.children) {
            for (const child of node.children) {
                this.selectAllNodes(child, model);
            }
        }
    }

    protected getSelectedMarkerNodes(widget: ProblemWidget): MarkerNode[] {
        return widget.model.selectedNodes.filter(MarkerNode.is);
    }

    protected addToClipboard(content: string): void {
        const handleCopy = (e: ClipboardEvent) => {
            document.removeEventListener('copy', handleCopy);
            if (e.clipboardData) {
                e.clipboardData.setData('text/plain', content);
                e.preventDefault();
            }
        };
        document.addEventListener('copy', handleCopy);
        document.execCommand('copy');
    }

    protected copy(selections: ProblemSelection | ProblemSelection[]): void {
        const selectionsArray = Array.isArray(selections) ? selections : [selections];
        const serializedProblems = selectionsArray.map(selection => this.serializeMarker(selection.marker as ProblemMarker));
        const output = selectionsArray.length === 1
            ? JSON.stringify(serializedProblems[0], undefined, '\t')
            : JSON.stringify(serializedProblems, undefined, '\t');
        this.addToClipboard(output);
    }

    protected copyMessage(selections: ProblemSelection | ProblemSelection[]): void {
        const selectionsArray = Array.isArray(selections) ? selections : [selections];
        const messages = selectionsArray.map(selection => {
            const marker = selection.marker as ProblemMarker;
            return marker.data.message;
        });
        this.addToClipboard(messages.join('\n'));
    }

    protected serializeMarker(marker: ProblemMarker): object {
        return {
            resource: marker.uri,
            owner: marker.owner,
            code: marker.data.code,
            severity: marker.data.severity,
            message: marker.data.message,
            source: marker.data.source,
            startLineNumber: marker.data.range.start.line,
            startColumn: marker.data.range.start.character,
            endLineNumber: marker.data.range.end.line,
            endColumn: marker.data.range.end.character
        };
    }

    protected copyAsText(widget: ProblemWidget, root: TreeNode | undefined, selectedSet: Set<TreeNode>): void {
        const lines: string[] = [];
        if (root) {
            this.collectSelectedLinesInOrder(widget, root, selectedSet, lines);
        }
        this.addToClipboard(lines.join('\n'));
    }

    protected collectSelectedLinesInOrder(widget: ProblemWidget, node: TreeNode, selectedSet: Set<TreeNode>, lines: string[]): void {
        if (selectedSet.has(node)) {
            if (MarkerInfoNode.is(node)) {
                lines.push(this.formatMarkerInfoNode(widget, node));
            } else if (MarkerNode.is(node)) {
                lines.push(this.formatMarkerNode(node));
            }
        }
        if (CompositeTreeNode.is(node) && node.children) {
            for (const child of node.children) {
                this.collectSelectedLinesInOrder(widget, child, selectedSet, lines);
            }
        }
    }

    protected formatMarkerInfoNode(widget: ProblemWidget, node: MarkerInfoNode): string {
        const name = widget.toNodeName(node);
        const description = widget.toNodeDescription(node);
        return description ? `${name} ${description}` : name;
    }

    protected formatMarkerNode(node: MarkerNode): string {
        const marker = node.marker as ProblemMarker;
        const severity = this.getSeverityLabel(marker.data.severity);
        const line = marker.data.range.start.line + 1;
        const column = marker.data.range.start.character + 1;
        const location = nls.localizeByDefault('Ln {0}, Col {1}', line, column);
        const source = marker.data.source ? `${marker.data.source}` : '';
        const code = marker.data.code ? `(${marker.data.code})` : '';
        const sourceCode = [source, code].filter(s => s).join(' ');
        const suffix = sourceCode ? ` ${sourceCode}` : '';
        return `${severity}: ${marker.data.message}${suffix} [${location}]`;
    }

    protected getSeverityLabel(severity: number | undefined): string {
        switch (severity) {
            case 1: return 'error';
            case 2: return 'warning';
            case 3: return 'info';
            default: return 'hint';
        }
    }

    protected async exportProblems(widget: ProblemWidget): Promise<void> {
        const selectedNodes = widget.model.selectedNodes;

        if (selectedNodes.length === 0) {
            return;
        }

        const markerNodes = this.collectMarkerNodes(selectedNodes);

        if (markerNodes.length === 0) {
            return;
        }

        const filePath = await this.fileDialogService.showSaveDialog({
            title: 'Export Problems',
            filters: { 'JSON Files': ['json'] },
            saveLabel: 'Export'
        });

        if (!filePath) {
            return;
        }

        try {
            const serializedProblems = markerNodes.map(node => this.serializeMarker(node.marker as ProblemMarker));
            const content = JSON.stringify(serializedProblems, undefined, '\t');
            await this.fileService.write(filePath, content);
            this.messageService.info(nls.localize('theia/markers/exportSuccess', 'Problems exported successfully.'));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.messageService.error(errorMessage);
        }
    }

    protected collectMarkerNodes(nodes: readonly TreeNode[]): MarkerNode[] {
        const seen = new Set<MarkerNode>();
        for (const node of nodes) {
            if (MarkerNode.is(node)) {
                seen.add(node);
            } else if (CompositeTreeNode.is(node)) {
                this.collectMarkerNodesRecursive(node, seen);
            }
        }
        return Array.from(seen);
    }

    protected collectMarkerNodesRecursive(node: CompositeTreeNode, seen: Set<MarkerNode>): void {
        if (node.children) {
            for (const child of node.children) {
                if (MarkerNode.is(child)) {
                    seen.add(child);
                } else if (CompositeTreeNode.is(child)) {
                    this.collectMarkerNodesRecursive(child, seen);
                }
            }
        }
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (problems: ProblemWidget) => T): T | false {
        if (widget instanceof ProblemWidget && widget.id === PROBLEMS_WIDGET_ID) {
            return cb(widget);
        }
        return false;
    }
}
