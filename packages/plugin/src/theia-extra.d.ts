// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * This is the place for extra APIs Theia supports compared to VS Code.
 */
export module '@theia/plugin' {

    export interface WebviewPanel {
        /**
         * Show the webview panel according to a given options.
         *
         * A webview panel may only show in a single column at a time. If it is already showing, this
         * method moves it to a new column.
         *
         * @param area target area where webview panel will be resided. Shows in the 'WebviewPanelTargetArea.Main' area if undefined.
         * @param viewColumn View column to show the panel in. Shows in the current `viewColumn` if undefined.
         * @param preserveFocus When `true`, the webview will not take focus.
         */
        reveal(area?: WebviewPanelTargetArea, viewColumn?: ViewColumn, preserveFocus?: boolean): void;
    }

    export type PluginType = 'frontend' | 'backend';

    /**
     * Namespace for dealing with installed plug-ins. Plug-ins are represented
     * by an [plug-in](#Plugin)-interface which enables reflection on them.
     *
     * Plug-in writers can provide APIs to other plug-ins by returning their API public
     * surface from the `start`-call.
     *
     * ```javascript
     * export function start() {
     *     let api = {
     *         sum(a, b) {
     *             return a + b;
     *         },
     *         mul(a, b) {
     *             return a * b;
     *         }
     *     };
     *     // 'export' public api-surface
     *     return api;
     * }
     * ```
     * ```javascript
     * let mathExt = plugins.getPlugin('genius.math');
     * let importedApi = mathExt.exports;
     *
     * console.log(importedApi.mul(42, 1));
     * ```
     */
    export namespace plugins {
        /**
         * Get an plug-in by its full identifier in the form of: `publisher.name`.
         *
         * @param pluginId An plug-in identifier.
         * @return An plug-in or `undefined`.
         */
        export function getPlugin(pluginId: string): Plugin<any> | undefined;

        /**
         * Get an plug-in its full identifier in the form of: `publisher.name`.
         *
         * @param pluginId An plug-in identifier.
         * @return An plug-in or `undefined`.
         */
        export function getPlugin<T>(pluginId: string): Plugin<T> | undefined;

        /**
         * All plug-ins currently known to the system.
         */
        export let all: Plugin<any>[];

        /**
         * An event which fires when `plugins.all` changes. This can happen when extensions are
         * installed, uninstalled, enabled or disabled.
         */
        export let onDidChange: Event<void>;
    }

    /**
     * Represents an plugin.
     *
     * To get an instance of an `Plugin` use {@link plugins.getPlugin getPlugin}.
     */
    export interface Plugin<T> {

        /**
         * The canonical plug-in identifier in the form of: `publisher.name`.
         */
        readonly id: string;

        /**
         * The absolute file path of the directory containing this plug-in.
         */
        readonly pluginPath: string;

        /**
         * The uri of the directory containing this plug-in.
         */
        readonly pluginUri: Uri;

        /**
         * `true` if the plug-in has been activated.
         */
        readonly isActive: boolean;

        /**
         * The parsed contents of the plug-in's package.json.
         */
        readonly packageJSON: any;

        /**
         *
         */
        readonly pluginType: PluginType;

        /**
         * The public API exported by this plug-in. It is an invalid action
         * to access this field before this plug-in has been activated.
         */
        readonly exports: T;

        /**
         * Activates this plug-in and returns its public API.
         *
         * @return A promise that will resolve when this plug-in has been activated.
         */
        activate(): Thenable<T>;
    }

    /**
     * A plug-in context is a collection of utilities private to a
     * plug-in.
     *
     * An instance of a `PluginContext` is provided as the first
     * parameter to the `start` of a plug-in.
     */
    export interface PluginContext {

        /**
         * An array to which disposables can be added. When this
         * extension is deactivated the disposables will be disposed.
         */
        subscriptions: { dispose(): any }[];

        /**
         * A memento object that stores state in the context
         * of the currently opened {@link workspace.workspaceFolders workspace}.
         */
        workspaceState: Memento;

        /**
         * A memento object that stores state independent
         * of the current opened {@link workspace.workspaceFolders workspace}.
         */
        globalState: Memento & {
            /**
             * Set the keys whose values should be synchronized across devices when synchronizing user-data
             * like configuration, extensions, and mementos.
             *
             * Note that this function defines the whole set of keys whose values are synchronized:
             *  - calling it with an empty array stops synchronization for this memento
             *  - calling it with a non-empty array replaces all keys whose values are synchronized
             *
             * For any given set of keys this function needs to be called only once but there is no harm in
             * repeatedly calling it.
             *
             * @param keys The set of keys whose values are synced.
             */
            setKeysForSync(keys: readonly string[]): void;
        };

        /**
         * A storage utility for secrets.
         */
        readonly secrets: SecretStorage;

        /**
         * The absolute file path of the directory containing the extension.
         */
        extensionPath: string;

        /**
         * The uri of the directory containing the extension.
         */
        readonly extensionUri: Uri;

        /**
         * Gets the extension's environment variable collection for this workspace, enabling changes
         * to be applied to terminal environment variables.
         */
        readonly environmentVariableCollection: EnvironmentVariableCollection;

        /**
         * Get the absolute path of a resource contained in the extension.
         *
         * @param relativePath A relative path to a resource contained in the extension.
         * @return The absolute path of the resource.
         */
        asAbsolutePath(relativePath: string): string;

        /**
         * An absolute file path of a workspace specific directory in which the extension
         * can store private state. The directory might not exist on disk and creation is
         * up to the extension. However, the parent directory is guaranteed to be existent.
         *
         * Use [`workspaceState`](#PluginContext.workspaceState) or
         * [`globalState`](#PluginContext.globalState) to store key value data.
         *
         * @deprecated Use {@link PluginContext.storageUri storageUri} instead.
         */
        storagePath: string | undefined;

        /**
         * The uri of a workspace specific directory in which the extension
         * can store private state. The directory might not exist and creation is
         * up to the extension. However, the parent directory is guaranteed to be existent.
         * The value is `undefined` when no workspace nor folder has been opened.
         *
         * Use [`workspaceState`](#PluginContext.workspaceState) or
         * [`globalState`](#PluginContext.globalState) to store key value data.
         *
         * @see [`workspace.fs`](#FileSystem) for how to read and write files and folders from
         *  an uri.
         */
        readonly storageUri: Uri | undefined;

        /**
         * An absolute file path in which the extension can store global state.
         * The directory might not exist on disk and creation is
         * up to the extension. However, the parent directory is guaranteed to be existent.
         *
         * Use [`globalState`](#PluginContext.globalState) to store key value data.
         *
         * @deprecated Use {@link PluginContext.globalStorageUri globalStorageUri} instead.
         */
        readonly globalStoragePath: string;

        /**
         * The uri of a directory in which the extension can store global state.
         * The directory might not exist on disk and creation is
         * up to the extension. However, the parent directory is guaranteed to be existent.
         *
         * Use [`globalState`](#PluginContext.globalState) to store key value data.
         *
         * @see [`workspace.fs`](#FileSystem) for how to read and write files and folders from
         *  an uri.
         */
        readonly globalStorageUri: Uri;

        /**
         * An absolute file path of a directory in which the extension can create log files.
         * The directory might not exist on disk and creation is up to the extension. However,
         * the parent directory is guaranteed to be existent.
         */
        readonly logPath: string;

        /**
         * The mode the extension is running in. This is specific to the current
         * extension. One extension may be in `ExtensionMode.Development` while
         * other extensions in the host run in `ExtensionMode.Release`.
         */
        readonly extensionMode: ExtensionMode;

        /**
         * The current extension instance.
         */
        readonly extension: Plugin<any> | undefined;

        /**
         * The uri of a directory in which the extension can create log files. The directory might
         * not exist on disk and creation is up to the extension. However, the parent directory is
         * guaranteed to be existent.
         * see - workspace.fs for how to read and write files and folders from an uri.
         */
        readonly logUri: Uri;

        /**
         * An object that keeps information about how this extension can use language models.
         *
         * @see {@link LanguageModelChat.sendRequest}
         */
        readonly languageModelAccessInformation: LanguageModelAccessInformation;
    }

    export namespace commands {

        /**
         * Get the keybindings associated to commandId.
         * @param commandId The ID of the command for which we are looking for keybindings.
         */
        export function getKeyBinding(commandId: string): Thenable<CommandKeyBinding[] | undefined>;
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

    export interface TerminalObserver {

        /**
         * A regex to match against the latest terminal output.
         */
        readonly outputMatcherRegex: string;
        /**
         * The maximum number of lines to match the regex against. Maximum is 40 lines.
         */
        readonly nrOfLinesToMatch: number;
        /**
         * Invoked when the regex matched against the terminal contents.
         * @param groups The matched groups
         */
        matchOccurred(groups: string[]): void;
    }

    export namespace window {
        export function registerTerminalObserver(observer: TerminalObserver): Disposable;
    }
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
