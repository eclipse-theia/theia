/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { QuickOpenService, QuickOpenItem, QuickOpenModel, QuickOpenMode } from "@theia/core/lib/browser";
import { PluginServer } from "../../common";
import { Command } from "@theia/core";
import { HostedPluginSupport } from "../../hosted/browser/hosted-plugin";
import { PluginWidget } from "./plugin-ext-widget";

@injectable()
export class PluginExtDeployCommandService implements QuickOpenModel {

    private items: QuickOpenItem[];

    public static COMMAND: Command = {
        id: 'plugin-ext:deploy-plugin-id',
        label: 'Plugin: Deploy a plugin\'s id'
    };

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(HostedPluginSupport)
    protected readonly hostedPluginSupport: HostedPluginSupport;

    @inject(PluginWidget)
    protected readonly pluginWidget: PluginWidget;

    constructor() {
        this.items = [];
    }

    /**
     * Whether the dialog is currently open.
     */
    protected isOpen: boolean = false;

    deploy(): void {
        const placeholderText = "Plugin's id to deploy.";

        this.isOpen = true;

        this.quickOpenService.open(this, {
            placeholder: placeholderText,
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true,
            onClose: () => {
                this.isOpen = false;
            },
        });
    }

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        this.items = [];
        if (lookFor || lookFor.length > 0) {
            this.items.push(new DeployQuickOpenItem(lookFor, this.pluginServer, this.hostedPluginSupport, this.pluginWidget, 'Deploy this plugin'));
        }
        acceptor(this.items);
    }

}

export class DeployQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly name: string,
        protected readonly pluginServer: PluginServer,
        protected readonly hostedPluginSupport: HostedPluginSupport,
        protected readonly pluginWidget: PluginWidget,
        protected readonly description?: string,
    ) {
        super();
    }

    getLabel(): string {
        return this.name;
    }

    getDetail(): string {
        return this.description || '';
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        const promise = this.pluginServer.deploy(this.name);
        promise.then(() => {
            this.hostedPluginSupport.initPlugins();
            this.pluginWidget.refreshPlugins();
        });
        return true;
    }

}
