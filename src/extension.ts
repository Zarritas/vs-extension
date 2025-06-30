import * as vscode from 'vscode';
import { ProjectManager } from './config/projectManager';
import { ModelsCache } from './cache/modelsCache';
import * as path from 'path';
import { RemoteRepositoryManager } from './remote/remoteRepositoryManager';
import { InheritanceNode, CompletionContext, RemoteRepository } from './types';
import * as fs from 'fs';
import { GextiaTreeProvider } from './gextiaTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Gextia Development Helper is now active!');

    // Inicializar el gestor de proyectos
    const projectManager = ProjectManager.getInstance();
    
    // Inicializar el cache de modelos
    const modelsCache = ModelsCache.getInstance();
    modelsCache.initialize().catch(error => {
        console.error('Error initializing models cache:', error);
    });

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
        async () => {
            try {
                vscode.window.showInformationMessage('Refreshing Gextia models cache...');
                
                const projectManager = ProjectManager.getInstance();
                const modelsCache = ModelsCache.getInstance();
                
                // Verificar que hay un perfil activo
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil de proyecto activo. Crea uno primero.');
                    return;
                }
                
                // Mostrar progreso
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Refreshing Gextia Models Cache",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Inicializando cache...' });
                    
                    // Refrescar cache
                    await modelsCache.refreshCache();
                    
                    progress.report({ message: 'Cache actualizado exitosamente' });
                });
                
                // Mostrar estadísticas
                const stats = modelsCache.getCacheStats();
                vscode.window.showInformationMessage(
                    `Cache actualizado: ${stats.totalModels} modelos en ${stats.uniqueModelNames} tipos únicos`
                );
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error refreshing cache: ${error}`);
            }
        }
    );

    const showInheritanceTreeCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.showInheritanceTree',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                const modelsCache = ModelsCache.getInstance();
                
                // Verificar que hay un perfil activo
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil de proyecto activo. Crea uno primero.');
                    return;
                }
                
                // Verificar que el cache está listo
                if (!modelsCache.isReady()) {
                    vscode.window.showWarningMessage('El cache de modelos no está listo. Ejecuta "Refresh Models Cache" primero.');
                    return;
                }
                
                // Solicitar modelo para mostrar
                const modelNames = modelsCache.getAllModelNames();
                if (modelNames.length === 0) {
                    vscode.window.showWarningMessage('No hay modelos disponibles en el cache.');
                    return;
                }
                
                const selectedModel = await vscode.window.showQuickPick(modelNames, {
                    placeHolder: 'Selecciona un modelo para mostrar su árbol de herencia'
                });
                
                if (!selectedModel) return;
                
                // Generar árbol de herencia
                const inheritanceTree = buildInheritanceTree(selectedModel, modelsCache);
                
                // Mostrar en un documento
                const document = await vscode.workspace.openTextDocument({
                    content: formatInheritanceTree(inheritanceTree, 0, projectManager),
                    language: 'markdown'
                });
                
                await vscode.window.showTextDocument(document);
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error showing inheritance tree: ${error}`);
            }
        }
    );

    // Registrar proveedor de autocompletado
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'python',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const projectManager = ProjectManager.getInstance();
                const modelsCache = ModelsCache.getInstance();
                
                // Verificar que hay un perfil activo y cache listo
                if (!projectManager.hasActiveProfile() || !modelsCache.isReady()) {
                    return [];
                }
                
                const lineText = document.lineAt(position).text;
                const wordRange = document.getWordRangeAtPosition(position);
                const wordAtCursor = wordRange ? document.getText(wordRange) : '';
                
                // Analizar contexto
                const context = analyzeCompletionContext(document, position, modelsCache);
                
                // Generar sugerencias basadas en el contexto
                return generateCompletionItems(context, wordAtCursor);
            }
        },
        '.',  // Trigger en punto
        '_'   // Trigger en guión bajo
    );

    // Registrar proveedor de definiciones para navegación de modelos
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        'python',
        {
            provideDefinition(document: vscode.TextDocument, position: vscode.Position) {
                const projectManager = ProjectManager.getInstance();
                const modelsCache = ModelsCache.getInstance();
                
                // Verificar que hay un perfil activo y cache listo
                if (!projectManager.hasActiveProfile() || !modelsCache.isReady()) {
                    return null;
                }
                
                const lineText = document.lineAt(position).text;
                const wordRange = document.getWordRangeAtPosition(position);
                
                if (!wordRange) {
                    return null;
                }
                
                const wordAtCursor = document.getText(wordRange);
                
                // Buscar si estamos en una línea con _inherit
                const inheritMatch = lineText.match(/_inherit\s*=\s*['"]([^'"]+)['"]/);
                if (inheritMatch && wordAtCursor === inheritMatch[1]) {
                    // Buscar el modelo base en el cache
                    const baseModels = modelsCache.getModels(wordAtCursor);
                    const baseModel = baseModels.find(m => !m.isInherit); // Modelo base (no heredado)
                    
                    if (baseModel) {
                        const uri = vscode.Uri.file(baseModel.filePath);
                        const range = new vscode.Range(
                            new vscode.Position(baseModel.lineNumber - 1, 0),
                            new vscode.Position(baseModel.lineNumber - 1, 0)
                        );
                        
                        return new vscode.Location(uri, range);
                    }
                }
                
                // También buscar si estamos en una línea con _name
                const nameMatch = lineText.match(/_name\s*=\s*['"]([^'"]+)['"]/);
                if (nameMatch && wordAtCursor === nameMatch[1]) {
                    // Buscar el modelo en el cache
                    const models = modelsCache.getModels(wordAtCursor);
                    const model = models.find(m => !m.isInherit); // Modelo base
                    
                    if (model) {
                        const uri = vscode.Uri.file(model.filePath);
                        const range = new vscode.Range(
                            new vscode.Position(model.lineNumber - 1, 0),
                            new vscode.Position(model.lineNumber - 1, 0)
                        );
                        
                        return new vscode.Location(uri, range);
                    }
                }
                
                return null;
            }
        }
    );

    // Listener para cambios en archivos Python
    const fileWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.languageId === 'python' && 
            vscode.workspace.getConfiguration('gextia-dev-helper').get('autoRefreshOnSave')) {
            
            const projectManager = ProjectManager.getInstance();
            const modelsCache = ModelsCache.getInstance();
            
            // Verificar que hay un perfil activo y cache listo
            if (!projectManager.hasActiveProfile() || !modelsCache.isReady()) {
                return;
            }
            
            projectManager.log(`File saved: ${document.fileName}`);
            
            try {
                // Actualizar cache para este archivo específico
                await modelsCache.updateFileInCache(document.fileName);
                projectManager.log(`Cache updated for: ${document.fileName}`);
            } catch (error) {
                projectManager.log(`Error updating cache for ${document.fileName}: ${error}`);
            }
        }
    });

    // Registrar comandos adicionales
    const showCacheStatsCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.showCacheStats',
        () => {
            const modelsCache = ModelsCache.getInstance();
            const stats = modelsCache.getCacheStats();
            
            const message = `**Estadísticas del Cache de Modelos**\n\n` +
                `• Total de modelos: ${stats.totalModels}\n` +
                `• Tipos únicos: ${stats.uniqueModelNames}\n` +
                `• Archivos rastreados: ${stats.trackedFiles}\n` +
                `• Cache inicializado: ${stats.isInitialized ? '✅' : '❌'}\n` +
                `• Refrescando: ${stats.isRefreshing ? '🔄' : '✅'}`;
            
            vscode.window.showInformationMessage(message);
        }
    );

    const syncRemoteRepositoriesCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.syncRemoteRepositories',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                const remoteManager = RemoteRepositoryManager.getInstance();
                
                // Verificar que hay un perfil activo
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil de proyecto activo. Crea uno primero.');
                    return;
                }
                
                const profile = projectManager.getCurrentProfile();
                if (!profile || !profile.paths.remoteRepositories || profile.paths.remoteRepositories.length === 0) {
                    vscode.window.showInformationMessage('No hay repositorios remotos configurados.');
                    return;
                }
                
                const repositories = profile.paths.remoteRepositories;
                
                let successCount = 0;
                let errorCount = 0;
                
                // Mostrar progreso
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Sincronizando Repositorios Remotos",
                    cancellable: false
                }, async (progress) => {
                    for (let i = 0; i < repositories.length; i++) {
                        const repo = repositories[i];
                        progress.report({ 
                            message: `Sincronizando ${repo.name} (${i + 1}/${repositories.length})`,
                            increment: 100 / repositories.length
                        });
                        
                        const success = await remoteManager.syncRepository(repo);
                        if (success) {
                            successCount++;
                        } else {
                            errorCount++;
                        }
                    }
                    
                    progress.report({ message: 'Sincronización completada' });
                });
                
                // Mostrar resultados
                if (errorCount > 0) {
                    vscode.window.showWarningMessage(
                        `Sincronización completada con errores: ${successCount} exitosos, ${errorCount} fallidos. Revisa el log para más detalles.`
                    );
                } else {
                    vscode.window.showInformationMessage(
                        `Sincronización completada exitosamente: ${successCount} repositorios actualizados.`
                    );
                    
                    // Preguntar si refrescar el cache para incluir los nuevos repositorios
                    if (successCount > 0) {
                        const refreshCache = await vscode.window.showQuickPick(['Sí', 'No'], {
                            placeHolder: '¿Refrescar el cache de modelos para incluir los repositorios sincronizados?'
                        });
                        
                        if (refreshCache === 'Sí') {
                            vscode.window.showInformationMessage('Refrescando cache de modelos...');
                            
                            const modelsCache = ModelsCache.getInstance();
                            await vscode.window.withProgress({
                                location: vscode.ProgressLocation.Notification,
                                title: "Refrescando Cache de Modelos",
                                cancellable: false
                            }, async (progress) => {
                                progress.report({ message: 'Inicializando cache...' });
                                await modelsCache.refreshCache();
                                progress.report({ message: 'Cache actualizado exitosamente' });
                            });
                            
                            // Mostrar estadísticas actualizadas
                            const stats = modelsCache.getCacheStats();
                            vscode.window.showInformationMessage(
                                `Cache actualizado: ${stats.totalModels} modelos en ${stats.uniqueModelNames} tipos únicos`
                            );
                        }
                    }
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error sincronizando repositorios: ${error}`);
            }
        }
    );

    const showSyncLogCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.showSyncLog',
        () => {
            const remoteManager = RemoteRepositoryManager.getInstance();
            remoteManager.showLog();
        }
    );

    const clearSyncLogCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.clearSyncLog',
        () => {
            const remoteManager = RemoteRepositoryManager.getInstance();
            remoteManager.clearLog();
            vscode.window.showInformationMessage('Log de sincronización limpiado.');
        }
    );

    const testRepositoryConnectionCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.testRepositoryConnection',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                const remoteManager = RemoteRepositoryManager.getInstance();
                
                // Verificar que hay un perfil activo
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil de proyecto activo. Crea uno primero.');
                    return;
                }
                
                const profile = projectManager.getCurrentProfile();
                if (!profile || !profile.paths.remoteRepositories || profile.paths.remoteRepositories.length === 0) {
                    vscode.window.showInformationMessage('No hay repositorios remotos configurados.');
                    return;
                }
                
                // Seleccionar repositorio para probar
                const repoOptions = profile.paths.remoteRepositories.map((repo: RemoteRepository) => ({
                    label: repo.name,
                    description: repo.url,
                    detail: repo.branch ? `Rama: ${repo.branch}` : 'Rama: main',
                    repo: repo
                }));
                
                const selected = await vscode.window.showQuickPick(repoOptions, {
                    placeHolder: 'Selecciona un repositorio para probar la conexión'
                });
                
                if (!selected) return;
                
                // Probar conexión
                vscode.window.showInformationMessage(`Probando conexión a ${selected.repo.name}...`);
                
                const testResult = await remoteManager.testRepositoryConnection(selected.repo);
                
                if (testResult.success) {
                    vscode.window.showInformationMessage(`✓ Conexión exitosa a ${selected.repo.name}`);
                } else {
                    vscode.window.showErrorMessage(`✗ Error de conexión a ${selected.repo.name}: ${testResult.error}`);
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error probando conexión: ${error}`);
            }
        }
    );

    const showRemoteRepositoriesInfoCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.showRemoteRepositoriesInfo',
        () => {
            const projectManager = ProjectManager.getInstance();
            
            if (!projectManager.hasActiveProfile()) {
                vscode.window.showWarningMessage('No hay un perfil de proyecto activo.');
                return;
            }
            
            const profile = projectManager.getCurrentProfile();
            if (!profile || !profile.paths.remoteRepositories || profile.paths.remoteRepositories.length === 0) {
                vscode.window.showInformationMessage('No hay repositorios remotos configurados.');
                return;
            }
            
            let message = `**Repositorios Remotos Configurados**\n\n`;
            
            for (const repo of profile.paths.remoteRepositories) {
                const status = repo.enabled ? '✅' : '❌';
                const lastSync = repo.lastSync 
                    ? new Date(repo.lastSync).toLocaleDateString() 
                    : 'Nunca';
                
                message += `${status} **${repo.name}**\n`;
                message += `   URL: ${repo.url}\n`;
                message += `   🌿 Rama: ${repo.branch || 'main'}\n`;
                message += `   📅 Última sync: ${lastSync}\n`;
                message += `   Privado: ${repo.isPrivate ? 'Sí' : 'No'}\n\n`;
            }
            
            vscode.window.showInformationMessage(message);
        }
    );

    const goToModelDefinitionCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.goToModelDefinition',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                const modelsCache = ModelsCache.getInstance();
                
                // Verificar que hay un perfil activo y cache listo
                if (!projectManager.hasActiveProfile() || !modelsCache.isReady()) {
                    vscode.window.showWarningMessage('No hay un perfil activo o el cache no está listo.');
                    return;
                }
                
                // Obtener el editor activo
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No hay un archivo abierto.');
                    return;
                }
                
                const document = editor.document;
                const position = editor.selection.active;
                const lineText = document.lineAt(position.line).text;
                
                // Buscar si estamos en una línea con _inherit o _name
                const inheritMatch = lineText.match(/_inherit\s*=\s*['"]([^'"]+)['"]/);
                const nameMatch = lineText.match(/_name\s*=\s*['"]([^'"]+)['"]/);
                
                let modelName: string | null = null;
                
                if (inheritMatch) {
                    modelName = inheritMatch[1];
                } else if (nameMatch) {
                    modelName = nameMatch[1];
                }
                
                if (!modelName) {
                    vscode.window.showWarningMessage('No se encontró un modelo en la línea actual.');
                    return;
                }
                
                // Buscar el modelo base en el cache
                const baseModels = modelsCache.getModels(modelName);
                const baseModel = baseModels.find(m => !m.isInherit); // Modelo base (no heredado)
                
                if (!baseModel) {
                    vscode.window.showWarningMessage(`No se encontró el modelo base: ${modelName}`);
                    return;
                }
                
                // Abrir el archivo y navegar a la línea
                const uri = vscode.Uri.file(baseModel.filePath);
                const range = new vscode.Range(
                    new vscode.Position(baseModel.lineNumber - 1, 0),
                    new vscode.Position(baseModel.lineNumber - 1, 0)
                );
                
                await vscode.window.showTextDocument(uri, { selection: range });
                vscode.window.showInformationMessage(`Navegando a ${modelName} en ${path.basename(baseModel.filePath)}`);
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error navegando al modelo: ${error}`);
            }
        }
    );

    const addProjectPathCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.addProjectPath',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil activo. Crea uno primero.');
                    return;
                }
                
                // Seleccionar carpeta
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    openLabel: 'Seleccionar carpeta de addons'
                });

                if (folderUri && folderUri.length > 0) {
                    const selectedPath = folderUri[0].fsPath;
                    
                    // Verificar si es una carpeta de addons válida
                    const hasManifest = await checkIfAddonsFolder(selectedPath);
                    
                    if (!hasManifest) {
                        const confirm = await vscode.window.showWarningMessage(
                            'Esta carpeta no parece contener módulos de Gextia. ¿Continuar de todas formas?',
                            'Continuar',
                            'Cancelar'
                        );
                        
                        if (confirm !== 'Continuar') {
                            return;
                        }
                    }
                    
                    const success = await projectManager.addAddonsPath(selectedPath);
                    
                    if (success) {
                        // Preguntar si refrescar el cache
                        const refreshCache = await vscode.window.showQuickPick(['Sí', 'No'], {
                            placeHolder: '¿Refrescar el cache de modelos ahora?'
                        });
                        
                        if (refreshCache === 'Sí') {
                            const modelsCache = ModelsCache.getInstance();
                            await modelsCache.refreshCache();
                            vscode.window.showInformationMessage('Cache actualizado con la nueva ruta.');
                        }
                    }
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error agregando ruta: ${error}`);
            }
        }
    );

    const addRemoteRepositoryCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.addRemoteRepository',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                const remoteManager = RemoteRepositoryManager.getInstance();
                
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil activo. Crea uno primero.');
                    return;
                }
                
                // Configurar repositorio usando el RemoteRepositoryManager
                const repository = await remoteManager.configureRemoteRepository();
                
                if (repository) {
                    const success = await projectManager.addRemoteRepository(repository);
                    
                    if (success) {
                        // Preguntar si sincronizar ahora
                        const syncNow = await vscode.window.showQuickPick(['Sí', 'No'], {
                            placeHolder: '¿Sincronizar repositorio ahora? (puede tardar unos minutos)'
                        });
                        
                        if (syncNow === 'Sí') {
                            vscode.window.showInformationMessage('Sincronizando repositorio...');
                            const syncSuccess = await remoteManager.syncRepository(repository);
                            
                            if (syncSuccess) {
                                vscode.window.showInformationMessage(`Repositorio "${repository.name}" sincronizado exitosamente`);
                                
                                // Preguntar si refrescar el cache
                                const refreshCache = await vscode.window.showQuickPick(['Sí', 'No'], {
                                    placeHolder: '¿Refrescar el cache de modelos ahora?'
                                });
                                
                                if (refreshCache === 'Sí') {
                                    const modelsCache = ModelsCache.getInstance();
                                    await modelsCache.refreshCache();
                                    vscode.window.showInformationMessage('Cache actualizado con el nuevo repositorio.');
                                }
                            } else {
                                vscode.window.showWarningMessage(`Error sincronizando repositorio "${repository.name}"`);
                            }
                        }
                    }
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error agregando repositorio: ${error}`);
            }
        }
    );

    const manageProjectPathsCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.manageProjectPaths',
        async () => {
            try {
                const projectManager = ProjectManager.getInstance();
                
                if (!projectManager.hasActiveProfile()) {
                    vscode.window.showWarningMessage('No hay un perfil activo. Crea uno primero.');
                    return;
                }
                
                const profile = projectManager.getCurrentProfile();
                if (!profile) {
                    vscode.window.showWarningMessage('No se pudo obtener el perfil actual.');
                    return;
                }
                
                // Crear lista de opciones
                const options = [
                    '📁 Agregar ruta de addons',
                    '🌐 Agregar repositorio remoto',
                    '📊 Ver información del proyecto',
                    '🗑️ Remover ruta de addons',
                    '🗑️ Remover repositorio remoto',
                    '🔄 Refrescar cache de modelos'
                ];
                
                const action = await vscode.window.showQuickPick(options, {
                    placeHolder: 'Selecciona una acción'
                });
                
                if (!action) return;
                
                switch (action) {
                    case '📁 Agregar ruta de addons':
                        vscode.commands.executeCommand('gextia-dev-helper.addProjectPath');
                        break;
                        
                    case '🌐 Agregar repositorio remoto':
                        vscode.commands.executeCommand('gextia-dev-helper.addRemoteRepository');
                        break;
                        
                    case '📊 Ver información del proyecto':
                        projectManager.showProjectInfo();
                        break;
                        
                    case '🗑️ Remover ruta de addons':
                        await removeAddonsPath(projectManager, profile);
                        break;
                        
                    case '🗑️ Remover repositorio remoto':
                        await removeRemoteRepository(projectManager, profile);
                        break;
                        
                    case '🔄 Refrescar cache de modelos':
                        const modelsCache = ModelsCache.getInstance();
                        await modelsCache.refreshCache();
                        vscode.window.showInformationMessage('Cache de modelos refrescado.');
                        break;
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error gestionando rutas: ${error}`);
            }
        }
    );

    const deleteProfileCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.deleteProfile',
        () => projectManager.deleteProfile()
    );

    // Registrar el TreeView nativo en la barra lateral
    const gextiaTreeProvider = new GextiaTreeProvider();
    const gextiaTreeView = vscode.window.createTreeView('gextiaManagerView', {
        treeDataProvider: gextiaTreeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(gextiaTreeView);

    // Acción al seleccionar un nodo de modelo o componente
    gextiaTreeView.onDidChangeSelection(async (e) => {
        const item = e.selection[0];
        if (!item) return;
        const modelsCache = ModelsCache.getInstance();
        if (item.contextValue === 'modelo') {
            const modelos = modelsCache.getModels(item.label);
            if (modelos.length > 0) {
                const model = modelos[0];
                const msg = `Modelo: ${model.name}\nArchivo: ${model.filePath}\nClase: ${model.className}\nCampos: ${model.fields.length}\nMétodos: ${model.methods.length}`;
                const open = await vscode.window.showInformationMessage(msg, 'Abrir archivo');
                if (open === 'Abrir archivo') {
                    const doc = await vscode.workspace.openTextDocument(model.filePath);
                    vscode.window.showTextDocument(doc, { selection: new vscode.Range(model.lineNumber-1,0,model.lineNumber-1,0) });
                }
            } else {
                vscode.window.showWarningMessage('No se encontró información del modelo.');
            }
        } else if (item.contextValue === 'componente') {
            const componentes = modelsCache.getComponent(item.label);
            if (componentes.length > 0) {
                const comp = componentes[0];
                const msg = `Componente: ${comp.name}\nArchivo: ${comp.filePath}\nClase: ${comp.className}\nCampos: ${comp.fields.length}\nMétodos: ${comp.methods.length}`;
                const open = await vscode.window.showInformationMessage(msg, 'Abrir archivo');
                if (open === 'Abrir archivo') {
                    const doc = await vscode.workspace.openTextDocument(comp.filePath);
                    vscode.window.showTextDocument(doc, { selection: new vscode.Range(comp.lineNumber-1,0,comp.lineNumber-1,0) });
                }
            } else {
                vscode.window.showWarningMessage('No se encontró información del componente.');
            }
        }
    });

    // Registrar los comandos en el contexto
    context.subscriptions.push(
        createProfileCommand,
        switchProfileCommand,
        refreshModelsCommand,
        deleteProfileCommand
    );

    // Comando para abrir la ventana visual (Webview)
    // const openGextiaManagerCommand = vscode.commands.registerCommand(
    //     'gextia-dev-helper.openGextiaManager',
    //     () => { /* ...WebviewPanel eliminado... */ }
    // );
    // context.subscriptions.push(openGextiaManagerCommand);

    // Funciones auxiliares para manageProjectPaths
    async function removeAddonsPath(projectManager: ProjectManager, profile: any): Promise<void> {
        if (profile.paths.addonsPath.length === 0) {
            vscode.window.showInformationMessage('No hay rutas de addons configuradas.');
            return;
        }
        
        const selectedPath = await vscode.window.showQuickPick(profile.paths.addonsPath, {
            placeHolder: 'Selecciona la ruta a remover'
        });
        
        if (selectedPath) {
            const success = await projectManager.removeAddonsPath(selectedPath);
            if (success) {
                const refreshCache = await vscode.window.showQuickPick(['Sí', 'No'], {
                    placeHolder: '¿Refrescar el cache de modelos ahora?'
                });
                
                if (refreshCache === 'Sí') {
                    const modelsCache = ModelsCache.getInstance();
                    await modelsCache.refreshCache();
                    vscode.window.showInformationMessage('Cache actualizado.');
                }
            }
        }
    }

    async function removeRemoteRepository(projectManager: ProjectManager, profile: any): Promise<void> {
        if (!profile.paths.remoteRepositories || profile.paths.remoteRepositories.length === 0) {
            vscode.window.showInformationMessage('No hay repositorios remotos configurados.');
            return;
        }
        
        const repoNames = profile.paths.remoteRepositories.map((repo: any) => repo.name);
        const selectedRepo = await vscode.window.showQuickPick(repoNames, {
            placeHolder: 'Selecciona el repositorio a remover'
        });
        
        if (selectedRepo) {
            const success = await projectManager.removeRemoteRepository(selectedRepo);
            if (success) {
                const refreshCache = await vscode.window.showQuickPick(['Sí', 'No'], {
                    placeHolder: '¿Refrescar el cache de modelos ahora?'
                });
                
                if (refreshCache === 'Sí') {
                    const modelsCache = ModelsCache.getInstance();
                    await modelsCache.refreshCache();
                    vscode.window.showInformationMessage('Cache actualizado.');
                }
            }
        }
    }

    // Función auxiliar para verificar si una carpeta contiene módulos de Gextia
    async function checkIfAddonsFolder(folderPath: string): Promise<boolean> {
        try {
            const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
            
            // Buscar al menos un directorio que contenga __manifest__.py
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const manifestPath = path.join(folderPath, entry.name, '__manifest__.py');
                    const openerpPath = path.join(folderPath, entry.name, '__openerp__.py');
                    
                    try {
                        await fs.promises.access(manifestPath);
                        return true;
                    } catch {
                        try {
                            await fs.promises.access(openerpPath);
                            return true;
                        } catch {
                            // Continuar buscando
                        }
                    }
                }
            }
            
            return false;
        } catch {
            return false;
        }
    }

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
    } else {
        // Inicializar cache si hay perfil activo
        modelsCache.initialize().catch(error => {
            console.error('Error initializing models cache:', error);
        });
    }

    // Agregar todo al contexto
    context.subscriptions.push(
        createProfileCommand,
        switchProfileCommand,
        refreshModelsCommand,
        showInheritanceTreeCommand,
        showCacheStatsCommand,
        syncRemoteRepositoriesCommand,
        showSyncLogCommand,
        clearSyncLogCommand,
        testRepositoryConnectionCommand,
        showRemoteRepositoriesInfoCommand,
        completionProvider,
        definitionProvider,
        fileWatcher,
        goToModelDefinitionCommand,
        addProjectPathCommand,
        addRemoteRepositoryCommand,
        manageProjectPathsCommand,
        showCacheLogCommand,
        debugRefreshCacheCommand
    );

    // Mostrar mensaje de bienvenida
    projectManager.log('Gextia Development Helper activated successfully');
}

export function deactivate() {
    console.log('Gextia Development Helper is now deactivated');
}

/**
 * Construye el árbol de herencia para un modelo
 */
function buildInheritanceTree(modelName: string, modelsCache: ModelsCache, visited: Set<string> = new Set(), maxDepth: number = 5): InheritanceNode {
    // Evitar recursión infinita
    if (visited.has(modelName) || visited.size >= maxDepth) {
        return {
            modelName,
            children: [],
            filePath: '',
            moduleName: '',
            isBaseModel: false,
            inheritanceType: 'extension'
        };
    }
    
    visited.add(modelName);
    
    const models = modelsCache.getModels(modelName);
    const inheritingModels = modelsCache.getInheritingModels(modelName);
    
    // Encontrar el modelo base (no heredado)
    const baseModel = models.find(m => !m.isInherit);
    
    if (!baseModel) {
        throw new Error(`No se encontró el modelo base: ${modelName}`);
    }
    
    const node: InheritanceNode = {
        modelName: baseModel.name,
        children: [],
        filePath: baseModel.filePath,
        moduleName: baseModel.moduleName,
        isBaseModel: true,
        className: baseModel.className,
        inheritanceType: 'extension'
    };
    
    // Agregar modelos que heredan (solo los que tienen información válida)
    for (const inheriting of inheritingModels) {
        // Solo incluir si tiene información válida
        if (inheriting.filePath && inheriting.moduleName) {
            const childNode: InheritanceNode = {
                modelName: inheriting.name,
                children: [],
                filePath: inheriting.filePath,
                moduleName: inheriting.moduleName,
                isBaseModel: false,
                className: inheriting.className,
                inheritanceType: 'extension',
                parentModels: [modelName]
            };
            
            // Recursivamente construir árbol para modelos que heredan de este
            // Solo si no hemos alcanzado la profundidad máxima
            if (visited.size < maxDepth) {
                const grandChildren = modelsCache.getInheritingModels(inheriting.name);
                for (const grandChild of grandChildren) {
                    // Solo procesar si no hemos visitado este modelo antes
                    if (!visited.has(grandChild.name)) {
                        const grandChildNode = buildInheritanceTree(grandChild.name, modelsCache, new Set(visited), maxDepth);
                        if (grandChildNode.filePath && grandChildNode.moduleName) {
                            childNode.children.push(grandChildNode);
                        }
                    }
                }
            }
            
            node.children.push(childNode);
        }
    }
    
    return node;
}

/**
 * Obtiene información detallada de un repositorio remoto
 */
function getRemoteRepositoryInfo(filePath: string, projectManager: ProjectManager): { isRemote: boolean, repoName: string, repoUrl: string } {
    const profile = projectManager.getCurrentProfile();
    
    if (profile && profile.paths.remoteRepositories) {
        for (const repo of profile.paths.remoteRepositories) {
            if (repo.localCachePath && filePath.startsWith(repo.localCachePath)) {
                return {
                    isRemote: true,
                    repoName: repo.name,
                    repoUrl: repo.url
                };
            }
        }
    }
    
    return {
        isRemote: false,
        repoName: '',
        repoUrl: ''
    };
}

/**
 * Formatea el árbol de herencia para mostrar
 */
function formatInheritanceTree(node: InheritanceNode, level: number = 0, projectManager: ProjectManager): string {
    const indent = '  '.repeat(level);
    const prefix = level === 0 ? '🌳' : '├─';
    
    let result = `${indent}${prefix} **${node.modelName}**\n`;
    
    // Información del módulo
    if (node.moduleName) {
        result += `${indent}   📁 Módulo: ${node.moduleName}\n`;
    }
    
    // Información del archivo con ruta completa
    if (node.filePath) {
        const fileName = path.basename(node.filePath);
        const dirName = path.dirname(node.filePath);
        
        // Determinar si es un repositorio remoto
        const remoteInfo = getRemoteRepositoryInfo(node.filePath, projectManager);
        
        if (remoteInfo.isRemote) {
            result += `${indent}   📄 Archivo: ${fileName} (🔗 ${remoteInfo.repoName})\n`;
            result += `${indent}   📂 Ruta: ${node.filePath}\n`;
            result += `${indent}   🌐 Repositorio: ${remoteInfo.repoUrl}\n`;
        } else {
            result += `${indent}   📄 Archivo: ${fileName}\n`;
            result += `${indent}   📂 Ruta: ${node.filePath}\n`;
        }
    }
    
    // Información de la clase
    if (node.className) {
        result += `${indent}   🐍 Clase: ${node.className}\n`;
    }
    
    // Información de herencia
    if (node.parentModels && node.parentModels.length > 0) {
        result += `${indent}   🔗 Hereda de: ${node.parentModels.join(', ')}\n`;
    }
    
    // Información del tipo de modelo
    if (node.isBaseModel) {
        result += `${indent}   🏗️ Tipo: Modelo Base (_name)\n`;
    } else {
        result += `${indent}   🔄 Tipo: Herencia (_inherit)\n`;
    }
    
    // Información del tipo de herencia
    result += `${indent}   📋 Herencia: ${node.inheritanceType}\n`;
    
    result += '\n';
    
    // Agregar hijos (limitando la profundidad para evitar recursión infinita)
    if (level < 10 && node.children.length > 0) {
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isLast = i === node.children.length - 1;
            
            // Solo mostrar hijos que tengan información válida
            if (child.filePath && child.moduleName) {
                result += formatInheritanceTree(child, level + 1, projectManager);
            }
        }
    } else if (level >= 10) {
        result += `${indent}   ⚠️ Profundidad máxima alcanzada (${node.children.length} hijos más)\n\n`;
    }
    
    return result;
}

/**
 * Analiza el contexto para el autocompletado
 */
function analyzeCompletionContext(
    document: vscode.TextDocument, 
    position: vscode.Position, 
    modelsCache: ModelsCache
): CompletionContext {
    const lineText = document.lineAt(position).text;
    const wordRange = document.getWordRangeAtPosition(position);
    const wordAtCursor = wordRange ? document.getText(wordRange) : '';
    
    // Obtener líneas anteriores para contexto
    const previousLines: string[] = [];
    for (let i = Math.max(0, position.line - 10); i < position.line; i++) {
        previousLines.push(document.lineAt(i).text);
    }
    
    // Detectar modelo actual
    const currentModel = detectCurrentModel(previousLines);
    
    // Detectar método actual
    const currentMethod = detectCurrentMethod(previousLines);
    
    // Detectar clase actual
    const currentClass = detectCurrentClass(previousLines);
    
    // Calcular nivel de indentación
    const indentLevel = calculateIndentLevel(lineText);
    
    // Detectar si estamos en una cadena o comentario
    const isInString = isCursorInString(document, position);
    const isInComment = isCursorInComment(document, position);
    
    return {
        currentModel,
        availableModels: modelsCache.getAllModelsMap(),
        currentMethod,
        currentClass,
        lineText,
        position: position.character,
        wordAtCursor,
        indentLevel,
        previousLines,
        isInString,
        isInComment
    };
}

/**
 * Genera elementos de autocompletado basados en el contexto
 */
function generateCompletionItems(context: CompletionContext, wordAtCursor: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    
    // Si estamos en una cadena o comentario, no mostrar sugerencias
    if (context.isInString || context.isInComment) {
        return items;
    }
    
    // Sugerencias de modelos
    if (context.lineText.includes('self.env[') || context.lineText.includes('env[')) {
        const modelNames = Array.from(context.availableModels.keys());
        for (const modelName of modelNames) {
            if (modelName.toLowerCase().includes(wordAtCursor.toLowerCase())) {
                const item = new vscode.CompletionItem(modelName, vscode.CompletionItemKind.Class);
                item.detail = `Modelo Gextia: ${modelName}`;
                item.documentation = `Modelo de Gextia: ${modelName}`;
                items.push(item);
            }
        }
    }
    
    // Sugerencias de campos si estamos en un modelo
    if (context.currentModel) {
        const fields = context.availableModels.get(context.currentModel);
        if (fields && fields.length > 0) {
            for (const field of fields[0].fields) {
                if (field.name.toLowerCase().includes(wordAtCursor.toLowerCase())) {
                    const item = new vscode.CompletionItem(field.name, vscode.CompletionItemKind.Field);
                    item.detail = `Campo ${field.type}: ${field.name}`;
                    item.documentation = field.docString || `Campo ${field.type}`;
                    items.push(item);
                }
            }
        }
    }
    
    // Sugerencias de métodos comunes de Gextia
    const commonMethods = [
        'create', 'write', 'unlink', 'read', 'search', 'browse',
        'ensure_one', 'filtered', 'mapped', 'sorted', 'exists'
    ];
    
    for (const method of commonMethods) {
        if (method.toLowerCase().includes(wordAtCursor.toLowerCase())) {
            const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
            item.detail = `Método Gextia: ${method}`;
            item.documentation = `Método estándar de Gextia: ${method}`;
            items.push(item);
        }
    }
    
    return items;
}

// Funciones auxiliares para el análisis de contexto
function detectCurrentModel(lines: string[]): string | undefined {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const match = line.match(/_name\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

function detectCurrentMethod(lines: string[]): string | undefined {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const match = line.match(/def\s+(\w+)\s*\(/);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

function detectCurrentClass(lines: string[]): string | undefined {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const match = line.match(/class\s+(\w+)/);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

function calculateIndentLevel(line: string): number {
    let indent = 0;
    for (const char of line) {
        if (char === ' ') indent++;
        else if (char === '\t') indent += 4;
        else break;
    }
    return indent;
}

function isCursorInString(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const beforeCursor = line.substring(0, position.character);
    
    // Contar comillas simples y dobles
    const singleQuotes = (beforeCursor.match(/'/g) || []).length;
    const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
    
    return (singleQuotes % 2 === 1) || (doubleQuotes % 2 === 1);
}

function isCursorInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const beforeCursor = line.substring(0, position.character);
    
    return beforeCursor.includes('#');
}

const showCacheLogCommand = vscode.commands.registerCommand(
    'gextia-dev-helper.showCacheLog',
    () => {
        const modelsCache = ModelsCache.getInstance();
        // Mostrar el output channel del cache
        vscode.commands.executeCommand('workbench.action.output.show');
        vscode.commands.executeCommand('workbench.action.output.toggleOutput');
    }
);

const debugRefreshCacheCommand = vscode.commands.registerCommand(
    'gextia-dev-helper.debugRefreshCache',
    async () => {
        try {
            const projectManager = ProjectManager.getInstance();
            const modelsCache = ModelsCache.getInstance();
            
            // Verificar que hay un perfil activo
            if (!projectManager.hasActiveProfile()) {
                vscode.window.showWarningMessage('No hay un perfil de proyecto activo. Crea uno primero.');
                return;
            }
            
            vscode.window.showInformationMessage('Iniciando refresh de debug del cache...');
            
            // Mostrar progreso
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Debug Refresh Cache",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Limpiando cache...' });
                
                // Limpiar cache completamente
                modelsCache.clearCache();
                
                progress.report({ message: 'Refrescando cache con logging detallado...' });
                
                // Refrescar cache
                await modelsCache.refreshCache();
                
                progress.report({ message: 'Refresh completado' });
            });
            
            // Mostrar estadísticas
            const stats = modelsCache.getCacheStats();
            vscode.window.showInformationMessage(
                `Debug refresh completado: ${stats.totalModels} modelos en ${stats.uniqueModelNames} tipos únicos`
            );
            
            // Mostrar el log
            vscode.commands.executeCommand('gextia-dev-helper.showCacheLog');
            
        } catch (error) {
            vscode.window.showErrorMessage(`Error en debug refresh: ${error}`);
        }
    }
);