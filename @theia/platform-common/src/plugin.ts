import {ContainerModule, Container} from "inversify";

/**
 * A plugin contributes services to the shared injection container
 */
export interface Plugin {

    /**
     * The container module for this plugin
     */
    readonly containerModule : ContainerModule;

}

/**
 * Plugin registry
 */
export class PluginRegistry {

    constructor(readonly plugins : Plugin[]) {
    }

    createContainer() : Container {
        const container = new Container();
        for (let plugin of this.plugins) {
            container.load(plugin.containerModule);
        }
        return container;
    }

}