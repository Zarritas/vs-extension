import * as vscode from 'vscode';
import { ProjectManager } from './config/projectManager';
import { ModelsCache } from './cache/modelsCache';

export class GextiaTreeProvider implements vscode.TreeDataProvider<GextiaTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GextiaTreeItem | undefined | void> = new vscode.EventEmitter<GextiaTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<GextiaTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GextiaTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GextiaTreeItem): Thenable<GextiaTreeItem[]> {
        const projectManager = ProjectManager.getInstance();
        const modelsCache = ModelsCache.getInstance();

        if (!element) {
            // Raíz: grupos principales
            return Promise.resolve([
                new GextiaTreeItem('Rutas', 'group', vscode.TreeItemCollapsibleState.Collapsed),
                new GextiaTreeItem('Modelos', 'group', vscode.TreeItemCollapsibleState.Collapsed),
                new GextiaTreeItem('Componentes', 'group', vscode.TreeItemCollapsibleState.Collapsed),
                new GextiaTreeItem('Acciones', 'group', vscode.TreeItemCollapsibleState.Collapsed)
            ]);
        }

        // Grupos
        if (element.contextValue === 'group') {
            switch (element.label) {
                case 'Rutas': {
                    const rutas = projectManager.getAllModelsPaths();
                    return Promise.resolve(rutas.map(r => new GextiaTreeItem(r, 'ruta', vscode.TreeItemCollapsibleState.None)));
                }
                case 'Modelos': {
                    const modelos = modelsCache.getAllModelNames();
                    return Promise.resolve(modelos.map(m => new GextiaTreeItem(m, 'modelo', vscode.TreeItemCollapsibleState.None)));
                }
                case 'Componentes': {
                    const componentes = modelsCache.getAllComponentNames();
                    return Promise.resolve(componentes.map(c => new GextiaTreeItem(c, 'componente', vscode.TreeItemCollapsibleState.None)));
                }
                case 'Acciones': {
                    return Promise.resolve([
                        new GextiaTreeItem('Configuración', 'accion', vscode.TreeItemCollapsibleState.None, {
                            command: 'workbench.action.openSettings',
                            title: 'Configuración',
                            arguments: ['gextia-dev-helper']
                        }),
                        new GextiaTreeItem('Crear Perfil', 'accion', vscode.TreeItemCollapsibleState.None, {
                            command: 'gextia-dev-helper.createProfile',
                            title: 'Crear Perfil'
                        }),
                        new GextiaTreeItem('Refrescar Todo', 'accion', vscode.TreeItemCollapsibleState.None, {
                            command: 'gextia-dev-helper.refreshModels',
                            title: 'Refrescar Todo'
                        }),
                        new GextiaTreeItem('Agregar Ruta', 'accion', vscode.TreeItemCollapsibleState.None, {
                            command: 'gextia-dev-helper.addProjectPath',
                            title: 'Agregar Ruta'
                        })
                    ]);
                }
            }
        }

        return Promise.resolve([]);
    }
}

export class GextiaTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        if (command) this.command = command;
        // Iconos personalizados por tipo
        if (contextValue === 'ruta') this.iconPath = new vscode.ThemeIcon('folder');
        if (contextValue === 'modelo') this.iconPath = new vscode.ThemeIcon('symbol-class');
        if (contextValue === 'componente') this.iconPath = new vscode.ThemeIcon('symbol-method');
        if (contextValue === 'accion') this.iconPath = new vscode.ThemeIcon('gear');
    }
}
