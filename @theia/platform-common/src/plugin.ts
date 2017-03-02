import {ContainerModule, Container} from "inversify";

/**
 * A plugin contributes services to the shared injection container
 */
export interface Plugin {

    /**
     * The container module for this plugin
     */
    getContainerModule() : ContainerModule;

    /**
     * optional life cycle hook, called after the container is ready
     *
     * @param container
     */
    start? : (container:Container)=>void;

}

/**
 * Plugin registry
 */
export class PluginRegistry {

    constructor(readonly plugins : Plugin[]) {
    }

    protected createContainer() : Container {
        const container = new Container();
        for (let plugin of this.plugins) {
            container.load(plugin.getContainerModule());
        }
        return container;
    }

    public start<T>(identifier: symbol) : T {
        const container = this.createContainer();
        for (let plugin of this.plugins) {
            if (plugin.start) {
                plugin.start(container);
            }
        }
        return container.get<T>(identifier) as T;
    }

}