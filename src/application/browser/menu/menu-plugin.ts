
import { TheiaPlugin, TheiaApplication } from "../application";
import { MenuBar as MenuBarWidget, Menu as MenuWidget, Widget } from "@phosphor/widgets";
import { CommandRegistry as PhosphorCommandRegistry } from "@phosphor/commands";
import { CommandRegistry } from "../../common/command";
import { KeybindingRegistry } from "../../common/keybinding";
import { injectable, inject } from "inversify";
import { ActionMenuNode, CompositeMenuNode, MenuModelRegistry, MAIN_MENU_BAR } from '../../common/menu';

@injectable()
export class MainMenuFactory {

    constructor(
        @inject(CommandRegistry) protected commandRegistry: CommandRegistry,
        @inject(KeybindingRegistry) protected keybindingRegistry: KeybindingRegistry,
        @inject(MenuModelRegistry) protected menuProvider: MenuModelRegistry
    ) {
    }

    createMenuBar(): MenuBarWidget {
        const menuBar = new MenuBarWidget();
        menuBar.id = 'theia:menubar';
        const menuModel = this.menuProvider.getMenu(MAIN_MENU_BAR);
        const phosphorCommands = this.createPhosporCommands(menuModel);
        for (let menu of menuModel.childrens) {
            if (menu instanceof CompositeMenuNode) {
                const menuWidget = this.createMenuWidget(menu, phosphorCommands);
                menuBar.addMenu(menuWidget);
            }
        }
        return menuBar;
    }

    createContextMenu(path: string): MenuWidget {
        const menuModel = this.menuProvider.getMenu(path);
        const phosphorCommands = this.createPhosporCommands(menuModel);

        const contextMenu = new MenuWidget({
            commands: phosphorCommands
        });

        for (let menu of menuModel.childrens) {
            if (menu instanceof CompositeMenuNode) {
                if (menu.label) {
                    contextMenu.addItem({
                        type: 'submenu',
                        submenu: this.createMenuWidget(menu, phosphorCommands)
                    });
                } else if (menu.childrens.length > 0) {
                    if (contextMenu.items.length > 0) {
                        contextMenu.addItem({
                            type: 'separator'
                        });
                    }
                    this.fillSubMenus(contextMenu, menu, phosphorCommands);
                }
            } else if (menu instanceof ActionMenuNode) {
                contextMenu.addItem({
                    command: menu.action.commandId,
                    type: 'command'
                });
            }
        }
        return contextMenu;
    }

    private createPhosporCommands(menu: CompositeMenuNode): PhosphorCommandRegistry {
        const commands = new PhosphorCommandRegistry();
        const commandRegistry = this.commandRegistry;
        const keybindingRegistry = this.keybindingRegistry;
        function initCommands(current: CompositeMenuNode): void {
            for (let menu of current.childrens) {
                if (menu instanceof ActionMenuNode) {
                    const command = commandRegistry.getCommand(menu.action.commandId);
                    if (command) {
                        let handler = commandRegistry.getActiveHandler(command.id) || {
                            execute: () => { },
                            isEnabled: () => { return false; },
                            isVisible: () => { return true; }
                        };

                        handler = handler!;
                        commands.addCommand(command.id, {
                            execute: (e: any) => handler.execute(),
                            label: menu.label,
                            icon: command.iconClass,
                            isEnabled: (e: any) => !handler.isEnabled || handler.isEnabled(),
                            isVisible: (e: any) => !handler.isVisible || handler.isVisible()
                        });

                        const binding = keybindingRegistry.getKeybindingForCommand(command.id);
                        if (binding) {
                            const keys = binding.accelerator || [];
                            commands.addKeyBinding({
                                command: command.id,
                                keys,
                                selector: '.p-Widget' // We have the Phosphor.JS dependency anyway.
                            });
                        }
                    }
                } else if (menu instanceof CompositeMenuNode) {
                    initCommands(menu);
                }
            }
        }
        initCommands(menu);
        return commands;
    }

    private createMenuWidget(menu: CompositeMenuNode, commands: PhosphorCommandRegistry): MenuWidget {
        const result = new MenuWidget({
            commands
        });
        if (menu.label) {
            result.title.label = menu.label;
        }
        this.fillSubMenus(result, menu, commands);
        return result;
    }

    private fillSubMenus(parent: MenuWidget, menu: CompositeMenuNode, commands: PhosphorCommandRegistry): void {
        for (let item of menu.childrens) {
            if (item instanceof CompositeMenuNode) {
                if (item.label) {
                    parent.addItem({
                        submenu: this.createMenuWidget(item, commands)
                    });
                } else {
                    if (item.childrens.length > 0) {
                        if (parent.items.length > 0) {
                            parent.addItem({
                                type: 'separator'
                            });
                        }
                        this.fillSubMenus(parent, item, commands);
                    }
                }
            } else if (item instanceof ActionMenuNode) {
                parent.addItem({
                    command: item.action.commandId,
                    type: 'command'
                });
            }
        }
    }

}

@injectable()
export class BrowserMenuBarContribution implements TheiaPlugin {

    constructor( @inject(MainMenuFactory) private factory: MainMenuFactory) {
    }

    onStart(app: TheiaApplication): void {
        app.shell.addToTopArea(this.getLogo());
        const menu = this.factory.createMenuBar();
        app.shell.addToTopArea(menu);
    }

    private getLogo(): Widget {
        const logo = new Widget();
        logo.id = 'theia:icon';
        logo.addClass('theia-icon');
        return logo;
    }
}
