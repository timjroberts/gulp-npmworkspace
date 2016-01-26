"use strict";

import {WorkspacePackage} from "./WorkspacePackage";

/**
 * A function that can be applied to a workspace package.
 *
 * @param workspacePackage The [[WorkspacePackage]] that will have the action
 * applied to it.
 */
export type WorkspacePackageAction = (workspacePackage: WorkspacePackage) => void;


/**
 * Tracks changes that can be later applied to a workspace.
 */
export class WorkspaceChangeTracker {
    private _trackedWorkspacePackages: Map<string, WorkspacePackage> = new Map<string, WorkspacePackage>();
    private _workspacePackages: Map<string, WorkspacePackage> = new Map<string, WorkspacePackage>();

    /**
     * Initialises a new workspace change tracker.
     *
     * @param workspacePackages The current workspace packages.
     */
    constructor(workspacePackages: Map<string, WorkspacePackage>) {
        this._workspacePackages = workspacePackages;
    }

    /**
     * Retrieves a named workspace package.
     *
     * @param packageName The name of the package that should be retrieved.
     *
     * @returns A [[WorkspacePackage]] that can be updated and later applied within a
     * workspace.
     *
     * If a workspace package doesn't exist with the given name, then one is returned
     * that will create a new package in the workspace when the changes are applied.
     */
    public getWorkspacePackage(packageName: string): WorkspacePackage {
        let trackedWorkspacePackage = this._trackedWorkspacePackages.get(packageName);

        if (trackedWorkspacePackage) return trackedWorkspacePackage;

        trackedWorkspacePackage = new WorkspacePackage(this._workspacePackages[packageName]);

        trackedWorkspacePackage.name = packageName;
        trackedWorkspacePackage.path = `./${packageName}`;

        this._trackedWorkspacePackages.set(packageName, trackedWorkspacePackage);

        return trackedWorkspacePackage;
    }

    /**
     * Applies an action to each of the tracked workspace packages.
     *
     * @param applyFunc The function that will be called for each [[WorkspacePackage]]
     * that is being tracked by the change tracker.
     */
    public apply(applyFunc: WorkspacePackageAction): void {
        this._trackedWorkspacePackages.forEach((value) => applyFunc(value));
    }
}
