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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import debounce = require('@theia/core/shared/lodash.debounce');
import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution, CompositeTreeNode, SelectableTreeNode, Widget, codicon } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { PROBLEM_KIND, ProblemMarker } from '../../common/problem-marker';
import { ProblemManager, ProblemStat } from './problem-manager';
import { ProblemWidget, PROBLEMS_WIDGET_ID } from './problem-widget';
import { MenuPath, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { ProblemSelection } from './problem-selection';
import { nls } from '@theia/core/lib/common/nls';

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
    export const COPY: Command = {
        id: 'problems.copy'
    };
    export const COPY_MESSAGE: Command = {
        id: 'problems.copy.message',
    };
    export const CLEAR_ALL = Command.toLocalizedCommand({
        id: 'problems.clear.all',
        category: 'Problems',
        label: 'Clear All',
        iconClass: codicon('clear-all')
    }, 'theia/markers/clearAll', nls.getDefaultKey('Problems'));
}

@injectable()
export class ProblemContribution extends AbstractViewContribution<ProblemWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(ProblemManager) protected readonly problemManager: ProblemManager;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(SelectionService) protected readonly selectionService: SelectionService;

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
        commands.registerCommand(ProblemsCommands.COPY,
            new ProblemSelection.CommandHandler(this.selectionService, {
                multi: false,
                isEnabled: () => true,
                isVisible: () => true,
                execute: selection => this.copy(selection)
            })
        );
        commands.registerCommand(ProblemsCommands.COPY_MESSAGE,
            new ProblemSelection.CommandHandler(this.selectionService, {
                multi: false,
                isEnabled: () => true,
                isVisible: () => true,
                execute: selection => this.copyMessage(selection)
            })
        );
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
        menus.registerMenuAction(ProblemsMenu.PROBLEMS, {
            commandId: ProblemsCommands.COLLAPSE_ALL.id,
            label: nls.localizeByDefault('Collapse All'),
            order: '2'
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

    protected async collapseAllProblems(): Promise<void> {
        const { model } = await this.widget;
        const root = model.root as CompositeTreeNode;
        const firstChild = root.children[0];
        root.children.forEach(child => CompositeTreeNode.is(child) && model.collapseAll(child));
        if (SelectableTreeNode.is(firstChild)) {
            model.selectNode(firstChild);
        }
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

    protected copy(selection: ProblemSelection): void {
        const marker = selection.marker as ProblemMarker;
        const serializedProblem = JSON.stringify({
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
        }, undefined, '\t');

        this.addToClipboard(serializedProblem);
    }

    protected copyMessage(selection: ProblemSelection): void {
        const marker = selection.marker as ProblemMarker;
        this.addToClipboard(marker.data.message);
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (problems: ProblemWidget) => T): T | false {
        if (widget instanceof ProblemWidget && widget.id === PROBLEMS_WIDGET_ID) {
            return cb(widget);
        }
        return false;
    }
}
