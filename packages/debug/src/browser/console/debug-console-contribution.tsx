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
import '../../../src/browser/style/debug.css';

import { ConsoleSessionManager } from '@theia/console/lib/browser/console-session-manager';
import { ConsoleOptions, ConsoleWidget } from '@theia/console/lib/browser/console-widget';
import { AbstractViewContribution, bindViewContribution, codicon, HoverService, Widget, WidgetFactory } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { nls } from '@theia/core/lib/common/nls';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { Severity } from '@theia/core/lib/common/severity';
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { DebugSession } from '../debug-session';
import { DebugSessionManager, DidChangeActiveDebugSession } from '../debug-session-manager';
import { DebugConsoleSession, DebugConsoleSessionFactory } from './debug-console-session';
import { Disposable, DisposableCollection, Emitter, Event, InMemoryResources } from '@theia/core';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import debounce = require('@theia/core/shared/lodash.debounce');

export type InDebugReplContextKey = ContextKey<boolean>;
export const InDebugReplContextKey = Symbol('inDebugReplContextKey');

export namespace DebugConsoleCommands {

    export const DEBUG_CATEGORY = 'Debug';

    export const CLEAR = Command.toDefaultLocalizedCommand({
        id: 'debug.console.clear',
        category: DEBUG_CATEGORY,
        label: 'Clear Console',
        iconClass: codicon('clear-all')
    });
}

@injectable()
export class DebugConsoleContribution extends AbstractViewContribution<ConsoleWidget> implements TabBarToolbarContribution, Disposable {

    @inject(ConsoleSessionManager)
    protected consoleSessionManager: ConsoleSessionManager;

    @inject(DebugConsoleSessionFactory)
    protected debugConsoleSessionFactory: DebugConsoleSessionFactory;

    @inject(DebugSessionManager)
    protected debugSessionManager: DebugSessionManager;

    @inject(InMemoryResources)
    protected readonly resources: InMemoryResources;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    protected readonly DEBUG_CONSOLE_SEVERITY_ID = 'debugConsoleSeverity';

    protected filterInputRef: HTMLInputElement | undefined;
    protected currentFilterValue = '';
    protected readonly filterChangedEmitter = new Emitter<void>();
    protected readonly toDispose = new DisposableCollection();

    constructor() {
        super({
            widgetId: DebugConsoleContribution.options.id,
            widgetName: DebugConsoleContribution.options.title!.label!,
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'debug:console:toggle',
            toggleKeybinding: 'ctrlcmd+shift+y'
        });
    }

    @postConstruct()
    protected init(): void {
        this.resources.add(DebugConsoleSession.uri, '');
        this.toDispose.pushAll([
            this.debugSessionManager.onDidCreateDebugSession(session => {
                const consoleParent = session.findConsoleParent();
                if (consoleParent) {
                    const parentConsoleSession = this.consoleSessionManager.get(consoleParent.id);
                    if (parentConsoleSession instanceof DebugConsoleSession) {
                        session.on('output', event => parentConsoleSession.logOutput(parentConsoleSession.debugSession, event));
                    }
                } else {
                    const consoleSession = this.debugConsoleSessionFactory(session);
                    this.consoleSessionManager.add(consoleSession);
                    session.on('output', event => consoleSession.logOutput(session, event));
                }
            }),
            this.debugSessionManager.onDidChangeActiveDebugSession(event => this.handleActiveDebugSessionChanged(event)),
            this.debugSessionManager.onDidDestroyDebugSession(session => {
                const consoleSession = this.consoleSessionManager.get(session.id);
                if (consoleSession instanceof DebugConsoleSession) {
                    consoleSession.markTerminated();
                }
            }),
            this.consoleSessionManager.onDidChangeSelectedSession(() => {
                const session = this.consoleSessionManager.selectedSession;
                if (session && this.filterInputRef) {
                    const filterValue = session.filterText || '';
                    this.filterInputRef.value = filterValue;
                    this.currentFilterValue = filterValue;
                    this.filterChangedEmitter.fire();
                }
            })
        ]);
    }

    protected handleActiveDebugSessionChanged(event: DidChangeActiveDebugSession): void {
        if (!event.current) {
            return;
        } else {
            const topSession = event.current.findConsoleParent() || event.current;
            const consoleSession = topSession ? this.consoleSessionManager.get(topSession.id) : undefined;
            this.consoleSessionManager.selectedSession = consoleSession;
            const consoleSelector = document.getElementById('debugConsoleSelector');
            if (consoleSession && consoleSelector instanceof HTMLSelectElement) {
                consoleSelector.value = consoleSession.id;
            }
        }
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(DebugConsoleCommands.CLEAR, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: widget => this.withWidget(widget, () => {
                this.clearConsole();
            }),
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: 'debug-console-severity',
            render: widget => this.renderSeveritySelector(widget),
            isVisible: widget => this.withWidget(widget, () => true),
            onDidChange: this.consoleSessionManager.onDidChangeSeverity,
            priority: -3,
        });

        toolbarRegistry.registerItem({
            id: 'debug-console-filter',
            render: () => this.renderFilterInput(),
            isVisible: widget => this.withWidget(widget, () => true),
            onDidChange: this.filterChangedEmitter.event,
            priority: -2,
        });

        toolbarRegistry.registerItem({
            id: 'debug-console-session-selector',
            render: widget => this.renderDebugConsoleSelector(widget),
            isVisible: widget => this.withWidget(widget, () => this.consoleSessionManager.all.length >= 1),
            onDidChange: Event.any(
                this.consoleSessionManager.onDidAddSession,
                this.consoleSessionManager.onDidDeleteSession,
                this.consoleSessionManager.onDidChangeSelectedSession
            ) as Event<void>,
            priority: -1,
        });

        toolbarRegistry.registerItem({
            id: DebugConsoleCommands.CLEAR.id,
            command: DebugConsoleCommands.CLEAR.id,
            tooltip: DebugConsoleCommands.CLEAR.label,
            priority: 0,
        });
    }

    static options: ConsoleOptions = {
        id: 'debug-console',
        title: {
            label: nls.localizeByDefault('Debug Console'),
            iconClass: codicon('debug-console')
        },
        input: {
            uri: DebugConsoleSession.uri,
            options: {
                autoSizing: true,
                minHeight: 1,
                maxHeight: 10
            }
        }
    };

    static async create(parent: interfaces.Container): Promise<ConsoleWidget> {
        const inputFocusContextKey = parent.get<InDebugReplContextKey>(InDebugReplContextKey);
        const child = ConsoleWidget.createContainer(parent, {
            ...DebugConsoleContribution.options,
            inputFocusContextKey
        });
        const widget = child.get(ConsoleWidget);
        await widget.ready;
        return widget;
    }

    static bindContribution(bind: interfaces.Bind): void {
        bind(InDebugReplContextKey).toDynamicValue(({ container }) =>
            container.get<ContextKeyService>(ContextKeyService).createKey('inDebugRepl', false)
        ).inSingletonScope();
        bind(DebugConsoleSession).toSelf().inRequestScope();
        bind(DebugConsoleSessionFactory).toFactory(context => (session: DebugSession) => {
            const consoleSession = context.container.get(DebugConsoleSession);
            consoleSession.debugSession = session;
            return consoleSession;
        });
        bind(ConsoleSessionManager).toSelf().inSingletonScope();
        bindViewContribution(bind, DebugConsoleContribution);
        bind(TabBarToolbarContribution).toService(DebugConsoleContribution);
        bind(WidgetFactory).toDynamicValue(({ container }) => ({
            id: DebugConsoleContribution.options.id,
            createWidget: () => DebugConsoleContribution.create(container)
        }));
    }

    protected renderSeveritySelector(widget: Widget | undefined): React.ReactNode {
        const severityElements: SelectOption[] = Severity.toArray().map(e => ({
            value: e,
            label: Severity.toLocaleString(e)
        }));

        return <div onMouseEnter={this.handleSeverityMouseEnter}>
            <SelectComponent
                id={this.DEBUG_CONSOLE_SEVERITY_ID}
                key="debugConsoleSeverity"
                options={severityElements}
                defaultValue={this.consoleSessionManager.severity || Severity.Ignore}
                onChange={this.changeSeverity}
            />
        </div>;
    }

    protected handleSeverityMouseEnter = (e: React.MouseEvent<HTMLDivElement>): void => {
        const tooltipContent = new MarkdownStringImpl();
        tooltipContent.appendMarkdown(nls.localize(
            'theia/debug/consoleSeverityTooltip',
            'Filter console output by severity level. Only messages with the selected severity will be shown.'
        ));
        this.hoverService.requestHover({
            content: tooltipContent,
            target: e.currentTarget,
            position: 'bottom'
        });
    };

    protected renderDebugConsoleSelector(widget: Widget | undefined): React.ReactNode {
        const availableConsoles: SelectOption[] = [];
        const sortedSessions = this.consoleSessionManager.all
            .filter((e): e is DebugConsoleSession => e instanceof DebugConsoleSession)
            .sort((a, b) => {
                if (a.terminated !== b.terminated) {
                    return a.terminated ? 1 : -1;
                }
                return 0;
            });

        sortedSessions.forEach(session => {
            let label = session.debugSession.label;
            if (session.terminated) {
                label = `${label} (${nls.localizeByDefault('Stopped')})`;
            }
            availableConsoles.push({
                value: session.id,
                label
            });
        });

        const selectedId = this.consoleSessionManager.selectedSession?.id;

        return <div onMouseEnter={this.handleSessionSelectorMouseEnter}><SelectComponent
            key="debugConsoleSelector"
            options={availableConsoles}
            defaultValue={selectedId}
            onChange={this.changeDebugConsole} />
        </div>;
    }

    protected handleSessionSelectorMouseEnter = (e: React.MouseEvent<HTMLDivElement>): void => {
        const tooltipContent = new MarkdownStringImpl();
        tooltipContent.appendMarkdown(nls.localize(
            'theia/debug/consoleSessionSelectorTooltip',
            'Switch between debug sessions. Each debug session has its own console output.'
        ));
        this.hoverService.requestHover({
            content: tooltipContent,
            target: e.currentTarget,
            position: 'bottom'
        });
    };

    protected renderFilterInput(): React.ReactNode {
        return (
            <div className="item enabled debug-console-filter-container">
                <input
                    type="text"
                    className="theia-input"
                    placeholder={nls.localize('theia/debug/consoleFilter', 'Filter (e.g. text, !exclude)')}
                    aria-label={nls.localize('theia/debug/consoleFilterAriaLabel', 'Filter debug console output')}
                    ref={ref => { this.filterInputRef = ref ?? undefined; }}
                    onChange={this.handleFilterInputChange}
                    onMouseEnter={this.handleFilterMouseEnter}
                />
                {this.currentFilterValue && <span
                    className="debug-console-filter-btn codicon codicon-close action-label"
                    role="button"
                    aria-label={nls.localizeByDefault('Clear')}
                    onClick={this.handleFilterClear}
                    title={nls.localizeByDefault('Clear')}
                />}
            </div>
        );
    }

    protected handleFilterInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const value = e.target.value;
        this.currentFilterValue = value;
        this.filterChangedEmitter.fire();
        this.applyFilterDebounced(value);
    };

    protected applyFilterDebounced = debounce((value: string) => {
        const session = this.consoleSessionManager.selectedSession;
        if (session) {
            session.filterText = value;
        }
    }, 150);

    protected handleFilterClear = (): void => {
        if (this.filterInputRef) {
            this.filterInputRef.value = '';
        }
        this.currentFilterValue = '';
        const session = this.consoleSessionManager.selectedSession;
        if (session) {
            session.filterText = '';
        }
        this.filterChangedEmitter.fire();
    };

    protected handleFilterMouseEnter = (e: React.MouseEvent<HTMLInputElement>): void => {
        const tooltipContent = new MarkdownStringImpl();
        tooltipContent.appendMarkdown(nls.localize(
            'theia/debug/consoleFilterTooltip',
            'Filter console output by text. Separate multiple terms with commas. Prefix with `!` to exclude a term.\n\n' +
            'Examples:\n\n' +
            '- `text` - show lines containing "text"\n' +
            '- `text, other` - show lines containing "text" or "other"\n' +
            '- `!text` - hide lines containing "text"\n' +
            '- `text, !other` - show "text" but hide "other"'
        ));
        this.hoverService.requestHover({
            content: tooltipContent,
            target: e.currentTarget,
            position: 'bottom'
        });
    };

    protected changeDebugConsole = (option: SelectOption) => {
        const id = option.value!;
        const session = this.consoleSessionManager.get(id);
        this.consoleSessionManager.selectedSession = session;
    };

    protected changeSeverity = (option: SelectOption) => {
        this.consoleSessionManager.severity = Severity.fromValue(option.value);
    };

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), fn: (widget: ConsoleWidget) => T): T | false {
        if (widget instanceof ConsoleWidget && widget.id === DebugConsoleContribution.options.id) {
            return fn(widget);
        }
        return false;
    }

    /**
     * Clear the console widget.
     */
    protected async clearConsole(): Promise<void> {
        const widget = await this.widget;
        widget.clear();
        const selectedSession = this.consoleSessionManager.selectedSession;
        if (selectedSession instanceof DebugConsoleSession && selectedSession.terminated) {
            this.consoleSessionManager.delete(selectedSession.id);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
