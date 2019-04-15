/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from './quick-open-model';
import { QuickOpenService, QuickOpenOptions } from './quick-open-service';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { ILogger } from '../../common/logger';
import { MaybePromise } from '../../common/types';
import { QuickOpenActionProvider } from './quick-open-action-provider';

export const QuickOpenContribution = Symbol('QuickOpenContribution');
/**
 * The quick open contribution should be implemented to register custom quick open handler.
 */
export interface QuickOpenContribution {
    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void;
}

/**
 * A handler allows to call it's quick open model when
 * the handler's prefix is typed in the quick open widget.
 */
export interface QuickOpenHandler {

    /**
     * Prefix to trigger this handler's model.
     */
    readonly prefix: string;

    /**
     * A human-readable description of this handler.
     */
    readonly description: string;

    /**
     * Called immediately when the user's input in
     * the quick open widget matches this handler's prefix.
     * Allows to initialize the model with some initial data.
     */
    init?(): MaybePromise<void>;

    /**
     * A model that should be used by the quick open widget when this handler's prefix is used.
     */
    getModel(): QuickOpenModel;

    /**
     * Returns the options which should be used for the quick open widget.
     * Note, that the `prefix` and `skipPrefix` options are ignored and will be overridden.
     * The `placeholder` option makes sense for a default handler only since it's used without a prefix in quick open widget.
     */
    getOptions(): QuickOpenOptions;
}

@injectable()
export class QuickOpenHandlerRegistry implements Disposable {

    protected readonly handlers: Map<string, QuickOpenHandler> = new Map();
    protected readonly toDispose = new DisposableCollection();
    protected defaultHandler: QuickOpenHandler | undefined;

    @inject(ILogger)
    protected readonly logger: ILogger;

    /**
     * Register the given handler.
     * Do nothing if a handler is already registered.
     * @param handler the handler to register
     * @param defaultHandler default means that a handler is used when the user's
     * input in the quick open widget doesn't match any of known prefixes
     */
    registerHandler(handler: QuickOpenHandler, defaultHandler: boolean = false): Disposable {
        if (this.handlers.has(handler.prefix)) {
            this.logger.warn(`A handler with prefix ${handler.prefix} is already registered.`);
            return Disposable.NULL;
        }
        this.handlers.set(handler.prefix, handler);
        const disposable = {
            dispose: () => this.handlers.delete(handler.prefix)
        };
        this.toDispose.push(disposable);
        if (defaultHandler) {
            this.defaultHandler = handler;
        }
        return disposable;
    }

    getDefaultHandler(): QuickOpenHandler | undefined {
        return this.defaultHandler;
    }

    isDefaultHandler(handler: QuickOpenHandler): boolean {
        return handler === this.getDefaultHandler();
    }

    /**
     * Return all registered handlers.
     */
    getHandlers(): QuickOpenHandler[] {
        return [...this.handlers.values()];
    }

    /**
     * Return a handler that matches the given text or the default handler if none.
     */
    getHandlerOrDefault(text: string): QuickOpenHandler | undefined {
        for (const handler of this.handlers.values()) {
            if (text.startsWith(handler.prefix)) {
                return handler;
            }
        }
        return this.getDefaultHandler();
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

/** Prefix-based quick open service. */
@injectable()
export class PrefixQuickOpenService {

    @inject(QuickOpenHandlerRegistry)
    protected readonly handlers: QuickOpenHandlerRegistry;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    /**
     * Opens a quick open widget with the model that handles the known prefixes.
     * @param prefix string that may contain a prefix of some of the known quick open handlers.
     * A default quick open handler will be called if the provided string doesn't match any.
     * An empty quick open will be opened if there's no default handler registered.
     */
    open(prefix: string): void {
        const handler = this.handlers.getHandlerOrDefault(prefix);
        this.setCurrentHandler(prefix, handler);
    }

    protected toDisposeCurrent = new DisposableCollection();
    protected currentHandler: QuickOpenHandler | undefined;

    protected async setCurrentHandler(prefix: string, handler: QuickOpenHandler | undefined): Promise<void> {
        if (handler !== this.currentHandler) {
            this.toDisposeCurrent.dispose();
            this.currentHandler = handler;
            this.toDisposeCurrent.push(Disposable.create(() => {
                const closingHandler = handler && handler.getOptions().onClose;
                if (closingHandler) {
                    closingHandler(true);
                }
            }));
        }
        if (!handler) {
            this.doOpen();
            return;
        }
        if (handler.init) {
            await handler.init();
        }
        let optionsPrefix = prefix;
        if (this.handlers.isDefaultHandler(handler) && prefix.startsWith(handler.prefix)) {
            optionsPrefix = prefix.substr(handler.prefix.length);
        }
        const skipPrefix = this.handlers.isDefaultHandler(handler) ? 0 : handler.prefix.length;
        const handlerOptions = handler.getOptions();
        this.doOpen({
            prefix: optionsPrefix,
            placeholder: "Type '?' to get help on the actions you can take from here",
            skipPrefix,
            ...handlerOptions
        });
    }

    protected doOpen(options?: QuickOpenOptions): void {
        this.quickOpenService.open({
            onType: (lookFor, acceptor) => this.onType(lookFor, acceptor)
        }, options);
    }

    protected onType(lookFor: string, acceptor: (items: QuickOpenItem[], actionProvider?: QuickOpenActionProvider | undefined) => void): void {
        const handler = this.handlers.getHandlerOrDefault(lookFor);
        if (handler === undefined) {
            const items: QuickOpenItem[] = [];
            items.push(new QuickOpenItem({
                label: lookFor.length === 0 ? 'No default handler is registered' : `No handlers matches the prefix ${lookFor} and no default handler is registered.`
            }));
            acceptor(items);
        } else if (handler !== this.currentHandler) {
            this.setCurrentHandler(lookFor, handler);
        } else {
            const handlerModel = handler.getModel();
            const searchValue = this.handlers.isDefaultHandler(handler) ? lookFor : lookFor.substr(handler.prefix.length);
            handlerModel.onType(searchValue, (items, actionProvider) => acceptor(items, actionProvider));
        }
    }

}

@injectable()
export class HelpQuickOpenHandler implements QuickOpenHandler, QuickOpenContribution {

    readonly prefix: string = '?';
    readonly description: string = '';
    protected items: QuickOpenItem[];

    @inject(QuickOpenHandlerRegistry)
    protected readonly handlers: QuickOpenHandlerRegistry;

    @inject(PrefixQuickOpenService)
    protected readonly quickOpenService: PrefixQuickOpenService;

    init(): void {
        this.items = this.handlers.getHandlers()
            .filter(handler => handler.prefix !== this.prefix)
            .map(handler => new QuickOpenItem({
                label: handler.prefix,
                description: handler.description,
                run: (mode: QuickOpenMode) => {
                    if (mode !== QuickOpenMode.OPEN) {
                        return false;
                    }
                    this.quickOpenService.open(handler.prefix);
                    return false;
                }
            }));

        if (this.items.length === 0) {
            this.items.push(new QuickOpenItem({
                label: 'No handlers registered',
                run: () => false
            }));
        }
    }

    getModel(): QuickOpenModel {
        return {
            onType: (lookFor: string, acceptor: (items: QuickOpenItem[]) => void) => {
                acceptor(this.items);
            }
        };
    }

    getOptions(): QuickOpenOptions {
        return {};
    }

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this);
    }
}
