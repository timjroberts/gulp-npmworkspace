import {PackageDescriptor,
        Dictionary} from "./interfaces";

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

export interface AsyncAction {
    (path: string, packageDescriptor: PackageDescriptor, callback: (error?: Error) => void): void;
}

/**
 * An action that it only executed for a given condition.
 */
export interface ConditionableOption {
    /**
     * An optional condition function that if returns true will apply the associated action. If no condition is
     * supplied, then the action is always applied.
     */
    condition?: (packageDescriptor: PackageDescriptor, path: string) => boolean;

    /**
     * The action to execute.
     * If the action is a string, then the action is executed in the shell; otherwise the action is a function.
     */
    action: string | AsyncAction;
}

/**
 * Options for npmInstall().
 */
export interface NpmInstallOptions {
    /**
     * true to continue streaming 'package.json' files if the installation errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to apply an installation strategy that attempts to install all devDependencies
     * in the root of the workspace. If a required version cannot be satified by the version
     * installed at the workspace level, then the package is installed locally.
     *
     * Defaults to true.
     */
    minimizeSizeOnDisk?: boolean;

    /**
     * A map between a package name and the npm registry where it should be installed from.
     */
    registryMap?: Dictionary<string>;

    /**
     * A combination of a condition and an action that will be executed once the package has been installed.
     */
    postInstall?: ConditionableOption;
}

/**
 * An increment type that can be applied to a package's version.
 */
export enum VersionIncrement {
    major,
    premajor,
    minor,
    preminor,
    patch,
    prepatch,
    prerelease
}

/**
 * Options for npmPublish().
 */
export interface NpmPublishOptions {
    /**
     * true to continue streaming 'package.json' files if the publish errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to generate a shrikwrap file before publishing.
     *
     * Default to true.
     */
    shrinkWrap?: boolean;

    /**
     * An optional version number or a increment type to apply to the 'package.json' files before
     * they are published.
     */
    bump?: string | VersionIncrement;

    /**
     * A combination of a condition and an action that will be executed before the package is published.
     */
    prePublish?: ConditionableOption;
}

/**
 * Options for buildTypeScriptProject().
 */
export interface TypeScriptCompileOptions {
    /**
     * true to continue streaming 'package.json' files if the TypeScript compilation yields errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to compile only those source files that are affected by change.
     *
     * Defaults to true.
     */
    fastCompile?: boolean;

    /**
     * true to process any found `typings.json` files that are included in the workspace package.
     *
     * Defaults to true.
     */
    includeTypings?: boolean;
}