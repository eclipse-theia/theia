/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as theia from '@theia/plugin';
import {ThemeColor, StatusBarAlignment} from '../types-impl';
import {StatusBarMessageRegistryMain} from '../../api/plugin-api';
import {VS_COLORS} from './vscolor-const';

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
        if (typeof this.color !== 'string') {
            const colorId = (<ThemeColor>this.color).id;
            return `var(${VS_COLORS[colorId] ? VS_COLORS[colorId] : colorId})`;
        }
        return this.color;
    }

    public dispose(): void {
        this.hide();
    }
}
