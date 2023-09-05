// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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
import { RendererType, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import { BaseWidget, Message, Widget, codicon, isFirefox } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core';
import { DEFAULT_TERMINAL_RENDERER_TYPE, TerminalPreferences, TerminalRendererType, isTerminalRendererType } from '@theia/terminal/lib/browser/terminal-preferences';
import { TerminalThemeService } from '@theia/terminal/lib/browser/terminal-theme-service';
import { TestOutputSource, TestOutputUIModel } from './test-output-ui-model';
import debounce = require('p-debounce');

@injectable()
export class TestOutputWidget extends BaseWidget {
    @inject(TerminalPreferences) protected readonly preferences: TerminalPreferences;
    @inject(TerminalThemeService) protected readonly themeService: TerminalThemeService;
    @inject(TestOutputUIModel) protected readonly uiModel: TestOutputUIModel;

    static ID = 'test-output-view';

    protected term: Terminal;
    protected disposeOnSetInput = new DisposableCollection();
    protected fitAddon: FitAddon;

    constructor() {
        super();

        this.id = TestOutputWidget.ID;
        this.title.label = 'Test Output';
        this.title.caption = 'Test Output';
        this.title.iconClass = codicon('symbol-keyword');
        this.title.closable = true;
    }

    @postConstruct()
    init(): void {
        this.term = new Terminal({
            disableStdin: true,
            cursorStyle: 'bar',
            fontFamily: this.preferences['terminal.integrated.fontFamily'],
            fontSize: this.preferences['terminal.integrated.fontSize'],
            fontWeight: this.preferences['terminal.integrated.fontWeight'],
            fontWeightBold: this.preferences['terminal.integrated.fontWeightBold'],
            drawBoldTextInBrightColors: this.preferences['terminal.integrated.drawBoldTextInBrightColors'],
            letterSpacing: this.preferences['terminal.integrated.letterSpacing'],
            lineHeight: this.preferences['terminal.integrated.lineHeight'],
            scrollback: this.preferences['terminal.integrated.scrollback'],
            fastScrollSensitivity: this.preferences['terminal.integrated.fastScrollSensitivity'],
            rendererType: this.getTerminalRendererType(this.preferences['terminal.integrated.rendererType']),
            theme: this.themeService.theme
        });

        this.fitAddon = new FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.setInput(this.uiModel.selectedOutputSource);
        this.uiModel.onDidChangeSelectedOutputSource(source => this.setInput(source));

        this.toDispose.push(Disposable.create(() =>
            this.term.dispose()
        ));
    }

    setInput(selectedOutputSource: TestOutputSource | undefined): void {
        this.disposeOnSetInput.dispose();
        this.disposeOnSetInput = new DisposableCollection();
        this.term.clear();
        if (selectedOutputSource) {
            selectedOutputSource.output.forEach(item => this.term.writeln(item.output));
            this.disposeOnSetInput.push(selectedOutputSource.onDidAddTestOutput(items => {
                items.forEach(item => this.term.writeln(item.output));
            }));
            this.term.scrollToBottom();
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.term.open(this.node);

        if (isFirefox) {
            // monkey patching intersection observer handling for secondary window support
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const renderService: any = (this.term as any)._core._renderService;
            const originalFunc: (entry: IntersectionObserverEntry) => void = renderService._onIntersectionChange.bind(renderService);
            const replacement = function (entry: IntersectionObserverEntry): void {
                if (entry.target.ownerDocument !== document) {
                    // in Firefox, the intersection observer always reports the widget as non-intersecting if the dom element
                    // is in a different document from when the IntersectionObserver started observing. Since we know
                    // that the widget is always "visible" when in a secondary window, so we mark the entry as "intersecting"
                    const patchedEvent: IntersectionObserverEntry = {
                        ...entry,
                        isIntersecting: true,
                    };
                    originalFunc(patchedEvent);
                } else {
                    originalFunc(entry);
                }
            };

            renderService._onIntersectionChange = replacement;
        }

        if (isFirefox) {
            // The software scrollbars don't work with xterm.js, so we disable the scrollbar if we are on firefox.
            if (this.term.element) {
                (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
            }
        }
    }

    private getTerminalRendererType(terminalRendererType?: string | TerminalRendererType): RendererType {
        if (terminalRendererType && isTerminalRendererType(terminalRendererType)) {
            return terminalRendererType;
        }
        return DEFAULT_TERMINAL_RENDERER_TYPE;
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.resizeTerminal();
    }

    protected resizeTerminal = debounce(() => this.doResizeTerminal(), 50);

    protected doResizeTerminal(): void {
        if (this.isDisposed) {
            return;
        }
        const geo = this.fitAddon.proposeDimensions();
        const cols = geo.cols;
        const rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(cols, rows);
    }
}
