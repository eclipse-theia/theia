/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
// tslint:disable:no-any

import { join } from 'path';
import { inject, injectable } from 'inversify';
import Axios, { AxiosResponse } from 'axios';
import URI from '../../common/uri';
import {
    Command, CommandContribution, CommandRegistry,
    MenuModelRegistry, MenuContribution, ILogger
} from '../../common';
import {
    StorageService, KeybindingContribution, KeybindingRegistry,
    QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenGroupItem, QuickOpenGroupItemOptions
} from '../../browser';
import { CommonMenus } from '../../browser';
import { WindowService } from '../../browser/window/window-service';
import { timeout as delay } from '../../common/promise-util';
import { ElectronBackendLocation } from './electron-backend-location';
import { ElectronRemoteQuestionPath, ElectronRemoteAnswer } from '../../common/remote/electron-remote-protocol';

export type RemoteEntryGroup = 'Input' | 'Autocomplete' | 'History';
export type Response<T = any> = AxiosResponse<T>;
export interface RemoteEntryOptions {
    errorMessage?: string;
    questionPath?: string;
    expectedAnswer?: any;
}
export class RemoteEntry {

    protected _ok?: boolean;
    protected _response?: Response;
    protected _error?: Error;

    constructor(
        public url: string,
        protected options: RemoteEntryOptions = {},
        public group?: string,
    ) { }

    protected get errorMessage(): string | undefined {
        return this.options.errorMessage;
    }
    protected get questionPath(): string | undefined {
        return this.options.questionPath;
    }
    protected get expectedAnswer(): object | undefined {
        return this.options.expectedAnswer;
    }

    protected createError(response: Response): Error {
        return new Error(this.errorMessage || response.statusText);
    }

    protected compareAnswer(answer: any, expected: any): boolean {
        return Object.keys(answer)
            .filter(key => answer.hasOwnProperty(key))
            .every(key => answer[key] === expected[key])
            ;
    }

    protected coerce(response: Response): Response {
        if (/^2/.test(response.status.toString())) {
            if (this.expectedAnswer) {
                if (!(this._ok = this.compareAnswer(response.data, this.expectedAnswer))) {
                    throw this.createError(response);
                }
            }
            return response;
        }
        throw this.createError(response);
    }

    async poll(timeout?: number): Promise<Response> {
        if (this._error) {
            throw this._error;
        }
        if (this._response) {
            return this._response;
        }
        const url = this.questionPath ? join(this.url, this.questionPath) : this.url;
        try {
            return this.coerce(this._response = await Axios.get(url, { timeout, responseType: 'json' }));
        } catch (error) {
            if (error.response && /^4/.test(error.response.status.toString())) {
                error = this.createError(error.response);
            }
            throw this._error = error;
        }
    }

    get response(): RemoteEntry['_response'] {
        if (this._error) {
            throw this._error;
        }
        return this._response;
    }

    hasError(): boolean {
        return typeof this._error !== 'undefined';
    }

    hasResponse(): boolean {
        return typeof this.response !== 'undefined';
    }

    isOk(): boolean {
        return !!this._ok;
    }

    getStatusText(): string {
        try {
            const response = this.response;
            if (response) {
                return 'Online';
            }
        } catch (error) {
            return error.message;
        }
        return 'Unresolved';
    }

    clear(): void {
        this._response = undefined;
        this._error = undefined;
        this._ok = undefined;
    }
}

@injectable()
export class ElectronRemoteContribution implements QuickOpenModel, CommandContribution, MenuContribution, KeybindingContribution {

    @inject(StorageService) protected readonly localStorageService: StorageService;
    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(WindowService) protected readonly windowService: WindowService;
    @inject(ILogger) protected readonly logger: ILogger;

    protected historyEntries: Promise<RemoteEntry[]>;
    protected timeout: number = 500; // ms

    constructor(
        @inject(ElectronRemoteQuestionPath) protected readonly questionPath?: string,
        @inject(ElectronRemoteAnswer) protected readonly expectedAnswer?: object,
    ) { }

    protected remoteEntryOptions: RemoteEntryOptions = {
        errorMessage: 'Not a Theia Application',
        expectedAnswer: this.expectedAnswer,
        questionPath: this.questionPath,
    };

    protected get history(): Promise<string[]> {
        return this.localStorageService.getData<string[]>(ElectronRemoteHistory.KEY, [])
            .then(history => history.map(entry => decodeURI(entry)));
    }

    protected async remember(url: string): Promise<void> {
        const history = await this.localStorageService.getData<string[]>(ElectronRemoteHistory.KEY, []);
        const encoded = encodeURI(url);
        if (encoded) {
            const index = history.indexOf(encoded);
            if (index >= 0) {
                history.splice(index);
            }
            history.unshift(encoded);
            this.localStorageService.setData(ElectronRemoteHistory.KEY, history);
        }
    }

    protected async clearHistory(): Promise<void> {
        return this.localStorageService.setData(ElectronRemoteHistory.KEY, undefined);
    }

    protected async computeHistoryCache(): Promise<RemoteEntry[]> {
        return this.accumulateResponses(
            (await this.history).map(
                url => new RemoteEntry(url, this.remoteEntryOptions, 'History')
            ), this.timeout);
    }

    protected async accumulateResponses(input: RemoteEntry[], timeout: number): Promise<RemoteEntry[]> {
        const output: RemoteEntry[] = [];
        input.forEach(async entry => {
            await entry.poll(timeout).catch(e => void 0);
            output.push(entry);
        });
        await delay(timeout);
        return output.slice(0);
    }

    protected urlOpener = (url: string) => (mode: QuickOpenMode): boolean => {
        if (mode === QuickOpenMode.OPEN) {
            this.windowService.openNewWindow(url);
            this.remember(url);
        }
        return true;
    }

    protected convertEntryToQuickOpenItem(entry: RemoteEntry, override: QuickOpenGroupItemOptions = {}): QuickOpenItem {
        const opener = this.urlOpener(entry.url);
        return new QuickOpenGroupItem({
            label: entry.url,
            groupLabel: entry.group,
            description: entry.getStatusText(),
            run: mode => entry.isOk() ? opener(mode) : false,
            ...override,
        });
    }

    async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        const defaultSchemes = ['http', 'https'];
        const items: QuickOpenItem[] = [];
        const inputResponses = [];
        const inputEntries = [];

        // Add a way to open a local electron window
        if (ElectronBackendLocation.isRemote()) {
            items.push(new QuickOpenGroupItem({
                label: 'Localhost Application',
                groupLabel: 'Electron',
                description: 'Electron',
                run: this.urlOpener('localhost'),
            }));
        }

        if (lookFor) {
            let url = new URI(lookFor);

            // Autocompletion (http/https) if not using http(s) filescheme
            if (!/^https?$/.test(url.scheme)) {
                const reformated = new URI(`//${lookFor}`);
                for (const scheme of defaultSchemes) {
                    url = reformated.withScheme(scheme);
                    inputEntries.push(
                        new RemoteEntry(url.toString(), this.remoteEntryOptions, 'Autocomplete')
                    );
                }
            } else {
                inputEntries.push(
                    new RemoteEntry(url.toString(), this.remoteEntryOptions, 'Input')
                );
            }

            // Host polling
            inputResponses.push(...await this.accumulateResponses(inputEntries, this.timeout));
        }

        // Sorting the autocompletion and history based on the status of the responses
        const sortedEntries = [...inputResponses, ...await this.historyEntries]
            // make unique
            .filter((entry, index, array) => array.findIndex(e => e.url === entry.url) === index)
            // place OK responses first
            .sort((a, b) => {
                if (a.isOk() === b.isOk()) {
                    return 0;
                } else if (a.isOk()) {
                    return -1;
                } else {
                    return 1;
                }
            })
            // place a separator between OK and Error responses
            .map((entry, index, array) => {
                const previous = array[index - 1];
                const options: QuickOpenGroupItemOptions = {};
                if (previous && previous.isOk() && !entry.isOk()) {
                    options.showBorder = true;
                }
                return this.convertEntryToQuickOpenItem(entry, options);
            });

        items.push(...sortedEntries);
        acceptor(items);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ElectronRemoteCommands.CONNECT_TO_REMOTE, {
            execute: () => {
                this.historyEntries = this.computeHistoryCache();
                this.quickOpenService.open(this, {
                    placeholder: 'Type the URL to connect to...',
                    fuzzyMatchLabel: true,
                });
            }
        });

        registry.registerCommand(ElectronRemoteCommands.DISCONNECT_FROM_REMOTE, {
            isEnabled: () => ElectronBackendLocation.isRemote(),
            isVisible: () => ElectronBackendLocation.isRemote(),
            execute: () => {
                this.windowService.openNewWindow('localhost');
                close();
            },
        });
        registry.registerCommand(ElectronRemoteCommands.CLEAR_REMOTE_HISTORY, {
            execute: () => this.clearHistory()
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybindings({
            command: ElectronRemoteCommands.CONNECT_TO_REMOTE.id,
            keybinding: 'ctrl+alt+r'
        });
    }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(ElectronMenus.ELECTRON_REMOTE, {
            commandId: ElectronRemoteCommands.CONNECT_TO_REMOTE.id,
            order: 'z4',
        });
        // Do not load the disconnect button if we are not on a remote server
        if (ElectronBackendLocation.isRemote()) {
            registry.registerMenuAction(ElectronMenus.ELECTRON_REMOTE, {
                commandId: ElectronRemoteCommands.DISCONNECT_FROM_REMOTE.id,
                order: 'z5',
            });
        }
    }
}

export namespace ElectronRemoteCommands {
    export const CONNECT_TO_REMOTE: Command = {
        id: 'electron.remote.connect',
        label: 'Remote: Connect to a Server'
    };
    export const CLEAR_REMOTE_HISTORY: Command = {
        id: 'electron.remote.history.clear',
        label: 'Remote: Clear host history'
    };
    export const DISCONNECT_FROM_REMOTE: Command = {
        id: 'electron.remote.disconnect',
        label: 'Remote: Disconnect',
    };
}

export namespace ElectronMenus {
    export const ELECTRON_REMOTE = [...CommonMenus.FILE_OPEN, 'z_connect'];
}

export namespace ElectronRemoteHistory {
    export const KEY = 'theia.remote.history';
}
