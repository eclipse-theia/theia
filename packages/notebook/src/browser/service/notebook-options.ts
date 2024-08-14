
// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/browser';
import { Emitter } from '@theia/core';
import { NotebookPreferences, notebookPreferenceSchema } from '../contributions/notebook-preferences';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { BareFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/common/config/fontInfo';
import { PixelRatio } from '@theia/monaco-editor-core/esm/vs/base/browser/browser';

const notebookOutputOptionsRelevantPreferences = [
    'editor.fontSize',
    'editor.fontFamily',
    NotebookPreferences.NOTEBOOK_LINE_NUMBERS,
    NotebookPreferences.OUTPUT_LINE_HEIGHT,
    NotebookPreferences.OUTPUT_FONT_SIZE,
    NotebookPreferences.OUTPUT_FONT_FAMILY,
    NotebookPreferences.OUTPUT_SCROLLING,
    NotebookPreferences.OUTPUT_WORD_WRAP,
    NotebookPreferences.OUTPUT_LINE_LIMIT
];

export interface NotebookOutputOptions {
    // readonly outputNodePadding: number;
    readonly outputNodeLeftPadding: number;
    // readonly previewNodePadding: number;
    // readonly markdownLeftMargin: number;
    // readonly leftMargin: number;
    // readonly rightMargin: number;
    // readonly runGutter: number;
    // readonly dragAndDropEnabled: boolean;
    readonly fontSize: number;
    readonly outputFontSize?: number;
    readonly fontFamily: string;
    readonly outputFontFamily?: string;
    // readonly markupFontSize: number;
    // readonly markdownLineHeight: number;
    readonly outputLineHeight: number;
    readonly outputScrolling: boolean;
    readonly outputWordWrap: boolean;
    readonly outputLineLimit: number;
    // readonly outputLinkifyFilePaths: boolean;
    // readonly minimalError: boolean;

}

@injectable()
export class NotebookOptionsService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    protected outputOptionsChangedEmitter = new Emitter<NotebookOutputOptions>();
    onDidChangeOutputOptions = this.outputOptionsChangedEmitter.event;

    protected fontInfo?: BareFontInfo;
    get editorFontInfo(): BareFontInfo {
        return this.getOrCreateMonacoFontInfo();
    }

    @postConstruct()
    protected init(): void {
        this.preferenceService.onPreferencesChanged(async preferenceChanges => {
            if (notebookOutputOptionsRelevantPreferences.some(p => p in preferenceChanges)) {
                this.outputOptionsChangedEmitter.fire(this.computeOutputOptions());
            }
        });
    }

    computeOutputOptions(): NotebookOutputOptions {
        const outputLineHeight = this.getNotebookPreferenceWithDefault<number>(NotebookPreferences.OUTPUT_LINE_HEIGHT);

        const fontSize = this.preferenceService.get<number>('editor.fontSize')!;
        const outputFontSize = this.getNotebookPreferenceWithDefault<number>(NotebookPreferences.OUTPUT_FONT_SIZE);

        return {
            fontSize,
            outputFontSize: outputFontSize,
            fontFamily: this.preferenceService.get<string>('editor.fontFamily')!,
            outputNodeLeftPadding: 8,
            outputFontFamily: this.getNotebookPreferenceWithDefault<string>(NotebookPreferences.OUTPUT_FONT_FAMILY),
            outputLineHeight: this.computeOutputLineHeight(outputLineHeight, outputFontSize ?? fontSize),
            outputScrolling: this.getNotebookPreferenceWithDefault<boolean>(NotebookPreferences.OUTPUT_SCROLLING)!,
            outputWordWrap: this.getNotebookPreferenceWithDefault<boolean>(NotebookPreferences.OUTPUT_WORD_WRAP)!,
            outputLineLimit: this.getNotebookPreferenceWithDefault<number>(NotebookPreferences.OUTPUT_LINE_LIMIT)!
        };
    }

    protected getNotebookPreferenceWithDefault<T>(key: string): T {
        return this.preferenceService.get<T>(key, notebookPreferenceSchema.properties?.[key]?.default as T);
    }

    protected computeOutputLineHeight(lineHeight: number, outputFontSize: number): number {
        const minimumLineHeight = 9;

        if (lineHeight === 0) {
            // use editor line height
            lineHeight = this.editorFontInfo.lineHeight;
        } else if (lineHeight < minimumLineHeight) {
            // Values too small to be line heights in pixels are in ems.
            let fontSize = outputFontSize;
            if (fontSize === 0) {
                fontSize = this.preferenceService.get<number>('editor.fontSize')!;
            }

            lineHeight = lineHeight * fontSize;
        }

        // Enforce integer, minimum constraints
        lineHeight = Math.round(lineHeight);
        if (lineHeight < minimumLineHeight) {
            lineHeight = minimumLineHeight;
        }

        return lineHeight;
    }

    protected getOrCreateMonacoFontInfo(): BareFontInfo {
        if (!this.fontInfo) {
            this.fontInfo = this.createFontInfo();
            this.editorPreferences.onPreferenceChanged(e => this.fontInfo = this.createFontInfo());
        }
        return this.fontInfo;
    }

    protected createFontInfo(): BareFontInfo {
        return BareFontInfo.createFromRawSettings({
            fontFamily: this.editorPreferences['editor.fontFamily'],
            fontWeight: String(this.editorPreferences['editor.fontWeight']),
            fontSize: this.editorPreferences['editor.fontSize'],
            fontLigatures: this.editorPreferences['editor.fontLigatures'],
            lineHeight: this.editorPreferences['editor.lineHeight'],
            letterSpacing: this.editorPreferences['editor.letterSpacing'],
        }, PixelRatio.value);
    }

}
