import {PackageDescriptor} from "./PackageDescriptor";
import {ConditionableAction, AsyncAction} from "./Plugins/ConditionableAction";
import * as PostInstallTypings from "./Actions/PostInstallTypings";

export * from "./Plugins/WorkspacePackages";
export * from "./Plugins/FilterPackages";
export * from "./Plugins/InstallPackages";
export * from "./Plugins/UninstallPackages";
export * from "./Plugins/PublishPackages";
export * from "./Plugins/BuildTypeScriptPackages";
export * from "./Plugins/TestCucumberPackages";

/**
 * Post install actions.
 */
export var postInstallActions = {
    installTypings: PostInstallTypings.installTypings,
    installTypingsAsLinks: PostInstallTypings.installTypingsAsLinks,
}
