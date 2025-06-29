import * as vscode from 'vscode';
import { ProjectManager } from './config/projectManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Gextia Development Helper is now active!');

    // Inicializar el gestor de proyectos
    const projectManager = ProjectManager.getInstance();

    // Registrar comandos
    const createProfileCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.createProfile',
        () => projectManager.createProfile()
    );

    const switchProfileCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.switchProfile', 
        () => projectManager.switchProfile()
    );

    const refreshModelsCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.refreshModels',
        () => {
            vscode.window.showInformationMessage('Refreshing Gextia models cache...');
            // TODO: Implementar refresh de modelos
        }
    );

    const showInheritanceTreeCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.showInheritanceTree',
        () => {
            vscode.window.showInformationMessage('Showing inheritance tree...');
            // TODO: Implementar árbol de herencia
        }
    );

    // Registrar proveedor de autocompletado
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'python',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                // TODO: Implementar autocompletado inteligente
                return [];
            }
        },
        '.',  // Trigger en punto
        '_'   // Trigger en guión bajo
    );

    // Listener para cambios en archivos Python
    const fileWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'python' && 
            vscode.workspace.getConfiguration('gextia-dev-helper').get('autoRefreshOnSave')) {
            projectManager.log(`File saved: ${document.fileName}`);
            // TODO: Actualizar cache de modelos
        }
    });

    // Verificar si hay perfil activo al iniciar
    if (!projectManager.hasActiveProfile()) {
        vscode.window.showInformationMessage(
            'No hay un perfil de Gextia configurado. ¿Crear uno?',
            'Crear perfil'
        ).then(selection => {
            if (selection === 'Crear perfil') {
                projectManager.createProfile();
            }
        });
    }

    // Agregar todo al contexto
    context.subscriptions.push(
        createProfileCommand,
        switchProfileCommand,
        refreshModelsCommand,
        showInheritanceTreeCommand,
        completionProvider,
        fileWatcher
    );

    // Mostrar mensaje de bienvenida
    projectManager.log('Gextia Development Helper activated successfully');
}

export function deactivate() {
    console.log('Gextia Development Helper is now deactivated');
}