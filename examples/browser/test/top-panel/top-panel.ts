import "webdriverio";

export class TopPanel {

    public constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    exists(): boolean {
        return this.driver.isExisting('div#theia-top-panel');
    }

    openNewTerminal() {
        this.clickMenuTab('File');
        this.clickSubMenu('New Terminal');
    }

    waitForTerminal() {
        this.driver.waitForExist('.p-Widget div.terminal.xterm');
    }

    openProblemsView() {
        this.clickMenuTab('View');
        this.clickSubMenu('Open Problems View');
    }

    waitForProblemsView() {
        this.driver.waitForExist('.p-Widget div.theia-marker-container');
    }

    isSubMenuVisible(): boolean {
        return this.driver.isExisting('div.p-Widget.p-Menu.p-MenuBar-menu');
    }

    clickMenuTab(tab: number | string) {
        if (typeof tab === "string") {
            this.driver.element(`ul.p-MenuBar-content`).click(`div\=${tab}`);
        } else {
            this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tab})`);
        }
    }

    clickSubMenu(subMenuItem: string) {
        this.driver.element(`div.p-Widget.p-Menu.p-MenuBar-menu .p-Menu-content`).click(`div\=${subMenuItem}`);
    }

    hoverMenuTab(tabNumber: number) {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    isTabActive(tabNumber: number): boolean {
        return this.driver.isExisting(`ul.p-MenuBar-content > .p-mod-active.p-MenuBar-item:nth-child(${tabNumber}`);
    }

    isMenuActive(): boolean {
        return this.driver.isExisting(`#theia\\:menubar.p-mod-active`);
    }

    getxBarTabPosition(tabNumber: number) {
        return this.driver.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber}`, 'x');
    }

    getxSubMenuPosition(): number {
        return this.driver.getLocation(`div.p-Widget.p-Menu.p-MenuBar-menu`, 'x');
    }
}
