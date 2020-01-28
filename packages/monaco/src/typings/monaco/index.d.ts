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

/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types='@typefox/monaco-editor-core/monaco'/>

declare module monaco.instantiation {
    export interface IInstantiationService {
        invokeFunction: (fn: any, ...args: any) => any
    }
}

declare module monaco.editor {

    export interface IBulkEditResult {
        ariaSummary: string;
    }

    export interface IBulkEditService {
        apply(edit: monaco.languages.WorkspaceEdit): Promise<IBulkEditResult>;
    }

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
        setDecorations(decorationTypeKey: string, ranges: IDecorationOptions[]): void;
        setDecorationsFast(decorationTypeKey: string, ranges: IRange[]): void;
        trigger(source: string, handlerId: string, payload: any): void
        _standaloneKeybindingService: {
            _store: {
                _toDispose: monaco.IDisposable[]
            }
            resolveKeybinding(keybinding: monaco.keybindings.ChordKeybinding): monaco.keybindings.ResolvedKeybinding[];
            resolveKeyboardEvent(keyboardEvent: monaco.IKeyboardEvent): monaco.keybindings.ResolvedKeybinding;
        }
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/editor/browser/widget/codeEditorWidget.ts#L107
    export interface CommonCodeEditor {
        readonly _commandService: monaco.commands.ICommandService;
        readonly _instantiationService: monaco.instantiation.IInstantiationService;
        readonly _contributions: {
            'editor.controller.quickOpenController': monaco.quickOpen.QuickOpenController
            'editor.contrib.referencesController': monaco.referenceSearch.ReferencesController
        }
        readonly _modelData: {
            cursor: ICursor
        };
    }

    export interface ICursor {
        trigger(source: string, handlerId: string, payload: any): void;
    }

    export interface IEditorOverrideServices {
        codeEditorService?: ICodeEditorService;
        textModelService?: ITextModelService;
        contextMenuService?: IContextMenuService;
        commandService?: monaco.commands.ICommandService;
        IWorkspaceEditService?: IBulkEditService;
        contextKeyService?: monaco.contextKeyService.IContextKeyService;
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

    export interface ICodeEditorService {
        getActiveCodeEditor(): monaco.editor.ICodeEditor | undefined;
        openCodeEditor(input: monaco.editor.IResourceInput, source?: monaco.editor.ICodeEditor, sideBySide?: boolean): Promise<monaco.editor.CommonCodeEditor | undefined>;
        registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
        removeDecorationType(key: string): void;
        resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions;
    }

    export interface IReference<T> extends monaco.IDisposable {
        readonly object: T;
    }

    export interface ITextModelService {
        /**
         * Provided a resource URI, it will return a model reference
         * which should be disposed once not needed anymore.
         */
        createModelReference(resource: monaco.Uri): Promise<IReference<ITextEditorModel>>;

        /**
         * Registers a specific `scheme` content provider.
         */
        registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): monaco.IDisposable;
    }

    export interface ITextModelContentProvider {
        /**
         * Given a resource, return the content of the resource as IModel.
         */
        provideTextContent(resource: monaco.Uri): Promise<monaco.editor.IModel>;
    }

    export interface ITextEditorModel {
        onDispose: monaco.IEvent<void>;
        /**
         * Loads the model.
         */
        load(): Promise<ITextEditorModel>;

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
        getActions(): ReadonlyArray<IAction>;

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
        run(event?: any): Promise<any>;
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/platform/contextview/browser/contextView.ts#L38
    export interface IContextMenuService {
        /**
         * Shows the native Monaco context menu in the editor.
         */
        showContextMenu(delegate: IContextMenuDelegate): void;
    }

    export interface IDecorationOptions {
        range: IRange;
        hoverMessage?: IMarkdownString | IMarkdownString[];
        renderOptions?: IDecorationInstanceRenderOptions;
    }

    export interface IThemeDecorationInstanceRenderOptions {
        before?: IContentDecorationRenderOptions;
        after?: IContentDecorationRenderOptions;
    }

    export interface IDecorationInstanceRenderOptions extends IThemeDecorationInstanceRenderOptions {
        light?: IThemeDecorationInstanceRenderOptions;
        dark?: IThemeDecorationInstanceRenderOptions;
    }

    // https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/editorCommon.ts#L552
    export interface IContentDecorationRenderOptions {
        contentText?: string;
        contentIconPath?: UriComponents;

        border?: string;
        borderColor?: string | ThemeColor;
        fontStyle?: string;
        fontWeight?: string;
        textDecoration?: string;
        color?: string | ThemeColor;
        opacity?: string;
        backgroundColor?: string | ThemeColor;

        margin?: string;
        width?: string;
        height?: string;
    }

    export interface IDecorationRenderOptions extends IThemeDecorationRenderOptions {
        isWholeLine?: boolean;
        rangeBehavior?: TrackedRangeStickiness;
        overviewRulerLane?: OverviewRulerLane;

        light?: IThemeDecorationRenderOptions;
        dark?: IThemeDecorationRenderOptions;
    }

    // https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/editorCommon.ts#L517
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
        opacity?: string;
        letterSpacing?: string;

        gutterIconPath?: UriComponents;
        gutterIconSize?: string;

        overviewRulerColor?: string | ThemeColor;

        before?: IContentDecorationRenderOptions;
        after?: IContentDecorationRenderOptions;
    }

}

declare module monaco.commands {

    export const CommandsRegistry: {
        getCommands(): Map<string, { id: string, handler: (...args: any) => any }>;
    };

    export interface ICommandEvent {
        commandId: string;
    }

    export interface ICommandService {
        readonly _onWillExecuteCommand: monaco.Emitter<ICommandEvent>;
        executeCommand<T>(commandId: string, ...args: any[]): Promise<T>;
        executeCommand(commandId: string, ...args: any[]): Promise<any>;
    }

}

declare module monaco.actions {

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
         * @param menuId - see https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/platform/actions/common/actions.ts#L66
         */
        getMenuItems(menuId: 7 /* EditorContext */): IMenuItem[];
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

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/platform/keybinding/common/keybindingResolver.ts#L20
    export class KeybindingResolver {
        static contextMatchesRules(context: monaco.contextKeyService.IContext, rules: monaco.contextkey.ContextKeyExpr): boolean;
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/base/common/keyCodes.ts#L443
    export class SimpleKeybinding {
        public readonly ctrlKey: boolean;
        public readonly shiftKey: boolean;
        public readonly altKey: boolean;
        public readonly metaKey: boolean;
        public readonly keyCode: KeyCode;

        constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, keyCode: KeyCode);
        toChord(): ChordKeybinding;
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/base/common/keyCodes.ts#L503
    export class ChordKeybinding {
        readonly parts: SimpleKeybinding[];
    }

    export type Keybinding = SimpleKeybinding | ChordKeybinding;

    export interface IKeybindingItem {
        keybinding: Keybinding;
        command: string;
        when?: ContextKeyExpr;
    }

    export interface ContextKeyExpr {
        serialize(): string;
    }

    export interface IKeybindingsRegistry {
        /**
         * Returns with all the default, static keybindings.
         */
        getDefaultKeybindings(): IKeybindingItem[];
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/platform/keybinding/common/keybindingsRegistry.ts#L75
    export const KeybindingsRegistry: IKeybindingsRegistry;

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/base/common/keyCodes.ts#L542
    export class ResolvedKeybindingPart {
        readonly ctrlKey: boolean;
        readonly shiftKey: boolean;
        readonly altKey: boolean;
        readonly metaKey: boolean;

        readonly keyLabel: string | null;
        readonly keyAriaLabel: string | null;

        constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, kbLabel: string | null, kbAriaLabel: string | null);
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/base/common/keyCodes.ts#L564
    export abstract class ResolvedKeybinding {
        public abstract getLabel(): string | null;
        public abstract getAriaLabel(): string | null;
        public abstract getElectronAccelerator(): string | null;
        public abstract getUserSettingsLabel(): string | null;
        public abstract isWYSIWYG(): boolean;
        public abstract isChord(): boolean;
        public abstract getParts(): ResolvedKeybindingPart[];
        public abstract getDispatchParts(): (string | null)[];
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/platform/keybinding/common/usLayoutResolvedKeybinding.ts#L13
    export class USLayoutResolvedKeybinding {
        public static getDispatchStr(keybinding: SimpleKeybinding): string;
    }

    export interface Modifiers {
        readonly ctrlKey: boolean;
        readonly shiftKey: boolean;
        readonly altKey: boolean;
        readonly metaKey: boolean;
    }

    export interface KeyLabelProvider<T extends Modifiers> {
        (keybinding: T): string | null;
    }

    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/base/common/keybindingLabels.ts#L28
    export interface ModifierLabelProvider {
        toLabel<T extends Modifiers>(OS: monaco.platform.OperatingSystem, parts: T[], keyLabelProvider: KeyLabelProvider<T>): string | null;
    }

    export const UILabelProvider: ModifierLabelProvider;
    export const AriaLabelProvider: ModifierLabelProvider;
    export const ElectronAcceleratorLabelProvider: ModifierLabelProvider;
    export const UserSettingsLabelProvider: ModifierLabelProvider;

}

declare module monaco.services {

    export class TokenizationSupport2Adapter implements monaco.modes.ITokenizationSupport {
        constructor(standaloneThemeService: IStandaloneThemeService, languageIdentifier: LanguageIdentifier, actual: monaco.languages.TokensProvider)
        tokenize(line: string, state: monaco.languages.IState, offsetDelta: number): any;
    }

    export const ICodeEditorService: any;
    export const IConfigurationService: any;

    export interface Configuration {
        getValue(section: string, overrides: any, workspace: any): any;
    }

    export class ConfigurationChangeEvent {
        // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/platform/configuration/common/configuration.ts#L30-L38
        _source?: number;
        change(keys: string[]): ConfigurationChangeEvent;
    }

    export interface IConfigurationService {
        _onDidChangeConfiguration: monaco.Emitter<ConfigurationChangeEvent>;
        _configuration: Configuration;
    }

    export interface ITextResourcePropertiesService {
    }

    export abstract class CodeEditorServiceImpl implements monaco.editor.ICodeEditorService {
        constructor(themeService: IStandaloneThemeService);
        abstract getActiveCodeEditor(): monaco.editor.ICodeEditor | undefined;
        abstract openCodeEditor(input: monaco.editor.IResourceInput, source?: monaco.editor.ICodeEditor,
            sideBySide?: boolean): Promise<monaco.editor.CommonCodeEditor | undefined>;
        registerDecorationType: monaco.editor.ICodeEditorService['registerDecorationType'];
        removeDecorationType: monaco.editor.ICodeEditorService['removeDecorationType'];
        resolveDecorationOptions: monaco.editor.ICodeEditorService['resolveDecorationOptions'];
    }

    export class StandaloneCommandService implements monaco.commands.ICommandService {
        constructor(instantiationService: monaco.instantiation.IInstantiationService);
        readonly _onWillExecuteCommand: monaco.Emitter<monaco.commands.ICommandEvent>;
        executeCommand<T>(commandId: string, ...args: any[]): Promise<T>;
        executeCommand(commandId: string, ...args: any[]): Promise<any>;
    }

    export class LazyStaticService<T> {
        get(overrides?: monaco.editor.IEditorOverrideServices): T;
    }

    export interface IStandaloneThemeService extends monaco.theme.IThemeService {
        readonly _knownThemes: Map<string, IStandaloneTheme>;
        getTheme(): IStandaloneTheme;
    }

    export interface IStandaloneTheme {
        themeData: monaco.editor.IStandaloneThemeData
        tokenTheme: TokenTheme;
        getColor(color: string): Color | undefined;
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

    export class LanguageIdentifier {
        readonly language: string;
    }

    // https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/services/modeService.ts#L30
    export interface IModeService {
        createByFilepathOrFirstLine(rsource: monaco.Uri | null, firstLine?: string): ILanguageSelection;
        getLanguageIdentifier(modeId: string): LanguageIdentifier | null;
    }

    export interface ILanguageSelection {
        readonly languageIdentifier: LanguageIdentifier;
    }

    export interface ServiceCollection {
        set<T>(id: any, instanceOrDescriptor: T): T;
    }

    export interface IMarkerService {
        read(filter?: { owner?: string; resource?: monaco.Uri; severities?: number, take?: number; }): editor.IMarkerData[];
    }

    export module StaticServices {
        export function init(overrides: monaco.editor.IEditorOverrideServices): [ServiceCollection, monaco.instantiation.IInstantiationService];
        export const standaloneThemeService: LazyStaticService<IStandaloneThemeService>;
        export const modeService: LazyStaticService<IModeService>;
        export const codeEditorService: LazyStaticService<monaco.editor.ICodeEditorService>;
        export const configurationService: LazyStaticService<IConfigurationService>;
        export const resourcePropertiesService: LazyStaticService<ITextResourcePropertiesService>;
        export const instantiationService: LazyStaticService<monaco.instantiation.IInstantiationService>;
        export const markerService: LazyStaticService<IMarkerService>;
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

declare module monaco.color {
    export class RGBA {
        constructor(r: number, g: number, b: number, a?: number);
    }
    export class HSLA {
        constructor(h: number, s: number, l: number, a: number);
    }
    export class Color {
        constructor(arg: RGBA | HSLA);
    }
    export interface ColorContribution {
        readonly id: string;
    }
    export type ColorFunction = () => string | Color;
    export type ColorValue = string | Color | ColorFunction;
    export interface ColorDefaults {
        light?: ColorValue;
        dark?: ColorValue;
        hc?: ColorValue;
    }
    export interface IColorRegistry {
        getColors(): ColorContribution[];
        registerColor(id: string, defaults: ColorDefaults | undefined, description: string): string;
        deregisterColor(id: string): void;
    }
    export function getColorRegistry(): IColorRegistry;
    export function darken(colorValue: ColorValue, factor: number): ColorFunction;
    export function lighten(colorValue: ColorValue, factor: number): ColorFunction;
    export function transparent(colorValue: ColorValue, factor: number): ColorFunction;
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
        _editorService: monaco.editor.ICodeEditorService;
        closeWidget(): void;
        _gotoReference(ref: Location): void
        toggleWidget(range: IRange, modelPromise: Promise<ReferencesModel> & { cancel: () => void }, options: RequestOptions): void;
    }

}

declare module monaco.quickOpen {

    export interface IMessage {
        content: string;
        formatContent?: boolean; // defaults to false
        type?: 1 /* INFO */ | 2  /* WARNING */ | 3 /* ERROR */;
    }

    export class InputBox {
        inputElement: HTMLInputElement;
        setPlaceHolder(placeHolder: string): void;
        showMessage(message: IMessage): void;
        hideMessage(): void;
    }

    export class QuickOpenWidget implements IDisposable {
        inputBox?: InputBox;
        constructor(container: HTMLElement, callbacks: IQuickOpenCallbacks, options: IQuickOpenOptions, usageLogger?: IQuickOpenUsageLogger);
        dispose(): void;
        create(): HTMLElement;
        setInput(input: IModel<any>, autoFocus: IAutoFocus, ariaLabel?: string): void;
        layout(dimension: monaco.editor.IDimension): void;
        show(prefix: string, options?: IShowOptions): void;
        hide(reason?: HideReason): void;
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
    // https://github.com/TypeFox/vscode/blob/monaco/0.18.0/src/vs/base/parts/quickopen/common/quickOpen.ts#L43-L48
    export type Mode = 0 /* PREVIEW */ | 1 /* OPEN */ | 2 /* OPEN_IN_BACKGROUND */;
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

    export interface IAction extends IDisposable {
        id: string;
        label: string;
        tooltip: string;
        class: string | undefined;
        enabled: boolean;
        checked: boolean;
        radio: boolean;
        run(event?: any): PromiseLike<any>;
    }

    export interface IActionProvider {
        hasActions(element: any, item: any): boolean;
        getActions(element: any, item: any): ReadonlyArray<IAction>;
    }

    export class QuickOpenModel implements IModel<QuickOpenEntry>, IDataSource<QuickOpenEntry>, IFilter<QuickOpenEntry>, IRunner<QuickOpenEntry> {
        constructor(entries?: QuickOpenEntry[], actionProvider?: IActionProvider);
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

    export interface ITokenizationSupport {
        tokenize(line: string, state: monaco.languages.IState, offsetDelta: number): any;
    }
    export interface TokenizationRegistry {
        get(language: string): ITokenizationSupport | null;
        getColorMap(): monaco.color.Color[] | null;
        readonly onDidChange: monaco.IEvent<any>;
    }
    export const TokenizationRegistry: TokenizationRegistry;

    export class TokenMetadata {

        public static getLanguageId(metadata: number): number;

        public static getFontStyle(metadata: number): number;

        public static getForeground(metadata: number): number;

        public static getBackground(metadata: number): number;

        public static getClassNameFromMetadata(metadata: number): string;

        public static getInlineStyleFromMetadata(metadata: number, colorMap: string[]): string;
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
        has(model: monaco.editor.IReadOnlyModel): boolean;
        all(model: monaco.editor.IReadOnlyModel): T[];
        register(selector: LanguageSelector, provider: T): IDisposable;
        readonly onDidChange: monaco.IEvent<number>;
    }

    export const DocumentSymbolProviderRegistry: LanguageFeatureRegistry<monaco.languages.DocumentSymbolProvider>;

    export const CompletionProviderRegistry: LanguageFeatureRegistry<monaco.languages.CompletionItemProvider>;

    export const CodeActionProviderRegistry: LanguageFeatureRegistry<monaco.languages.CodeActionProvider & { providedCodeActionKinds?: string[] }>;
}

declare module monaco.suggest {

    export const enum SnippetSortOrder {
        Top, Inline, Bottom
    }

    export interface CompletionItem {
        completion: monaco.languages.CompletionItem;
    }

    export class CompletionOptions {

        constructor(
            snippetSortOrder?: SnippetSortOrder,
            kindFilter?: Set<languages.CompletionItemKind>,
            providerFilter?: Set<languages.CompletionItemProvider>,
        );

    }

    export function provideSuggestionItems(
        model: monaco.editor.ITextModel,
        position: Position,
        options?: CompletionOptions,
        context?: monaco.languages.CompletionContext,
        token?: monaco.CancellationToken
    ): Promise<CompletionItem[]>;

    export function setSnippetSuggestSupport(support: monaco.languages.CompletionItemProvider): monaco.languages.CompletionItemProvider;

}

declare module monaco.snippetParser {
    export class SnippetParser {
        parse(value: string): TextmateSnippet;
    }
    export class TextmateSnippet {
    }
}

declare module monaco.contextKeyService {

    export interface IContextKey<T> {
        set(value: T | undefined): void;
        reset(): void;
        get(): T | undefined;
    }

    export interface IContextKeyService { }

    export interface IContext { }

    export interface IContextKeyChangeEvent {
        affectsSome(keys: Set<string>): boolean;
    }

    export class ContextKeyService implements IContextKeyService {
        constructor(configurationService: monaco.services.IConfigurationService);
        createScoped(target?: HTMLElement): IContextKeyService;
        getContext(target?: HTMLElement): IContext;
        createKey<T>(key: string, defaultValue: T | undefined): IContextKey<T>;
        contextMatchesRules(rules: monaco.contextkey.ContextKeyExpr | undefined): boolean;
        onDidChangeContext: monaco.IEvent<IContextKeyChangeEvent>;
    }

}

declare module monaco.contextkey {
    export class ContextKeyExpr {
        keys(): string[];
        static deserialize(when: string): ContextKeyExpr;
    }
}

declare module monaco.mime {
    export interface ITextMimeAssociation {
        readonly id: string;
        readonly mime: string;
        readonly filename?: string;
        readonly extension?: string;
        readonly filepattern?: string;
        readonly firstline?: RegExp;
        readonly userConfigured?: boolean;
    }

    export function registerTextMime(association: monaco.mime.ITextMimeAssociation, warnOnOverwrite: boolean): void;

    export function clearTextMimes(onlyUserConfigured?: boolean): void;
}

declare module monaco.error {
    export function onUnexpectedError(e: any): undefined;
}

/**
 * overloading languages register functions to accept LanguageSelector,
 * check that all register functions passing a selector to registries:
 * https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/standalone/browser/standaloneLanguages.ts#L335-L497
 */
declare module monaco.languages {
    export function registerReferenceProvider(selector: monaco.modes.LanguageSelector, provider: ReferenceProvider): IDisposable;
    export function registerRenameProvider(selector: monaco.modes.LanguageSelector, provider: RenameProvider): IDisposable;
    export function registerSignatureHelpProvider(selector: monaco.modes.LanguageSelector, provider: SignatureHelpProvider): IDisposable;
    export function registerHoverProvider(selector: monaco.modes.LanguageSelector, provider: HoverProvider): IDisposable;
    export function registerDocumentSymbolProvider(selector: monaco.modes.LanguageSelector, provider: DocumentSymbolProvider): IDisposable;
    export function registerDocumentHighlightProvider(selector: monaco.modes.LanguageSelector, provider: DocumentHighlightProvider): IDisposable;
    export function registerDefinitionProvider(selector: monaco.modes.LanguageSelector, provider: DefinitionProvider): IDisposable;
    export function registerImplementationProvider(selector: monaco.modes.LanguageSelector, provider: ImplementationProvider): IDisposable;
    export function registerTypeDefinitionProvider(selector: monaco.modes.LanguageSelector, provider: TypeDefinitionProvider): IDisposable;
    export function registerCodeLensProvider(selector: monaco.modes.LanguageSelector, provider: CodeLensProvider): IDisposable;
    export function registerCodeActionProvider(selector: monaco.modes.LanguageSelector, provider: CodeActionProvider): IDisposable;
    export function registerDocumentFormattingEditProvider(selector: monaco.modes.LanguageSelector, provider: DocumentFormattingEditProvider): IDisposable;
    export function registerDocumentRangeFormattingEditProvider(selector: monaco.modes.LanguageSelector, provider: DocumentRangeFormattingEditProvider): IDisposable;
    export function registerOnTypeFormattingEditProvider(selector: monaco.modes.LanguageSelector, provider: OnTypeFormattingEditProvider): IDisposable;
    export function registerLinkProvider(selector: monaco.modes.LanguageSelector, provider: LinkProvider): IDisposable;
    export function registerCompletionItemProvider(selector: monaco.modes.LanguageSelector, provider: CompletionItemProvider): IDisposable;
    export function registerColorProvider(selector: monaco.modes.LanguageSelector, provider: DocumentColorProvider): IDisposable;
    export function registerFoldingRangeProvider(selector: monaco.modes.LanguageSelector, provider: FoldingRangeProvider): IDisposable;
    export function registerDeclarationProvider(selector: monaco.modes.LanguageSelector, provider: DeclarationProvider): IDisposable;
    export function registerSelectionRangeProvider(selector: monaco.modes.LanguageSelector, provider: SelectionRangeProvider): IDisposable;
}
