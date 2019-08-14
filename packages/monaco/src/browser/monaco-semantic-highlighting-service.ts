/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { EditorDecoration, EditorDecorationOptions } from '@theia/editor/lib/browser/decorations';
import { SemanticHighlightingService, SemanticHighlightingRange, Range } from '@theia/editor/lib/browser/semantic-highlight/semantic-highlighting-service';
import { MonacoEditor } from './monaco-editor';
import { MonacoEditorService } from './monaco-editor-service';

/**
 * A helper class for grouping information about a decoration type that has
 * been registered with the editor service.
 */
class DecorationTypeInfo {
    key: string;
    options: monaco.editor.IModelDecorationOptions;
}

@injectable()
export class MonacoSemanticHighlightingService extends SemanticHighlightingService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MonacoEditorService)
    protected readonly monacoEditorService: MonacoEditorService;

    protected readonly decorations = new Map<string, Set<string>>();
    protected readonly toDisposeOnEditorClose = new Map<string, Disposable>();
    protected readonly toDisposeOnUnregister = new Map<string, Disposable>();

    // laguage id -> (scope index -> decoration type)
    protected readonly decorationTypes = new Map<string, Map<number, DecorationTypeInfo>>();

    private lastDecorationTypeId: number = 0;

    private nextDecorationTypeKey(): string {
        return 'MonacoSemanticHighlighting' + (++this.lastDecorationTypeId);
    }

    protected registerDecorationTypesForLanguage(languageId: string): void {
        const scopes = this.scopes.get(languageId);
        if (scopes) {
            const decorationTypes = new Map<number, DecorationTypeInfo>();
            for (let index = 0; index < scopes.length; index++) {
                const modelDecoration = this.toDecorationType(scopes[index]);
                if (modelDecoration) {
                    decorationTypes.set(index, modelDecoration);
                }
            }
            this.decorationTypes.set(languageId, decorationTypes);
        }
    }

    protected removeDecorationTypesForLanguage(languageId: string): void {
        const decorationTypes = this.decorationTypes.get(languageId);
        if (!decorationTypes) {
            this.logger.warn(`No decoration types are registered for language: ${languageId}`);
            return;
        }
        for (const [, decorationType] of decorationTypes) {
            this.monacoEditorService.removeDecorationType(decorationType.key);
        }
    }

    protected refreshDecorationTypesForLanguage(languageId: string): void {
        const decorationTypes = this.decorationTypes.get(languageId);
        const scopes = this.scopes.get(languageId);
        if (!decorationTypes || !scopes) {
            this.logger.warn(`No decoration types are registered for language: ${languageId}`);
            return;
        }
        for (const [scope, decorationType] of decorationTypes) {
            // Pass in the existing key to associate the new color with the same
            // decoration type, thereby reusing it.
            const newDecorationType = this.toDecorationType(scopes[scope], decorationType.key);
            if (newDecorationType) {
                decorationType.options = newDecorationType.options;
            }
        }
    }

    register(languageId: string, scopes: string[][] | undefined): Disposable {
        const result = super.register(languageId, scopes);
        this.registerDecorationTypesForLanguage(languageId);
        const disposable = this.themeService().onThemeChange(() => {
            // When the theme changes, refresh the decoration types to reflect
            // the colors for the old theme.
            // Note that we do not remove the old decoration types and add new ones.
            // The new ones would have different class names, and we'd have to
            // update all open editors to use the new class names.
            this.refreshDecorationTypesForLanguage(languageId);
        });
        this.toDisposeOnUnregister.set(languageId, disposable);
        return result;
    }

    protected unregister(languageId: string): void {
        super.unregister(languageId);
        this.removeDecorationTypesForLanguage(languageId);
        const disposable = this.toDisposeOnUnregister.get(languageId);
        if (disposable) {
            disposable.dispose();
        }
        this.decorationTypes.delete(languageId);
        this.toDisposeOnUnregister.delete(languageId);
    }

    protected toDecorationType(scopes: string[], reuseKey?: string): DecorationTypeInfo | undefined {
        const key = reuseKey || this.nextDecorationTypeKey();
        // TODO: why for-of? How to pick the right scope? Is it fine to get the first element (with the narrowest scope)?
        for (const scope of scopes) {
            const tokenTheme = this.tokenTheme();
            const metadata = tokenTheme.match(undefined, scope);
            // Don't use the inlineClassName from the TokenMetadata, because this
            // will conflict with styles used for TM scopes
            // (https://github.com/Microsoft/monaco-editor/issues/1070).
            // Instead, get the token color, use registerDecorationType() to cause
            // monaco to allocate a new inlineClassName for that color, and use
            // resolveDecorationOptions() to get an IModelDecorationOptions
            // containing that inlineClassName.
            const colorIndex = monaco.modes.TokenMetadata.getForeground(metadata);
            const color = tokenTheme.getColorMap()[colorIndex];
            // If we wanted to support other decoration options such as font style,
            // we could include them here.
            const options: monaco.editor.IDecorationRenderOptions = {
                color: color.toString(),
            };
            this.monacoEditorService.registerDecorationType(key, options);
            return {
                key,
                options: this.monacoEditorService.resolveDecorationOptions(key, false)
            };
        }
        return undefined;
    }

    async decorate(languageId: string, uri: URI, ranges: SemanticHighlightingRange[]): Promise<void> {
        const editor = await this.editor(uri);
        if (!editor) {
            return;
        }

        const key = uri.toString();
        if (!this.toDisposeOnEditorClose.has(key)) {
            this.toDisposeOnEditorClose.set(key, new DisposableCollection(
                editor.onDispose(() => this.deleteDecorations(key, editor))
            ));
        }

        const newDecorations = ranges.map(range => this.toDecoration(languageId, range));
        const oldDecorations = this.oldDecorations(key, editor, ranges);
        const newState = editor.deltaDecorations({
            newDecorations,
            oldDecorations
        });

        const decorationIds = this.decorationIds(key);
        newState.forEach(id => decorationIds.add(id));
        this.decorations.set(key, decorationIds);
    }

    dispose(): void {
        Array.from(this.toDisposeOnEditorClose.values()).forEach(disposable => disposable.dispose());
    }

    protected decorationIds(uri: string | URI): Set<string> {
        return this.decorations.get(typeof uri === 'string' ? uri : uri.toString()) || new Set();
    }

    protected async editor(uri: string | URI): Promise<MonacoEditor | undefined> {
        const editorWidget = await this.editorManager.getByUri(typeof uri === 'string' ? new URI(uri) : uri);
        if (!!editorWidget && editorWidget.editor instanceof MonacoEditor) {
            return editorWidget.editor;
        }
        return undefined;
    }

    protected async model(uri: string | URI): Promise<monaco.editor.ITextModel | undefined> {
        const editor = await this.editor(uri);
        if (editor) {
            return editor.getControl().getModel() || undefined;
        }
        return undefined;
    }

    /**
     * Returns all the semantic highlighting decoration IDs that are affected by any of the range arguments.
     */
    protected oldDecorations(uri: string, editor: MonacoEditor, ranges: SemanticHighlightingRange[]): string[] {
        const ids = this.decorationIds(uri);
        const affectedLines = Array.from(new Set(ranges.map(r => [r.start.line, r.end.line]).reduce((prev, curr) => prev.concat(curr), [])));
        return affectedLines
            .map(line => editor.getLinesDecorations(line, line))
            .reduce((prev, curr) => prev.concat(curr), [])
            .map(decoration => decoration.id)
            .filter(id => ids.has(id));
    }

    protected deleteDecorations(uri: string, editor: MonacoEditor): void {
        const ids = this.decorations.get(uri);
        if (ids) {
            const oldDecorations = Array.from(ids);
            editor.deltaDecorations({
                newDecorations: [],
                oldDecorations
            });
            this.decorations.delete(uri);
        }
        const disposable = this.toDisposeOnEditorClose.get(uri);
        if (disposable) {
            disposable.dispose();
        }
        this.toDisposeOnEditorClose.delete(uri);
    }

    protected toDecoration(languageId: string, range: SemanticHighlightingRange): EditorDecoration {
        const { start, end } = range;
        const options = this.toOptions(languageId, range.scope);
        return {
            range: Range.create(start, end),
            options
        };
    }

    protected toOptions(languageId: string, scope: number | undefined): EditorDecorationOptions {
        if (scope !== undefined) {
            const decorationTypes = this.decorationTypes.get(languageId);
            if (decorationTypes) {
                const decoration = decorationTypes.get(scope);
                if (decoration) {
                    return {
                        inlineClassName: decoration.options.inlineClassName || undefined
                    };
                }
            }
        }
        return {};
    }

    protected themeService(): monaco.services.IStandaloneThemeService {
        return monaco.services.StaticServices.standaloneThemeService.get();
    }

    protected tokenTheme(): monaco.services.TokenTheme {
        return this.themeService().getTheme().tokenTheme;
    }
}
