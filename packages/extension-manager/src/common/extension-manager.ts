/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Event, Emitter, Disposable, DisposableCollection } from '@theia/core';
import * as protocol from './extension-protocol';
import { ExtensionChange } from './extension-protocol';

/**
 * The extension allows to:
 * - access its information from the repository;
 * - resolve the detailed information from the repository;
 * - test whether it is installed or outdated;
 * - install, uninstall and update it.
 *
 * The user code should access extensions and listen to their changes with the extension manager.
 */
export class Extension extends protocol.Extension {

    protected readonly onDidChangedEmitter = new Emitter<ExtensionChange>();

    constructor(extension: protocol.Extension,
                protected readonly server: protocol.ExtensionServer,
                protected readonly manager: ExtensionManager) {
        super();
        Object.assign(this, extension);
        manager.onDidChange(change => {
            if (change.name === this.name) {
                Object.assign(this, change);
                this.onDidChangedEmitter.fire(change);
            }
        });
    }

    get onDidChange(): Event<ExtensionChange> {
        return this.onDidChangedEmitter.event;
    }

    /**
     * Resolve the detailed information.
     *
     * Resolving can be used to refresh an already resolved extension.
     */
    resolve(): Promise<ResolvedExtension> {
        return this.server.resolve(this.name).then(resolved =>
            Object.assign(this, resolved)
        );
    }

    /**
     * Intall the latest version of this extension.
     */
    install(): void {
        this.server.install(this.name);
    }

    /**
     * Uninstall the extension.
     */
    uninstall(): void {
        this.server.uninstall(this.name);
    }

    /**
     * Update the extension to the latest version.
     */
    update(): void {
        this.server.update(this.name);
    }

}

/**
 * The resolved extension allows to access its detailed information.
 */
export type ResolvedExtension = Extension & protocol.ResolvedExtension;

/**
 * The extension manager allows to:
 * - access installed extensions;
 * - look up extensions from the repository;
 * - listen to changes of:
 *   - installed extension;
 *   - and the installation process.

 */
@injectable()
export class ExtensionManager implements Disposable {

    protected readonly onChangedEmitter = new Emitter<protocol.ExtensionChange>();
    protected readonly onWillStartInstallationEmitter = new Emitter<void>();
    protected readonly onDidStopInstallationEmitter = new Emitter<protocol.DidStopInstallationParam>();
    protected readonly toDispose = new DisposableCollection();

    constructor(@inject(protocol.ExtensionServer) protected readonly server: protocol.ExtensionServer) {
        this.toDispose.push(server);
        this.toDispose.push(this.onChangedEmitter);
        this.toDispose.push(this.onWillStartInstallationEmitter);
        this.toDispose.push(this.onDidStopInstallationEmitter);
        this.server.setClient({
            onDidChange: change => this.fireDidChange(change),
            onWillStartInstallation: () => this.fireWillStartInstallation(),
            onDidStopInstallation: params => this.fireDidStopInstallation(params),
        });
    }

    dispose() {
        this.toDispose.dispose();
    }

    /**
     * List installed extensions if the given query is undefined or empty.
     * Otherwise look up extensions from the repository matching the given query
     * taking into the account installed extensions.
     */
    list(param?: protocol.SearchParam): Promise<Extension[]> {
        return this.server.list(param).then(extensions =>
            extensions.map(extension =>
                new Extension(extension, this.server, this)
            )
        );
    }

    /**
     * Notify when extensions are installed, uninsalled or updated.
     */
    get onDidChange(): Event<protocol.ExtensionChange> {
        return this.onChangedEmitter.event;
    }

    protected fireDidChange(change: protocol.ExtensionChange): void {
        this.onChangedEmitter.fire(change);
    }

    /**
     * Notiy when the installation process is going to be started.
     */
    get onWillStartInstallation(): Event<void> {
        return this.onWillStartInstallationEmitter.event;
    }

    protected fireWillStartInstallation(): void {
        this.onWillStartInstallationEmitter.fire(undefined);
    }

    /**
     * Notiy when the installation process has been finished.
     */
    get onDidStopInstallation(): Event<protocol.DidStopInstallationParam> {
        return this.onDidStopInstallationEmitter.event;
    }

    protected fireDidStopInstallation(params: protocol.DidStopInstallationParam): void {
        this.onDidStopInstallationEmitter.fire(params);
    }


}