// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { type RpcServer } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { Browser, launch, Page } from 'puppeteer-core';
import type { BrowserAutomation, BrowserAutomationClient, LaunchResult } from '../../common/browser-automation-protocol';

const MAX_DOM_LENGTH = 50000;

@injectable()
export class BrowserAutomationImpl implements RpcServer<BrowserAutomationClient>, BrowserAutomation {
    protected _browser?: Browser;
    protected _page?: Page;
    protected client?: BrowserAutomationClient;

    protected get browser(): Browser {
        if (!this._browser) {
            throw new Error('Browser is not launched');
        }
        return this._browser;
    }

    protected get page(): Page {
        if (!this._page) {
            throw new Error('Page is not created');
        }
        return this._page;
    }

    async isRunning(): Promise<boolean> {
        return this._browser !== undefined && this._browser.connected;
    }

    async launch(remoteDebuggingPort: number): Promise<LaunchResult | undefined> {
        if (this._browser) {
            await this.close();
        }

        const browser = await launch({
            headless: false,
            channel: 'chrome',
            args: [
                `--remote-debugging-port=${remoteDebuggingPort}`
            ],
        });
        this._browser = browser;
        // The initial page will be used per default
        this._page = (await browser.pages())[0];
        return {
            remoteDebuggingPort
        };
    }

    async close(): Promise<void> {
        await this._browser?.close();
        this._browser = undefined;
    }

    async queryDom(selector?: string): Promise<string> {
        const page = this.page;
        let content = '';

        if (selector) {
            const element = await page.$(selector);
            if (!element) {
                throw new Error(`Element with selector "${selector}" not found`);
            }
            content = await page.evaluate(el => el.outerHTML, element);
        } else {
            content = await page.content();
        }

        if (content.length > MAX_DOM_LENGTH) {
            return 'The queried DOM is too large. Please provide a more specific query.';
        }

        return content;
    }

    dispose(): void {
        this._browser?.close();
        this._browser = undefined;
    }

    setClient(client: BrowserAutomationClient | undefined): void {
        this.client = client;
    }

    getClient?(): BrowserAutomationClient | undefined {
        return this.client;
    }

}
