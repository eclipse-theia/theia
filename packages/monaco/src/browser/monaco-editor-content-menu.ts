// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ArrayUtils, CommandMenu, CommandRegistry, CompoundMenuNode, Disposable, Event, MenuModelRegistry, MenuNode } from '@theia/core';
import { ObservableFromEvent, ObservableUtils } from '@theia/core/lib/common/observable';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Context } from '@theia/core/lib/browser/context-key-service';
import { EditorManager, EDITOR_CONTENT_MENU, EditorWidget } from '@theia/editor/lib/browser';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { MonacoContextKeyService } from './monaco-context-key-service';
import { MonacoEditor } from './monaco-editor';
import { MonacoEditorOverlayButton } from './monaco-editor-overlay-button';

/**
 * Implements {@link EDITOR_CONTENT_MENU} for {@link MonacoEditor}s.
 */
@injectable()
export class MonacoEditorContentMenuContribution implements FrontendApplicationContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MonacoContextKeyService)
    protected readonly contextKeyService: MonacoContextKeyService;

    onStart(): void {
        this.editorManager.onCreated(editorWidget => {
            const editor = MonacoEditor.get(editorWidget);
            if (editor) {
                const disposable = this.createEditorContentMenu(editor, editorWidget);
                editor.onDispose(() => disposable.dispose());
            }
        });
    }

    protected createEditorContentMenu(editor: MonacoEditor, editorWidget: EditorWidget): Disposable {
        const contextKeyService = (editor.getControl() as unknown as ICodeEditor).invokeWithinContext( // get the editor-scoped context key service
            accessor => accessor.get(IContextKeyService)
        );
        const context: Context = {
            getValue: key => contextKeyService.getContextKeyValue(key),
            onDidChange: Event.map(contextKeyService.onDidChangeContext, event => ({
                affects: keys => event.affectsSome(keys)
            }))
        };
        const menuNodesObservable = ObservableFromEvent.create(this.menus.onDidChange,
            () => this.getEditorContentMenuNodes(),
            { isEqual: (a, b) => ArrayUtils.equals(a, b) }
        );
        return ObservableUtils.autorunWithDisposables(({ toDispose }) => {
            const menuNodes = menuNodesObservable.get();
            const firstMatchObservable = ObservableFromEvent.create(contextKeyService.onDidChangeContext, () => this.withContext(context,
                () => menuNodes.find(menuNode => menuNode.isVisible(EDITOR_CONTENT_MENU, this.contextKeyService, undefined, editorWidget))
            ));
            // eslint-disable-next-line @typescript-eslint/no-shadow
            toDispose.push(ObservableUtils.autorunWithDisposables(({ toDispose }) => {
                const firstMatch = firstMatchObservable.get();
                if (firstMatch) {
                    const button = new MonacoEditorOverlayButton(editor, firstMatch.label);
                    toDispose.push(button);
                    toDispose.push(button.onClick(() =>
                        this.withContext(context, () => firstMatch.run(EDITOR_CONTENT_MENU, editorWidget))
                    ));

                    const handlersObservable = ObservableFromEvent.create(this.commands.onCommandsChanged,
                        () => this.commands.getAllHandlers(firstMatch.id),
                        { isEqual: (a, b) => ArrayUtils.equals(a, b) }
                    );
                    // eslint-disable-next-line @typescript-eslint/no-shadow
                    toDispose.push(ObservableUtils.autorunWithDisposables(({ toDispose }) => {
                        this.withContext(context, () => {
                            button.enabled = firstMatch.isEnabled(EDITOR_CONTENT_MENU, editorWidget);
                            const handlers = handlersObservable.get();
                            for (const handler of handlers) {
                                const { onDidChangeEnabled } = handler;
                                if (onDidChangeEnabled) {
                                    // for handlers with declarative enablement such as those originating from `PluginContributionHandler.registerCommand`,
                                    // the onDidChangeEnabled event is context-dependent, so we need to ensure the subscription is made within `withContext`
                                    toDispose.push(onDidChangeEnabled(() => this.withContext(context, () =>
                                        button.enabled = firstMatch.isEnabled(EDITOR_CONTENT_MENU, editorWidget)
                                    )));
                                }
                            }
                        });
                    }));
                }
            }));
        });
    }

    protected getEditorContentMenuNodes(): CommandMenu[] {
        const result: CommandMenu[] = [];
        const children = this.menus.getMenu(EDITOR_CONTENT_MENU)?.children ?? [];
        const getCommandMenuNodes = (nodes: MenuNode[]) => nodes.filter(CommandMenu.is);
        // inline the special navigation group, if any; the navigation group would always be the first element
        if (children.length && CompoundMenuNode.isNavigationGroup(children[0])) {
            result.push(...getCommandMenuNodes(children[0].children));
        }
        result.push(...getCommandMenuNodes(children));
        return result;
    }

    protected withContext<T>(context: Context, callback: () => T): T {
        return this.contextKeyService.withContext(context, callback);
    }
}
