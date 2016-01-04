import {PackageDescriptor} from "./interfaces";

/**
 * Options for npmScript().
 */
export interface NpmScriptOptions {
    /**
     * true to ignore a script that is missing from the 'package.json' file.
     *
     * Defaults to true.
     */
    ignoreMissingScript?: boolean;

    /**
     * true to continue streaming 'package.json' files if the script errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;
}

/**
 * Options for post installation.
 */
export interface PostInstallOption {
    /**
     * An optional condition function that if returns true will apply the associated action. If no condition is
     * supplied, then the action is always applied.
     */
    condition?: (packageDescriptor: PackageDescriptor, path: string) => boolean;

    /**
     * The action to execute.
     * If the action is a string, then the action is executed in the shell; otherwise the action is a function.
     */
    action: string | Function;
}

/**
 * Options for npmInstall().
 */
export interface NpmInstallOptions {
    /**
     * true to continue streaming 'package.json' files if the script errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to apply an installation strategy that attempts to install all devDependencies
     * in the root of the workspace.
     *
     * Defaults to true.
     */
    minimizeSizeOnDisk?: boolean;

    /**
     * A combination of a condition and an action that will be executed once the package has been installed.
     */
    postInstall?: PostInstallOption;
}