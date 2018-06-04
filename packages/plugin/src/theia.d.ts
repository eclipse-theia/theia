/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

declare module '@theia/plugin' {

    export class Disposable {

        constructor(func: () => void);
        /**
         * Dispose this object.
         */
        dispose(): void;

        static create(func: () => void): Disposable;

    }

    /**
     * A command is a unique identifier of a function
     * which can be executed by a user via a keyboard shortcut,
     * a menu action or directly.
     */
    export interface Command {
        /**
         * A unique identifier of this command.
         */
        id: string;
        /**
         * A label of this command.
         */
        label?: string;
        /**
         * An icon class of this command.
         */
        iconClass?: string;
    }

    /**
     * Represents a text editor.
     */
    export interface TextEditor {
        // TODO implement TextEditor
    }

    /**
     *
     */
    export interface TextEditorEdit {
        // TODO implement TextEditorEdit
    }

    /**
     * Represents a typed event.
     */
    export interface Event<T> {

        /**
         *
         * @param listener The listener function will be call when the event happens.
         * @param thisArgs The 'this' which will be used when calling the event listener.
         * @param disposables An array to which a {{IDisposable}} will be added.
         * @return a disposable to remove the listener again.
         */
        (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
    }

    /**
     * An event emitter used to create and fire an [event](#Event) or to subscribe to.
     */
    export class EventEmitter<T> {
        /**
         * The event listeners can subscribe to
         */
        event: Event<T>;

        /**
         * Fire the event and pass data object
         * @param data
         */
        fire(data?: T): void;

        /**
         * Dispose this object
         */
        dispose(): void;
    }

    /**
     * A cancellation token used to request cancellation on long running
     * or asynchronous task.
     */
    export interface CancellationToken {
        readonly isCancellationRequested: boolean;
        /*
         * An event emitted when cancellation is requested
         * @event
         */
        readonly onCancellationRequested: Event<any>;


    }

    /**
     * A cancellation token source create and manage a [cancellation token](#CancellationToken)
     */
    export class CancellationTokenSource {
        token: CancellationToken;
        cancel(): void;
        dispose(): void;
    }

    /**
     * Something that can be selected from a list of items.
     */
    export interface QuickPickItem {

        /**
         * The item label
         */
        label: string;

        /**
         * The item description
         */
        description?: string;

        /**
         * The item detail
         */
        detail?: string;

        /**
         * Used for [QuickPickOptions.canPickMany](#QuickPickOptions.canPickMany)
         * not implemented yet
         */
        picked?: boolean;
    }

    /**
     * Options for configuration behavior of the quick pick
     */
    export interface QuickPickOptions {
        /**
         * A flag to include the description when filtering
         */
        machOnDescription?: boolean;

        /**
         *  A flag to include the detail when filtering
         */
        machOnDetail?: boolean;

        /**
         * The place holder in input box
         */
        placeHolder?: string;

        /**
         * If `true` prevent picker closing when it's loses focus
         */
        ignoreFocusOut?: boolean;

        /**
         * If `true` make picker accept multiple selections.
         * Not implemented yet
         */
        canPickMany?: boolean;

        /**
         * Function that is invoked when item selected
         */
        onDidSelectItem?(item: QuickPickItem | string): any;
    }

    export interface InputBoxOptions {
        value?: string;

        valueSelection?: [number, number];
        prompt?: string;
        placeHolder?: string;
        password?: boolean;
        ignoreFocusOut?: boolean;
        validateInput?(value: string): string | undefined | null | PromiseLike<string | undefined | null>;
    }

    /**
     * Namespace for dealing with commands. In short, a command is a function with a
     * unique identifier. The function is sometimes also called _command handler_.
     *
     * Commands can be added using the [registerCommand](#commands.registerCommand) and
     * [registerTextEditorCommand](#commands.registerTextEditorCommand) functions.
     * Registration can be split in two step: first register command without handler,
     * second register handler by command id.
     *
     * Any contributed command are available to any plugin, command can be invoked
     * by [executeCommand](#commands.executeCommand) function.
     *
     * Simple example that register command:
     * ```javascript
     * theia.commands.registerCommand({id:'say.hello.command'}, ()=>{
     *     console.log("Hello World!");
     * });
     * ```
     *
     * Simple example that invoke command:
     *
     * ```javascript
     * theia.commands.executeCommand('core.about');
     * ```
     */
    export namespace commands {
        /**
         * Register the given command and handler if present.
         *
         * Throw if a command is already registered for the given command identifier.
         */
        export function registerCommand(command: Command, handler?: (...args: any[]) => any): Disposable;

        /**
         * Register the given handler for the given command identifier.
         *
         * @param commandId a given command id
         * @param handler a command handler
         */
        export function registerHandler(commandId: string, handler: (...args: any[]) => any): Disposable;

        /**
         * Register a text editor command which can execute only if active editor present and command has access to the active editor
         *
         * @param command a command description
         * @param handler a command handler with access to text editor
         */
        export function registerTextEditorCommand(command: Command, handler: (textEditor: TextEditor, edit: TextEditorEdit, ...arg: any[]) => void): Disposable;

        /**
         * Execute the active handler for the given command and arguments.
         *
         * Reject if a command cannot be executed.
         */
        export function executeCommand<T>(commandId: string, ...args: any[]): PromiseLike<T | undefined>;
    }

    /**
     * Represents an action that is shown with a message.
     */
    export interface MessageItem {

        /**
         * A message title.
         */
        title: string;

        /**
         * Indicates that the item should be triggered
         * when the user cancels the dialog.
         *
         * Note: this option is ignored for non-modal messages.
         */
        isCloseAffordance?: boolean;
    }

    /**
     * Options to configure the message behavior.
     */
    export interface MessageOptions {

        /**
         * Indicates that this message should be modal.
         */
        modal?: boolean;
    }

    /**
     * Represents the alignment of status bar items.
     */
    export enum StatusBarAlignment {

        /**
         * Aligned to the left side.
         */
        Left = 1,

            /**
             * Aligned to the right side.
             */
        Right = 2
    }

    /**
     * A status bar item is a status bar contribution that can
     * show text and icons and run a command on click.
     */
    export interface StatusBarItem {

        /**
         * The alignment of this item.
         */
        readonly alignment: StatusBarAlignment;

        /**
         * The priority of this item. Higher value means the item should
         * be shown more to the left.
         */
        readonly priority: number;

        /**
         * The text to show for the entry. To set a text with icon use the following pattern in text string:
         * $(fontawesomeClasssName)
         */
        text: string;

        /**
         * The tooltip text when you hover over this entry.
         */
        tooltip: string | undefined;

        /**
         * The foreground color for this entry.
         */
        color: string | ThemeColor | undefined;

        /**
         * The identifier of a command to run on click.
         */
        command: string | undefined;

        /**
         * Shows the entry in the status bar.
         */
        show(): void;

        /**
         * Hide the entry in the status bar.
         */
        hide(): void;

        /**
         * Dispose and free associated resources. Hide the entry in the status bar.
         */
        dispose(): void;
    }

    /**
     * A reference to one of the workbench colors.
     * Using a theme color is preferred over a custom color as it gives theme authors and users the possibility to change the color.
     */
    export class ThemeColor {
        /**
         * Creates a reference to a theme color.
         */
        constructor(id: string);
    }

    /**
     * Represents the state of a window.
     */
    export interface WindowState {
        /**
         * Whether the current window is focused.
         */
        readonly focused: boolean;
    }

    /**
     * Common namespace for dealing with window and editor, showing messages and user input.
     */
    export namespace window {

        /**
         * Shows a selection list.
         * @param items
         * @param options
         * @param token
         */
        export function showQuickPick(items: string[] | PromiseLike<string[]>, options: QuickPickOptions, token?: CancellationToken): PromiseLike<string[] | undefined>;

        /**
         * Shows a selection list with multiple selection allowed.
         */
        export function showQuickPick(items: string[] | PromiseLike<string[]>, options: QuickPickOptions & { canPickMany: true }, token?: CancellationToken): PromiseLike<string[] | undefined>;

        /**
         * Shows a selection list.
         * @param items
         * @param options
         * @param token
         */
        export function showQuickPick<T extends QuickPickItem>(items: T[] | PromiseLike<T[]>, options: QuickPickOptions, token?: CancellationToken): PromiseLike<T[] | undefined>;

        /**
         * Shows a selection list with multiple selection allowed.
         */
        export function showQuickPick<T extends QuickPickItem>(items: T[] | PromiseLike<T[]>, options: QuickPickOptions & { canPickMany: true }, token?: CancellationToken): PromiseLike<T[] | undefined>;

        /**
         * Show an information message.
         *
         * @param message a message to show.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showInformationMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;

        /**
         * Show an information message.
         *
         * @param message a message to show.
         * @param options Configures the behaviour of the message.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showInformationMessage(message: string, options: MessageOptions, ...items: string[]): PromiseLike<string | undefined>;

        /**
         * Show an information message.
         *
         * @param message a message to show.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showInformationMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): PromiseLike<T | undefined>

        /**
         * Show an information message.
         *
         * @param message a message to show.
         * @param options Configures the behaviour of the message.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showInformationMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): PromiseLike<T | undefined>;

        /**
         * Show a warning message.
         *
         * @param message a message to show.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showWarningMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): PromiseLike<T | undefined>

        /**
         * Show a warning message.
         *
         * @param message a message to show.
         * @param options Configures the behaviour of the message.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showWarningMessage(message: string, options: MessageOptions, ...items: string[]): PromiseLike<string | undefined>;

        /**
         * Show a warning message.
         *
         * @param message a message to show.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showWarningMessage<T extends MessageItem>(message: string, ...items: T[]): PromiseLike<T | undefined>;

        /**
         * Show a warning message.
         *
         * @param message a message to show.
         * @param options Configures the behaviour of the message.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showWarningMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): PromiseLike<T | undefined>;

        /**
         * Show an error message.
         *
         * @param message a message to show.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showErrorMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): PromiseLike<T | undefined>

        /**
         * Show an error message.
         *
         * @param message a message to show.
         * @param options Configures the behaviour of the message.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showErrorMessage(message: string, options: MessageOptions, ...items: string[]): PromiseLike<string | undefined>;

        /**
         * Show an error message.
         *
         * @param message a message to show.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showErrorMessage<T extends MessageItem>(message: string, ...items: T[]): PromiseLike<T | undefined>;

        /**
         * Show an error message.
         *
         * @param message a message to show.
         * @param options Configures the behaviour of the message.
         * @param items A set of items that will be rendered as actions in the message.
         * @return A promise that resolves to the selected item or `undefined` when being dismissed.
         */
        export function showErrorMessage<T extends MessageItem>(message: string, options: MessageOptions, ...items: T[]): PromiseLike<T | undefined>;

        /**
         * Represents the current window's state.
         *
         * @readonly
         */
        export let state: WindowState;

        /**
         * An event which fires when the focus state of the current window changes.
         * The value of the event represents whether the window is focused.
         */
        export const onDidChangeWindowState: Event<WindowState>;

        /**
         * Set a message to the status bar.
         *
         * @param text The message to show, supports icon substitution as in status bar.
         * @return A disposable which hides the status bar message.
         */
        export function setStatusBarMessage(text: string): Disposable;

        /**
         * Set a message to the status bar.
         *
         * @param text The message to show, supports icon substitution as in status bar.
         * @param hideAfterTimeout Timeout in milliseconds after which the message will be disposed.
         * @return A disposable which hides the status bar message.
         */
        export function setStatusBarMessage(text: string, hideAfterTimeout: number): Disposable;

        /**
         * Set a message to the status bar.
         *
         * @param text The message to show, supports icon substitution as in status bar.
         * @param hideWhenDone PromiseLike on which completion (resolve or reject) the message will be disposed.
         * @return A disposable which hides the status bar message.
         */
        export function setStatusBarMessage(text: string, hideWhenDone: PromiseLike<any>): Disposable;

        /**
         * Creates a status bar [item](#StatusBarItem).
         *
         * @param alignment The alignment of the item.
         * @param priority The priority of the item. Higher values mean the item should be shown more to the left.
         * @return A new status bar item.
         */
        export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;

    }
}
