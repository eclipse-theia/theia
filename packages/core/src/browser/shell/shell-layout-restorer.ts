/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Widget } from '@phosphor/widgets';
import { FrontendApplication, FrontendApplicationContribution } from '../frontend-application';
import { WidgetManager, WidgetConstructionOptions } from '../widget-manager';
import { StorageService } from '../storage-service';
import { ILogger } from '../../common/logger';
import { CommandContribution, CommandRegistry } from '../../common/command';
import { ApplicationShell } from './application-shell';

/**
 * A contract for widgets that want to store and restore their inner state, between sessions.
 */
export interface StatefulWidget {

    /**
     * Called on unload to store the inner state.
     */
    storeState(): object;

    /**
     * Called when the widget got created by the storage service
     */
    restoreState(oldState: object): void;
}

export namespace StatefulWidget {
    // tslint:disable-next-line:no-any
    export function is(arg: any): arg is StatefulWidget {
        return arg !== undefined && typeof arg["storeState"] === 'function' && typeof arg["restoreState"] === 'function';
    }
}

interface WidgetDescription {
    constructionOptions: WidgetConstructionOptions,
    innerWidgetState?: object
}

@injectable()
export class ShellLayoutRestorer implements CommandContribution {
    private storageKey = 'layout';
    private shouldStoreLayout: boolean = true;

    constructor(
        @inject(WidgetManager) protected widgetManager: WidgetManager,
        @inject(ILogger) protected logger: ILogger,
        @inject(StorageService) protected storageService: StorageService) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({
            id: 'reset.layout',
            label: 'Reset Workbench Layout'
        }, {
                execute: () => {
                    this.shouldStoreLayout = false;
                    this.storageService.setData(this.storageKey, undefined)
                        .then(() => window.location.reload(true));
                }
            });
    }

    async initializeLayout(app: FrontendApplication, contributions: FrontendApplicationContribution[]): Promise<void> {
        try {
            // Try to restore the shell layout from the storage service
            const serializedLayoutData = await this.storageService.getData<string>(this.storageKey);
            if (serializedLayoutData !== undefined) {
                const layoutData = await this.inflate(serializedLayoutData);
                app.shell.setLayoutData(layoutData);
                await app.shell.pendingUpdates;
                return;
            }
        } catch (e) {
            this.logger.debug(e);
        }

        // Fallback: Let the frontend application contributions initialize the layout
        for (const initializer of contributions) {
            if (initializer.initializeLayout) {
                await initializer.initializeLayout(app);
            }
        }
        await app.shell.pendingUpdates;
    }

    storeLayout(app: FrontendApplication): void {
        if (this.shouldStoreLayout) {
            try {
                const layoutData = app.shell.getLayoutData();
                const serializedLayoutData = this.deflate(layoutData);
                this.storageService.setData(this.storageKey, serializedLayoutData);
            } catch (error) {
                this.storageService.setData(this.storageKey, undefined);
                this.logger.error(`Error during serialization of layout data: ${error}`);
            }
        }
    }

    protected isWidgetProperty(propertyName: string) {
        return propertyName === 'widget';
    }

    protected isWidgetsProperty(propertyName: string) {
        return propertyName === 'widgets';
    }

    /**
     * Turns the layout data to a string representation.
     */
    protected deflate(data: ApplicationShell.LayoutData): string {
        return JSON.stringify(data, (property: string, value) => {
            if (this.isWidgetProperty(property)) {
                const description = this.convertToDescription(value as Widget);
                if (description) {
                    return description;
                }
            } else if (this.isWidgetsProperty(property)) {
                const descriptions: WidgetDescription[] = [];
                for (const widget of (value as Widget[])) {
                    const description = this.convertToDescription(widget);
                    if (description) {
                        descriptions.push(description);
                    }
                }
                return descriptions;
            }
            return value;
        });
    }

    private convertToDescription(widget: Widget): WidgetDescription | undefined {
        const desc = this.widgetManager.getDescription(widget);
        if (desc) {
            let innerState = undefined;
            if (StatefulWidget.is(widget)) {
                innerState = widget.storeState();
            }
            return {
                constructionOptions: desc,
                innerWidgetState: innerState
            };
        }
    }

    /**
     * Creates the layout data from its string representation.
     */
    protected inflate(layoutData: string): Promise<ApplicationShell.LayoutData> {
        const pending: Promise<Widget | undefined>[] = [];
        const result = JSON.parse(layoutData, (property: string, value) => {
            if (this.isWidgetsProperty(property)) {
                const widgets: (Widget | undefined)[] = [];
                const descs = (value as WidgetDescription[]);
                for (let i = 0; i < descs.length; i++) {
                    const promise = this.convertToWidget(descs[i]);
                    pending.push(promise.then(widget => {
                        widgets[i] = widget;
                        return widget;
                    }));
                }
                return widgets;
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                const copy: any = {};
                for (const p in value) {
                    if (this.isWidgetProperty(p)) {
                        const promise = this.convertToWidget(value[p]);
                        pending.push(promise.then(widget => {
                            copy[p] = widget;
                            return widget;
                        }));
                    } else {
                        copy[p] = value[p];
                    }
                }
                return copy;
            }
            return value;
        });
        return Promise.all(pending).then(() => result);
    }

    private convertToWidget(desc: WidgetDescription): Promise<Widget | undefined> {
        if (desc.constructionOptions) {
            return this.widgetManager.getOrCreateWidget(desc.constructionOptions.factoryId, desc.constructionOptions.options)
                .then(widget => {
                    if (StatefulWidget.is(widget) && desc.innerWidgetState !== undefined) {
                        try {
                            widget.restoreState(desc.innerWidgetState);
                        } catch (err) {
                            this.logger.warn(`Couldn't restore widget state for ${widget.id}. Error: ${err} `);
                        }
                    }
                    return widget;
                }, err => {
                    this.logger.warn(`Couldn't restore widget for ${desc.constructionOptions.factoryId}. Error: ${err} `);
                    return undefined;
                });
        } else {
            return Promise.resolve(undefined);
        }
    }

}
