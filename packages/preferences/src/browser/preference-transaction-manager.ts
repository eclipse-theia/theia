/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { CancellationError, Emitter, Event, MaybePromise, MessageService, nls, WaitUntilEvent } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import URI from '@theia/core/lib/common/uri';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { Mutex, MutexInterface } from 'async-mutex';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoJSONCEditor } from './monaco-jsonc-editor';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';

export interface OnWillConcludeEvent<T> extends WaitUntilEvent {
    status: T | false;
}

@injectable()
export abstract class Transaction<Arguments extends unknown[], Result = unknown, Status = unknown> {
    protected _open = true;
    get open(): boolean {
        return this._open;
    }
    protected _result = new Deferred<Result | false>();
    get result(): Promise<Result | false> {
        return this._result.promise;
    }
    protected readonly queue = new Mutex(new CancellationError);
    protected readonly onWillConcludeEmitter = new Emitter<OnWillConcludeEvent<Status>>();
    get onWillConclude(): Event<OnWillConcludeEvent<Status>> {
        return this.onWillConcludeEmitter.event;
    }

    protected status = new Deferred<Status>();
    protected inUse = false;

    @postConstruct()
    protected async init(): Promise<void> {
        const release = await this.queue.acquire();
        try {
            const status = await this.setUp();
            this.status.resolve(status);
        } catch {
            this.dispose();
        } finally {
            release();
        }
    }

    async enqueueAction(...args: Arguments): Promise<Result | false> {
        if (this._open) {
            let release: MutexInterface.Releaser | undefined;
            try {
                release = await this.queue.acquire();
                if (!this.inUse) {
                    this.inUse = true;
                    this.queue.waitForUnlock().then(() => this.dispose());
                }
                return this.act(...args);
            } catch (e) {
                if (e instanceof CancellationError) {
                    throw e;
                }
                return false;
            } finally {
                if (release) {
                    release();
                }
            }
        } else {
            throw new Error('Transaction used after disposal.');
        }
    }

    protected async conclude(): Promise<void> {
        if (this._open) {
            try {
                this._open = false;
                this.queue.cancel();
                const result = await this.tearDown();
                const status = this.status.state === 'unresolved' || this.status.state === 'rejected' ? false : await this.status.promise;
                await WaitUntilEvent.fire(this.onWillConcludeEmitter, { status });
                this.onWillConcludeEmitter.dispose();
                this._result.resolve(result);
            } catch {
                this._result.resolve(false);
            }
        }
    }

    dispose(): void {
        this.conclude();
    }

    protected abstract setUp(): MaybePromise<Status>;
    protected abstract act(...args: Arguments): MaybePromise<Result>;
    protected abstract tearDown(): MaybePromise<Result>;
}

export interface PreferenceContext {
    getConfigUri(): URI;
    getScope(): PreferenceScope;
}
export const PreferenceContext = Symbol('PreferenceContext');

@injectable()
export class PreferenceTransaction extends Transaction<[string, string[], unknown], boolean, boolean> {
    reference: monaco.editor.IReference<MonacoEditorModel> | undefined;
    @inject(PreferenceContext) protected readonly context: PreferenceContext;
    @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService;
    @inject(MonacoJSONCEditor) protected readonly jsoncEditor: MonacoJSONCEditor;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    protected async setUp(): Promise<boolean> {
        const reference = await this.textModelService.createModelReference(this.context.getConfigUri()!);
        if (this._open) {
            this.reference = reference;
        } else {
            reference.dispose();
            return false;
        }
        if (reference.object.dirty) {
            const shouldContinue = await this.handleDirtyEditor();
            if (!shouldContinue) {
                this.dispose();
                return false;
            }
        }
        return true;
    }

    /**
     * @returns whether the setting operation in progress, and any others started in the meantime, should continue.
     */
    protected async handleDirtyEditor(): Promise<boolean> {
        const saveAndRetry = nls.localizeByDefault('Save and Retry');
        const open = nls.localizeByDefault('Open File');
        const msg = await this.messageService.error(
            nls.localizeByDefault('Unable to write into {0} settings because the file has unsaved changes. Please save the {0} settings file first and then try again.',
                nls.localizeByDefault(PreferenceScope[this.context.getScope()].toLocaleLowerCase())
            ),
            saveAndRetry, open);

        if (this.reference?.object) {
            if (msg === open) {
                this.editorManager.open(new URI(this.reference.object.uri));
            } else if (msg === saveAndRetry) {
                await this.reference.object.save();
                return true;
            }
        }
        return false;
    }

    protected async act(key: string, path: string[], value: unknown): Promise<boolean> {
        const model = this.reference?.object;
        try {
            if (model) {
                await this.jsoncEditor.setValue(model, path, value);
                return this.result;
            }
            return false;
        } catch (e) {
            const message = `Failed to update the value of '${key}' in '${this.context.getConfigUri()}'.`;
            this.messageService.error(`${message} Please check if it is corrupted.`);
            console.error(`${message}`, e);
            return false;
        }
    }

    protected async tearDown(): Promise<boolean> {
        const model = this.reference?.object;
        if (model) {
            if (this.status.state === 'resolved' && await this.status.promise) {
                await model.save();
                return true;
            }
            this.reference?.dispose();
            this.reference = undefined;
        }
        return false;
    }
}

export interface PreferenceTransactionFactory {
    (context: PreferenceContext): PreferenceTransaction;
}
export const PreferenceTransactionFactory = Symbol('PreferenceTransactionFactory');
