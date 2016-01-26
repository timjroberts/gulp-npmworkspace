"use strict";

import * as _ from "underscore";

/**
 * Represents a package that is contained in a workspace.
 */
export class WorkspacePackage {
    private _packageDescriptor: any;
    private _path: string;

    /**
     * Initialises a new workspace package.
     *
     * @param other An optional [[WorkspacePackage]] that will be copied into the
     * current.
     */
    constructor(other?: WorkspacePackage) {
        if (other) {
            this._packageDescriptor = other._packageDescriptor;
            this._path = other._path;
        }
        else {
            this._packageDescriptor = { };
        }
    }

    /**
     * Gets the relative path of the workspace package.
     *
     * @returns A string representing the relative path of the current workspace package
     * to the workspace.
     */
    public get path(): string {
        return this._path;
    }

    /**
     * Sets the relative path of the workspace package.
     *
     * @param newPath The new relative path.
     */
    public set path(newPath: string)  {
        this._path = newPath;
    }

    /**
     * Gets the name of the package.
     *
     * @returns A string representing the name of the package.
     */
    public get name(): string {
        return this._packageDescriptor["name"];
    }

    /**
     * Sets the name of the package.
     *
     * @param newName The new package name.
     */
    public set name(newName: string) {
        this._packageDescriptor["name"] = newName;
    }

    /**
     * Gets the dependencies of the package.
     *
     * @returns A dictionary that is a copy of the package dependencies.
     */
    public get dependencies(): IDictionary<string> {
        return _.extend({ }, this._packageDescriptor["dependencies"]);
    }

    /**
     * Sets the dependencies of the package to an exact set.
     *
     * @param newDependencies A dictionary of dependencies that will replace the current
     * package dependencies.
     */
    public setDependencies(newDependencies: IDictionary<string>): void {
        this._packageDescriptor["dependencies"] = newDependencies;
    }

    /**
     * Updates the dependencies of the package to include a set.
     *
     * @param additionalDependencies A dictionary of dependencies that will be merged into
     * the current package dependencies.
     */
    public includeDependencies(additionalDependencies: IDictionary<string>): void {
        if (!this._packageDescriptor["dependencies"]) {
            this._packageDescriptor["dependencies"] = { };
        }

        _.extend(this._packageDescriptor["dependencies"], additionalDependencies);
    }
}
