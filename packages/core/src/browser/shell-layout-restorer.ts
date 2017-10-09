/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { FrontendApplication, FrontendApplicationContribution } from './frontend-application';
import { WidgetManager, WidgetConstructionOptions } from './widget-manager';
import { StorageService } from './storage-service';
import { LayoutData } from './shell';
import { Widget } from '@phosphor/widgets';
import { ILogger } from '../common/logger';

@injectable()
export class ShellLayoutRestorer implements FrontendApplicationContribution {
    private storageKey = 'layout';

    constructor(
        @inject(WidgetManager) protected widgetManager: WidgetManager,
        @inject(ILogger) protected logger: ILogger,
        @inject(StorageService) protected storageService: StorageService) { }

    onStart(app: FrontendApplication): void {
        this.storageService.getData<string>(this.storageKey).then(serializedLayoutData => {
            let promise = Promise.resolve<void>(undefined);
            if (serializedLayoutData !== undefined) {
                promise = this.inflate(serializedLayoutData).then(layoutData => {
                    app.shell.setLayoutData(layoutData);
                });
            }
        });
    }

    onStop(app: FrontendApplication): void {
        try {
            const layoutData = app.shell.getLayoutData();
            this.storageService.setData(this.storageKey, this.deflate(layoutData));
        } catch (error) {
            this.storageService.setData(this.storageKey, undefined);
            this.logger.error(`Error during serialization of layout data: ${error}`);
        }
    }

    protected isWidgetsProperty(property: string) {
        return property.toLowerCase().endsWith('widgets');
    }

    /**
     * Turns the layout data to a string representation.
     */
    protected deflate(data: LayoutData): string {
        return JSON.stringify(data, (property: string, value) => {
            if (this.isWidgetsProperty(property)) {
                const result: WidgetConstructionOptions[] = [];
                for (const widget of (value as Widget[])) {
                    const desc = this.widgetManager.getDescription(widget);
                    if (desc) {
                        result.push(desc);
                    }
                }
                return result;
            }
            return value;
        });
    }

    /**
     * Creates the layout data from its string representation.
     */
    protected inflate(layoutData: string): Promise<LayoutData> {
        const pending: Promise<void>[] = [];
        const result = JSON.parse(layoutData, (property: string, value) => {
            if (this.isWidgetsProperty(property)) {
                const widgets: Widget[] = [];
                for (const desc of (value as WidgetConstructionOptions[])) {
                    const promise = this.widgetManager.getOrCreateWidget(desc.factoryId, desc.options)
                        .then(widget => {
                            if (widget) {
                                widgets.push(widget);
                            }
                        }).catch(err => {
                            this.logger.warn(`Couldn't restore widget for ${desc}. Error : ${err} `);
                        });
                    pending.push(promise);
                }
                return widgets;
            }
            return value;
        });
        return Promise.all(pending).then(() => result);
    }

}
