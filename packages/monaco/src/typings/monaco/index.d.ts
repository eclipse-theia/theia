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

/// <reference types='monaco-editor-core/monaco'/>

declare module monaco.instantiation {
    export interface IInstantiationService {
    }
}

declare module monaco.editor {

    export interface IDiffNavigator {
        readonly ranges: IDiffRange[];
        readonly nextIdx: number;
        readonly revealFirst: boolean;
        _initIdx(fwd: boolean): void;
    }

    export interface IDiffRange {
        readonly range: Range;
    }

    export interface IStandaloneCodeEditor extends CommonCodeEditor {
    }

    export interface CommonCodeEditor {
        readonly _commandService: monaco.commands.ICommandService;
        readonly _instantiationService: monaco.instantiation.IInstantiationService;
        readonly _contributions: {
            'editor.controller.quickOpenController': monaco.quickOpen.QuickOpenController
            'editor.contrib.referencesController': monaco.referenceSearch.ReferencesController
        }
        readonly cursor: ICursor;
    }

    export interface ICursor {
        trigger(source: string, handlerId: string, payload: any): void;
    }

    export interface IEditorOverrideServices {
        editorService?: IEditorService;
        textModelService?: ITextModelService;
        contextMenuService?: IContextMenuService;
        commandService?: monaco.commands.ICommandService;
    }

    export interface IResourceInput {
        resource: monaco.Uri;
        options?: IResourceInputOptions;
    }

    export interface IResourceInputOptions {
        /**
         * Tells the editor to not receive keyboard focus when the editor is being opened. By default,
         * the editor will receive keyboard focus on open.
         */
        preserveFocus?: boolean;

        /**
         * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
         */
        revealIfVisible?: boolean;

        /**
         * Text editor selection.
         */
        selection?: Partial<monaco.IRange>;
    }

    export interface IEditorReference {
        getControl(): monaco.editor.CommonCodeEditor;
    }

    export interface IEditorInput {
    }

    export interface IEditorOptions {
    }

    export interface IEditorService {
        openEditor(input: IResourceInput, sideBySide?: boolean): monaco.Promise<IEditorReference | undefined>;
    }

    export interface IReference<T> extends monaco.IDisposable {
        readonly object: T;
    }

    export interface ITextModelService {
        /**
         * Provided a resource URI, it will return a model reference
         * which should be disposed once not needed anymore.
         */
        createModelReference(resource: monaco.Uri): monaco.Promise<IReference<ITextEditorModel>>;

        /**
         * Registers a specific `scheme` content provider.
         */
        registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): monaco.IDisposable;
    }

    export interface ITextModelContentProvider {
        /**
         * Given a resource, return the content of the resource as IModel.
         */
        provideTextContent(resource: monaco.Uri): monaco.Promise<monaco.editor.IModel>;
    }

    export interface ITextEditorModel {
        onDispose: monaco.IEvent<void>;
        /**
         * Loads the model.
         */
        load(): monaco.Promise<ITextEditorModel>;

        /**
         * Dispose associated resources
         */
        dispose(): void;
        /**
         * Provides access to the underlying IModel.
         */
        textEditorModel: monaco.editor.IModel;
    }

    export interface IContextMenuDelegate {
        /**
         * Returns with an HTML element or the client coordinates as the anchor of the context menu to open.
         */
        getAnchor(): HTMLElement | { x: number; y: number; };

        /**
         * Returns the actions for the menu
         */
        getActions(): monaco.Promise<IAction[]>

        /**
         * Needs to be called with the context menu closes again.
         */
        onHide(wasCancelled: boolean): void
    }

    export interface IAction {
        id: string;
        label: string;
        tooltip: string;
        class: string;
        enabled: boolean;
        checked: boolean;
        radio: boolean;
        run(event?: any): monaco.Promise<any>;
    }

    export interface IContextMenuService {
        /**
         * Shows the native Monaco context menu in the editor.
         */
        showContextMenu(delegate: IContextMenuDelegate): void;
    }

}

declare module monaco.commands {

    export interface ICommandEvent {
        commandId: string;
    }

    export interface ICommandService {
        onWillExecuteCommand: monaco.IEvent<ICommandEvent>;
        executeCommand<T>(commandId: string, ...args: any[]): monaco.Promise<T>;
        executeCommand(commandId: string, ...args: any[]): monaco.Promise<any>;
    }

}

declare module monaco.actions {

    export class MenuId {
        /**
         * The unique ID of the editor's context menu.
         */
        public static readonly EditorContext: MenuId;
    }

    export interface ICommandAction {
        id: string;
        title: string
        category?: string;
        iconClass?: string;
    }

    export interface IMenuItem {
        command: ICommandAction;
        when?: any;
        group?: 'navigation' | string;
    }

    export interface IMenuRegistry {
        /**
         * Retrieves all the registered menu items for the given menu.
         */
        getMenuItems(menuId: MenuId | { id: string }): IMenuItem[];
    }

    /**
     * The shared menu registry singleton.
     */
    export const MenuRegistry: IMenuRegistry;

}

declare module monaco.platform {
    export const enum OperatingSystem {
        Windows = 1,
        Macintosh = 2,
        Linux = 3
    }
    export const OS: OperatingSystem;
}

declare module monaco.keybindings {

    export const enum KeybindingType {
        Simple = 1,
        Chord = 2
    }

    export class SimpleKeybinding {
        public readonly type: KeybindingType;

        public readonly ctrlKey: boolean;
        public readonly shiftKey: boolean;
        public readonly altKey: boolean;
        public readonly metaKey: boolean;
        public readonly keyCode: KeyCode;

        constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, keyCode: KeyCode);
    }

    export class ChordKeybinding {
        public readonly type: KeybindingType;

        public readonly firstPart: SimpleKeybinding;
        public readonly chordPart: SimpleKeybinding;

        constructor(firstPart: SimpleKeybinding, chordPart: SimpleKeybinding);
    }

    export type Keybinding = SimpleKeybinding | ChordKeybinding;

    export interface IKeybindingItem {
        keybinding: Keybinding;
        command: string;
    }

    export interface IKeybindingsRegistry {
        /**
         * Returns with all the default, static keybindings.
         */
        getDefaultKeybindings(): IKeybindingItem[];
    }

    export const KeybindingsRegistry: IKeybindingsRegistry;

    export namespace KeyCodeUtils {
        export function toString(key: any): string;
    }

    export class ResolvedKeybindingPart {
        readonly ctrlKey: boolean;
        readonly shiftKey: boolean;
        readonly altKey: boolean;
        readonly metaKey: boolean;

        readonly keyLabel: string;
        readonly keyAriaLabel: string;

        constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, kbLabel: string, kbAriaLabel: string);
    }
    export abstract class ResolvedKeybinding {
        /**
         * This prints the binding in a format suitable for ARIA.
         */
        public abstract getAriaLabel(): string;
        /**
         * Returns the firstPart, chordPart of the keybinding.
         * For simple keybindings, the second element will be null.
         */
        public abstract getParts(): [ResolvedKeybindingPart, ResolvedKeybindingPart | undefined];
    }

    export class USLayoutResolvedKeybinding extends ResolvedKeybinding {
        constructor(actual: Keybinding, OS: monaco.platform.OperatingSystem);

        public getAriaLabel(): string;
        public getParts(): [ResolvedKeybindingPart, ResolvedKeybindingPart | undefined];
    }

}

declare module monaco.services {
    export class StandaloneCommandService implements monaco.commands.ICommandService {
        constructor(instantiationService: monaco.instantiation.IInstantiationService);
        onWillExecuteCommand: monaco.IEvent<monaco.commands.ICommandEvent>;
        executeCommand<T>(commandId: string, ...args: any[]): monaco.Promise<T>;
        executeCommand(commandId: string, ...args: any[]): monaco.Promise<any>;
    }

    export class LazyStaticService<T> {
        get(overrides?: monaco.editor.IEditorOverrideServices): T;
    }

    export interface IStandaloneThemeService extends monaco.theme.IThemeService {
        getTheme(): IStandaloneTheme;
    }

    export interface IStandaloneTheme {
        tokenTheme: TokenTheme;
    }

    export interface TokenTheme {
        match(languageId: string | undefined, scope: string): number;
        getColorMap(): Color[];
    }

    export interface Color {
        rgba: RGBA;
    }

    export interface RGBA {
        r: number;
        g: number;
        b: number;
        a: number;
    }

    export enum LanguageId {
        Null = 0,
        PlainText = 1
    }

    export class LanguageIdentifier {
        /**
         * A string identifier. Unique across languages. e.g. 'javascript'.
         */
        readonly language: string;

        /**
         * A numeric identifier. Unique across languages. e.g. 5
         * Will vary at runtime based on registration order, etc.
         */
        readonly id: LanguageId;
    }

    export interface IModeService {
        getLanguageIdentifier(modeId: string | LanguageId): LanguageIdentifier;
    }

    export module StaticServices {
        export const standaloneThemeService: LazyStaticService<IStandaloneThemeService>;
        export const modeService: LazyStaticService<IModeService>;
    }
}

declare module monaco.theme {
    export interface ITheme { }
    export interface IThemeService {
        onThemeChange: monaco.IEvent<ITheme>;
    }
    export interface IThemable { }
    export function attachQuickOpenStyler(widget: IThemable, themeService: IThemeService): monaco.IDisposable;
}

declare module monaco.referenceSearch {

    export interface Location {
        uri: Uri,
        range: IRange
    }

    export interface OneReference { }

    export interface ReferencesModel {
        references: OneReference[]
    }

    export interface RequestOptions {
        getMetaTitle(model: ReferencesModel): string;
    }

    export interface ReferenceWidget {
        hide(): void;
        show(range: IRange): void;
        focus(): void;
    }

    export interface ReferencesController {
        _widget: ReferenceWidget
        _model: ReferencesModel | undefined
        _ignoreModelChangeEvent: boolean;
        _editorService: monaco.editor.IEditorService;
        closeWidget(): void;
        _gotoReference(ref: Location): void
        toggleWidget(range: IRange, modelPromise: Promise<ReferencesModel> & { cancel: () => void }, options: RequestOptions): void;
    }

}

declare module monaco.quickOpen {

    export class QuickOpenWidget implements IDisposable {
        constructor(container: HTMLElement, callbacks: IQuickOpenCallbacks, options: IQuickOpenOptions, usageLogger?: IQuickOpenUsageLogger);
        dispose(): void;
        create(): HTMLElement;
        setPlaceHolder(placeHolder: string): void;
        setInput(input: IModel<any>, autoFocus: IAutoFocus, ariaLabel?: string): void;
        layout(dimension: monaco.editor.IDimension): void;
        show(prefix: string, options?: IShowOptions): void;
        hide(reason?: HideReason): void;
        refresh(input?: IModel<any>, autoFocus?: IAutoFocus): void;
        setPassword(isPassword: boolean): void;
        showInputDecoration(decoration: Severity): void;
        clearInputDecoration(): void;
    }

    export enum HideReason {
        ELEMENT_SELECTED,
        FOCUS_LOST,
        CANCELED
    }
    export interface IQuickOpenCallbacks {
        onOk: () => void;
        onCancel: () => void;
        onType: (lookFor?: string) => void;
        onShow?: () => void;
        onHide?: (reason: HideReason) => void;
        onFocusLost?: () => boolean /* veto close */;
    }
    export interface IQuickOpenOptions /* extends IQuickOpenStyles */ {
        minItemsToShow?: number;
        maxItemsToShow?: number;
        inputPlaceHolder?: string;
        inputAriaLabel?: string;
        // actionProvider?: IActionProvider;
        keyboardSupport?: boolean;
    }
    export interface IQuickOpenUsageLogger {
        publicLog(eventName: string, data?: any): void;
    }

    export interface IShowOptions {
        quickNavigateConfiguration?: IQuickNavigateConfiguration;
        autoFocus?: IAutoFocus;
        inputSelection?: IRange;
    }

    export interface IQuickNavigateConfiguration {
        keybindings: monaco.keybindings.ResolvedKeybinding[];
    }
    export interface IAutoFocus {

        /**
         * The index of the element to focus in the result list.
         */
        autoFocusIndex?: number;

        /**
         * If set to true, will automatically select the first entry from the result list.
         */
        autoFocusFirstEntry?: boolean;

        /**
         * If set to true, will automatically select the second entry from the result list.
         */
        autoFocusSecondEntry?: boolean;

        /**
         * If set to true, will automatically select the last entry from the result list.
         */
        autoFocusLastEntry?: boolean;

        /**
         * If set to true, will automatically select any entry whose label starts with the search
         * value. Since some entries to the top might match the query but not on the prefix, this
         * allows to select the most accurate match (matching the prefix) while still showing other
         * elements.
         */
        autoFocusPrefixMatch?: string;
    }
    export enum Mode {
        PREVIEW,
        OPEN,
        OPEN_IN_BACKGROUND
    }
    export interface IEntryRunContext {
        event: any;
        keymods: number[];
        quickNavigateConfiguration: IQuickNavigateConfiguration;
    }
    export interface IDataSource<T> {
        getId(entry: T): string;
        getLabel(entry: T): string;
    }
    /**
     * See vs/base/parts/tree/browser/tree.ts - IRenderer
     */
    export interface IRenderer<T> {
        getHeight(entry: T): number;
        getTemplateId(entry: T): string;
        renderTemplate(templateId: string, container: HTMLElement, styles: any): any;
        renderElement(entry: T, templateId: string, templateData: any, styles: any): void;
        disposeTemplate(templateId: string, templateData: any): void;
    }
    export interface IFilter<T> {
        isVisible(entry: T): boolean;
    }
    export interface IAccessiblityProvider<T> {
        getAriaLabel(entry: T): string;
    }
    export interface IRunner<T> {
        run(entry: T, mode: Mode, context: IEntryRunContext): boolean;
    }
    export interface IModel<T> {
        entries: T[];
        dataSource: IDataSource<T>;
        renderer: IRenderer<T>;
        runner: IRunner<T>;
        filter?: IFilter<T>;
        accessibilityProvider?: IAccessiblityProvider<T>;
    }

    export interface IHighlight {
        start: number;
        end: number;
    }
    export interface IIconLabelOptions {
        title?: string;
        extraClasses?: string[];
        italic?: boolean;
        matches?: monaco.filters.IMatch[];
    }
    export class QuickOpenEntry {
        constructor(highlights?: IHighlight[]);
        getLabel(): string | undefined;
        getLabelOptions(): IIconLabelOptions | undefined;
        getAriaLabel(): string | undefined;
        getDetail(): string | undefined;
        getIcon(): string | undefined;
        getDescription(): string | undefined;
        getKeybinding(): monaco.keybindings.ResolvedKeybinding | undefined;
        getResource(): Uri | undefined;
        isHidden(): boolean;
        setHidden(hidden: boolean): void;
        setHighlights(labelHighlights: IHighlight[], descriptionHighlights?: IHighlight[], detailHighlights?: IHighlight[]): void;
        getHighlights(): [IHighlight[] /* Label */, IHighlight[] /* Description */, IHighlight[] /* Detail */];
        run(mode: Mode, context: IEntryRunContext): boolean;
    }

    export function compareEntries(elementA: QuickOpenEntry, elementB: QuickOpenEntry, lookFor: string): number;

    export class QuickOpenEntryGroup extends QuickOpenEntry {
        constructor(entry?: QuickOpenEntry, groupLabel?: string, withBorder?: boolean);
        getGroupLabel(): string;
        setGroupLabel(groupLabel: string): void;
        showBorder(): boolean;
        setShowBorder(showBorder: boolean): void;
        getEntry(): QuickOpenEntry | undefined;
    }
    export class QuickOpenModel implements IModel<QuickOpenEntry>, IDataSource<QuickOpenEntry>, IFilter<QuickOpenEntry>, IRunner<QuickOpenEntry> {
        constructor(entries?: QuickOpenEntry[] /*, actionProvider?: IActionProvider */);
        addEntries(entries: QuickOpenEntry[]): void;
        entries: QuickOpenEntry[];
        dataSource: IDataSource<QuickOpenEntry>;
        renderer: IRenderer<QuickOpenEntry>;
        runner: IRunner<QuickOpenEntry>;
        filter?: IFilter<QuickOpenEntry>;
        accessibilityProvider?: IAccessiblityProvider<QuickOpenEntry>;
        getId(entry: QuickOpenEntry): string;
        getLabel(entry: QuickOpenEntry): string;
        isVisible(entry: QuickOpenEntry): boolean;
        run(entry: QuickOpenEntry, mode: Mode, context: IEntryRunContext): boolean;
    }

    export interface IQuickOpenControllerOpts {
        readonly inputAriaLabel: string;
        getModel(lookFor: string): QuickOpenModel;
        getAutoFocus(lookFor: string): IAutoFocus;
    }
    export interface QuickOpenController extends IDisposable {
        getId(): string;
        run(opts: IQuickOpenControllerOpts): void;
        decorateLine(range: Range, editor: monaco.editor.ICodeEditor): void;
        clearDecorations(): void;
    }

}

declare module monaco.filters {
    export interface IMatch {
        start: number;
        end: number;
    }
    export function matchesFuzzy(word: string, wordToMatchAgainst: string, enableSeparateSubstringMatching?: boolean): IMatch[] | undefined;
}

declare module monaco.editorExtensions {

    export interface EditorAction {
        id: string;
        label: string;
        alias: string;
    }

    export module EditorExtensionsRegistry {
        export function getEditorActions(): EditorAction[];
    }
}
declare module monaco.modes {

    export class TokenMetadata {

        public static getLanguageId(metadata: number): number;

        public static getFontStyle(metadata: number): number;

        public static getForeground(metadata: number): number;

        public static getBackground(metadata: number): number;

        public static getClassNameFromMetadata(metadata: number): string;

        public static getInlineStyleFromMetadata(metadata: number, colorMap: string[]): string;
    }

    export interface LanguageFeatureRegistry<T> {
        has(model: monaco.editor.IReadOnlyModel): boolean;
        all(model: monaco.editor.IReadOnlyModel): T[];
        readonly onDidChange: monaco.IEvent<number>;
    }

    export enum SymbolKind {
        File = 0,
        Module = 1,
        Namespace = 2,
        Package = 3,
        Class = 4,
        Method = 5,
        Property = 6,
        Field = 7,
        Constructor = 8,
        Enum = 9,
        Interface = 10,
        Function = 11,
        Variable = 12,
        Constant = 13,
        String = 14,
        Number = 15,
        Boolean = 16,
        Array = 17,
        Object = 18,
        Key = 19,
        Null = 20,
        EnumMember = 21,
        Struct = 22,
        Event = 23,
        Operator = 24,
        TypeParameter = 25
    }

    export interface SymbolInformation {
        name: string;
        containerName?: string;
        kind: SymbolKind;
        location: monaco.languages.Location;
    }

    export const DocumentSymbolProviderRegistry: LanguageFeatureRegistry<monaco.languages.DocumentSymbolProvider>;
}

declare module monaco.cancellation {
    export interface CancellationToken {
        readonly isCancellationRequested: boolean;
        readonly onCancellationRequested: monaco.IEvent<any>;
    }

    export class CancellationTokenSource {
        token: CancellationToken;
        cancel(): void;
        dispose(): void;
    }

}

declare module monaco.suggestController {

    export class SuggestWidget {
        suggestWidgetVisible: {
            get(): boolean;
        };
    }

    export class SuggestController {

        getId(): string;
        dispose(): void;

        /**
         * This is a hack. The widget has a `private` visibility in the VSCode source.
         */
        readonly _widget: SuggestWidget | undefined;

    }

}

declare module monaco.findController {

    export class CommonFindController {

        getId(): string;
        dispose(): void;

        /**
         * Hack for checking whether the find (and replace) widget is visible in code editor or not.
         */
        readonly _findWidgetVisible: {
            get(): boolean;
        };

    }

}

declare module monaco.rename {

    export class RenameController {

        getId(): string;
        dispose(): void;

        /**
         * Hack for checking whether the rename input HTML element is visible in the code editor or not. In VSCode source this is has `private` visibility.
         */
        readonly _renameInputVisible: {
            get(): boolean;
        };

    }

}
