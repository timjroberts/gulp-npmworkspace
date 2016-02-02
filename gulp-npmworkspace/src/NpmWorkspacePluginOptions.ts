import * as path from "path"
import * as _ from "underscore";

import {PackageDescriptor} from "./PackageDescriptor";

const argv = require("yargs")
    .alias("p", "package")
    .alias("v", "verbose")
    .argv;

/**
 * The 'gulp-npmworkspace' plugin name (useful for generating errors).
 */
export const PLUGIN_NAME = (<PackageDescriptor>require(path.join(__dirname, "../../package.json"))).name;

/**
 * A type of increment to apply when bumping up version numbers during a publish.
 */
export enum VersionBump {
    major,
    premajor,
    minor,
    preminor,
    patch,
    prepatch,
    prerelease
}

/**
 * Represents the global options that are applied across all plugins.
 */
export interface NpmWorkspacePluginOptions {
    /**
     * The name of the workspace package to focus streaming on.
     */
    package?: string;

    /**
     * If [[NpmWorkspacePluginOptions#package]] is specified, then true will only
     * stream that named package; false will stream that named package and its
     * associated dependencies.
     */
    onlyNamedPackage?: boolean;

    /**
     * A switch to determine if logging should be enabled.
     */
    enableLogging?: boolean;

    /**
     * A switch to determine if verbose logging should be enabled.
     */
    verboseLogging?: boolean;

    /**
     * A [[VersionBump]] value that determines how version numbers are bumped up
     * during a publish.
     */
    versionBump?: string | VersionBump;
}

/**
 * The default plugin options.
 */
const DEFAULT_WORKSPACE_PLUGIN_OPTIONS: NpmWorkspacePluginOptions = {
    enableLogging: true,
    verboseLogging: false,
    versionBump: VersionBump.patch
};

/**
 * Returns the workspace plugin options.
 *
 * @param localOptions An optional set of options that should override the defaults.
 *
 * @returns An [[NpmWorkspacePluginOptions]] object that is a combination of the default
 * workspace plugin options, the provided options, and the options taken from the command line.
 *
 * Option precedence is command line options -> local options -> default options.
 */
export function getWorkspacePluginOptions(localOptions?: NpmWorkspacePluginOptions): NpmWorkspacePluginOptions {
        return _.extend(DEFAULT_WORKSPACE_PLUGIN_OPTIONS,
                        localOptions || { },
                        getCmdLineWorkspacePluginOptions());
}

/**
 * Returns the options that are set on the command line.
 */
function getCmdLineWorkspacePluginOptions(): NpmWorkspacePluginOptions {
    const EXCLUSIVE_PACKAGE_SYMBOL: string = "!";

    let options: NpmWorkspacePluginOptions = { };

    if (argv.package) {
        let matches = /(\!?)(.+)/.exec(argv.package);
        let exclusiveMarkerToken = matches[1];
        let packageToken = matches[2];

        options.package = packageToken;
        options.onlyNamedPackage = exclusiveMarkerToken === EXCLUSIVE_PACKAGE_SYMBOL;
    }

    if (argv.verbose) {
        options.verboseLogging = true;
    }

    if (argv.versionbump) {
        options.versionBump = argv.versionbump;
    }

    return options;
}
