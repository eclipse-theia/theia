/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';
import '../../src/browser/find-text.css';
import { Terminal } from 'xterm';
import * as ReactDOM from 'react-dom';
import { findNext, findPrevious } from 'xterm/lib/addons/search/search';

export const FIND_TERMINAL_TEXT_WIDGET_FACTORY_ID = 'find-terminal-text-widget';

export const FindTerminalTextWidgetFactory = Symbol('FindTerminalWidgetFactory');
export type FindTerminalTextWidgetFactory = (terminal: Terminal) => FindTextTerminalWidget;

export const FIND_TERMINAL_TEXT_WIDGET_ID = 'find-terminal-text-widget';

@injectable()
export class FindTextTerminalWidget extends ReactWidget {

    private searchInpt: HTMLInputElement | null;

    @inject(Terminal)
    protected terminal: Terminal;

    focus(): void {
        if (this.searchInpt) {
            this.searchInpt.focus();
        }
    }

    update(): void {
        ReactDOM.render(<React.Fragment>{this.render()}</React.Fragment>, this.node, () => console.log('clean up'));
    }

    render(): React.ReactNode {
        this.node.classList.add('find-terminal-widget-text-parent');
        return <div className='find-terminal-widget-text'>
                <input className='find-terminal-widget-text input'
                       type='text'
                       placeholder='Find'
                       ref={ip => this.searchInpt = ip}
                       onKeyUp = {() => this.search()}
                       ></input>
                <button className='find-terminal-widget-text button' onClick={() => this.findPrevious()}>&#171;</button>
                <button className='find-terminal-widget-text button' onClick={() => this.findNext()}>&#187;</button>
                <button className='find-terminal-widget-text button' onClick={() => this.hide()}>&#215;</button>
            </div>;
    }

    search() {
        this.findNext(true);
    }

    protected findNext(incremental?: boolean): void {
        if (this.searchInpt) {
            const text = this.searchInpt.value;
            findNext(this.terminal, text, {caseSensitive: false, regex: false, wholeWord: false, incremental});
        }
    }

    protected findPrevious(): void {
        if (this.searchInpt) {
            const text = this.searchInpt.value;
            findPrevious(this.terminal, text, {caseSensitive: false, regex: false, wholeWord: false, incremental: false});
        }
    }

    hide(): void {
        super.hide();
        this.terminal.focus();
    }
}
