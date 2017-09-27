/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { FileSystem } from '@theia/filesystem/lib/common';
import { Disposable, DisposableCollection, ILogger, } from '@theia/core/lib/common';
import { FileSystemWatcherServer, DidFilesChangedParams, FileChange } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { KeymapsServer, KeybindingClient, KeymapChangeEvent, RawKeybinding } from '../common/keymaps-protocol';
import * as jsoncparser from "jsonc-parser";
import URI from "@theia/core/lib/common/uri";
import { ParseError } from "jsonc-parser";

export const KeybindingURI = Symbol("KeybindingURI");

@injectable()
export class CustomKeymapsServer implements KeymapsServer {

    protected client: KeybindingClient | undefined;
    protected keybindings: { [key: string]: any } | undefined;
    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcherServer) protected readonly watcherServer: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(KeybindingURI) protected readonly fileUri: URI
    ) {

        this.toDispose.push(watcherServer);

        watcherServer.setClient({
            onDidFilesChanged: p => this.onDidFilesChanged(p)
        });

        watcherServer.watchFileChanges(this.fileUri.toString()).then(id => {
            this.toDispose.push(Disposable.create(() =>
                watcherServer.unwatchFileChanges(id))
            );
        });

        this.reconcileKeybindings();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected onDidFilesChanged(params: DidFilesChangedParams): void {
        if (this.areKeybindingsAffected(params.changes)) {
            this.reconcileKeybindings();
        }
    }

    /**
     * Checks to see if the keybindings file was modified
     * @param changes Changes
     */
    protected areKeybindingsAffected(changes: FileChange[]): boolean {
        return changes.some(c => c.uri === this.fileUri.toString());
    }

    protected reconcileKeybindings(): void {
        this.readKeybindings().then(keybindings => {
            if (keybindings) {
                this.handleKeybindingChanges(keybindings)
            }
        }
        );
    }

    protected readKeybindings(): Promise<JSON | undefined> {
        return this.fileSystem.exists(this.fileUri.toString()).then(exists => {
            if (!exists) {
                return undefined;
            }
            return this.fileSystem.resolveContent(this.fileUri.toString()).then(({ stat, content }) => {
                const strippedContent = jsoncparser.stripComments(content);
                const errors: ParseError[] = [];
                const keybindings = jsoncparser.parse(strippedContent, errors);
                if (errors.length) {
                    for (const error of errors) {
                        this.logger.error("JSON parsing error", error);
                    }
                }

                return Promise.resolve(keybindings);
            });
        }).catch(reason => {
            if (reason) {
                this.logger.error(`Failed to read keybindings ${this.fileUri}:`, reason);
            }
            return Promise.resolve(undefined);
        });
    }

    protected handleKeybindingChanges(keybindings: any | undefined): void {

        const rawBindings: RawKeybinding[] = [];

        for (const keybinding of keybindings) {
            rawBindings.push({
                command: keybinding.command,
                keybinding: keybinding.keybinding,
                context: keybinding.context,
                args: keybinding.args
            });
        }

        this.fireEvent({ changes: rawBindings });
        this.keybindings = rawBindings;
    }

    protected fireEvent(event: KeymapChangeEvent) {
        this.logger.debug(log =>
            log('onDidChangeKeymap:', event)
        );
        if (this.client) {
            this.client.onDidChangeKeymap(event);
        }
    }

    setClient(client: KeybindingClient | undefined) {
        this.client = client;
    }

    getUri(): Promise<string> {
        return Promise.resolve(this.fileUri.toString());
    }

}
