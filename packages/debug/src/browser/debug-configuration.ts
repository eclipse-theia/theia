/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from "inversify";
import { FileSystem, FileStat } from "@theia/filesystem/lib/common";
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Deferred } from "@theia/core/lib/common/promise-util";
import URI from "@theia/core/lib/common/uri";
import { EditorManager, EditorWidget } from "@theia/editor/lib/browser";
import { QuickOpenService, QuickOpenItem, QuickOpenMode } from "@theia/core/lib/browser";
import { DebugService, DebugConfiguration } from "../common/debug-model";

@injectable()
export class DebugConfigurationManager {
    private static readonly CONFIG = ".theia/launch.json";

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(DebugService)
    protected readonly debug: DebugService;
    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    /**
     * Opens configuration file in the editor.
     */
    openConfigurationFile(): Promise<EditorWidget> {
        return this.resolveConfigurationFile().then(configFile => this.editorManager.open(new URI(configFile.uri)));
    }

    /**
     * Adds a new configuration to the configuration file.
     */
    addConfiguration(): Promise<void> {
        return this.provideDebugTypes()
            .then(debugType => this.provideDebugConfigurations(debugType))
            .then(newDebugConfiguration => this.readConfigurations().then(configurations => configurations.concat(newDebugConfiguration)))
            .then(configurations => this.writeConfigurations(configurations))
            .then(() => this.openConfigurationFile())
            .then(() => { });
    }

    /**
     * Selects the debug configuration to start debug adapter.
     */
    selectConfiguration(): Promise<DebugConfiguration> {
        const result = new Deferred<DebugConfiguration>();

        return this.readConfigurations()
            .then(configurations => {
                if (configurations.length !== 0) {
                    const items = configurations.map(configuration => this.toQuickOpenItem(configuration.type + " : " + configuration.name, result, configuration));
                    return Promise.resolve(items);
                }
                return Promise.reject("There are no provided debug configurations.");
            })
            .then(items => this.doOpen(items))
            .then(() => result.promise);
    }

    readConfigurations(): Promise<DebugConfiguration[]> {
        return this.resolveConfigurationFile()
            .then(configFile => this.fileSystem.resolveContent(configFile.uri))
            .then(({ stat, content }) => {
                if (content.length === 0) {
                    return [];
                }

                try {
                    return JSON.parse(content);
                } catch (error) {
                    return Promise.reject("Configuration file bad format.");
                }
            });
    }

    writeConfigurations(configurations: DebugConfiguration[]): Promise<void> {
        return this.resolveConfigurationFile()
            .then(configFile => {
                const jsonPretty = JSON.stringify(configurations, (key: string, value: any) => value, 2);
                return this.fileSystem.setContent(configFile, jsonPretty);
            })
            .then(() => { });
    }

    /**
     * Creates and returns configuration file.
     * @returns [configuration file](#FileStat).
     */
    resolveConfigurationFile(): Promise<FileStat> {
        return this.workspaceService.root.then(root => {
            if (root) {
                const uri = root.uri + "/" + DebugConfigurationManager.CONFIG;
                return this.fileSystem.exists(uri).then((exists) => {
                    return { exists, uri };
                });
            }
            return Promise.reject("Workspace is not opened yet.");
        }).then(({ exists, uri }) => {
            if (exists) {
                return this.fileSystem.getFileStat(uri);
            } else {
                return this.fileSystem.createFile(uri, { encoding: "utf8" });
            }
        }).then(configFile => {
            if (configFile) {
                return Promise.resolve(configFile);
            }
            return Promise.reject(`Configuration file '${DebugConfigurationManager.CONFIG}' not found.`);
        });
    }

    private provideDebugTypes(): Promise<string> {
        const result = new Deferred<string>();

        return this.debug.debugTypes()
            .then(debugTypes => {
                if (debugTypes.length !== 0) {
                    const items = debugTypes.map(debugType => this.toQuickOpenItem(debugType, result, debugType));
                    return Promise.resolve(items);
                }
                return Promise.reject("There are no registered debug adapters.");
            })
            .then(items => this.doOpen(items))
            .then(() => result.promise);
    }

    private provideDebugConfigurations(debugType: string): Promise<DebugConfiguration> {
        const result = new Deferred<DebugConfiguration>();

        return this.debug.provideDebugConfigurations(debugType)
            .then(configurations => {
                if (configurations) {
                    const items = configurations.map(configuration => this.toQuickOpenItem(configuration.name, result, configuration));
                    return Promise.resolve(items);
                }
                return Promise.reject(`There are no provided debug configurations for ${debugType}`);
            })
            .then(items => this.doOpen(items))
            .then(() => result.promise);
    }

    private toQuickOpenItem<T>(label: string, result: Deferred<T>, value: T): QuickOpenItem {
        return new QuickOpenItem({
            label: label,
            run(mode: QuickOpenMode): boolean {
                if (mode === QuickOpenMode.OPEN) {
                    result.resolve(value);
                    return true;
                }
                return false;
            }
        });
    }

    private doOpen(items: QuickOpenItem[]): void {
        this.quickOpenService.open({
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                acceptor(items);
            }
        });
    }
}
