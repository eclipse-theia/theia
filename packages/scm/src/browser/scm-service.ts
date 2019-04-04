/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';

export const ScmService = Symbol('ScmService');
export interface ScmService extends Disposable {

    readonly onDidAddRepository: Event<ScmRepository>;
    readonly onDidRemoveRepository: Event<ScmRepository>;

    readonly repositories: ScmRepository[];
    selectedRepository: ScmRepository | undefined;
    readonly onDidChangeSelectedRepositories: Event<ScmRepository>;

    registerScmProvider(provider: ScmProvider): ScmRepository;
}

export interface ScmProvider extends Disposable {
    readonly label: string;
    readonly id: string;
    readonly handle: number;
    readonly contextValue: string;

    readonly groups: ScmResourceGroup[];

    readonly onDidChangeResources: Event<void>;

    readonly rootUri?: string;
    readonly count?: number;
    readonly commitTemplate?: string;
    readonly onDidChangeCommitTemplate?: Event<string>;
    readonly onDidChangeStatusBarCommands?: Event<ScmCommand[]>;
    readonly acceptInputCommand?: ScmCommand;
    readonly statusBarCommands?: ScmCommand[];
    readonly onDidChange: Event<void>;

    getOriginalResource(uri: URI): Promise<URI | undefined>;
}

export interface ScmResourceGroup {
    readonly handle: number,
    readonly sourceControlHandle: number,
    readonly resources: ScmResource[];
    readonly provider: ScmProvider;
    readonly label: string;
    readonly id: string;
    readonly hideWhenEmpty: boolean | undefined;
    readonly onDidChange: Event<void>;
}

export interface ScmResource {
    readonly handle: number;
    readonly groupHandle: number;
    readonly sourceControlHandle: number;
    readonly group: ScmResourceGroup;
    readonly sourceUri: URI;
    readonly decorations?: ScmResourceDecorations;
    readonly selected?: boolean;

    open(): Promise<void>;
}

export interface ScmResourceDecorations {
    icon?: string;
    tooltip?: string;
    strikeThrough?: boolean;
    faded?: boolean;

    source?: string;
    letter?: string;
    color?: string;
}

export interface ScmCommand {
    id: string;
    text: string;
    tooltip?: string;
    command?: string;
}

export interface InputValidation {
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export interface InputValidator {
    (value: string): Promise<InputValidation | undefined>;
}

export namespace InputValidator {
    /**
     * Type for the validation result with a status and a corresponding message.
     */
    export type Result = Readonly<{ message: string, type: 'info' | 'success' | 'warning' | 'error' }>;

    export namespace Result {

        /**
         * `true` if the `message` and the `status` properties are the same on both `left` and `right`. Or both arguments are `undefined`. Otherwise, `false`.
         */
        export function equal(left: Result | undefined, right: Result | undefined): boolean {
            if (left && right) {
                return left.message === right.message && left.type === right.type;
            }
            return left === right;
        }

    }
}

export interface ScmInput {
    value: string;
    readonly onDidChange: Event<string>;

    placeholder: string;
    readonly onDidChangePlaceholder: Event<string>;

    validateInput: InputValidator;
    readonly onDidChangeValidateInput: Event<void>;

    visible: boolean;
    readonly onDidChangeVisibility: Event<boolean>;
}

export interface ScmRepository extends Disposable {
    readonly onDidFocus: Event<void>;
    readonly selected: boolean;
    readonly onDidChangeSelection: Event<boolean>;
    readonly provider: ScmProvider;
    readonly input: ScmInput;

    focus(): void;

    setSelected(selected: boolean): void;
}

@injectable()
export class ScmServiceImpl implements ScmService {
    private providerIds = new Set<string>();
    private _repositories: ScmRepository[] = [];
    private _selectedRepository: ScmRepository | undefined;

    private disposableCollection: DisposableCollection = new DisposableCollection();
    private onDidChangeSelectedRepositoriesEmitter = new Emitter<ScmRepository>();
    private onDidAddProviderEmitter = new Emitter<ScmRepository>();
    private onDidRemoveProviderEmitter = new Emitter<ScmRepository>();

    readonly onDidChangeSelectedRepositories: Event<ScmRepository> = this.onDidChangeSelectedRepositoriesEmitter.event;

    constructor() {
        this.disposableCollection.push(this.onDidChangeSelectedRepositoriesEmitter);
        this.disposableCollection.push(this.onDidAddProviderEmitter);
        this.disposableCollection.push(this.onDidRemoveProviderEmitter);
    }

    get repositories(): ScmRepository[] {
        return [...this._repositories];
    }

    get selectedRepository(): ScmRepository | undefined {
        return this._selectedRepository;
    }

    set selectedRepository(repository: ScmRepository | undefined) {
        this._selectedRepository = repository;
        if (repository) {
            this.onDidChangeSelectedRepositoriesEmitter.fire(repository);
        }
    }

    get onDidAddRepository(): Event<ScmRepository> {
        return this.onDidAddProviderEmitter.event;
    }

    get onDidRemoveRepository(): Event<ScmRepository> {
        return this.onDidRemoveProviderEmitter.event;
    }

    registerScmProvider(provider: ScmProvider): ScmRepository {

        if (this.providerIds.has(provider.id)) {
            throw new Error(`SCM Provider ${provider.id} already exists.`);
        }

        this.providerIds.add(provider.id);

        const disposable: Disposable = Disposable.create(() => {
            const index = this._repositories.indexOf(repository);
            if (index < 0) {
                return;
            }
            this.providerIds.delete(provider.id);
            this._repositories.splice(index, 1);
            this.onDidRemoveProviderEmitter.fire(repository);
        });

        const repository = new ScmRepositoryImpl(provider, disposable);

        this._repositories.push(repository);
        this.onDidAddProviderEmitter.fire(repository);

        // automatically select the first repository
        if (this._repositories.length === 1) {
            this.selectedRepository = repository;
        }

        return repository;
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }
}

class ScmRepositoryImpl implements ScmRepository {

    private _onDidFocus = new Emitter<void>();
    readonly onDidFocus: Event<void> = this._onDidFocus.event;

    private _selected = false;
    get selected(): boolean {
        return this._selected;
    }

    private _onDidChangeSelection = new Emitter<boolean>();
    readonly onDidChangeSelection: Event<boolean> = this._onDidChangeSelection.event;

    readonly input: ScmInput = new ScmInputImpl();

    constructor(
        public readonly provider: ScmProvider,
        private disposable: Disposable
    ) { }

    focus(): void {
        this._onDidFocus.fire(undefined);
    }

    setSelected(selected: boolean): void {
        this._selected = selected;
        this._onDidChangeSelection.fire(selected);
    }

    dispose(): void {
        this.disposable.dispose();
        this.provider.dispose();
    }
}

class ScmInputImpl implements ScmInput {

    private _value = '';

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        if (this._value === value) {
            return;
        }
        this._value = value;
        this._onDidChange.fire(value);
    }

    private _onDidChange = new Emitter<string>();
    get onDidChange(): Event<string> { return this._onDidChange.event; }

    private _placeholder = '';

    get placeholder(): string {
        return this._placeholder;
    }

    set placeholder(placeholder: string) {
        this._placeholder = placeholder;
        this._onDidChangePlaceholder.fire(placeholder);
    }

    private _onDidChangePlaceholder = new Emitter<string>();
    get onDidChangePlaceholder(): Event<string> { return this._onDidChangePlaceholder.event; }

    private _visible = true;

    get visible(): boolean {
        return this._visible;
    }

    set visible(visible: boolean) {
        this._visible = visible;
        this._onDidChangeVisibility.fire(visible);
    }

    private _onDidChangeVisibility = new Emitter<boolean>();
    get onDidChangeVisibility(): Event<boolean> { return this._onDidChangeVisibility.event; }

    private _validateInput: InputValidator = () => Promise.resolve(undefined);

    get validateInput(): InputValidator {
        return this._validateInput;
    }

    set validateInput(validateInput: InputValidator) {
        this._validateInput = validateInput;
        this._onDidChangeValidateInput.fire(undefined);
    }

    private _onDidChangeValidateInput = new Emitter<void>();
    get onDidChangeValidateInput(): Event<void> { return this._onDidChangeValidateInput.event; }
}
