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

import { CancellationError, Listener, ListenerList, MaybePromise, MessageService, nls, ILogger } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, interfaces, postConstruct, named, optional } from '@theia/core/shared/inversify';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import URI from '@theia/core/lib/common/uri';
import { Mutex, MutexInterface } from 'async-mutex';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { TextEditorDocument } from '@theia/editor/lib/browser/editor';
import { TextEditorDocumentService } from '@theia/editor/lib/browser/text-editor-document-service';
import { JSONCEditor } from '@theia/core/lib/common/jsonc-editor';

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
    protected readonly onWillConcludeListeners = new ListenerList<(Status | false), Promise<void>>();
    /**
     * An event fired when the transaction is wrapping up.
     * Consumers can call `waitUntil` on the event to delay the resolution of the `result` Promise.
     */
    onWillConclude = this.onWillConcludeListeners.registration;

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
                const status: Status | boolean = (this.status.state === 'unresolved' || this.status.state === 'rejected') ? false : await this.status.promise;
                await Listener.awaitAll(status, this.onWillConcludeListeners);
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

interface PreferenceEdit {
    path: string[];
    value: unknown;
}

interface PreferenceFileState {
    /** The content as read from the file. */
    readonly original: string;
    /** The content with the edits of the transaction applied. */
    current: string;
    readonly encoding?: string;
    readonly etag?: string;
    readonly mtime?: number;
    /** Whether the file existed when it was read. */
    readonly exists: boolean;
}

@injectable()
export class PreferenceTransaction extends Transaction<[string, string[], unknown], boolean, boolean> {
    /**
     * How often the edits are reapplied when the file is modified by someone else while the transaction is running.
     */
    protected static readonly MAX_WRITE_ATTEMPTS = 3;

    protected file: PreferenceFileState | undefined;
    protected readonly edits: PreferenceEdit[] = [];
    @inject(PreferenceContext) protected readonly context: PreferenceContext;
    @inject(PreferenceTransactionPreludeProvider) protected readonly prelude?: PreferenceTransactionPreludeProvider;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(JSONCEditor) protected readonly jsoncEditor: JSONCEditor;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(TextEditorDocumentService) @optional() protected readonly documentService?: TextEditorDocumentService;
    @inject(ILogger) @named('preferences:PreferenceTransaction')
    protected readonly logger: ILogger;

    protected override async doInit(): Promise<void> {
        this.waitFor(this.prelude?.());
        await super.doInit();
    }

    protected async setUp(): Promise<boolean> {
        if (this.findDirtyDocument()) {
            const shouldContinue = await this.handleDirtyEditor();
            if (!shouldContinue) {
                this.dispose();
                return false;
            }
        }
        const file = await this.readFile();
        if (!this._open) {
            return false;
        }
        this.file = file;
        return true;
    }

    /**
     * @returns the document with unsaved changes to the preference file, if any.
     * Without a {@link TextEditorDocumentService}, only documents shown in an editor are found.
     */
    protected findDirtyDocument(): TextEditorDocument | undefined {
        const uri = this.context.getConfigUri();
        const document = this.documentService
            ? this.documentService.getDocument(uri)
            : this.editorManager.all.find(widget => widget.editor.uri.isEqual(uri))?.editor.document;
        return document?.dirty ? document : undefined;
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

        if (msg === open) {
            this.editorManager.open(this.context.getConfigUri());
        } else if (msg === saveAndRetry) {
            const document = this.findDirtyDocument();
            await document?.save();
            if (document?.dirty) {
                // Saving can fail without an error, e.g. if the file was changed on disk in the meantime.
                this.messageService.error(nls.localize('theia/preferences/saveFailed', 'Could not save {0}.', this.context.getConfigUri().path.base));
                return false;
            }
            return true;
        }
        return false;
    }

    protected async readFile(): Promise<PreferenceFileState> {
        try {
            const { value, encoding, etag, mtime } = await this.fileService.read(this.context.getConfigUri());
            return { original: value, current: this.applyEdits(value), encoding, etag, mtime, exists: true };
        } catch (e) {
            if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
                return { original: '', current: this.applyEdits(''), exists: false };
            }
            throw e;
        }
    }

    protected async act(key: string, path: string[], value: unknown): Promise<boolean> {
        try {
            if (this.file) {
                this.file.current = this.jsoncEditor.setValue(this.file.current, path, value as JSONValue);
                this.edits.push({ path, value });
                return this.result;
            }
            return false;
        } catch (e) {
            const message = `Failed to update the value of '${key}' in '${this.context.getConfigUri()}'.`;
            this.messageService.error(`${message} Please check if it is corrupted.`);
            this.logger.error(`${message}`, e);
            return false;
        }
    }

    /**
     * @returns the content with the edits of the transaction applied.
     */
    protected applyEdits(content: string): string {
        for (const edit of this.edits) {
            content = this.jsoncEditor.setValue(content, edit.path, edit.value as JSONValue);
        }
        return content;
    }

    protected async tearDown(): Promise<boolean> {
        if (!this.file || this.status.state !== 'resolved' || !await this.status.promise) {
            return false;
        }
        try {
            return await this.writeFile(this.file);
        } catch (e) {
            const message = `Failed to write preferences to '${this.context.getConfigUri()}'.`;
            this.messageService.error(nls.localize('theia/preferences/writeFailed', 'Failed to write the settings to {0}.', this.context.getConfigUri().path.base));
            this.logger.error(message, e);
            return false;
        }
    }

    /**
     * Writes the edits of the transaction, reapplying them if the file was modified by someone else in the meantime.
     * @returns whether the edits were written, `false` if the user did not save unsaved changes to the file.
     */
    protected async writeFile(file: PreferenceFileState): Promise<boolean> {
        for (let attempt = 1; ; attempt++) {
            if (file.current === file.original) {
                return true;
            }
            // The user may have edited the file since the transaction was set up.
            if (this.findDirtyDocument()) {
                if (!await this.handleDirtyEditor()) {
                    return false;
                }
                file = await this.readFile();
                continue;
            }
            try {
                const uri = this.context.getConfigUri();
                const { encoding, etag, mtime } = file;
                if (file.exists) {
                    await this.fileService.write(uri, file.current, { encoding, etag, mtime });
                } else {
                    // Fails with `FILE_MODIFIED_SINCE` if someone else created the file in the meantime.
                    await this.fileService.create(uri, file.current, { overwrite: false });
                }
                return true;
            } catch (e) {
                if (attempt < PreferenceTransaction.MAX_WRITE_ATTEMPTS && e instanceof FileOperationError
                    && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
                    file = await this.readFile();
                } else {
                    throw e;
                }
            }
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

