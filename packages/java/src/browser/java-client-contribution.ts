/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { v4 } from 'uuid';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection, CommandService } from '@theia/core/lib/common/';
import { StatusBar, StatusBarEntry, StatusBarAlignment } from '@theia/core/lib/browser';
import { SemanticHighlightingService, SemanticHighlightingRange, Position } from '@theia/editor/lib/browser/semantic-highlight/semantic-highlighting-service';
import {
    Window,
    ILanguageClient,
    BaseLanguageClientContribution,
    Workspace, Languages,
    LanguageClientFactory,
    LanguageClientOptions,
    TextDocumentFeature,
    TextDocumentRegistrationOptions,
    ClientCapabilities,
    ServerCapabilities,
    Disposable,
    DocumentSelector
} from '@theia/languages/lib/browser';
import { JAVA_LANGUAGE_ID, JAVA_LANGUAGE_NAME } from '../common';
import {
    ActionableNotification,
    ActionableMessage,
    StatusReport,
    StatusNotification,
    SemanticHighlight,
    SemanticHighlightingParams
} from './java-protocol';

@injectable()
export class JavaClientContribution extends BaseLanguageClientContribution {

    readonly id = JAVA_LANGUAGE_ID;
    readonly name = JAVA_LANGUAGE_NAME;
    private readonly statusNotificationName = 'java-status-notification';
    private statusBarTimeout: number | undefined;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(Window) protected readonly window: Window,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(StatusBar) protected readonly statusBar: StatusBar,
        @inject(SemanticHighlightingService) protected readonly semanticHighlightingService: SemanticHighlightingService
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns() {
        return ['**/*.java', '**/pom.xml', '**/*.gradle'];
    }

    protected get workspaceContains() {
        return ['pom.xml', 'build.gradle'];
    }

    protected onReady(languageClient: ILanguageClient): void {
        languageClient.onNotification(ActionableNotification.type, this.showActionableMessage.bind(this));
        languageClient.onNotification(StatusNotification.type, this.showStatusMessage.bind(this));
        super.onReady(languageClient);
    }

    createLanguageClient(): ILanguageClient {
        const client: ILanguageClient & Readonly<{ languageId: string }> = Object.assign(super.createLanguageClient(), { languageId: this.id });
        client.registerFeature(new SemanticHighlightFeature(client, this.semanticHighlightingService));
        return client;
    }

    protected showStatusMessage(message: StatusReport) {
        if (this.statusBarTimeout) {
            window.clearTimeout(this.statusBarTimeout);
            this.statusBarTimeout = undefined;
        }
        const statusEntry = {
            alignment: StatusBarAlignment.LEFT,
            priority: 1,
            text: '$(refresh~spin) ' + message.message
        } as StatusBarEntry;
        this.statusBar.setElement(this.statusNotificationName, statusEntry);
        this.statusBarTimeout = window.setTimeout(() => {
            this.statusBar.removeElement(this.statusNotificationName);
            this.statusBarTimeout = undefined;
        }, 5000);
    }

    protected showActionableMessage(message: ActionableMessage): void {
        const items = message.commands || [];
        this.window.showMessage(message.severity, message.message, ...items).then(command => {
            if (command) {
                const args = command.arguments || [];
                this.commandService.executeCommand(command.command, ...args);
            }
        });
    }

    protected createOptions(): LanguageClientOptions {
        const options = super.createOptions();
        options.initializationOptions = {
            extendedClientCapabilities: {
                classFileContentsSupport: true,
                semanticHighlighting: true
            }
        };
        return options;
    }

}

// TODO: This will be part of the protocol.
export class SemanticHighlightFeature extends TextDocumentFeature<TextDocumentRegistrationOptions> {

    protected readonly languageId: string;
    protected readonly toDispose: DisposableCollection;

    constructor(client: ILanguageClient & Readonly<{ languageId: string }>, protected readonly semanticHighlightingService: SemanticHighlightingService) {
        super(client, SemanticHighlight.type);
        this.languageId = client.languageId;
        this.toDispose = new DisposableCollection();
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if (!capabilities.textDocument) {
            capabilities.textDocument = {};
        }
        // tslint:disable-next-line:no-any
        (capabilities.textDocument as any).semanticHighlightingCapabilities = {
            semanticHighlighting: true
        };
    }

    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
        if (!documentSelector) {
            return;
        }
        const capabilitiesExt: ServerCapabilities & { semanticHighlighting?: { scopes: string[][] | undefined } } = capabilities;
        if (capabilitiesExt.semanticHighlighting) {
            const { scopes } = capabilitiesExt.semanticHighlighting;
            if (scopes && scopes.length > 0) {
                this.toDispose.push(this.semanticHighlightingService.register(this.languageId, scopes));
                const id = v4();
                this.register(this.messages, {
                    id,
                    registerOptions: Object.assign({}, { documentSelector: documentSelector }, capabilitiesExt.semanticHighlighting)
                });
            }
        }
    }

    protected registerLanguageProvider(): Disposable {
        this._client.onNotification(SemanticHighlight.type, this.applySemanticHighlighting.bind(this));
        return Disposable.create(() => this.toDispose.dispose());
    }

    protected applySemanticHighlighting(params: SemanticHighlightingParams): void {
        const toRanges: (tuple: [number, string | undefined]) => SemanticHighlightingRange[] = tuple => {
            const [line, tokens] = tuple;
            if (!tokens) {
                return [
                    {
                        start: Position.create(line, 0),
                        end: Position.create(line, 0),
                    }
                ];
            }
            return SemanticHighlightingService.decode(tokens).map(token => ({
                start: Position.create(line, token.character),
                end: Position.create(line, token.character + token.length),
                scope: token.scope
            }));
        };
        const ranges = params.lines.map(line => [line.line, line.tokens]).map(toRanges).reduce((acc, current) => acc.concat(current), []);
        const uri = new URI(params.textDocument.uri);
        this.semanticHighlightingService.decorate(this.languageId, uri, ranges);
    }

}
