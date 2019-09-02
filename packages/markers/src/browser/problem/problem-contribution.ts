/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import debounce = require('lodash.debounce');
import { injectable, inject } from 'inversify';
import { FrontendApplication, FrontendApplicationContribution, CompositeTreeNode, SelectableTreeNode, Widget } from '@theia/core/lib/browser';
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
        iconClass: 'collapse-all'
    };
    export const COPY: Command = {
        id: 'problems.copy'
    };
    export const COPY_MESSAGE: Command = {
        id: 'problems.copy.message',
    };
}

@injectable()
export class ProblemContribution extends AbstractViewContribution<ProblemWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(ProblemManager) protected readonly problemManager: ProblemManager;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(SelectionService) protected readonly selectionService: SelectionService;

    constructor() {
        super({
            widgetId: PROBLEMS_WIDGET_ID,
            widgetName: 'Problems',
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
                ? `$(times-circle) ${problemStat.errors} $(exclamation-triangle) ${problemStat.warnings}`
                : `$(times-circle) ${problemStat.errors} $(exclamation-triangle) ${problemStat.warnings} $(info-circle) ${problemStat.infos}`,
            alignment: StatusBarAlignment.LEFT,
            priority: 10,
            command: this.toggleCommand ? this.toggleCommand.id : undefined
        });
    }

    registerCommands(commands: CommandRegistry): void {
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
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(ProblemsMenu.CLIPBOARD, {
            commandId: ProblemsCommands.COPY.id,
            label: 'Copy',
            order: '0'
        });
        menus.registerMenuAction(ProblemsMenu.CLIPBOARD, {
            commandId: ProblemsCommands.COPY_MESSAGE.id,
            label: 'Copy Message',
            order: '1'
        });
        menus.registerMenuAction(ProblemsMenu.PROBLEMS, {
            commandId: ProblemsCommands.COLLAPSE_ALL.id,
            label: 'Collapse All',
            order: '2'
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: ProblemsCommands.COLLAPSE_ALL_TOOLBAR.id,
            command: ProblemsCommands.COLLAPSE_ALL_TOOLBAR.id,
            tooltip: 'Collapse All',
            priority: 0,
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
            owner: marker.uri,
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
