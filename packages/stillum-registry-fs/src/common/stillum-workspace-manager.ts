/**
 * Shared interface for the Stillum workspace materializer.
 * The frontend calls this via JSON-RPC to ask the backend (Node.js)
 * to write all project files to a real directory on disk.
 */

export const STILLUM_WORKSPACE_MANAGER_PATH = '/services/stillum-workspace-manager';

export const StillumWorkspaceManager = Symbol('StillumWorkspaceManager');

/**
 * Describes a component's files to be written into its own subfolder.
 * e.g., src/components/droplets/Button/Button.tsx
 */
export interface ComponentFiles {
    /** UUID of the component artifact */
    artifactId: string;
    /** Component title (used as folder name) */
    title: string;
    /** Component area: "droplets" | "pools" | "triggers" | "types" */
    area: string;
    /**
     * Files to write into the component folder.
     * Keys are filenames relative to the component folder (e.g., "Button.tsx", "Button.test.tsx"),
     * values are file contents.
     */
    files: Record<string, string>;
}

export interface WorkspaceMaterializeRequest {
    /** UUID of the module artifact */
    moduleId: string;
    /** Human-readable module title (used for directory naming) */
    moduleTitle: string;
    /**
     * Build snapshot files — the resolved project configuration files.
     * Keys are relative paths (e.g., "package.json", "src/App.tsx"),
     * values are file contents.
     */
    snapshotFiles: Record<string, string>;
    /**
     * Module's own source code (written to src/index.tsx).
     */
    moduleSourceCode?: string;
    /**
     * Component source files, each with their own subfolder.
     */
    components: ComponentFiles[];
}

export interface WorkspaceMaterializeResult {
    /** Absolute filesystem path (e.g., /tmp/stillum-workspaces/<moduleId>) */
    workspacePath: string;
}

export interface StillumWorkspaceManager {
    /**
     * Write all project files to a real directory on disk.
     * If the directory already exists, it is updated in-place (existing files overwritten).
     */
    materialize(request: WorkspaceMaterializeRequest): Promise<WorkspaceMaterializeResult>;

    /** Remove the materialized workspace directory. */
    cleanup(moduleId: string): Promise<void>;
}
