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

/**
* This is the place for API experiments and proposals.
* These API are NOT stable and subject to change. Use it on own risk.
*/
declare module '@theia/plugin' {
    /**
     * @deprecated since 1.4.0 - in order to remove monaco-languageclient, use VS Code extensions to contribute language smartness:
     * https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
     */
    export namespace languageServer {
        /**
         * Registers new language server.
         *
         * @param languageServerInfo information about the language server
         */
        export function registerLanguageServerProvider(languageServerInfo: LanguageServerInfo): Disposable;

        /**
         * Stops the language server.
         *
         * @param id language server's id
         */
        export function stop(id: string): void;
    }

    /**
     * The language contribution interface defines an information about language server which should be registered.
     *
     * @deprecated since 1.4.0 - in order to remove monaco-languageclient, use VS Code extensions to contribute language smartness:
     * https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
     */
    export interface LanguageServerInfo {
        /**
         * Language server's id.
         */
        id: string;
        /**
         * Language server's name.
         */
        name: string;
        /**
         * The command to run language server as a process.
         */
        command: string;
        /**
         * Command's arguments.
         */
        args: string[];
        /**
         * File's patterns which can be used to create file system watchers.
         */
        globPatterns?: string[];
        /**
         * Names of files. If the workspace contains some of them language server should be activated.
         */
        workspaceContains?: string[];
    }


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
        export function getKeyBinding(commandId: string): PromiseLike<CommandKeyBinding[] | undefined>;

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
        export function getClientOperatingSystem(): PromiseLike<OperatingSystem>;

    }

    export interface DecorationData {
        letter?: string;
        title?: string;
        color?: ThemeColor;
        priority?: number;
        bubble?: boolean;
        source?: string;
    }

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

    export interface DecorationProvider {
        onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
        provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<DecorationData>;
    }

    //#region LogLevel: https://github.com/microsoft/vscode/issues/85992

    /**
     * The severity level of a log message
     */
    export enum LogLevel {
        Trace = 1,
        Debug = 2,
        Info = 3,
        Warning = 4,
        Error = 5,
        Critical = 6,
        Off = 7
    }

    export namespace env {
        /**
         * Current logging level.
         */
        export const logLevel: LogLevel;

        /**
         * An [event](#Event) that fires when the log level has changed.
         */
        export const onDidChangeLogLevel: Event<LogLevel>;
    }

    //#endregion

    export namespace window {
        export function registerDecorationProvider(provider: DecorationProvider): Disposable;
    }

    //#region Tree View
    // copied from https://github.com/microsoft/vscode/blob/3ea5c9ddbebd8ec68e3b821f9c39c3ec785fde97/src/vs/vscode.proposed.d.ts#L1447-L1476
    /**
     * Label describing the [Tree item](#TreeItem)
     */
    export interface TreeItemLabel {

        /**
         * A human-readable string describing the [Tree item](#TreeItem).
         */
        label: string;

        /**
         * Ranges in the label to highlight. A range is defined as a tuple of two number where the
         * first is the inclusive start index and the second the exclusive end index
         */
        // TODO highlights?: [number, number][];

    }

    export class TreeItem2 extends TreeItem {
        /**
         * Label describing this item. When `falsy`, it is derived from [resourceUri](#TreeItem.resourceUri).
         */
        label?: string | TreeItemLabel | /* for compilation */ any;

        /**
         * @param label Label describing this item
         * @param collapsibleState [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item. Default is [TreeItemCollapsibleState.None](#TreeItemCollapsibleState.None)
         */
        constructor(label: TreeItemLabel, collapsibleState?: TreeItemCollapsibleState);
    }
    //#endregion

    //#region search in workspace
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
    //#endregion
}
