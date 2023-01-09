// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named, postConstruct } from 'inversify';
import * as fileIcons from 'file-icons-js';
import URI from '../common/uri';
import { ContributionProvider } from '../common/contribution-provider';
import { Event, Emitter, Disposable, isObject, Path, Prioritizeable } from '../common';
import { FrontendApplicationContribution } from './frontend-application';
import { EnvVariablesServer } from '../common/env-variables/env-variables-protocol';
import { ResourceLabelFormatter, ResourceLabelFormatting } from '../common/label-protocol';
import { codicon } from './widgets';

/**
 * @internal don't export it, use `LabelProvider.folderIcon` instead.
 */
const DEFAULT_FOLDER_ICON = `${codicon('folder')} default-folder-icon`;
/**
 * @internal don't export it, use `LabelProvider.fileIcon` instead.
 */
const DEFAULT_FILE_ICON = `${codicon('file')} default-file-icon`;

export const LabelProviderContribution = Symbol('LabelProviderContribution');
/**
 * A {@link LabelProviderContribution} determines how specific elements/nodes are displayed in the workbench.
 * Theia views use a common {@link LabelProvider} to determine the label and/or an icon for elements shown in the UI. This includes elements in lists
 * and trees, but also view specific locations like headers. The common {@link LabelProvider} collects all {@links LabelProviderContribution} and delegates
 * to the contribution with the highest priority. This is determined via calling the {@link LabelProviderContribution.canHandle} function, so contributions
 * define which elements they are responsible for.
 * As arbitrary views can consume LabelProviderContributions, they must be generic for the covered element type, not view specific. Label providers and
 * contributions can be used for arbitrary element and node types, e.g. for markers or domain-specific elements.
 */
export interface LabelProviderContribution {

    /**
     * Determines whether this contribution can handle the given element and with what priority.
     * All contributions are ordered by the returned number if greater than zero. The highest number wins.
     * If two or more contributions return the same positive number one of those will be used. It is undefined which one.
     */
    canHandle(element: object): number;

    /**
     * returns an icon class for the given element.
     */
    getIcon?(element: object): string | undefined;

    /**
     * returns a short name for the given element.
     */
    getName?(element: object): string | undefined;

    /**
     * returns a long name for the given element.
     */
    getLongName?(element: object): string | undefined;

    /**
     * A compromise between {@link getName} and {@link getLongName}. Can be used to supplement getName in contexts that allow both a primary display field and extra detail.
     */
    getDetails?(element: object): string | undefined;

    /**
     * Emit when something has changed that may result in this label provider returning a different
     * value for one or more properties (name, icon etc).
     */
    readonly onDidChange?: Event<DidChangeLabelEvent>;

    /**
     * Checks whether the given element is affected by the given change event.
     * Contributions delegating to the label provider can use this hook
     * to perform a recursive check.
     */
    affects?(element: object, event: DidChangeLabelEvent): boolean;

}

export interface DidChangeLabelEvent {
    affects(element: object): boolean;
}

export interface URIIconReference {
    kind: 'uriIconReference';
    id: 'file' | 'folder';
    uri?: URI
}
export namespace URIIconReference {
    export function is(element: unknown): element is URIIconReference {
        return isObject(element) && element.kind === 'uriIconReference';
    }
    export function create(id: URIIconReference['id'], uri?: URI): URIIconReference {
        return { kind: 'uriIconReference', id, uri };
    }
}

@injectable()
export class DefaultUriLabelProviderContribution implements LabelProviderContribution {

    protected formatters: ResourceLabelFormatter[] = [];
    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
    protected homePath: string | undefined;
    @inject(EnvVariablesServer) protected readonly envVariablesServer: EnvVariablesServer;

    @postConstruct()
    init(): void {
        this.envVariablesServer.getHomeDirUri().then(result => {
            this.homePath = result;
            this.fireOnDidChange();
        });
    }

    canHandle(element: object): number {
        if (element instanceof URI || URIIconReference.is(element)) {
            return 1;
        }
        return 0;
    }

    getIcon(element: URI | URIIconReference): string {
        if (URIIconReference.is(element) && element.id === 'folder') {
            return this.defaultFolderIcon;
        }
        const uri = URIIconReference.is(element) ? element.uri : element;
        if (uri) {
            const iconClass = uri && this.getFileIcon(uri);
            return iconClass || this.defaultFileIcon;
        }
        return '';
    }

    get defaultFolderIcon(): string {
        return DEFAULT_FOLDER_ICON;
    }

    get defaultFileIcon(): string {
        return DEFAULT_FILE_ICON;
    }

    protected getFileIcon(uri: URI): string | undefined {
        const fileIcon = fileIcons.getClassWithColor(uri.displayName);
        if (!fileIcon) {
            return undefined;
        }
        return fileIcon + ' theia-file-icons-js';
    }

    getName(element: URI | URIIconReference): string | undefined {
        const uri = this.getUri(element);
        return uri && uri.displayName;
    }

    getLongName(element: URI | URIIconReference): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            const formatting = this.findFormatting(uri);
            if (formatting) {
                return this.formatUri(uri, formatting);
            }
        }
        return uri && uri.path.fsPath();
    }

    getDetails(element: URI | URIIconReference): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.getLongName(uri.parent);
        }
        return this.getLongName(element);
    }

    protected getUri(element: URI | URIIconReference): URI | undefined {
        return URIIconReference.is(element) ? element.uri : element;
    }

    registerFormatter(formatter: ResourceLabelFormatter): Disposable {
        this.formatters.push(formatter);
        this.fireOnDidChange();
        return Disposable.create(() => {
            this.formatters = this.formatters.filter(f => f !== formatter);
            this.fireOnDidChange();
        });
    }

    get onDidChange(): Event<DidChangeLabelEvent> {
        return this.onDidChangeEmitter.event;
    }

    private fireOnDidChange(): void {
        this.onDidChangeEmitter.fire({
            affects: (element: URI) => this.canHandle(element) > 0
        });
    }

    // copied and modified from https://github.com/microsoft/vscode/blob/1.44.2/src/vs/workbench/services/label/common/labelService.ts
    /*---------------------------------------------------------------------------------------------
    *  Copyright (c) Microsoft Corporation. All rights reserved.
    *  Licensed under the MIT License. See License.txt in the project root for license information.
    *--------------------------------------------------------------------------------------------*/
    private readonly labelMatchingRegexp = /\${(scheme|authority|path|query)}/g;
    protected formatUri(resource: URI, formatting: ResourceLabelFormatting): string {
        let label = formatting.label.replace(this.labelMatchingRegexp, (match, token) => {
            switch (token) {
                case 'scheme': return resource.scheme;
                case 'authority': return resource.authority;
                case 'path': return resource.path.toString();
                case 'query': return resource.query;
                default: return '';
            }
        });

        // convert \c:\something => C:\something
        if (formatting.normalizeDriveLetter && this.hasDriveLetter(label)) {
            label = label.charAt(1).toUpperCase() + label.substr(2);
        }

        if (formatting.tildify) {
            label = Path.tildify(label, this.homePath ? this.homePath : '');
        }
        if (formatting.authorityPrefix && resource.authority) {
            label = formatting.authorityPrefix + label;
        }

        return label.replace(/\//g, formatting.separator);
    }

    private hasDriveLetter(path: string): boolean {
        return !!(path && path[2] === ':');
    }

    protected findFormatting(resource: URI): ResourceLabelFormatting | undefined {
        let bestResult: ResourceLabelFormatter | undefined;

        this.formatters.forEach(formatter => {
            if (formatter.scheme === resource.scheme) {
                if (!bestResult && !formatter.authority) {
                    bestResult = formatter;
                    return;
                }
                if (!formatter.authority) {
                    return;
                }

                if ((formatter.authority.toLowerCase() === resource.authority.toLowerCase()) &&
                    (!bestResult || !bestResult.authority || formatter.authority.length > bestResult.authority.length ||
                        ((formatter.authority.length === bestResult.authority.length) && formatter.priority))) {
                    bestResult = formatter;
                }
            }
        });

        return bestResult ? bestResult.formatting : undefined;
    }
}

/**
 * The {@link LabelProvider} determines how elements/nodes are displayed in the workbench. For any element, it can determine a short label, a long label
 * and an icon. The {@link LabelProvider} is to be used in lists, trees and tables, but also view specific locations like headers.
 * The common {@link LabelProvider} can be extended/adapted via {@link LabelProviderContribution}s. For every element, the {@links LabelProvider} will determine the
 * {@link LabelProviderContribution} with the hightest priority and delegate to it. Theia registers default {@link LabelProviderContribution} for common types, e.g.
 * the {@link DefaultUriLabelProviderContribution} for elements that have a URI.
 * Using the {@link LabelProvider} across the workbench ensures a common look and feel for elements across multiple views. To adapt the way how specific
 * elements/nodes are rendered, use a {@link LabelProviderContribution} rather than adapting or sub classing the {@link LabelProvider}. This way, your adaptation
 * is applied to all views in Theia that use the {@link LabelProvider}
 */
@injectable()
export class LabelProvider implements FrontendApplicationContribution {

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();

    @inject(ContributionProvider) @named(LabelProviderContribution)
    protected readonly contributionProvider: ContributionProvider<LabelProviderContribution>;

    /**
     * Start listening to contributions.
     *
     * Don't call this method directly!
     * It's called by the frontend application during initialization.
     */
    initialize(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const eventContribution of contributions) {
            if (eventContribution.onDidChange) {
                eventContribution.onDidChange(event => {
                    this.onDidChangeEmitter.fire({
                        // TODO check eventContribution.canHandle as well
                        affects: element => this.affects(element, event)
                    });
                });
            }
        }
    }

    protected affects(element: object, event: DidChangeLabelEvent): boolean {
        if (event.affects(element)) {
            return true;
        }
        for (const contribution of this.findContribution(element)) {
            if (contribution.affects && contribution.affects(element, event)) {
                return true;
            }
        }
        return false;
    }

    get onDidChange(): Event<DidChangeLabelEvent> {
        return this.onDidChangeEmitter.event;
    }

    /**
     * Return a default file icon for the current icon theme.
     */
    get fileIcon(): string {
        return this.getIcon(URIIconReference.create('file'));
    }

    /**
     * Return a default folder icon for the current icon theme.
     */
    get folderIcon(): string {
        return this.getIcon(URIIconReference.create('folder'));
    }

    /**
     * Get the icon class from the list of available {@link LabelProviderContribution} for the given element.
     * @return the icon class
     */
    getIcon(element: object): string {
        return this.handleRequest(element, 'getIcon') ?? '';
    }

    /**
     * Get a short name from the list of available {@link LabelProviderContribution} for the given element.
     * @return the short name
     */
    getName(element: object): string {
        return this.handleRequest(element, 'getName') ?? '<unknown>';
    }

    /**
     * Get a long name from the list of available {@link LabelProviderContribution} for the given element.
     * @return the long name
     */
    getLongName(element: object): string {
        return this.handleRequest(element, 'getLongName') ?? '';
    }

    /**
     * Get details from the list of available {@link LabelProviderContribution} for the given element.
     * @return the details
     * Can be used to supplement {@link getName} in contexts that allow both a primary display field and extra detail.
     */
    getDetails(element: object): string {
        return this.handleRequest(element, 'getDetails') ?? '';
    }

    protected handleRequest(element: object, method: keyof Omit<LabelProviderContribution, 'canHandle' | 'onDidChange' | 'affects'>): string | undefined {
        for (const contribution of this.findContribution(element, method)) {
            const value = contribution[method]?.(element);
            if (value !== undefined) {
                return value;
            }
        }
    }

    protected findContribution(element: object, method?: keyof Omit<LabelProviderContribution, 'canHandle' | 'onDidChange' | 'affects'>): LabelProviderContribution[] {
        const candidates = method
            ? this.contributionProvider.getContributions().filter(candidate => candidate[method])
            : this.contributionProvider.getContributions();
        return Prioritizeable.prioritizeAllSync(candidates, contrib =>
            contrib.canHandle(element)
        ).map(entry => entry.value);
    }
}
