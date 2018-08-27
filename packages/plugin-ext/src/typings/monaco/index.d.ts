/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

/// <reference types='@typefox/monaco-editor-core/monaco'/>
declare module monaco.editor {
    export interface IStandaloneCodeEditor extends CommonCodeEditor {
        setDecorations(decorationTypeKey: string, ranges: IDecorationOptions[]): void;

        setDecorationsFast(decorationTypeKey: string, ranges: IRange[]): void;
    }

    export interface IDecorationOptions {
        range: IRange;
        hoverMessage?: IMarkdownString | IMarkdownString[];
        renderOptions?: IDecorationInstanceRenderOptions;
    }

    export interface IDecorationInstanceRenderOptions extends IThemeDecorationInstanceRenderOptions {
        light?: IThemeDecorationInstanceRenderOptions;
        dark?: IThemeDecorationInstanceRenderOptions;
    }

    export interface IThemeDecorationInstanceRenderOptions {
        before?: IContentDecorationRenderOptions;
        after?: IContentDecorationRenderOptions;
    }

    export interface IContentDecorationRenderOptions {
        contentText?: string;
        contentIconPath?: string | UriComponents;

        border?: string;
        borderColor?: string | ThemeColor;
        fontStyle?: string;
        fontWeight?: string;
        textDecoration?: string;
        color?: string | ThemeColor;
        backgroundColor?: string | ThemeColor;

        margin?: string;
        width?: string;
        height?: string;
    }
}

declare module monaco.services {
    export interface ICodeEditorService {
        registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
        removeDecorationType(key: string): void;
        resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions;
    }

    export interface IModelDecorationOptions {
        /**
         * Customize the growing behavior of the decoration when typing at the edges of the decoration.
         * Defaults to TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
         */
        stickiness?: TrackedRangeStickiness;
        /**
         * CSS class name describing the decoration.
         */
        className?: string;
        /**
         * Message to be rendered when hovering over the glyph margin decoration.
         */
        glyphMarginHoverMessage?: IMarkdownString | IMarkdownString[];
        /**
         * Array of MarkdownString to render as the decoration message.
         */
        hoverMessage?: IMarkdownString | IMarkdownString[];
        /**
         * Should the decoration expand to encompass a whole line.
         */
        isWholeLine?: boolean;
        /**
         * Always render the decoration (even when the range it encompasses is collapsed).
         * @internal
         */
        showIfCollapsed?: boolean;
        /**
         * Specifies the stack order of a decoration.
         * A decoration with greater stack order is always in front of a decoration with a lower stack order.
         */
        zIndex?: number;
        /**
         * If set, render this decoration in the overview ruler.
         */
        overviewRuler?: IModelDecorationOverviewRulerOptions;
        /**
         * If set, the decoration will be rendered in the glyph margin with this CSS class name.
         */
        glyphMarginClassName?: string;
        /**
         * If set, the decoration will be rendered in the lines decorations with this CSS class name.
         */
        linesDecorationsClassName?: string;
        /**
         * If set, the decoration will be rendered in the margin (covering its full width) with this CSS class name.
         */
        marginClassName?: string;
        /**
         * If set, the decoration will be rendered inline with the text with this CSS class name.
         * Please use this only for CSS rules that must impact the text. For example, use `className`
         * to have a background color decoration.
         */
        inlineClassName?: string;
        /**
         * If there is an `inlineClassName` which affects letter spacing.
         */
        inlineClassNameAffectsLetterSpacing?: boolean;
        /**
         * If set, the decoration will be rendered before the text with this CSS class name.
         */
        beforeContentClassName?: string;
        /**
         * If set, the decoration will be rendered after the text with this CSS class name.
         */
        afterContentClassName?: string;
    }

    export interface IModelDecorationOverviewRulerOptions {
        /**
         * CSS color to render in the overview ruler.
         * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
         */
        color: string | ThemeColor;
        /**
         * CSS color to render in the overview ruler.
         * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
         */
        darkColor: string | ThemeColor;
        /**
         * CSS color to render in the overview ruler.
         * e.g.: rgba(100, 100, 100, 0.5) or a color from the color registry
         */
        hcColor?: string | ThemeColor;
        /**
         * The position in the overview ruler.
         */
        position: OverviewRulerLane;
    }

    export interface IDecorationRenderOptions extends IThemeDecorationRenderOptions {
        isWholeLine?: boolean;
        rangeBehavior?: TrackedRangeStickiness;
        overviewRulerLane?: OverviewRulerLane;

        light?: IThemeDecorationRenderOptions;
        dark?: IThemeDecorationRenderOptions;
    }

    export interface IContentDecorationRenderOptions {
        contentText?: string;
        contentIconPath?: string | UriComponents;

        border?: string;
        borderColor?: string | ThemeColor;
        fontStyle?: string;
        fontWeight?: string;
        textDecoration?: string;
        color?: string | ThemeColor;
        backgroundColor?: string | ThemeColor;

        margin?: string;
        width?: string;
        height?: string;
    }

    export interface IThemeDecorationRenderOptions {
        backgroundColor?: string | ThemeColor;

        outline?: string;
        outlineColor?: string | ThemeColor;
        outlineStyle?: string;
        outlineWidth?: string;

        border?: string;
        borderColor?: string | ThemeColor;
        borderRadius?: string;
        borderSpacing?: string;
        borderStyle?: string;
        borderWidth?: string;

        fontStyle?: string;
        fontWeight?: string;
        textDecoration?: string;
        cursor?: string;
        color?: string | ThemeColor;
        opacity?: number;
        letterSpacing?: string;

        gutterIconPath?: string | UriComponents;
        gutterIconSize?: string;

        overviewRulerColor?: string | ThemeColor;

        before?: IContentDecorationRenderOptions;
        after?: IContentDecorationRenderOptions;
    }

    export interface ThemeColor {
        id: string;
    }

    export enum TrackedRangeStickiness {
        AlwaysGrowsWhenTypingAtEdges = 0,
        NeverGrowsWhenTypingAtEdges = 1,
        GrowsOnlyWhenTypingBefore = 2,
        GrowsOnlyWhenTypingAfter = 3,
    }

    export enum OverviewRulerLane {
        Left = 1,
        Center = 2,
        Right = 4,
        Full = 7
    }

    export module StaticServices {
        export const codeEditorService: LazyStaticService<ICodeEditorService>;
    }

}

declare module monaco.modes {

    export type SuggestionType = 'method'
        | 'function'
        | 'constructor'
        | 'field'
        | 'variable'
        | 'class'
        | 'struct'
        | 'interface'
        | 'module'
        | 'property'
        | 'event'
        | 'operator'
        | 'unit'
        | 'value'
        | 'constant'
        | 'enum'
        | 'enum-member'
        | 'keyword'
        | 'snippet'
        | 'text'
        | 'color'
        | 'file'
        | 'reference'
        | 'customcolor'
        | 'folder'
        | 'type-parameter';

    export type SnippetType = 'internal' | 'textmate';

    export interface ISuggestion {
        label: string;
        insertText: string;
        type: SuggestionType;
        detail?: string;
        documentation?: string | IMarkdownString;
        filterText?: string;
        sortText?: string;
        preselect?: boolean;
        noAutoAccept?: boolean;
        commitCharacters?: string[];
        overwriteBefore?: number;
        overwriteAfter?: number;
        additionalTextEdits?: editor.ISingleEditOperation[];
        command?: monaco.languages.Command;
        snippetType?: SnippetType;
    }

    export interface ISuggestResult {
        suggestions: ISuggestion[];
        incomplete?: boolean;
        dispose?(): void;
    }

    export enum CompletionTriggerKind {
        Invoke = 0,
        TriggerCharacter = 1,
        TriggerForIncompleteCompletions = 2,
    }

    export interface SuggestContext {
        triggerKind: CompletionTriggerKind;
        triggerCharacter?: string;
    }

    export interface ISuggestSupport {

        triggerCharacters?: string[];

        provideCompletionItems(model: monaco.editor.ITextModel, position: Position, context: SuggestContext, token: CancellationToken): ISuggestResult | Thenable<ISuggestResult | undefined> | undefined;

        resolveCompletionItem?(model: monaco.editor.ITextModel, position: Position, item: ISuggestion, token: CancellationToken): ISuggestion | Thenable<ISuggestion>;
    }

    export interface IRelativePattern {
        base: string;
        pattern: string;
    }

    export interface LanguageFilter {
        language?: string;
        scheme?: string;
        pattern?: string | IRelativePattern;
        /**
         * This provider is implemented in the UI thread.
         */
        hasAccessToAllModels?: boolean;
        exclusive?: boolean;
    }

    export type LanguageSelector = string | LanguageFilter | (string | LanguageFilter)[];

    export interface LanguageFeatureRegistry<T> {
        register(selector: LanguageSelector, provider: T): IDisposable;
    }

    export const SuggestRegistry: LanguageFeatureRegistry<ISuggestSupport>;

    export type ProviderResult<T> = T | undefined | PromiseLike<T | undefined>;

    export interface HoverProvider {
        provideHover(document: monaco.editor.ITextModel, position: Position, token: CancellationToken | undefined): ProviderResult<monaco.languages.Hover>;
    }

    export const HoverProviderRegistry: LanguageFeatureRegistry<HoverProvider>;
}
