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
import { inject, injectable } from "inversify";
import { MonacoQuickOpenService, MonacoQuickOpenControllerOptsImpl } from "./monaco-quick-open-service";
import { QuickOpenMode, QuickOpenItemOptions, QuickOpenModel, QuickOpenOptions, QuickOpenItem } from "@theia/core/lib/browser";

export interface QuickInputOptions {

    /**
     * The prefill value.
     */
    value?: string;

    /**
     * The text to display under the input box.
     */
    prompt?: string;

    /**
     * The place holder in the input box to guide the user what to type.
     */
    placeHolder?: string;

    /**
     * Set to `true` to show a password prompt that will not show the typed value.
     */
    password?: boolean;

    /**
     * Set to `true` to keep the input box open when focus moves to another part of the editor or to another window.
     */
    ignoreFocusOut?: boolean;

    /**
     * An optional function that will be called to validate input and to give a hint
     * to the user.
     *
     * @param value The current value of the input box.
     * @return Return `undefined`, or the empty string when 'value' is valid.
     */
    validateInput?(value: string): string | undefined | PromiseLike<string | undefined>;
}

const promptMessage = "Press 'Enter' to confirm your input or 'Escape' to cancel";

@injectable()
export class QuickInputService {

    private opts: MonacoQuickInputControllerOptsImpl;
    @inject(MonacoQuickOpenService)
    protected readonly quickOpenService: MonacoQuickOpenService;

    open(options: QuickInputOptions): Promise<string | undefined> {
        options.prompt = this.createPrompt(options.prompt);

        const inputItem = new InputOpenItemOptions(options.prompt);
        this.opts = new MonacoQuickInputControllerOptsImpl({
            onType: (s, a) => this.validateInput(s, a, inputItem)
        },
            options,
            {
                prefix: options.value,
                placeholder: options.placeHolder,
                onClose: () => inputItem.resolve(undefined)
            });
        this.quickOpenService.internalOpen(this.opts);

        return new Promise(r => {
            inputItem.resolve = r;
        });
    }

    private createPrompt(prompt?: string): string {
        if (prompt) {
            return `${prompt} (${promptMessage})`;
        } else {
            return promptMessage;
        }
    }

    private validateInput(str: string, acceptor: (items: QuickOpenItem[]) => void, inputItem: InputOpenItemOptions): void {
        inputItem.currentText = str;
        acceptor([new QuickOpenItem(inputItem)]);
        if (this.opts && this.opts.validateInput) {
            const hint = this.opts.validateInput(str);
            if (hint) {
                if (typeof hint !== 'string') {
                    hint.then(p => {
                        if (p) {
                            this.setValidationState(inputItem, p, false);
                        } else {
                            this.setValidationState(inputItem, this.opts!.prompt!, true);
                        }
                    });
                } else {
                    this.setValidationState(inputItem, hint, false);
                }
            } else {
                this.setValidationState(inputItem, this.opts.prompt!, true);
            }
        }
    }

    private setValidationState(inputItem: InputOpenItemOptions, label: string, isValid: boolean): void {
        this.quickOpenService.clearInputDecoration();
        inputItem.isValid = isValid;
        inputItem.label = label;
        if (isValid) {
            this.quickOpenService.clearInputDecoration();
        } else {
            this.quickOpenService.showInputDecoration(monaco.Severity.Error);
        }
    }
}

class InputOpenItemOptions implements QuickOpenItemOptions {
    currentText: string;
    isValid = true;
    resolve: (value?: string | PromiseLike<string> | undefined) => void;

    constructor(
        public label?: string) {
    }

    run(mode: QuickOpenMode): boolean {
        if (this.isValid && mode === QuickOpenMode.OPEN) {
            this.resolve(this.currentText);
            return true;
        }
        return false;
    }
}

class MonacoQuickInputControllerOptsImpl extends MonacoQuickOpenControllerOptsImpl {
    readonly prompt?: string;
    readonly password?: boolean;
    readonly ignoreFocusOut?: boolean;
    validateInput?(value: string): string | undefined | PromiseLike<string | undefined>;
    constructor(
        model: QuickOpenModel,
        inputOptions: QuickInputOptions,
        options?: QuickOpenOptions
    ) {
        super(model, options);
        if (inputOptions.password) {
            this.password = inputOptions.password;
        }
        if (inputOptions.prompt) {
            this.prompt = inputOptions.prompt;
        }

        if (inputOptions.ignoreFocusOut) {
            this.ignoreFocusOut = inputOptions.ignoreFocusOut;
        }
        if (inputOptions.validateInput) {
            this.validateInput = inputOptions.validateInput;
        }
    }
}
