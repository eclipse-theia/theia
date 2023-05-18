// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * This is the place for API experiments and proposals.
 * These API are NOT stable and subject to change. Use it on own risk.
 */
export module '@theia/plugin' {
    /**
     * The contiguous set of modified lines in a diff.
     */
    export interface LineChange {
        readonly originalStartLineNumber: number;
        readonly originalEndLineNumber: number;
        readonly modifiedStartLineNumber: number;
        readonly modifiedEndLineNumber: number;
    }

    export namespace commands {

        /**
         * Get the keybindings associated to commandId.
         * @param commandId The ID of the command for which we are looking for keybindings.
         */
        export function getKeyBinding(commandId: string): Thenable<CommandKeyBinding[] | undefined>;

        /**
         * Registers a diff information command that can be invoked via a keyboard shortcut,
         * a menu item, an action, or directly.
         *
         * Diff information commands are different from ordinary [commands](#commands.registerCommand) as
         * they only execute when there is an active diff editor when the command is called, and the diff
         * information has been computed. Also, the command handler of an editor command has access to
         * the diff information.
         *
         * @param command A unique identifier for the command.
         * @param callback A command handler function with access to the [diff information](#LineChange).
         * @param thisArg The `this` context used when invoking the handler function.
         * @return Disposable which unregisters this command on disposal.
         */
        export function registerDiffInformationCommand(command: string, callback: (diff: LineChange[], ...args: any[]) => any, thisArg?: any): Disposable;

    }

    /**
     * Key Binding of a command
     */
    export interface CommandKeyBinding {
        /**
         * Identifier of the command.
         */
        id: string;
        /**
         * Value of the keyBinding
         */
        value: string;
    }

    /**
     * Enumeration of the supported operating systems.
     */
    export enum OperatingSystem {
        Windows = 'Windows',
        Linux = 'Linux',
        OSX = 'OSX'
    }

    export namespace env {

        /**
         * Returns the type of the operating system on the client side (like browser'OS if using browser mode). If it is neither [Windows](isWindows) nor [OS X](isOSX), then
         * it always return with the `Linux` OS type.
         */
        export function getClientOperatingSystem(): Thenable<OperatingSystem>;

    }

    export interface DecorationData {
        letter?: string;
        title?: string;
        color?: ThemeColor;
        priority?: number;
        bubble?: boolean;
        source?: string;
    }

    // #region SCM validation

    /**
     * Represents the validation type of the Source Control input.
     */
    export enum SourceControlInputBoxValidationType {

        /**
         * Something not allowed by the rules of a language or other means.
         */
        Error = 0,

        /**
         * Something suspicious but allowed.
         */
        Warning = 1,

        /**
         * Something to inform about but not a problem.
         */
        Information = 2
    }

    export interface SourceControlInputBoxValidation {

        /**
         * The validation message to display.
         */
        readonly message: string;

        /**
         * The validation type.
         */
        readonly type: SourceControlInputBoxValidationType;
    }

    /**
     * Represents the input box in the Source Control viewlet.
     */
    export interface SourceControlInputBox {

        /**
         * A validation function for the input box. It's possible to change
         * the validation provider simply by setting this property to a different function.
         */
        validateInput?(value: string, cursorPosition: number): ProviderResult<SourceControlInputBoxValidation | undefined | null>;
    }

    // #endregion

    export interface SourceControl {

        /**
         * Whether the source control is selected.
         */
        readonly selected: boolean;

        /**
         * An event signaling when the selection state changes.
         */
        readonly onDidChangeSelection: Event<boolean>;
    }

    export interface SourceControlResourceDecorations {
        source?: string;
        letter?: string;
        color?: ThemeColor;
    }

    // #region search in workspace
    /**
     * The parameters of a query for text search.
     */
    export interface TextSearchQuery {
        /**
         * The text pattern to search for.
         */
        pattern: string;

        /**
         * Whether or not `pattern` should match multiple lines of text.
         */
        isMultiline?: boolean;

        /**
         * Whether or not `pattern` should be interpreted as a regular expression.
         */
        isRegExp?: boolean;

        /**
         * Whether or not the search should be case-sensitive.
         */
        isCaseSensitive?: boolean;

        /**
         * Whether or not to search for whole word matches only.
         */
        isWordMatch?: boolean;
    }

    /**
     * Options that can be set on a findTextInFiles search.
     */
    export interface FindTextInFilesOptions {
        /**
         * A [glob pattern](#GlobPattern) that defines the files to search for. The glob pattern
         * will be matched against the file paths of files relative to their workspace. Use a [relative pattern](#RelativePattern)
         * to restrict the search results to a [workspace folder](#WorkspaceFolder).
         */
        include?: GlobPattern;

        /**
         * A [glob pattern](#GlobPattern) that defines files and folders to exclude. The glob pattern
         * will be matched against the file paths of resulting matches relative to their workspace. When `undefined`, default excludes will
         * apply.
         */
        exclude?: GlobPattern;

        /**
         * Whether to use the default and user-configured excludes. Defaults to true.
         */
        useDefaultExcludes?: boolean;

        /**
         * The maximum number of results to search for
         */
        maxResults?: number;

        /**
         * Whether external files that exclude files, like .gitignore, should be respected.
         * See the vscode setting `"search.useIgnoreFiles"`.
         */
        useIgnoreFiles?: boolean;

        /**
         * Whether global files that exclude files, like .gitignore, should be respected.
         * See the vscode setting `"search.useGlobalIgnoreFiles"`.
         */
        useGlobalIgnoreFiles?: boolean;

        /**
         * Whether symlinks should be followed while searching.
         * See the vscode setting `"search.followSymlinks"`.
         */
        followSymlinks?: boolean;

        /**
         * Interpret files using this encoding.
         * See the vscode setting `"files.encoding"`
         */
        encoding?: string;

        /**
         * Options to specify the size of the result text preview.
         */
        previewOptions?: TextSearchPreviewOptions;

        /**
         * Number of lines of context to include before each match.
         */
        beforeContext?: number;

        /**
         * Number of lines of context to include after each match.
         */
        afterContext?: number;
    }

    /**
     * A match from a text search
     */
    export interface TextSearchMatch {
        /**
         * The uri for the matching document.
         */
        uri: Uri;

        /**
         * The range of the match within the document, or multiple ranges for multiple matches.
         */
        ranges: Range | Range[];

        /**
         * A preview of the text match.
         */
        preview: TextSearchMatchPreview;
    }

    /**
     * A preview of the text result.
     */
    export interface TextSearchMatchPreview {
        /**
         * The matching lines of text, or a portion of the matching line that contains the match.
         */
        text: string;

        /**
         * The Range within `text` corresponding to the text of the match.
         * The number of matches must match the TextSearchMatch's range property.
         */
        matches: Range | Range[];
    }

    /**
     * Options to specify the size of the result text preview.
     * These options don't affect the size of the match itself, just the amount of preview text.
     */
    export interface TextSearchPreviewOptions {
        /**
         * The maximum number of lines in the preview.
         * Only search providers that support multiline search will ever return more than one line in the match.
         */
        matchLines: number;

        /**
         * The maximum number of characters included per line.
         */
        charsPerLine: number;
    }

    /**
     * A line of context surrounding a TextSearchMatch.
     */
    export interface TextSearchContext {
        /**
         * The uri for the matching document.
         */
        uri: Uri;

        /**
         * One line of text.
         * previewOptions.charsPerLine applies to this
         */
        text: string;

        /**
         * The line number of this line of context.
         */
        lineNumber: number;
    }

    export type TextSearchResult = TextSearchMatch | TextSearchContext;

    /**
     * Information collected when text search is complete.
     */
    export interface TextSearchComplete {
        /**
         * Whether the search hit the limit on the maximum number of search results.
         * `maxResults` on [`TextSearchOptions`](#TextSearchOptions) specifies the max number of results.
         * - If exactly that number of matches exist, this should be false.
         * - If `maxResults` matches are returned and more exist, this should be true.
         * - If search hits an internal limit which is less than `maxResults`, this should be true.
         */
        limitHit?: boolean;
    }

    export namespace workspace {
        /**
         * Find text in files across all [workspace folders] in the workspace
         * @param query What to search
         * @param optionsOrCallback
         * @param callbackOrToken
         * @param token
         */
        export function findTextInFiles(query: TextSearchQuery, optionsOrCallback: FindTextInFilesOptions | ((result: TextSearchResult) => void),
            callbackOrToken?: CancellationToken | ((result: TextSearchResult) => void), token?: CancellationToken): Promise<TextSearchComplete>;
    }
    // #endregion

    // #region read/write in chunks: https://github.com/microsoft/vscode/issues/84515

    export interface FileSystemProvider {
        open?(resource: Uri, options: { create: boolean; }): number | Thenable<number>;
        close?(fd: number): void | Thenable<void>;
        read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number>;
        write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number>;
    }

    // #endregion

    // #region Custom editor move https://github.com/microsoft/vscode/issues/86146
    // copied from https://github.com/microsoft/vscode/blob/53eac52308c4611000a171cc7bf1214293473c78/src/vs/vscode.proposed.d.ts#L986-L1007

    // TODO: Also for custom editor

    export interface CustomTextEditorProvider {

        /**
         * Handle when the underlying resource for a custom editor is renamed.
         *
         * This allows the webview for the editor be preserved throughout the rename. If this method is not implemented,
         * Theia will destroy the previous custom editor and create a replacement one.
         *
         * @param newDocument New text document to use for the custom editor.
         * @param existingWebviewPanel Webview panel for the custom editor.
         * @param token A cancellation token that indicates the result is no longer needed.
         *
         * @return Thenable indicating that the webview editor has been moved.
         */
        moveCustomTextEditor?(newDocument: TextDocument, existingWebviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;
    }

    // #endregion

    export interface ResourceLabelFormatter {
        scheme: string;
        authority?: string;
        formatting: ResourceLabelFormatting;
    }

    export interface ResourceLabelFormatting {
        label: string; // myLabel:/${path}
        // TODO@isi
        separator: '/' | '\\' | '';
        tildify?: boolean;
        normalizeDriveLetter?: boolean;
        workspaceSuffix?: string;
        authorityPrefix?: string;
    }

    export namespace workspace {
        export function registerResourceLabelFormatter(formatter: ResourceLabelFormatter): Disposable;
    }

    // #region timeline
    // copied from https://github.com/microsoft/vscode/blob/d69a79b73808559a91206d73d7717ff5f798f23c/src/vs/vscode.proposed.d.ts#L1870-L2017
    export class TimelineItem {
        /**
         * A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred.
         */
        timestamp: number;

        /**
         * A human-readable string describing the timeline item.
         */
        label: string;

        /**
         * Optional id for the timeline item. It must be unique across all the timeline items provided by this source.
         *
         * If not provided, an id is generated using the timeline item's timestamp.
         */
        id?: string;

        /**
         * The icon path or [ThemeIcon](#ThemeIcon) for the timeline item.
         */
        iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;

        /**
         * A human readable string describing less prominent details of the timeline item.
         */
        description?: string;

        /**
         * The tooltip text when you hover over the timeline item.
         */
        detail?: string;

        /**
         * The [command](#Command) that should be executed when the timeline item is selected.
         */
        command?: Command;

        /**
         * Context value of the timeline item. This can be used to contribute specific actions to the item.
         * For example, a timeline item is given a context value as `commit`. When contributing actions to `timeline/item/context`
         * using `menus` extension point, you can specify context value for key `timelineItem` in `when` expression like `timelineItem == commit`.
         * ```
         * "contributes": {
         *   "menus": {
         *     "timeline/item/context": [{
         *       "command": "extension.copyCommitId",
         *       "when": "timelineItem == commit"
         *      }]
         *   }
         * }
         * ```
         * This will show the `extension.copyCommitId` action only for items where `contextValue` is `commit`.
         */
        contextValue?: string;

        /**
         * Accessibility information used when screen reader interacts with this timeline item.
         */
        accessibilityInformation?: AccessibilityInformation;

        /**
         * @param label A human-readable string describing the timeline item
         * @param timestamp A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred
         */
        constructor(label: string, timestamp: number);
    }

    export interface TimelineChangeEvent {
        /**
         * The [uri](#Uri) of the resource for which the timeline changed.
         */
        uri: Uri;

        /**
         * A flag which indicates whether the entire timeline should be reset.
         */
        reset?: boolean;
    }

    export interface Timeline {
        readonly paging?: {
            /**
             * A provider-defined cursor specifying the starting point of timeline items which are after the ones returned.
             * Use `undefined` to signal that there are no more items to be returned.
             */
            readonly cursor: string | undefined;
        }

        /**
         * An array of [timeline items](#TimelineItem).
         */
        readonly items: readonly TimelineItem[];
    }

    export interface TimelineOptions {
        /**
         * A provider-defined cursor specifying the starting point of the timeline items that should be returned.
         */
        cursor?: string;

        /**
         * An optional maximum number timeline items or the all timeline items newer (inclusive) than the timestamp or id that should be returned.
         * If `undefined` all timeline items should be returned.
         */
        limit?: number | { timestamp: number; id?: string };
    }

    export interface TimelineProvider {
        /**
         * An optional event to signal that the timeline for a source has changed.
         * To signal that the timeline for all resources (uris) has changed, do not pass any argument or pass `undefined`.
         */
        onDidChange?: Event<TimelineChangeEvent | undefined>;

        /**
         * An identifier of the source of the timeline items. This can be used to filter sources.
         */
        readonly id: string;

        /**
         * A human-readable string describing the source of the timeline items. This can be used as the display label when filtering sources.
         */
        readonly label: string;

        /**
         * Provide [timeline items](#TimelineItem) for a [Uri](#Uri).
         *
         * @param uri The [uri](#Uri) of the file to provide the timeline for.
         * @param options A set of options to determine how results should be returned.
         * @param token A cancellation token.
         * @return The [timeline result](#TimelineResult) or a thenable that resolves to such. The lack of a result
         * can be signaled by returning `undefined`, `null`, or an empty array.
         */
        provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>;
    }

    export namespace workspace {
        /**
         * Register a timeline provider.
         *
         * Multiple providers can be registered. In that case, providers are asked in
         * parallel and the results are merged. A failing provider (rejected promise or exception) will
         * not cause a failure of the whole operation.
         *
         * @param scheme A scheme or schemes that defines which documents this provider is applicable to. Can be `*` to target all documents.
         * @param provider A timeline provider.
         * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
         */
        export function registerTimelineProvider(scheme: string | string[], provider: TimelineProvider): Disposable;
    }

    // Copied from https://github.com/microsoft/vscode/blob/ad4470522ecd858cfaf53a87c2702d7a40946ba1/src/vscode-dts/vscode.proposed.extensionsAny.d.ts
    // https://github.com/microsoft/vscode/issues/145307

    export interface Extension<T> {

        /**
         * `true` when the extension is associated to another extension host.
         *
         * *Note* that an extension from another extension host cannot export
         * API, e.g {@link Extension.exports its exports} are always `undefined`.
         */
        readonly isFromDifferentExtensionHost: boolean;
    }

    export namespace extensions {

        /**
         * Get an extension by its full identifier in the form of: `publisher.name`.
         *
         * @param extensionId An extension identifier.
         * @param includeDifferentExtensionHosts Include extensions from different extension host
         * @return An extension or `undefined`.
         */
        export function getExtension<T = any>(extensionId: string, includeDifferentExtensionHosts: boolean): Extension<T> | undefined;

        /**
         * All extensions across all extension hosts.
         *
         * @see {@link Extension.isFromDifferentExtensionHost}
         */
        export const allAcrossExtensionHosts: readonly Extension<void>[];

    }

    // #region DocumentPaste

    // https://github.com/microsoft/vscode/issues/30066/

    /**
     * Provider invoked when the user copies and pastes code.
     */
    export interface DocumentPasteEditProvider {

        /**
         * Optional method invoked after the user copies text in a file.
         *
         * During {@link prepareDocumentPaste}, an extension can compute metadata that is attached to
         * a {@link DataTransfer} and is passed back to the provider in {@link provideDocumentPasteEdits}.
         *
         * @param document Document where the copy took place.
         * @param ranges Ranges being copied in the `document`.
         * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for later use in  {@link provideDocumentPasteEdits}.
         * @param token A cancellation token.
         */
        prepareDocumentPaste?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

        /**
         * Invoked before the user pastes into a document.
         *
         * In this method, extensions can return a workspace edit that replaces the standard pasting behavior.
         *
         * @param document Document being pasted into
         * @param ranges Currently selected ranges in the document.
         * @param dataTransfer The data transfer associated with the paste.
         * @param token A cancellation token.
         *
         * @return Optional workspace edit that applies the paste. Return undefined to use standard pasting.
         */
        provideDocumentPasteEdits(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<DocumentPasteEdit>;
    }

    /**
     * An operation applied on paste
     */
    class DocumentPasteEdit {
        /**
         * The text or snippet to insert at the pasted locations.
         */
        insertText: string | SnippetString;

        /**
         * An optional additional edit to apply on paste.
         */
        additionalEdit?: WorkspaceEdit;

        /**
         * @param insertText The text or snippet to insert at the pasted locations.
         */
        constructor(insertText: string | SnippetString);
    }

    interface DocumentPasteProviderMetadata {
        /**
         * Mime types that `provideDocumentPasteEdits` should be invoked for.
         *
         * Use the special `files` mimetype to indicate the provider should be invoked if any files are present in the `DataTransfer`.
         */
        readonly pasteMimeTypes: readonly string[];
    }

    namespace languages {
        export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider, metadata: DocumentPasteProviderMetadata): Disposable;
    }
    // #endregion

    // #region ProfileContentHandler

    export interface ProfileContentHandler {
        readonly name: string;
        saveProfile(name: string, content: string, token: CancellationToken): Thenable<Uri | null>;
        readProfile(uri: Uri, token: CancellationToken): Thenable<string | null>;
    }

    export namespace window {
        export function registerProfileContentHandler(id: string, profileContentHandler: ProfileContentHandler): Disposable;
    }

    // #endregion ProfileContentHandler

    // #region TerminalQuickFixProvider

    export namespace window {
        /**
         * @param provider A terminal quick fix provider
         * @return A {@link Disposable} that un-registers the provider when being disposed
         */
        export function registerTerminalQuickFixProvider(id: string, provider: TerminalQuickFixProvider): Disposable;
    }

    export interface TerminalQuickFixProvider {
        /**
         * Provides terminal quick fixes
         * @param commandMatchResult The command match result for which to provide quick fixes
         * @param token A cancellation token indicating the result is no longer needed
         * @return Terminal quick fix(es) if any
         */
        provideTerminalQuickFixes(commandMatchResult: TerminalCommandMatchResult, token: CancellationToken): TerminalQuickFix[] | TerminalQuickFix | undefined;
    }

    export interface TerminalCommandMatchResult {
        commandLine: string;
        commandLineMatch: RegExpMatchArray;
        outputMatch?: {
            regexMatch: RegExpMatchArray;
            outputLines?: string[];
        };
    }

    interface TerminalQuickFix {
        type: TerminalQuickFixType;
    }

    enum TerminalQuickFixType {
        command = 'command',
        opener = 'opener'
    }

    // #endRegion TerminalQuickFixProvider
}

/**
 * Thenable is a common denominator between ES6 promises, Q, jquery.Deferred, WinJS.Promise,
 * and others. This API makes no assumption about what promise library is being used which
 * enables reusing existing code without migrating to a specific promise implementation. Still,
 * we recommend the use of native promises which are available in this editor.
 */
interface Thenable<T> {
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
    then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

