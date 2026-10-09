// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { MaybePromise, nls, UNTITLED_SCHEME } from '@theia/core';
import { ApplicationShell, isLocked, NavigatableWidget, Saveable, Widget } from '@theia/core/lib/browser';
import { injectable, inject } from '@theia/core/shared/inversify';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { AIVariable, ResolvedAIVariable, AIVariableContribution, AIVariableResolver, AIVariableService, AIVariableResolutionRequest, AIVariableContext } from '../common';

export const OPEN_EDITORS_VARIABLE: AIVariable = {
    id: 'openEditors',
    description: nls.localize('theia/ai/core/openEditorsVariable/description',
        'A comma-separated list of all currently open editors as workspace-relative paths, each followed by its state, if any '
        + '(e.g., \'my-project/src/index.ts\' (active, unsaved changes)).'),
    name: 'openEditors',
};

export const OPEN_EDITORS_SHORT_VARIABLE: AIVariable = {
    id: 'openEditorsShort',
    description: nls.localize('theia/ai/core/openEditorsShortVariable/description',
        'Short reference to all currently open editors (relative paths with their state, comma-separated)'),
    name: '_ff',
};

/**
 * An open editor as listed by the `openEditors` variable.
 */
export interface OpenEditorInfo {
    uri: URI;
    /** The kind of editor, e.g. `notebook`, if it is not a text editor. */
    kind?: string;
    /** The editor is the current editor of the main area. */
    active: boolean;
    /** The editor is the selected tab of its tab bar, e.g. the other side of a split. */
    visible: boolean;
    dirty: boolean;
    readOnly: boolean;
    preview: boolean;
}

@injectable()
export class OpenEditorsVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(OPEN_EDITORS_VARIABLE, this);
        service.registerResolver(OPEN_EDITORS_SHORT_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        return (request.variable.name === OPEN_EDITORS_VARIABLE.name || request.variable.name === OPEN_EDITORS_SHORT_VARIABLE.name) ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== OPEN_EDITORS_VARIABLE.name && request.variable.name !== OPEN_EDITORS_SHORT_VARIABLE.name) {
            return undefined;
        }

        const openFiles = this.getAllOpenFilesRelative();
        return {
            variable: request.variable,
            value: openFiles
        };
    }

    protected getAllOpenFilesRelative(): string {
        return this.collectOpenEditors().map(editor => this.formatOpenEditor(editor)).join(', ');
    }

    /**
     * Collects the editors of the main and bottom areas in tab order, followed by the text editors that are not in one of
     * their tab bars, e.g. editors in secondary windows. An editor that is open more than once, e.g. in a split, is listed once.
     */
    protected collectOpenEditors(): OpenEditorInfo[] {
        const editors = new Map<string, OpenEditorInfo>();
        const add = (widget: Widget, active: boolean, visible: boolean) => {
            const editor = this.createOpenEditorInfo(widget, active, visible);
            if (!editor) {
                return;
            }
            const key = editor.uri.toString();
            const existing = editors.get(key);
            if (existing) {
                existing.active ||= editor.active;
                existing.visible ||= editor.visible;
                existing.dirty ||= editor.dirty;
                existing.preview &&= editor.preview;
            } else {
                editors.set(key, editor);
            }
        };
        const currentWidget = this.shell.getCurrentWidget('main');
        for (const tabBar of [...this.shell.mainAreaTabBars, ...this.shell.bottomAreaTabBars]) {
            for (const title of tabBar.titles) {
                add(title.owner, title.owner === currentWidget, title === tabBar.currentTitle);
            }
        }
        for (const editor of this.editorManager.all) {
            add(editor, false, false);
        }
        return [...editors.values()];
    }

    protected createOpenEditorInfo(widget: Widget, active: boolean, visible: boolean): OpenEditorInfo | undefined {
        const uri = NavigatableWidget.getUri(widget);
        if (!uri || !this.isListedUri(uri)) {
            return undefined;
        }
        return {
            uri,
            kind: this.getEditorKind(widget),
            active,
            visible,
            dirty: Saveable.isDirty(widget),
            readOnly: isLocked(widget.title),
            preview: this.isPreview(widget)
        };
    }

    /**
     * Only lists editors of files, i.e. no diff editors or views of a file at a git revision.
     */
    protected isListedUri(uri: URI): boolean {
        return uri.scheme === 'file' || uri.scheme === UNTITLED_SCHEME || !!this.workspaceService.getWorkspaceRootUri(uri);
    }

    /**
     * Returns the kind of non-text editors. Notebook editors expose a `notebookType` and custom editors contributed by
     * VS Code extensions a `viewType`. Neither type is available in `@theia/ai-core`, so they are recognized by these properties.
     */
    protected getEditorKind(widget: Widget): string | undefined {
        if (widget instanceof EditorWidget) {
            return undefined;
        }
        const { notebookType, viewType } = widget as { notebookType?: unknown, viewType?: unknown };
        if (typeof notebookType === 'string') {
            return 'notebook';
        }
        if (typeof viewType === 'string') {
            return `custom editor: ${viewType}`;
        }
        return undefined;
    }

    /**
     * Whether the widget is shown as a preview tab, see `PreviewTabWidget` in `@theia/editor-preview`.
     */
    protected isPreview(widget: Widget): boolean {
        return (widget as { isPreview?: unknown }).isPreview === true;
    }

    protected formatOpenEditor(editor: OpenEditorInfo): string {
        const state: string[] = [];
        if (editor.kind) {
            state.push(editor.kind);
        }
        if (editor.active) {
            state.push('active');
        } else if (editor.visible) {
            state.push('visible');
        }
        if (editor.dirty) {
            state.push('unsaved changes');
        }
        if (editor.readOnly) {
            state.push('read-only');
        }
        if (editor.preview) {
            state.push('preview');
        }
        const path = `'${this.getWorkspaceRelativePath(editor.uri)}'`;
        return state.length ? `${path} (${state.join(', ')})` : path;
    }

    protected getWorkspaceRelativePath(uri: URI): string {
        return this.workspaceService.getRootPrefixedPath(uri);
    }
}
