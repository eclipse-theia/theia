// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';

export interface TranscriptPreviewMonacoEditorOptions {
    focus?: boolean;
    initialText?: string;
    readOnly?: boolean;
}

export interface TranscriptPreviewMonacoEditor {
    getText(): string;
    focus(): void;
    layout(): void;
    save(): Promise<void>;
    dispose(): void;
    readonly readOnly: boolean;
    readonly onDidChangeContent: Event<void>;
}

/**
 * Embeds the same Monaco stack as the workbench editor ({@link MonacoEditorProvider.createSimpleInline})
 * against the real workspace file URI so language, TextMate grammar, and model sync match the IDE.
 */
export async function createTranscriptPreviewMonacoEditor(
    host: HTMLElement,
    resourcePath: string,
    editorProvider: MonacoEditorProvider,
    options?: TranscriptPreviewMonacoEditorOptions,
): Promise<TranscriptPreviewMonacoEditor> {
    const uri = new URI(resourcePath);
    const readOnly = options?.readOnly ?? false;
    const disposables = new DisposableCollection();
    const onDidChangeContentEmitter = new Emitter<void>();
    disposables.push(onDidChangeContentEmitter);

    const editor = await editorProvider.createSimpleInline(uri, host, {
        readOnly,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        scrollBeyondLastColumn: 0,
        lineNumbers: 'on',
        folding: true,
        minimap: { enabled: false },
        wordWrap: 'off',
        renderLineHighlight: readOnly ? 'none' : 'all',
        glyphMargin: false,
        overviewRulerLanes: readOnly ? 0 : 2,
        scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
        },
    });
    disposables.push(editor);

    const model = editor.document.textEditorModel;
    if (options?.initialText !== undefined && model.getValue() !== options.initialText) {
        model.setValue(options.initialText);
    }

    if (!readOnly) {
        disposables.push(editor.onDocumentContentChanged(() => {
            onDidChangeContentEmitter.fire(undefined);
        }));
    }

    if (options?.focus) {
        editor.focus();
    } else {
        window.requestAnimationFrame(() => editor.resizeToFit());
    }

    return {
        readOnly,
        getText: () => model.getValue(),
        focus: () => editor.focus(),
        layout: () => editor.resizeToFit(),
        save: () => editor.document.save(),
        dispose: () => disposables.dispose(),
        onDidChangeContent: onDidChangeContentEmitter.event,
    };
}
