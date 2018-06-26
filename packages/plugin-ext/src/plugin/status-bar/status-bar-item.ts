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
import * as theia from '@theia/plugin';
import { ThemeColor, StatusBarAlignment } from '../types-impl';
import { StatusBarMessageRegistryMain } from '../../api/plugin-api';
import { VS_COLORS } from './vscolor-const';

export class StatusBarItemImpl implements theia.StatusBarItem {
    private _messageId: string;
    private _alignment: StatusBarAlignment;
    private _priority: number;

    private _text: string;
    private _tooltip: string;
    private _color: string | ThemeColor;
    private _command: string;

    private _isVisible: boolean;
    private _timeoutHandle: NodeJS.Timer | undefined;

    _proxy: StatusBarMessageRegistryMain;

    constructor(_proxy: StatusBarMessageRegistryMain,
        alignment: StatusBarAlignment = StatusBarAlignment.Left,
        priority: number = 0) {
        this._proxy = _proxy;
        this._alignment = alignment;
        this._priority = priority;
    }

    public get alignment(): theia.StatusBarAlignment {
        return <theia.StatusBarAlignment>this._alignment;
    }

    public get priority(): number {
        return this._priority;
    }

    public get text(): string {
        return this._text;
    }

    public get tooltip(): string {
        return this._tooltip;
    }

    public get color(): string | ThemeColor {
        return this._color;
    }

    public get command(): string {
        return this._command;
    }

    public set text(text: string) {
        this._text = text;
        this.update();
    }

    public set tooltip(tooltip: string) {
        this._tooltip = tooltip;
        this.update();
    }

    public set color(color: string | ThemeColor) {
        this._color = color;
        this.update();
    }

    public set command(command: string) {
        this._command = command;
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
        if (this._messageId) {
            this._proxy.$dispose(this._messageId);
        }
        this._isVisible = false;
    }

    private update(): void {
        if (!this._isVisible) {
            return;
        }

        if (this._messageId) {
            this._proxy.$dispose(this._messageId);
        }

        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
        }

        // Defer the update so that multiple changes to setters don't cause a redraw each
        this._timeoutHandle = setTimeout(() => {
            this._timeoutHandle = undefined;

            // Set to status bar
            this._proxy.$setMessage(this.text,
                this.priority,
                this.alignment,
                this.getColor(),
                this.tooltip,
                this.command).then((id: string) => {
                    this._messageId = id;
                });
        }, 0);
    }

    private getColor(): string | undefined {
        if (typeof this.color !== 'string' && typeof this.color !== 'undefined') {
            const colorId = (<ThemeColor>this.color).id;
            return `var(${VS_COLORS[colorId] ? VS_COLORS[colorId] : colorId})`;
        }
        return this.color;
    }

    public dispose(): void {
        this.hide();
    }
}
