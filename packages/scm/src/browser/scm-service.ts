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

export interface ScmProvider extends Disposable {
    readonly label: string;
    readonly id: string;
    readonly handle: number;
    readonly contextValue: string;

    readonly groups: ScmResourceGroup[];

    readonly onDidChangeResources: Event<void>;

    readonly rootUri?: string;
    readonly onDidChangeCommitTemplate?: Event<string>;
    readonly onDidChangeStatusBarCommands?: Event<ScmCommand[]>;
    readonly acceptInputCommand?: ScmCommand;
    readonly onDidChange: Event<void>;

    readonly amendSupport?: ScmAmendSupport;
}

export interface ScmResourceGroup extends Disposable {
    readonly handle: number,
    readonly sourceControlHandle: number,
    readonly resources: ScmResource[];
    readonly provider: ScmProvider;
    readonly label: string;
    readonly id: string;
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

export interface ScmInput extends Disposable {
    value: string;
    placeholder: string;
    validateInput: InputValidator;

    readonly onDidChange: Event<string>;
}

export interface ScmCommit {
    id: string,  // eg Git sha or Mercurial revision number
    summary: string,
    authorName: string,
    authorEmail: string,
    authorDateRelative: string
}

export interface ScmAmendSupport {
    getIntialAmendingCommits(storedState: string, lastHead: string): Promise<ScmCommit[]>
    getMessage(commit: string): Promise<string>;
    reset(commit: string): Promise<void>;
    getLastCommit(): Promise<ScmCommit | undefined>;
}

@injectable()
export class ScmService {
    private providerIds = new Set<string>();
    private _repositories: ScmRepository[] = [];
    private _selectedRepository: ScmRepository | undefined;

    private disposableCollection: DisposableCollection = new DisposableCollection();
    private onDidChangeSelectedRepositoriesEmitter = new Emitter<ScmRepository | undefined>();
    private onDidAddProviderEmitter = new Emitter<ScmRepository>();
    private onDidRemoveProviderEmitter = new Emitter<ScmRepository>();

    readonly onDidChangeSelectedRepositories: Event<ScmRepository | undefined> = this.onDidChangeSelectedRepositoriesEmitter.event;

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
        this.onDidChangeSelectedRepositoriesEmitter.fire(repository);
    }

    get onDidAddRepository(): Event<ScmRepository> {
        return this.onDidAddProviderEmitter.event;
    }

    get onDidRemoveRepository(): Event<ScmRepository> {
        return this.onDidRemoveProviderEmitter.event;
    }

    registerScmProvider(provider: ScmProvider, disposables?: Disposable[]): ScmRepository {

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

        const disposableCollection: DisposableCollection = new DisposableCollection(disposable);
        if (disposables) {
            disposableCollection.pushAll(disposables);
        }
        const repository = new ScmRepository(provider, disposableCollection);

        this._repositories.push(repository);
        this.onDidAddProviderEmitter.fire(repository);

        if (this._repositories.length === 1) {
            this.selectedRepository = repository;
        }

        return repository;
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }
}

export class ScmRepository implements Disposable {

    private onDidFocusEmitter = new Emitter<void>();
    readonly onDidFocus: Event<void> = this.onDidFocusEmitter.event;

    private onDidChangeSelectionEmitter = new Emitter<boolean>();
    readonly onDidChangeSelection: Event<boolean> = this.onDidChangeSelectionEmitter.event;

    private readonly disposables: DisposableCollection = new DisposableCollection();

    readonly input: ScmInput = new ScmInputImpl();

    constructor(
        public readonly provider: ScmProvider,
        private disposable: DisposableCollection
    ) {
        this.disposables.push(this.disposable);
        this.disposables.push(this.onDidChangeSelectionEmitter);
        this.disposables.push(this.input);
    }

    focus(): void {
        this.onDidFocusEmitter.fire(undefined);
    }

    dispose(): void {
        this.disposables.dispose();
        this.provider.dispose();
    }
}

class ScmInputImpl implements ScmInput {

    private _value: string;
    private _placeholder: string;
    private _validateInput: InputValidator;
    private readonly disposables: DisposableCollection;
    private readonly onDidChangePlaceholderEmitter: Emitter<string>;
    private readonly onDidChangeValidateInputEmitter: Emitter<void>;
    private readonly onDidChangeEmitter: Emitter<string>;

    constructor() {
        this._value = '';
        this._placeholder = '';
        this._validateInput = () => Promise.resolve(undefined);
        this.onDidChangePlaceholderEmitter = new Emitter();
        this.onDidChangeValidateInputEmitter = new Emitter();
        this.onDidChangeEmitter = new Emitter();
        this.disposables = new DisposableCollection();
        this.disposables.push(this.onDidChangePlaceholderEmitter);
        this.disposables.push(this.onDidChangeValidateInputEmitter);
        this.disposables.push(this.onDidChangeEmitter);
    }

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        if (this._value === value) {
            return;
        }
        this._value = value;
        this.onDidChangeEmitter.fire(value);
    }

    get onDidChange(): Event<string> {
        return this.onDidChangeEmitter.event;
    }

    get placeholder(): string {
        return this._placeholder;
    }

    set placeholder(placeholder: string) {
        this._placeholder = placeholder;
        this.onDidChangePlaceholderEmitter.fire(placeholder);
    }

    get validateInput(): InputValidator {
        return this._validateInput;
    }

    set validateInput(validateInput: InputValidator) {
        this._validateInput = validateInput;
        this.onDidChangeValidateInputEmitter.fire(undefined);
    }

    dispose(): void {
        this.disposables.dispose();
    }
}
