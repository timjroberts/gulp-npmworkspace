declare module "dependency-graph" {
    export class DepGraph {
        constructor();
        
        addNode(name: string): void;
        
        addDependency(from: string, to: string): void;
        
        dependenciesOf(name: string, leavesOnly?: boolean): Array<string>;
        
        overallOrder(leavesOnly?: boolean): Array<string>;
    }    
}
