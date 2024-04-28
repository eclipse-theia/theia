// *****************************************************************************
// Copyright (C) 2024 1C-Soft LLC and others.
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

import { Position, Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { DisposableCollection } from '@theia/core';
import { MonacoEditor } from './monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { PeekViewWidget, IPeekViewOptions, IPeekViewStyles } from '@theia/monaco-editor-core/esm/vs/editor/contrib/peekView/browser/peekView';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { ActionBar } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/actionbar/actionbar';
import { Action } from '@theia/monaco-editor-core/esm/vs/base/common/actions';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { Color } from '@theia/monaco-editor-core/esm/vs/base/common/color';

export { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground }
    from '@theia/monaco-editor-core/esm/vs/editor/contrib/peekView/browser/peekView';

export namespace MonacoEditorPeekViewWidget {
    export interface Styles {
        frameColor?: string;
        arrowColor?: string;
        headerBackgroundColor?: string;
        primaryHeadingColor?: string;
        secondaryHeadingColor?: string;
    }
    export interface Options {
        showFrame?: boolean;
        showArrow?: boolean;
        frameWidth?: number;
        className?: string;
        isAccessible?: boolean;
        isResizeable?: boolean;
        keepEditorSelection?: boolean;
        allowUnlimitedHeight?: boolean;
        ordinal?: number;
        showInHiddenAreas?: boolean;
        supportOnTitleClick?: boolean;
    }
    export interface Action {
        readonly id: string;
        label: string;
        tooltip: string;
        class: string | undefined;
        enabled: boolean;
        checked?: boolean;
        run(...args: unknown[]): unknown;
    }
    export interface ActionOptions {
        icon?: boolean;
        label?: boolean;
        keybinding?: string;
        index?: number;
    }
}

export class MonacoEditorPeekViewWidget {

    protected readonly toDispose = new DisposableCollection();

    readonly onDidClose = this.toDispose.onDispose;

    private readonly themeService = StandaloneServices.get(IThemeService);

    private readonly delegate;

    constructor(
        readonly editor: MonacoEditor,
        options: MonacoEditorPeekViewWidget.Options = {},
        protected styles: MonacoEditorPeekViewWidget.Styles = {}
    ) {
        const that = this;
        this.toDispose.push(this.delegate = new class extends PeekViewWidget {

            get actionBar(): ActionBar | undefined {
                return this._actionbarWidget;
            }

            fillHead(container: HTMLElement, noCloseAction?: boolean): void {
                super._fillHead(container, noCloseAction);
            }

            protected override _fillHead(container: HTMLElement, noCloseAction?: boolean): void {
                that.fillHead(container, noCloseAction);
            }

            fillBody(container: HTMLElement): void {
                // super._fillBody is an abstract method
            }

            protected override _fillBody(container: HTMLElement): void {
                that.fillBody(container);
            };

            doLayoutHead(heightInPixel: number, widthInPixel: number): void {
                super._doLayoutHead(heightInPixel, widthInPixel);
            }

            protected override _doLayoutHead(heightInPixel: number, widthInPixel: number): void {
                that.doLayoutHead(heightInPixel, widthInPixel);
            }

            doLayoutBody(heightInPixel: number, widthInPixel: number): void {
                super._doLayoutBody(heightInPixel, widthInPixel);
            }

            protected override _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
                that.doLayoutBody(heightInPixel, widthInPixel);
            }

            onWidth(widthInPixel: number): void {
                super._onWidth(widthInPixel);
            }

            protected override _onWidth(widthInPixel: number): void {
                that.onWidth(widthInPixel);
            }

            doRevealRange(range: monaco.Range, isLastLine: boolean): void {
                super.revealRange(range, isLastLine);
            }

            protected override revealRange(range: monaco.Range, isLastLine: boolean): void {
                that.doRevealRange(that.editor['m2p'].asRange(range), isLastLine);
            }
        }(
            editor.getControl() as unknown as ICodeEditor,
            Object.assign(<IPeekViewOptions>{}, options, this.convertStyles(styles)),
            StandaloneServices.get(IInstantiationService)
        ));
        this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.style(this.styles)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    create(): void {
        this.delegate.create();
    }

    setTitle(primaryHeading: string, secondaryHeading?: string): void {
        this.delegate.setTitle(primaryHeading, secondaryHeading);
    }

    style(styles: MonacoEditorPeekViewWidget.Styles): void {
        this.delegate.style(this.convertStyles(this.styles = styles));
    }

    show(rangeOrPos: Range | Position, heightInLines: number): void {
        this.delegate.show(this.convertRangeOrPosition(rangeOrPos), heightInLines);
    }

    hide(): void {
        this.delegate.hide();
    }

    clearActions(): void {
        this.delegate.actionBar?.clear();
    }

    addAction(id: string, label: string, cssClass: string | undefined, enabled: boolean, actionCallback: (arg: unknown) => unknown,
        options?: MonacoEditorPeekViewWidget.ActionOptions): MonacoEditorPeekViewWidget.Action {
        options = cssClass ? { icon: true, label: false, ...options } : { icon: false, label: true, ...options };
        const { actionBar } = this.delegate;
        if (!actionBar) {
            throw new Error('Action bar has not been created.');
        }
        const action = new Action(id, label, cssClass, enabled, actionCallback);
        actionBar.push(action, options);
        return action;
    }

    protected fillHead(container: HTMLElement, noCloseAction?: boolean): void {
        this.delegate.fillHead(container, noCloseAction);
    }

    protected fillBody(container: HTMLElement): void {
        this.delegate.fillBody(container);
    }

    protected doLayoutHead(heightInPixel: number, widthInPixel: number): void {
        this.delegate.doLayoutHead(heightInPixel, widthInPixel);
    }

    protected doLayoutBody(heightInPixel: number, widthInPixel: number): void {
        this.delegate.doLayoutBody(heightInPixel, widthInPixel);
    }

    protected onWidth(widthInPixel: number): void {
        this.delegate.onWidth(widthInPixel);
    }

    protected doRevealRange(range: Range, isLastLine: boolean): void {
        this.delegate.doRevealRange(this.editor['p2m'].asRange(range), isLastLine);
    }

    private convertStyles(styles: MonacoEditorPeekViewWidget.Styles): IPeekViewStyles {
        return {
            frameColor: this.convertColor(styles.frameColor),
            arrowColor: this.convertColor(styles.arrowColor),
            headerBackgroundColor: this.convertColor(styles.headerBackgroundColor),
            primaryHeadingColor: this.convertColor(styles.primaryHeadingColor),
            secondaryHeadingColor: this.convertColor(styles.secondaryHeadingColor),
        };
    }

    private convertColor(color?: string): Color | undefined {
        if (color === undefined) {
            return undefined;
        }
        return this.themeService.getColorTheme().getColor(color) || Color.fromHex(color);
    }

    private convertRangeOrPosition(arg: Range | Position): monaco.Range | monaco.Position {
        const p2m = this.editor['p2m'];
        return Range.is(arg) ? p2m.asRange(arg) : p2m.asPosition(arg);
    }
}
