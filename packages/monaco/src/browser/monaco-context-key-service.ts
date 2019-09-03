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

import { injectable, inject, postConstruct } from 'inversify';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { PreferenceServiceImpl, PreferenceChange } from '@theia/core/lib/browser';

@injectable()
export class MonacoContextKeyService extends ContextKeyService {

    // Prefix for context keys based on preference values
    protected static readonly CONFIG_KEY_PREFIX = 'config.';

    @inject(monaco.contextKeyService.ContextKeyService)
    protected readonly contextKeyService: monaco.contextKeyService.ContextKeyService;

    @inject(PreferenceServiceImpl)
    protected readonly preferenceService: PreferenceServiceImpl;

    // Storage of preferences added as context key to the context service to be able to update them later
    // tslint:disable-next-line:no-any
    protected readonly configValues = new Map<string, ContextKey<any>>();

    @postConstruct()
    protected init(): void {
        this.contextKeyService.onDidChangeContext(e =>
            this.fireDidChange({
                affects: keys => e.affectsSome(keys)
            })
        );

        // Watch for newly added preferences and add them as context key to the context service
        this.preferenceService.onPreferenceChanged(preference => this.onPreferencesChanged(preference));
    }

    createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T> {
        return this.contextKeyService.createKey(key, defaultValue);
    }

    activeContext?: HTMLElement;

    match(expression: string, context?: HTMLElement): boolean {
        const ctx = context || this.activeContext || (window.document.activeElement instanceof HTMLElement ? window.document.activeElement : undefined);
        const parsed = this.parse(expression);
        if (!ctx) {
            return this.contextKeyService.contextMatchesRules(parsed);
        }
        const keyContext = this.contextKeyService.getContext(ctx);
        return monaco.keybindings.KeybindingResolver.contextMatchesRules(keyContext, parsed);
    }

    protected readonly expressions = new Map<string, monaco.contextkey.ContextKeyExpr>();
    protected parse(when: string): monaco.contextkey.ContextKeyExpr {
        let expression = this.expressions.get(when);
        if (!expression) {
            expression = monaco.contextkey.ContextKeyExpr.deserialize(when);
            this.expressions.set(when, expression);
        }
        return expression;
    }

    parseKeys(expression: string): Set<string> {
        return new Set<string>(monaco.contextkey.ContextKeyExpr.deserialize(expression).keys());
    }

    protected async onPreferencesChanged(preference: PreferenceChange): Promise<void> {
        this.addOrUpdateConfigContextKey(preference.preferenceName, preference.newValue);
    }

    // tslint:disable-next-line:no-any
    protected addOrUpdateConfigContextKey(key: string, value: any): ContextKey<any> {
        if (!key.startsWith(MonacoContextKeyService.CONFIG_KEY_PREFIX)) {
            key = MonacoContextKeyService.CONFIG_KEY_PREFIX + key;
        }

        let contextKey = this.configValues.get(key);
        if (contextKey !== undefined) {
            contextKey.set(value);
        } else {
            contextKey = this.contextKeyService.createKey<string>(key, value);
            this.configValues.set(key, contextKey);
        }
        return contextKey;
    }

}
