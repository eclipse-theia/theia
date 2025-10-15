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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import * as theia from '@theia/plugin';
import { ThemeColor, StatusBarAlignment } from '../types-impl';
import { StatusBarMessageRegistryMain } from '../../common/plugin-api-rpc';
import { UUID } from '@theia/core/shared/@lumino/coreutils';
import { CommandRegistryImpl } from '../command-registry';
import { MarkdownString } from '../markdown-string';
import { DisposableCollection } from '@theia/core/lib/common/disposable';

export class StatusBarItemImpl implements theia.StatusBarItem {

    /** Map from allowed background colors to corresponding foreground colors. */
    private static BACKGROUND_COLORS = new Map<string, string>([
        ['statusBarItem.errorBackground', 'statusBarItem.errorForeground'],
        ['statusBarItem.warningBackground', 'statusBarItem.warningForeground']
    ]);

    private _id: string;

    private _alignment: StatusBarAlignment;
    private _priority: number;

    private _name: string | undefined;
    private _text: string;
    private _tooltip: string | theia.MarkdownString | undefined;
    private _tooltip2: string | theia.MarkdownString | undefined | ((token: theia.CancellationToken) => theia.ProviderResult<string | theia.MarkdownString>);
    private _color: string | ThemeColor | undefined;
    private _backgroundColor: ThemeColor | undefined;
    private _command: string | theia.Command;
    private _accessibilityInformation: theia.AccessibilityInformation;

    private _isVisible: boolean;
    private _timeoutHandle: NodeJS.Timeout | undefined;

    _proxy: StatusBarMessageRegistryMain;

    constructor(proxy: StatusBarMessageRegistryMain,
        private readonly commandRegistry: CommandRegistryImpl,
        alignment: StatusBarAlignment = StatusBarAlignment.Left,
        priority: number = 0,
        id = StatusBarItemImpl.nextId(),
        private onDispose?: () => void) {
        this._proxy = proxy;
        this._alignment = alignment;
        this._priority = priority;
        this._id = id;
    }

    public get id(): string {
        return this._id;
    }

    public get alignment(): theia.StatusBarAlignment {
        return this._alignment;
    }

    public get priority(): number {
        return this._priority;
    }

    public get name(): string | undefined {
        return this._name;
    }

    public get text(): string {
        return this._text;
    }

    public get tooltip(): string | theia.MarkdownString | undefined {
        return this._tooltip;
    }

    public get tooltip2(): string | theia.MarkdownString | undefined | ((token: theia.CancellationToken) => theia.ProviderResult<string | theia.MarkdownString>) {
        if (typeof this._tooltip2 === 'function') {
            const getTooltip = this._tooltip2.bind(this);
            return (token: theia.CancellationToken) => Promise.resolve(getTooltip(token)).then(res => {
                this.processTooltip(res);
                return res;
            });
        }
        return this._tooltip2;
    }

    public get color(): string | ThemeColor | undefined {
        return this._color;
    }

    public get backgroundColor(): ThemeColor | undefined {
        return this._backgroundColor;
    }

    public get command(): string | theia.Command {
        return this._command;
    }

    public get accessibilityInformation(): theia.AccessibilityInformation {
        return this._accessibilityInformation;
    }

    public set name(name: string | undefined) {
        this._name = name;
        this.update();
    }

    public set text(text: string) {
        this._text = text;
        this.update();
    }

    public set tooltip2(tooltip: string | theia.MarkdownString | ((token: theia.CancellationToken) => theia.ProviderResult<string | theia.MarkdownString>) | undefined) {
        this.processTooltip(tooltip);
        this._tooltip2 = tooltip;
        this.update();
    }

    public set tooltip(tooltip: string | theia.MarkdownString | undefined) {
        this.processTooltip(tooltip);
        this._tooltip = tooltip;
        this.update();
    }

    public set color(color: string | ThemeColor | undefined) {
        this._color = color;
        this.update();
    }

    public set backgroundColor(backgroundColor: ThemeColor | undefined) {
        if (backgroundColor && StatusBarItemImpl.BACKGROUND_COLORS.has(backgroundColor.id)) {
            this._backgroundColor = backgroundColor;
        } else {
            this._backgroundColor = undefined;
        }
        this.update();
    }

    public set command(command: string | theia.Command) {
        this._command = command;
        this.update();
    }

    public set accessibilityInformation(information: theia.AccessibilityInformation) {
        this._accessibilityInformation = information;
        this.update();
    }

    public show(): void {
        this._isVisible = true;
        this.update();
    }

    public hide(): void {
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
        }
        this._proxy.$dispose(this.id);
        this._isVisible = false;
    }

    private processTooltip(tooltip: string | theia.MarkdownString | ((token: theia.CancellationToken) => theia.ProviderResult<string | theia.MarkdownString>) | undefined): void {
        if (!MarkdownString.isMarkdownString(tooltip)) {
            return;
        }
        const content = tooltip.value;
        // Find all command links in the markdown content
        const regex = /\[([^\]]+)\]\(command:([^?\s\)]+)(?:\?([^\s\)]+))?([^\)]*)\)/g;
        let match;
        let updatedContent = content;

        while ((match = regex.exec(content)) !== null) {
            const linkText = match[1];
            const commandId = match[2];
            const argsEncoded = match[3]; // This captures the encoded arguments
            const tooltipPart = match[4] || ''; // This captures any tooltip or additional content after the command and args

            let args: unknown[] = [];
            if (argsEncoded) {
                try {
                    const decoded = decodeURIComponent(argsEncoded);
                    args = JSON.parse(decoded);
                } catch (e) {
                    console.error('Failed to parse command arguments:', e);
                }
            }

            const safeCommand = this.commandRegistry.converter.toSafeCommand(
                {
                    command: commandId,
                    title: linkText,
                    arguments: Array.isArray(args) ? args : [args]
                },
                new DisposableCollection()
            );

            if (safeCommand?.id) {
                let newArgsPart = '';
                if (safeCommand.arguments && safeCommand.arguments.length > 0) {
                    newArgsPart = `?${encodeURIComponent(JSON.stringify(safeCommand.arguments))}`;
                }

                const argsPart = argsEncoded ? `?${argsEncoded}` : '';
                const originalLink = `[${linkText}](command:${commandId}${argsPart}${tooltipPart})`;
                const safeLink = `[${linkText}](command:${safeCommand.id}${newArgsPart}${tooltipPart})`;
                updatedContent = updatedContent.replace(originalLink, safeLink);
            }
        }

        if (updatedContent !== content) {
            tooltip.value = updatedContent;
        }
    }

    private update(): void {
        if (!this._isVisible) {
            return;
        }
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
        }
        // Defer the update so that multiple changes to setters don't cause a redraw each
        this._timeoutHandle = setTimeout(() => {
            this._timeoutHandle = undefined;

            const commandId = typeof this.command === 'object' ? this.command.command : this.command;
            const args = typeof this.command === 'object' ? this.command.arguments : undefined;

            let color = this.color;
            if (this.backgroundColor) {
                // If an error or warning background color is set, set the corresponding foreground color
                color = StatusBarItemImpl.BACKGROUND_COLORS.get(this.backgroundColor.id);
            }

            const tooltip = typeof this._tooltip2 === 'function' ? true : this._tooltip2 ?? this.tooltip;

            // Set to status bar
            this._proxy.$setMessage(
                this.id,
                this.name,
                this.text,
                this.priority,
                this.alignment,
                typeof color === 'string' ? color : color?.id,
                this.backgroundColor?.id,
                tooltip,
                commandId,
                this.accessibilityInformation,
                args);
        }, 0);
    }

    public dispose(): void {
        this.onDispose?.();
        this.hide();
    }

    static nextId(): string {
        return StatusBarItemImpl.ID_PREFIX + ':' + UUID.uuid4();
    }
    static ID_PREFIX = 'plugin-status-bar-item';
}
