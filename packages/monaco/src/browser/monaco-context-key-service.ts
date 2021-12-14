/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyService, ContextKey, ContextKeyChangeEvent, ScopedValueStore } from '@theia/core/lib/browser/context-key-service';
import { Emitter } from '@theia/core';

@injectable()
export class MonacoContextKeyService implements ContextKeyService {
    protected readonly onDidChangeEmitter = new Emitter<ContextKeyChangeEvent>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @inject(monaco.contextKeyService.ContextKeyService)
    protected readonly contextKeyService: monaco.contextKeyService.ContextKeyService;

    @postConstruct()
    protected init(): void {
        this.contextKeyService.onDidChangeContext(e =>
            this.onDidChangeEmitter.fire({
                affects: keys => e.affectsSome(keys)
            })
        );
    }

    createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T> {
        return this.contextKeyService.createKey(key, defaultValue);
    }

    activeContext?: HTMLElement | monaco.contextKeyService.IContext;

    match(expression: string, context?: HTMLElement): boolean {
        const parsed = this.parse(expression);
        const ctx = this.identifyContext(context);
        if (!ctx) {
            return this.contextKeyService.contextMatchesRules(parsed);
        }
        return monaco.keybindings.KeybindingResolver.contextMatchesRules(ctx, parsed);
    }

    protected identifyContext(callersContext?: HTMLElement | monaco.contextKeyService.IContext): monaco.contextKeyService.IContext | undefined {
        if (callersContext && 'getValue' in callersContext) {
            return callersContext;
        } else if (this.activeContext && 'getValue' in this.activeContext) {
            return this.activeContext;
        }
        const browserContext = callersContext ?? this.activeContext ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
        if (browserContext) {
            return this.contextKeyService.getContext(browserContext);
        }
        return undefined;
    }

    protected readonly expressions = new Map<string, monaco.contextkey.ContextKeyExpression>();
    protected parse(when: string): monaco.contextkey.ContextKeyExpression | undefined {
        let expression = this.expressions.get(when);
        if (!expression) {
            expression = monaco.contextkey.ContextKeyExpr.deserialize(when);
            if (expression) {
                this.expressions.set(when, expression);
            }
        }
        return expression;
    }

    parseKeys(expression: string): Set<string> | undefined {
        const expr = monaco.contextkey.ContextKeyExpr.deserialize(expression);
        return expr ? new Set<string>(expr.keys()) : expr;
    }

    with<T>(values: Record<string, unknown>, callback: () => T): T {
        const oldActive = this.activeContext;
        const id = this.contextKeyService.createChildContext();
        const child = this.contextKeyService.getContextValuesContainer(id);
        for (const [key, value] of Object.entries(values)) {
            child.setValue(key, value);
        }
        this.activeContext = child;
        try {
            return callback();
        } finally {
            this.activeContext = oldActive;
            this.contextKeyService.disposeContext(id);
        }
    }

    createScoped(target?: HTMLElement): ScopedValueStore {
        return this.contextKeyService.createScoped(target);
    }

    setContext(key: string, value: unknown): void {
        this.contextKeyService.setContext(key, value);
    }

    dispose(): void {
        this.activeContext = undefined;
        this.onDidChangeEmitter.dispose();
        this.contextKeyService.dispose();
    }
}
