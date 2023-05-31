// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { CancellationError, Emitter, Event, MaybePromise, MessageService, nls, WaitUntilEvent } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import URI from '@theia/core/lib/common/uri';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { Mutex, MutexInterface } from 'async-mutex';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoJSONCEditor } from './monaco-jsonc-editor';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { IReference } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';

export interface OnWillConcludeEvent<T> extends WaitUntilEvent {
    status: T | false;
}

@injectable()
/**
 * Represents a batch of interactions with an underlying resource.
 */
export abstract class Transaction<Arguments extends unknown[], Result = unknown, Status = unknown> {
    protected _open = true;
    /**
     * Whether the transaction is still accepting new interactions.
     * Enqueueing an action when the Transaction is no longer open will throw an error.
     */
    get open(): boolean {
        return this._open;
    }
    protected _result = new Deferred<Result | false>();
    /**
     * The status of the transaction when complete.
     */
    get result(): Promise<Result | false> {
        return this._result.promise;
    }
    /**
     * The transaction will self-dispose when the queue is empty, once at least one action has been processed.
     */
    protected readonly queue = new Mutex(new CancellationError());
    protected readonly onWillConcludeEmitter = new Emitter<OnWillConcludeEvent<Status>>();
    /**
     * An event fired when the transaction is wrapping up.
     * Consumers can call `waitUntil` on the event to delay the resolution of the `result` Promise.
     */
    get onWillConclude(): Event<OnWillConcludeEvent<Status>> {
        return this.onWillConcludeEmitter.event;
    }

    protected status = new Deferred<Status>();
    /**
     * Whether any actions have been added to the transaction.
     * The Transaction will not self-dispose until at least one action has been performed.
     */
    protected inUse = false;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
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

    async waitFor(delay?: Promise<unknown>, disposeIfRejected?: boolean): Promise<void> {
        try {
            await this.queue.runExclusive(() => delay);
        } catch {
            if (disposeIfRejected) {
                this.dispose();
            }
        }
    }

    /**
     * @returns a promise reflecting the result of performing an action. Typically the promise will not resolve until the whole transaction is complete.
     */
    async enqueueAction(...args: Arguments): Promise<Result | false> {
        if (this._open) {
            let release: MutexInterface.Releaser | undefined;
            try {
                release = await this.queue.acquire();
                if (!this.inUse) {
                    this.inUse = true;
                    this.disposeWhenDone();
                }
                return this.act(...args);
            } catch (e) {
                if (e instanceof CancellationError) {
                    throw e;
                }
                return false;
            } finally {
                release?.();
            }
        } else {
            throw new Error('Transaction used after disposal.');
        }
    }

    protected disposeWhenDone(): void {
        // Due to properties of the micro task system, it's possible for something to have been enqueued between
        // the resolution of the waitForUnlock() promise and the the time this code runs, so we have to check.
        this.queue.waitForUnlock().then(() => {
            if (!this.queue.isLocked()) {
                this.dispose();
            } else {
                this.disposeWhenDone();
            }
        });
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

    /**
     * Runs any code necessary to initialize the batch of interactions. No interaction will be run until the setup is complete.
     *
     * @returns a representation of the success of setup specific to a given transaction implementation.
     */
    protected abstract setUp(): MaybePromise<Status>;
    /**
     * Performs a single interaction
     *
     * @returns the result of that interaction, specific to a given transaction type.
     */
    protected abstract act(...args: Arguments): MaybePromise<Result>;
    /**
     * Runs any code necessary to complete a transaction and release any resources it holds.
     *
     * @returns implementation-specific information about the success of the transaction. Will be used as the final status of the transaction.
     */
    protected abstract tearDown(): MaybePromise<Result>;
}

export interface PreferenceContext {
    getConfigUri(): URI;
    getScope(): PreferenceScope;
}
export const PreferenceContext = Symbol('PreferenceContext');
export const PreferenceTransactionPreludeProvider = Symbol('PreferenceTransactionPreludeProvider');
export type PreferenceTransactionPreludeProvider = () => Promise<unknown>;

@injectable()
export class PreferenceTransaction extends Transaction<[string, string[], unknown], boolean> {
    reference: IReference<MonacoEditorModel> | undefined;
    @inject(PreferenceContext) protected readonly context: PreferenceContext;
    @inject(PreferenceTransactionPreludeProvider) protected readonly prelude?: PreferenceTransactionPreludeProvider;
    @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService;
    @inject(MonacoJSONCEditor) protected readonly jsoncEditor: MonacoJSONCEditor;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    protected override async doInit(): Promise<void> {
        this.waitFor(this.prelude?.());
        await super.doInit();
    }

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
            // eslint-disable-next-line @theia/localization-check
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
        try {
            const model = this.reference?.object;
            if (model) {
                if (this.status.state === 'resolved' && await this.status.promise) {
                    await model.save();
                    return true;
                }
            }
            return false;
        } finally {
            this.reference?.dispose();
            this.reference = undefined;
        }
    }
}

export interface PreferenceTransactionFactory {
    (context: PreferenceContext, waitFor?: Promise<unknown>): PreferenceTransaction;
}
export const PreferenceTransactionFactory = Symbol('PreferenceTransactionFactory');

export const preferenceTransactionFactoryCreator: interfaces.FactoryCreator<PreferenceTransaction> = ({ container }) =>
    (context: PreferenceContext, waitFor?: Promise<unknown>) => {
        const child = container.createChild();
        child.bind(PreferenceContext).toConstantValue(context);
        child.bind(PreferenceTransactionPreludeProvider).toConstantValue(() => waitFor);
        return child.get(PreferenceTransaction);
    };
