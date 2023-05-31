// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { ElementHandle } from '@playwright/test';
import { TheiaOutputView } from './theia-output-view';
import { TheiaPageObject } from './theia-page-object';
import { isElementVisible } from './util';
import { TheiaMonacoEditor } from './theia-monaco-editor';

export interface TheiaOutputViewChannelData {
    viewSelector: string;
    dataUri: string;
    channelName: string;
}

export class TheiaOutputViewChannel extends TheiaPageObject {

    protected monacoEditor: TheiaMonacoEditor;

    constructor(protected readonly data: TheiaOutputViewChannelData, protected readonly outputView: TheiaOutputView) {
        super(outputView.app);
        this.monacoEditor = new TheiaMonacoEditor(this.viewSelector, outputView.app);
    }

    protected get viewSelector(): string {
        return this.data.viewSelector;
    }

    protected get dataUri(): string | undefined {
        return this.data.dataUri;
    }

    protected get channelName(): string | undefined {
        return this.data.channelName;
    }

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(this.viewSelector, { state: 'visible' });
    }

    async isDisplayed(): Promise<boolean> {
        return isElementVisible(this.viewElement());
    }

    protected viewElement(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        return this.page.$(this.viewSelector);
    }

    async numberOfLines(): Promise<number | undefined> {
        await this.waitForVisible();
        return this.monacoEditor.numberOfLines();
    }

    async maxSeverityOfLineByLineNumber(lineNumber: number): Promise<'error' | 'warning' | 'info'> {
        await this.waitForVisible();
        const lineElement = await this.monacoEditor.lineByLineNumber(lineNumber);
        const contents = await lineElement?.$$('span > span.mtk1');
        if (!contents || contents.length < 1) {
            throw new Error(`Could not find contents of line number ${lineNumber}!`);
        }
        const severityClassNames = await Promise.all(contents.map(
            async content => (await content.getAttribute('class'))?.split(' ')[1]));

        if (severityClassNames.includes('theia-output-error')) {
            return 'error';
        } else if (severityClassNames.includes('theia-output-warning')) {
            return 'warning';
        }
        return 'info';
    }

    async textContentOfLineByLineNumber(lineNumber: number): Promise<string | undefined> {
        return this.monacoEditor.textContentOfLineByLineNumber(lineNumber);
    }
}
