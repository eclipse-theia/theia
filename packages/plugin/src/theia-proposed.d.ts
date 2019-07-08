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

    // Experimental API
    // https://github.com/Microsoft/vscode/blob/1.30.2/src/vs/vscode.proposed.d.ts#L1015
    export interface FileRenameEvent {
        readonly oldUri: Uri;
        readonly newUri: Uri;
    }

    // Experimental API
    // https://github.com/Microsoft/vscode/blob/1.30.2/src/vs/vscode.proposed.d.ts#L1020
    export interface FileWillRenameEvent {
        readonly oldUri: Uri;
        readonly newUri: Uri;
        waitUntil(thenable: PromiseLike<WorkspaceEdit>): void;
    }

    /**
    * The language contribution interface defines an information about language server which should be registered.
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

    export interface SourceControlResourceDecorations {
        source?: string;
        letter?: string;
        color?: ThemeColor;
    }

    /**
     * Enumeration of the supported operating systems.
     */
    export enum OperatingSystem {
        Windows = 'Windows',
        Linux = 'Linux',
        OSX = 'OSX'
    }

    export namespace workspace {
        // Experimental API
        // https://github.com/Microsoft/vscode/blob/1.30.2/src/vs/vscode.proposed.d.ts#L1026-L1028
        export const onWillRenameFile: Event<FileWillRenameEvent>;
        export const onDidRenameFile: Event<FileRenameEvent>;
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

    export interface SourceControlResourceDecorations {
        source?: string;
        letter?: string;
        color?: ThemeColor;
    }

    export interface DecorationProvider {
        onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
        provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<DecorationData>;
    }

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
}
