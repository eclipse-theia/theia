import { injectable, inject } from "inversify";
import { CommandRegistry } from "../../common/command";
import { CommandRegistry as PhosphorCommandRegistry } from "@phosphor/commands";
import * as electron from 'electron';
import { Command } from "../../common/command";
import { TheiaPlugin, TheiaApplication } from "../../browser/application";
import { MenuBarModelProvider, isMenu, MenuItem } from "../../common/menu";

export function isOSX() {
  return typeof process !== 'undefined' && typeof process.platform !== 'undefined' && process.platform === 'darwin';
}

@injectable()
export class MainMenuFactory {

  private commands: PhosphorCommandRegistry;

  constructor(
    @inject(CommandRegistry) private commandRegistry: CommandRegistry,
    @inject(MenuBarModelProvider) private menuProvider: MenuBarModelProvider) {

    this.commands = new PhosphorCommandRegistry();
  }

  createMenuBar(): Electron.Menu {
    this.commandRegistry.getCommands().forEach(command => this.register(command));
    const template = this.createMenuTemplate();
    if (isOSX()) {
      template.unshift(this.createOSXMenu());
    }
    return electron.remote.Menu.buildFromTemplate(template);
  }

  private createMenuTemplate(): Electron.MenuItemOptions[] {
    return this.menuProvider.menuBar.menus.map(menu => this.transform(menu));
  }

  private transform(menu: MenuItem): Electron.MenuItemOptions {
    if (menu.separator) {
      return {
        type: 'separator'
      };
    } else if (menu.command && this.commands.hasCommand(menu.command)) {
      const command = menu.command;
      const label = this.commands.label(command);
      return {
        label,
        click: () => this.commands.execute(command)
      };
    } else if (isMenu(menu)) {
      const submenu = menu.items.map(menu => this.transform(menu));
      return {
        label: menu.label,
        submenu
      };
    } else {
      throw new Error(`Unexpecte item: ${JSON.stringify(menu)}.`);
    }
  }

  private createOSXMenu(): Electron.MenuItemOptions {
    return {
      label: 'Theia',
      submenu: [
        {
          role: 'about'
        },
        {
          type: 'separator'
        },
        {
          role: 'services',
          submenu: []
        },
        {
          type: 'separator'
        },
        {
          role: 'hide'
        },
        {
          role: 'hideothers'
        },
        {
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          role: 'quit'
        }
      ]
    };
  }

  private register(command: Command): void {
    this.commands.addCommand(command.id, {
      execute: e => command.execute(e),
      label: e => command.label(e),
      icon: e => command.iconClass(e),
      isEnabled: e => command.isEnabled(e),
      isVisible: e => command.isVisible(e)
    });
  }

}

@injectable()
export class MenuContribution implements TheiaPlugin {

  constructor( @inject(MainMenuFactory) private factory: MainMenuFactory) {
  }

  onStart(app: TheiaApplication): void {
    const itr = app.shell.children();
    let child = itr.next();
    while (child) {
      if (child.id === 'theia-top-panel') {
        child.setHidden(true);
        child = undefined;
      } else {
        child = itr.next();
      }
    }
    electron.remote.Menu.setApplicationMenu(this.factory.createMenuBar());
  }

}
