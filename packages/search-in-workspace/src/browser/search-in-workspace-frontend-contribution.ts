// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import {
    AbstractViewContribution, KeybindingRegistry, LabelProvider, CommonMenus, FrontendApplication,
    FrontendApplicationContribution, CommonCommands, StylingParticipant, ColorTheme, CssStyleCollector
} from '@theia/core/lib/browser';
import { SearchInWorkspaceWidget } from './search-in-workspace-widget';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry, MenuModelRegistry, SelectionService, Command, isOSX, nls } from '@theia/core';
import { codicon, Widget } from '@theia/core/lib/browser/widgets';
import { FileNavigatorCommands, NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { SearchInWorkspaceContextKeyService } from './search-in-workspace-context-key-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { SEARCH_VIEW_CONTAINER_ID } from './search-in-workspace-factory';
import { SearchInWorkspaceFileNode, SearchInWorkspaceResultTreeWidget } from './search-in-workspace-result-tree-widget';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { isHighContrast } from '@theia/core/lib/common/theme';

export namespace SearchInWorkspaceCommands {
    const SEARCH_CATEGORY = 'Search';
    export const TOGGLE_SIW_WIDGET = {
        id: 'search-in-workspace.toggle'
    };
    export const OPEN_SIW_WIDGET = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.open',
        category: SEARCH_CATEGORY,
        label: 'Find in Files'
    });
    export const REPLACE_IN_FILES = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.replace',
        category: SEARCH_CATEGORY,
        label: 'Replace in Files'
    });
    export const FIND_IN_FOLDER = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.in-folder',
        category: SEARCH_CATEGORY,
        label: 'Find in Folder...'
    });
    export const FOCUS_NEXT_RESULT = Command.toDefaultLocalizedCommand({
        id: 'search.action.focusNextSearchResult',
        category: SEARCH_CATEGORY,
        label: 'Focus Next Search Result'
    });
    export const FOCUS_PREV_RESULT = Command.toDefaultLocalizedCommand({
        id: 'search.action.focusPreviousSearchResult',
        category: SEARCH_CATEGORY,
        label: 'Focus Previous Search Result'
    });
    export const REFRESH_RESULTS = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.refresh',
        category: SEARCH_CATEGORY,
        label: 'Refresh',
        iconClass: codicon('refresh')
    });
    export const CANCEL_SEARCH = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.cancel',
        category: SEARCH_CATEGORY,
        label: 'Cancel Search',
        iconClass: codicon('search-stop')
    });
    export const COLLAPSE_ALL = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.collapse-all',
        category: SEARCH_CATEGORY,
        label: 'Collapse All',
        iconClass: codicon('collapse-all')
    });
    export const EXPAND_ALL = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.expand-all',
        category: SEARCH_CATEGORY,
        label: 'Expand All',
        iconClass: codicon('expand-all')
    });
    export const CLEAR_ALL = Command.toDefaultLocalizedCommand({
        id: 'search-in-workspace.clear-all',
        category: SEARCH_CATEGORY,
        label: 'Clear Search Results',
        iconClass: codicon('clear-all')
    });
    export const COPY_ALL = Command.toDefaultLocalizedCommand({
        id: 'search.action.copyAll',
        category: SEARCH_CATEGORY,
        label: 'Copy All',
    });
    export const COPY_ONE = Command.toDefaultLocalizedCommand({
        id: 'search.action.copyMatch',
        category: SEARCH_CATEGORY,
        label: 'Copy',
    });
    export const DISMISS_RESULT = Command.toDefaultLocalizedCommand({
        id: 'search.action.remove',
        category: SEARCH_CATEGORY,
        label: 'Dismiss',
    });
    export const REPLACE_RESULT = Command.toDefaultLocalizedCommand({
        id: 'search.action.replace',
    });
    export const REPLACE_ALL_RESULTS = Command.toDefaultLocalizedCommand({
        id: 'search.action.replaceAll'
    });
}

@injectable()
export class SearchInWorkspaceFrontendContribution extends AbstractViewContribution<SearchInWorkspaceWidget> implements
    FrontendApplicationContribution,
    TabBarToolbarContribution,
    StylingParticipant {

    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(ClipboardService) protected readonly clipboardService: ClipboardService;

    @inject(SearchInWorkspaceContextKeyService)
    protected readonly contextKeyService: SearchInWorkspaceContextKeyService;

    constructor() {
        super({
            viewContainerId: SEARCH_VIEW_CONTAINER_ID,
            widgetId: SearchInWorkspaceWidget.ID,
            widgetName: SearchInWorkspaceWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 200
            },
            toggleCommandId: SearchInWorkspaceCommands.TOGGLE_SIW_WIDGET.id
        });
    }

    @postConstruct()
    protected init(): void {
        const updateFocusContextKey = () =>
            this.contextKeyService.searchViewletFocus.set(this.shell.activeWidget instanceof SearchInWorkspaceWidget);
        updateFocusContextKey();
        this.shell.onDidChangeActiveWidget(updateFocusContextKey);
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false });
    }

    override async registerCommands(commands: CommandRegistry): Promise<void> {
        super.registerCommands(commands);
        commands.registerCommand(SearchInWorkspaceCommands.OPEN_SIW_WIDGET, {
            isEnabled: () => this.workspaceService.tryGetRoots().length > 0,
            execute: async () => {
                const widget = await this.openView({ activate: true });
                widget.updateSearchTerm(this.getSearchTerm());
            }
        });

        commands.registerCommand(SearchInWorkspaceCommands.REPLACE_IN_FILES, {
            isEnabled: () => this.workspaceService.tryGetRoots().length > 0,
            execute: async () => {
                const widget = await this.openView({ activate: true });
                widget.updateSearchTerm(this.getSearchTerm(), true);
            }
        });

        commands.registerCommand(SearchInWorkspaceCommands.FOCUS_NEXT_RESULT, {
            isEnabled: () => this.withWidget(undefined, widget => widget.hasResultList()),
            execute: async () => {
                const widget = await this.openView({ reveal: true });
                widget.resultTreeWidget.selectNextResult();
            }
        });

        commands.registerCommand(SearchInWorkspaceCommands.FOCUS_PREV_RESULT, {
            isEnabled: () => this.withWidget(undefined, widget => widget.hasResultList()),
            execute: async () => {
                const widget = await this.openView({ reveal: true });
                widget.resultTreeWidget.selectPreviousResult();
            }
        });

        commands.registerCommand(SearchInWorkspaceCommands.FIND_IN_FOLDER, this.newMultiUriAwareCommandHandler({
            execute: async uris => {
                const resources: string[] = [];
                for (const { stat } of await this.fileService.resolveAll(uris.map(resource => ({ resource })))) {
                    if (stat) {
                        const uri = stat.resource;
                        let uriStr = this.labelProvider.getLongName(uri);
                        if (stat && !stat.isDirectory) {
                            uriStr = this.labelProvider.getLongName(uri.parent);
                        }
                        resources.push(uriStr);
                    }
                }
                const widget = await this.openView({ activate: true });
                widget.findInFolder(resources);
            }
        }));

        commands.registerCommand(SearchInWorkspaceCommands.CANCEL_SEARCH, {
            execute: w => this.withWidget(w, widget => widget.getCancelIndicator() && widget.getCancelIndicator()!.cancel()),
            isEnabled: w => this.withWidget(w, widget => widget.getCancelIndicator() !== undefined),
            isVisible: w => this.withWidget(w, widget => widget.getCancelIndicator() !== undefined)
        });
        commands.registerCommand(SearchInWorkspaceCommands.REFRESH_RESULTS, {
            execute: w => this.withWidget(w, widget => widget.refresh()),
            isEnabled: w => this.withWidget(w, widget => (widget.hasResultList() || widget.hasSearchTerm()) && this.workspaceService.tryGetRoots().length > 0),
            isVisible: w => this.withWidget(w, () => true)
        });
        commands.registerCommand(SearchInWorkspaceCommands.COLLAPSE_ALL, {
            execute: w => this.withWidget(w, widget => widget.collapseAll()),
            isEnabled: w => this.withWidget(w, widget => widget.hasResultList()),
            isVisible: w => this.withWidget(w, widget => !widget.areResultsCollapsed())
        });
        commands.registerCommand(SearchInWorkspaceCommands.EXPAND_ALL, {
            execute: w => this.withWidget(w, widget => widget.expandAll()),
            isEnabled: w => this.withWidget(w, widget => widget.hasResultList()),
            isVisible: w => this.withWidget(w, widget => widget.areResultsCollapsed())
        });
        commands.registerCommand(SearchInWorkspaceCommands.CLEAR_ALL, {
            execute: w => this.withWidget(w, widget => widget.clear()),
            isEnabled: w => this.withWidget(w, widget => widget.hasResultList()),
            isVisible: w => this.withWidget(w, () => true)
        });
        commands.registerCommand(SearchInWorkspaceCommands.DISMISS_RESULT, {
            isEnabled: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0;
            }),
            isVisible: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0;
            }),
            execute: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                if (TreeWidgetSelection.is(selection)) {
                    selection.forEach(n => widget.resultTreeWidget.removeNode(n));
                }
            })
        });
        commands.registerCommand(SearchInWorkspaceCommands.REPLACE_RESULT, {
            isEnabled: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0 && !SearchInWorkspaceFileNode.is(selection[0]);
            }),
            isVisible: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0 && !SearchInWorkspaceFileNode.is(selection[0]);
            }),
            execute: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                if (TreeWidgetSelection.is(selection)) {
                    selection.forEach(n => widget.resultTreeWidget.replace(n));
                }
            }),
        });
        commands.registerCommand(SearchInWorkspaceCommands.REPLACE_ALL_RESULTS, {
            isEnabled: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0
                    && SearchInWorkspaceFileNode.is(selection[0]);
            }),
            isVisible: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0
                    && SearchInWorkspaceFileNode.is(selection[0]);
            }),
            execute: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                if (TreeWidgetSelection.is(selection)) {
                    selection.forEach(n => widget.resultTreeWidget.replace(n));
                }
            }),
        });
        commands.registerCommand(SearchInWorkspaceCommands.COPY_ONE, {
            isEnabled: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0;
            }),
            isVisible: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0;
            }),
            execute: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                if (TreeWidgetSelection.is(selection)) {
                    const string = widget.resultTreeWidget.nodeToString(selection[0], true);
                    if (string.length !== 0) {
                        this.clipboardService.writeText(string);
                    }
                }
            })
        });
        commands.registerCommand(SearchInWorkspaceCommands.COPY_ALL, {
            isEnabled: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0;
            }),
            isVisible: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                return TreeWidgetSelection.isSource(selection, widget.resultTreeWidget) && selection.length > 0;
            }),
            execute: () => this.withWidget(undefined, widget => {
                const { selection } = this.selectionService;
                if (TreeWidgetSelection.is(selection)) {
                    const string = widget.resultTreeWidget.treeToString();
                    if (string.length !== 0) {
                        this.clipboardService.writeText(string);
                    }
                }
            })
        });
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), fn: (widget: SearchInWorkspaceWidget) => T): T | false {
        if (widget instanceof SearchInWorkspaceWidget && widget.id === SearchInWorkspaceWidget.ID) {
            return fn(widget);
        }
        return false;
    }

    /**
     * Get the search term based on current editor selection.
     * @returns the selection if available.
     */
    protected getSearchTerm(): string {
        if (!this.editorManager.currentEditor) {
            return '';
        }
        // Get the current editor selection.
        const selection = this.editorManager.currentEditor.editor.selection;
        // Compute the selection range.
        const selectedRange: Range = Range.create(
            selection.start.line,
            selection.start.character,
            selection.end.line,
            selection.end.character
        );
        // Return the selection text if available, else return empty.
        return this.editorManager.currentEditor
            ? this.editorManager.currentEditor.editor.document.getText(selectedRange)
            : '';
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            keybinding: 'ctrlcmd+shift+f'
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.FIND_IN_FOLDER.id,
            keybinding: 'shift+alt+f',
            when: 'explorerResourceIsFolder'
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.FOCUS_NEXT_RESULT.id,
            keybinding: 'f4',
            when: 'hasSearchResult'
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.FOCUS_PREV_RESULT.id,
            keybinding: 'shift+f4',
            when: 'hasSearchResult'
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.DISMISS_RESULT.id,
            keybinding: isOSX ? 'cmd+backspace' : 'del',
            when: 'searchViewletFocus && !inputBoxFocus'
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.REPLACE_RESULT.id,
            keybinding: 'ctrlcmd+shift+1',
            when: 'searchViewletFocus && replaceActive',
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.REPLACE_ALL_RESULTS.id,
            keybinding: 'ctrlcmd+shift+1',
            when: 'searchViewletFocus && replaceActive',
        });
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.COPY_ONE.id,
            keybinding: 'ctrlcmd+c',
            when: 'searchViewletFocus && !inputBoxFocus'
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(NavigatorContextMenu.SEARCH, {
            commandId: SearchInWorkspaceCommands.FIND_IN_FOLDER.id,
            when: 'explorerResourceIsFolder'
        });
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            order: '2'
        });
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: SearchInWorkspaceCommands.REPLACE_IN_FILES.id,
            order: '3'
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.INTERNAL, {
            commandId: SearchInWorkspaceCommands.REPLACE_RESULT.id,
            label: nls.localizeByDefault('Replace'),
            order: '1',
            when: 'replaceActive',
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.INTERNAL, {
            commandId: SearchInWorkspaceCommands.REPLACE_ALL_RESULTS.id,
            label: nls.localizeByDefault('Replace All'),
            order: '1',
            when: 'replaceActive',
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.INTERNAL, {
            commandId: SearchInWorkspaceCommands.DISMISS_RESULT.id,
            order: '1'
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.COPY, {
            commandId: SearchInWorkspaceCommands.COPY_ONE.id,
            order: '1',
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.COPY, {
            commandId: CommonCommands.COPY_PATH.id,
            order: '2',
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.COPY, {
            commandId: SearchInWorkspaceCommands.COPY_ALL.id,
            order: '3',
        });
        menus.registerMenuAction(SearchInWorkspaceResultTreeWidget.Menus.EXTERNAL, {
            commandId: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            order: '1',
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        const widget = await this.widget;
        const onDidChange = widget.onDidUpdate;
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.CANCEL_SEARCH.id,
            command: SearchInWorkspaceCommands.CANCEL_SEARCH.id,
            tooltip: SearchInWorkspaceCommands.CANCEL_SEARCH.label,
            priority: 0,
            onDidChange
        });
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.REFRESH_RESULTS.id,
            command: SearchInWorkspaceCommands.REFRESH_RESULTS.id,
            tooltip: SearchInWorkspaceCommands.REFRESH_RESULTS.label,
            priority: 1,
            onDidChange
        });
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.CLEAR_ALL.id,
            command: SearchInWorkspaceCommands.CLEAR_ALL.id,
            tooltip: SearchInWorkspaceCommands.CLEAR_ALL.label,
            priority: 2,
            onDidChange
        });
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.COLLAPSE_ALL.id,
            command: SearchInWorkspaceCommands.COLLAPSE_ALL.id,
            tooltip: SearchInWorkspaceCommands.COLLAPSE_ALL.label,
            priority: 3,
            onDidChange
        });
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.EXPAND_ALL.id,
            command: SearchInWorkspaceCommands.EXPAND_ALL.id,
            tooltip: SearchInWorkspaceCommands.EXPAND_ALL.label,
            priority: 3,
            onDidChange
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return UriAwareCommandHandler.MonoSelect(this.selectionService, handler);
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        return UriAwareCommandHandler.MultiSelect(this.selectionService, handler);
    }

    registerThemeStyle(theme: ColorTheme, collector: CssStyleCollector): void {
        const contrastBorder = theme.getColor('contrastBorder');
        if (contrastBorder && isHighContrast(theme.type)) {
            collector.addRule(`
                .t-siw-search-container .searchHeader .search-field-container {
                    border-color: ${contrastBorder};
                }
            `);
        }
    }
}
