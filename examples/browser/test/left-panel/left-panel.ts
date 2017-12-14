import "webdriverio";

export class LeftPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    doesTabExist(tabName: string): boolean {
        return this.driver.element(`.p-Widget.p-TabBar.theia-SideBar.theia-mod-left .p-TabBar-content`).isExisting(`div\=${tabName}`);
    }

    isTabActive(tabName: string): boolean {
        const tab = this.driver.element(`.p-Widget.p-TabBar.theia-SideBar.theia-mod-left .p-TabBar-content`).element(`div\=${tabName}`);
        /* Check if the parent li container has the p-mod-current class which makes it active*/
        return (tab.$(`..`).getAttribute('class').split(' ').indexOf('p-mod-current') > -1);
    }

    openCloseTab(tabName: string) {
        this.driver.element(`.p-Widget.p-TabBar.theia-SideBar.theia-mod-left .p-TabBar-content`).click(`div\=${tabName}`);
    }

    isFileTreeVisible(): boolean {
        return (this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1)
    }

    isGitContainerVisible(): boolean {
        return (this.driver.element('#theia-gitContainer').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1)
    }

    isExtensionTabVisible(): boolean {
        return (this.driver.element('#extensions').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1)

    }
}
