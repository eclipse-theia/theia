import "webdriverio";
import { TheiaLayoutMain } from "../../theiaLayout/theiaLayoutMain"

export class TopPanelPO extends TheiaLayoutMain {

    protected driver: WebdriverIO.Client<any>;
    public constructor() {
        super();
    }

    /*
    * Test on File menu
    */

    clickOnFileMenu() {
        this.driver.click('ul.p-MenuBar-content > .p-MenuBar-item:nth-child(1)');
        return this.driver.isExisting('.p-MenuBar-item');
    }

    displaysFileSubmenu() {
        this.loadTopPanel();
        this.clickOnFileMenu();
        return this.driver.isExisting('.p-Menu-content');
    }

    /*
     * New Terminal
     */
    openNewTerminal() {
        if (!this.driver.isExisting('.p-Menu-content')) {
            this.clickOnFileMenu();
        }
        this.driver.click('li.p-Menu-item:nth-child(4)');
        return this.driver.isExisting('#xterm-cursor-layer');
    }

    closeNewTerminal() {
        if (this.driver.isExisting('.p-TabBar-content')) {
            this.driver.click('li.p-TabBar-tab.p-mod-closable > .p-TabBar-tabCloseIcon');
        }
        return this.driver.isExisting('#xterm-cursor-layer');
    }

    /*
     * Open... 
     */

    clickOnOpen() {
        if (!this.driver.isExisting('.p-Menu-content')) {
            this.clickOnFileMenu();
        }
        this.driver.click('li.p-Menu-item:nth-child(5)');
        this.driver.waitForExist('.dialogTitle')
        return this.driver.isExisting('.dialogContent');
    }

    /*
    * View
    */
    clickOnViewMenu() {
        this.driver.click('ul.p-MenuBar-content > .p-MenuBar-item:nth-child(4)');
        this.driver.isExisting('.p-MenuBar-item');
    }

    displayViewSubmenu() {
        this.loadTopPanel();
        this.clickOnViewMenu();
        return this.driver.isExisting('.p-Menu-content');
    }

    openProblemsView() {
        this.displayViewSubmenu();
        this.driver.click('li.p-Menu-item:nth-child(1)');
        this.driver.waitForExist('ul.p-TabBar-content');
        return (this.driver.getText('ul.p-TabBar-content > li.p-TabBar-tab.theia-mod-current.p-mod-closable.p-mod-current').indexOf('Problems') >= 0);
    }
}