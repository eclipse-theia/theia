// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Command, CommandHandler, CommandRegistry, Emitter, Event, URI } from '@theia/core';
import { ApplicationShell, Keybinding, KeybindingRegistry, LabelProvider, Widget, WidgetManager } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TabBarToolbarAction, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Container } from '@theia/core/shared/inversify';
import { EditorWidget } from '@theia/editor/lib/browser';
import { DiffEntryHeaderWidget, MultiDiffEditor, MultiDiffEditorData } from './multi-diff-editor';
import { MULTI_DIFF_EDITOR_FOCUS, MultiDiffEditorCommands, MultiDiffEditorContribution } from './multi-diff-editor-contribution';

disableJSDOM();

describe('MultiDiffEditorContribution', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const resource = { originalUri: new URI('file:///workspace/a.ts'), modifiedUri: new URI('file:///workspace/b.ts') };
    const labelProvider = {
        getIcon: () => 'codicon codicon-file',
        getName: (uri: URI) => uri.path.base,
        getLongName: (uri: URI) => uri.path.toString()
    } as unknown as LabelProvider;

    interface Setup {
        contribution: MultiDiffEditorContribution;
        shell: { currentWidget?: Widget; activeWidget?: Widget };
        activeWidgetChanged: Emitter<void>;
        widgetCreated: Emitter<{ widget: Widget }>;
        focusKey: { set: sinon.SinonSpy };
        handlers: Map<string, CommandHandler>;
    }

    function setup(): Setup {
        const activeWidgetChanged = new Emitter<void>();
        const widgetCreated = new Emitter<{ widget: Widget }>();
        const shell: Setup['shell'] & { onDidChangeActiveWidget: Event<void> } = { onDidChangeActiveWidget: activeWidgetChanged.event };
        const focusKey = { set: sinon.spy() };
        const createKey = sinon.stub().returns(focusKey);
        const container = new Container();
        container.bind(ApplicationShell).toConstantValue(shell as unknown as ApplicationShell);
        container.bind(WidgetManager).toConstantValue({ onDidCreateWidget: widgetCreated.event } as unknown as WidgetManager);
        container.bind(ContextKeyService).toConstantValue({ createKey } as unknown as ContextKeyService);
        container.bind(MultiDiffEditorContribution).toSelf();
        const contribution = container.get(MultiDiffEditorContribution);
        expect(createKey.calledOnceWith(MULTI_DIFF_EDITOR_FOCUS, false)).to.be.true;
        const handlers = new Map<string, CommandHandler>();
        contribution.registerCommands({
            registerCommand: (command: Command, handler: CommandHandler) => handlers.set(command.id, handler)
        } as unknown as CommandRegistry);
        return { contribution, shell, activeWidgetChanged, widgetCreated, focusKey, handlers };
    }

    function createEditor(count: number): MultiDiffEditor {
        const container = new Container();
        container.bind(MultiDiffEditorData).toConstantValue({ title: 'Changes', resources: Array(count).fill(resource) });
        container.bind(MultiDiffEditor).toSelf();
        const editor = container.get(MultiDiffEditor);
        for (let index = 0; index < count; index++) {
            editor.addDiffEntry(resource, new DiffEntryHeaderWidget(resource, labelProvider));
        }
        return editor;
    }

    it('should act on the toolbar widget, or on the multi-diff editor that contains the current widget', () => {
        const previous = globalThis.requestAnimationFrame;
        globalThis.requestAnimationFrame = sinon.stub().returns(0);
        const { shell, handlers } = setup();
        const editor = createEditor(2);
        const embedded = new Widget() as EditorWidget;
        editor.entries[1].setEditor(embedded);
        const handler = (command: Command) => handlers.get(command.id)!;
        try {
            expect(handler(MultiDiffEditorCommands.GO_TO_NEXT_FILE).isVisible!()).to.be.false;
            shell.currentWidget = embedded;
            expect(handler(MultiDiffEditorCommands.GO_TO_NEXT_FILE).isEnabled!()).to.be.true;
            expect(handler(MultiDiffEditorCommands.GO_TO_PREVIOUS_FILE).isEnabled!()).to.be.false;
            expect(handler(MultiDiffEditorCommands.GO_TO_PREVIOUS_CHANGE).isEnabled!()).to.be.false;
            expect(handler(MultiDiffEditorCommands.GO_TO_NEXT_CHANGE).isEnabled!()).to.be.true;
            // A toolbar passes its own widget, which wins over the current widget.
            expect(handler(MultiDiffEditorCommands.GO_TO_NEXT_FILE).isVisible!(new Widget())).to.be.false;
            expect(handler(MultiDiffEditorCommands.GO_TO_NEXT_FILE).isVisible!(editor)).to.be.true;

            const goToNextEntry = sinon.spy(editor, 'goToNextEntry');
            handler(MultiDiffEditorCommands.GO_TO_NEXT_FILE).execute(editor);
            expect(goToNextEntry.calledOnce).to.be.true;
            const goToPreviousEntry = sinon.spy(editor, 'goToPreviousEntry');
            editor.entries[1].node.dispatchEvent(new window.Event('focusin', { bubbles: true }));
            expect(handler(MultiDiffEditorCommands.GO_TO_PREVIOUS_FILE).isEnabled!(editor)).to.be.true;
            handler(MultiDiffEditorCommands.GO_TO_PREVIOUS_FILE).execute();
            expect(goToPreviousEntry.calledOnce).to.be.true;
        } finally {
            editor.dispose();
            globalThis.requestAnimationFrame = previous;
        }
    });

    it('should show either collapse all or expand all, and disable both without entries', () => {
        const { handlers } = setup();
        const editor = createEditor(2);
        const empty = createEditor(0);
        const collapseAll = handlers.get(MultiDiffEditorCommands.COLLAPSE_ALL.id)!;
        const expandAll = handlers.get(MultiDiffEditorCommands.EXPAND_ALL.id)!;
        try {
            expect(collapseAll.isVisible!(editor)).to.be.true;
            expect(expandAll.isVisible!(editor)).to.be.false;
            editor.entries[0].setCollapsed(true);
            expect(collapseAll.isVisible!(editor)).to.be.true;
            collapseAll.execute(editor);
            expect(editor.areAllEntriesCollapsed()).to.be.true;
            expect(collapseAll.isVisible!(editor)).to.be.false;
            expect(expandAll.isVisible!(editor)).to.be.true;
            expandAll.execute(editor);
            expect(editor.entries.some(entry => entry.isCollapsed)).to.be.false;
            expect(collapseAll.isEnabled!(empty)).to.be.false;
            expect(expandAll.isEnabled!(empty)).to.be.false;
        } finally {
            editor.dispose();
            empty.dispose();
        }
    });

    it('should track the focus in multi-diff editors and refresh the toolbar when their navigation state changes', () => {
        const { contribution, shell, activeWidgetChanged, widgetCreated, focusKey } = setup();
        const editor = createEditor(1);
        const embedded = new Widget() as EditorWidget;
        editor.entries[0].setEditor(embedded);
        const items: TabBarToolbarAction[] = [];
        contribution.registerToolbarItems({ registerItem: (item: TabBarToolbarAction) => items.push(item) } as unknown as TabBarToolbarRegistry);
        const toolbarChanged = sinon.spy();
        items[0].onDidChange!(toolbarChanged);
        try {
            expect(items.map(item => item.id)).to.deep.equal([
                MultiDiffEditorCommands.GO_TO_PREVIOUS_FILE.id,
                MultiDiffEditorCommands.GO_TO_NEXT_FILE.id,
                MultiDiffEditorCommands.GO_TO_PREVIOUS_CHANGE.id,
                MultiDiffEditorCommands.GO_TO_NEXT_CHANGE.id,
                MultiDiffEditorCommands.COLLAPSE_ALL.id,
                MultiDiffEditorCommands.EXPAND_ALL.id
            ]);
            shell.activeWidget = embedded;
            activeWidgetChanged.fire();
            expect(focusKey.set.lastCall.args[0]).to.be.true;
            shell.currentWidget = embedded;
            shell.activeWidget = undefined;
            activeWidgetChanged.fire();
            expect(focusKey.set.lastCall.args[0]).to.be.false;

            widgetCreated.fire({ widget: editor });
            editor.collapseAll();
            expect(toolbarChanged.calledOnce).to.be.true;
        } finally {
            editor.dispose();
        }
    });

    it('should bind change navigation to Alt+F5 and Shift+Alt+F5 in multi-diff editors', () => {
        const { contribution } = setup();
        const bindings: Keybinding[] = [];
        contribution.registerKeybindings({ registerKeybinding: (binding: Keybinding) => bindings.push(binding) } as unknown as KeybindingRegistry);
        expect(bindings).to.deep.equal([
            { command: MultiDiffEditorCommands.GO_TO_NEXT_CHANGE.id, keybinding: 'alt+f5', when: MULTI_DIFF_EDITOR_FOCUS },
            { command: MultiDiffEditorCommands.GO_TO_PREVIOUS_CHANGE.id, keybinding: 'shift+alt+f5', when: MULTI_DIFF_EDITOR_FOCUS }
        ]);
    });
});
