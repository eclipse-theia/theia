
import { TheiaPlugin, TheiaApplication } from "../application";
import { MenuBar as MenuBarWidget, Menu as MenuWidget, Widget } from "@phosphor/widgets";
import { CommandRegistry as PhosphorCommandRegistry} from "@phosphor/commands";
import { CommandRegistry } from "../../common/command";
import { injectable, inject } from "inversify";
import { MenuBarModelProvider, Menu, MenuItem, isMenu } from "../../common/menu";


@injectable()
export class MainMenuFactory {
    private commands: PhosphorCommandRegistry;

    constructor( 
        @inject(CommandRegistry) protected commandRegistry: CommandRegistry,
        @inject(MenuBarModelProvider) protected menuProvider: MenuBarModelProvider
    ) { 
        this.commands = new PhosphorCommandRegistry();
        for (let command of commandRegistry.getCommands()) {
            this.commands.addCommand(command.id, {
                execute : (e)=>command.execute(e),
                label : (e)=>command.label(e),
                icon : (e)=>command.iconClass(e),
                isEnabled : (e)=>command.isEnabled(e),
                isVisible : (e)=>command.isVisible(e)
            })
        }
    }

    createMenuBar() : MenuBarWidget {
        const menuBar = new MenuBarWidget();
        menuBar.id = 'theia:menubar';
        for (let menu of this.menuProvider.menuBar.menus) {
            const menuWidget = this.createMenuWidget(menu);
            menuBar.addMenu(menuWidget);
        }
        return menuBar;
    }

    private createMenuWidget(menu: Menu): MenuWidget {
        const result = new MenuWidget({
            commands: this.commands
        });
        result.title.label = menu.label;
        for (let item of menu.items) {
            result.addItem(
                this.createItem(item)
            );
        }
        return result;
    }

    private createItem(item: MenuItem): MenuWidget.IItemOptions {
        if (item.command) {
            return {
                command: item.command,
                type : 'command'
            }
        }
        if (item.separator) {
            return {
                type : 'separator'
            }
        }
        if (isMenu(item)) {
            return {
                submenu : this.createMenuWidget(item)
            }
        }
        throw new Error(`Unexpected item ${JSON.stringify(item)}`);
    }

}

@injectable()
export class MenuContribution implements TheiaPlugin {

    constructor(@inject(MainMenuFactory) private factory: MainMenuFactory) {
    }

    onStart(app: TheiaApplication): void {
        app.shell.addToTopArea(this.getLogo());
        const menu = this.factory.createMenuBar();
        app.shell.addToTopArea(menu);
    }
    
    private getLogo() : Widget {
        const logo = new Widget();
        logo.id = 'theia:icon';
        logo.addClass('theia-icon');
        return logo;
    }
}