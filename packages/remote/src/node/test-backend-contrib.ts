
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DependencyDownloadService } from '@theia/core/lib/node/dependency-download';

@injectable()
export class TestBackendContrib implements BackendApplicationContribution {

    @inject(DependencyDownloadService) service: DependencyDownloadService;

    onStart(): void {
        this.service.downloadDependencies(`${process.platform}-${process.arch}`);
    }
}
