/**
 * Extensión VS Code: Gextia Development Helper
 * ---------------------------------------------
 * Proporciona gestión avanzada de proyectos Gextia, autocompletado inteligente,
 * navegación de modelos, gestión visual de rutas y repositorios, y utilidades
 * para desarrolladores de addons Gextia.
 *
 * Estructura principal:
 * - TreeView nativo para gestión visual de rutas, modelos, componentes y acciones.
 * - Comandos para manipulación de rutas, perfiles y repositorios.
 * - Proveedores de autocompletado y navegación para Python.
 * - Utilidades para refresco de caché y sincronización remota.
 *
 * Autor: Jesus Lorenzo
 * Última revisión: 2025-07-02
 */

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

    // Instancias singleton globales para evitar llamadas repetidas
    const projectManager = ProjectManager.getInstance();
    const modelsCache = ModelsCache.getInstance();
    const remoteManager = RemoteRepositoryManager.getInstance();
    
    // Utilidad para mostrar mensajes y log de depuración
    function showMsg(msg: string, type: 'info'|'warn'|'error' = 'info') {
        if (type === 'info') vscode.window.showInformationMessage(msg);
        else if (type === 'warn') vscode.window.showWarningMessage(msg);
        else vscode.window.showErrorMessage(msg);
        projectManager.log(`[${type.toUpperCase()}] ${msg}`);
    }

    // Utilidad para loggear acciones
    function debugLog(action: string, data?: any) {
        let msg = `[DEBUG] Acción: ${action}`;
        if (data !== undefined) {
            try {
                msg += ' | Datos: ' + JSON.stringify(data);
            } catch {
                msg += ' | Datos: [no serializable]';
            }
        }
        projectManager.log(msg);
    }

    // --- Handlers de selección de nodos del TreeView ---
    async function handleCampoNode(item: any) {
        debugLog('handleCampoNode', item);
        if (item.parentModelName) {
            const modelos = modelsCache.getModels(item.parentModelName);
            if (modelos.length > 0) {
                const campo = modelos[0].fields.find((f: any) => f.name === item.label);
                if (campo && modelos[0].filePath && campo.lineNumber) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(modelos[0].filePath);
                        await vscode.window.showTextDocument(doc, { selection: new vscode.Range(campo.lineNumber-1,0,campo.lineNumber-1,0), preview: false });
                        debugLog('Campo abierto correctamente', { file: modelos[0].filePath, line: campo.lineNumber });
                    } catch (error) {
                        debugLog('Error abriendo campo', error);
                        showMsg('No se pudo abrir el archivo del campo: ' + error, 'error');
                    }
                } else {
                    showMsg(`Campo: ${item.label}${item.description ? ' (' + item.description + ')' : ''}\n${item.tooltip || ''}`);
                }
            }
        }
    }
    async function handleMetodoNode(item: any) {
        debugLog('handleMetodoNode', item);
        if (item.parentModelName) {
            const modelos = modelsCache.getModels(item.parentModelName);
            if (modelos.length > 0) {
                const metodo = modelos[0].methods.find((m: any) => m.name === item.label);
                if (metodo && modelos[0].filePath && metodo.lineNumber) {
                    const doc = await vscode.workspace.openTextDocument(modelos[0].filePath);
                    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(metodo.lineNumber-1,0,metodo.lineNumber-1,0) });
                } else {
                    showMsg(`Método: ${item.label}\n${item.tooltip || ''}`);
                }
            }
        }
    }
    async function handleComponenteNode(item: any) {
        debugLog('handleComponenteNode', item);
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
            showMsg('No se encontró información del componente.', 'warn');
        }
    }

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
        if (item.contextValue === 'campo') {
            await handleCampoNode(item);
        } else if (item.contextValue === 'metodo') {
            await handleMetodoNode(item);
        } else if (item.contextValue === 'componente') {
            await handleComponenteNode(item);
        }
        // 'modelo' solo expande
    });

    // Registrar comandos
    const createProfileCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.createProfile',
        async () => {
            debugLog('createProfileCommand');
            try {
                await projectManager.createProfile();
            } catch (error) {
                debugLog('createProfileCommand ERROR', error);
                showMsg('Error al crear perfil: ' + error, 'error');
            }
        }
    );

    const switchProfileCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.switchProfile',
        async () => {
            debugLog('switchProfileCommand');
            try {
                await projectManager.switchProfile();
            } catch (error) {
                debugLog('switchProfileCommand ERROR', error);
                showMsg('Error al cambiar perfil: ' + error, 'error');
            }
        }
    );

    const refreshModelsCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.refreshModels',
        async () => {
            debugLog('refreshModelsCommand');
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
                debugLog('refreshModelsCommand ERROR', error);
                vscode.window.showErrorMessage(`Error refreshing cache: ${error}`);
            }
        }
    );

    const showInheritanceTreeCommand = vscode.commands.registerCommand(
        'gextia-dev-helper.showInheritanceTree',
        async () => {
            debugLog('showInheritanceTreeCommand');
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
                debugLog('showInheritanceTreeCommand ERROR', error);
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

    // Comando para modificar una ruta desde el TreeView
    context.subscriptions.push(vscode.commands.registerCommand('gextia-dev-helper.editRuta', async (item: {label: string}) => {
        if (!item || !item.label) return;
        const profile = projectManager.getCurrentProfile();
        if (!profile) return;
        const nuevaRuta = await vscode.window.showInputBox({
            prompt: 'Nueva ruta para reemplazar',
            value: item.label
        });
        if (nuevaRuta && nuevaRuta !== item.label) {
            await projectManager.removeAddonsPath(item.label);
            await projectManager.addAddonsPath(nuevaRuta);
            vscode.commands.executeCommand('gextia-dev-helper.refreshTree');
        }
    }));

    // Comando para borrar una ruta desde el TreeView
    context.subscriptions.push(vscode.commands.registerCommand('gextia-dev-helper.deleteRuta', async (item: {label: string}) => {
        if (!item || !item.label) return;
        const profile = projectManager.getCurrentProfile();
        if (!profile) return;
        const confirm = await vscode.window.showWarningMessage(`¿Borrar la ruta "${item.label}" del perfil activo?`, 'Sí', 'No');
        if (confirm === 'Sí') {
            await projectManager.removeAddonsPath(item.label);
            vscode.commands.executeCommand('gextia-dev-helper.refreshTree');
        }
    }));

    // Comando para refrescar el TreeView desde cualquier acción
    context.subscriptions.push(vscode.commands.registerCommand('gextia-dev-helper.refreshTree', () => {
        gextiaTreeProvider.refresh();
    }));

    // Registrar comandos para doble clic en campos y métodos
    context.subscriptions.push(vscode.commands.registerCommand('gextia-dev-helper.openCampo', async (item: any) => {
        await handleCampoNode(item);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gextia-dev-helper.openMetodo', async (item: any) => {
        await handleMetodoNode(item);
    }));

    // --- WRAP comandos de repositorios remotos para mostrar mensaje de "No disponible" ---
    function notAvailableMsg() {
        vscode.window.showWarningMessage('La funcionalidad de repositorios remotos aún no está disponible. Próximamente.');
    }
    // Sobrescribir comandos de repositorios remotos para mostrar el mensaje
    context.subscriptions.push(
        vscode.commands.registerCommand('gextia-dev-helper.syncRemoteRepositories', notAvailableMsg),
        vscode.commands.registerCommand('gextia-dev-helper.showRemoteRepositoriesInfo', notAvailableMsg),
        vscode.commands.registerCommand('gextia-dev-helper.testRepositoryConnection', notAvailableMsg),
        vscode.commands.registerCommand('gextia-dev-helper.showSyncLog', notAvailableMsg),
        vscode.commands.registerCommand('gextia-dev-helper.clearSyncLog', notAvailableMsg),
        vscode.commands.registerCommand('gextia-dev-helper.addRemoteRepository', notAvailableMsg),
        vscode.commands.registerCommand('gextia-dev-helper.removeRemoteRepository', notAvailableMsg)
    );

    // Agregar todo al contexto (solo comandos locales y utilidades)
    context.subscriptions.push(
        createProfileCommand,
        switchProfileCommand,
        refreshModelsCommand,
        showInheritanceTreeCommand,
        showCacheStatsCommand,
        completionProvider,
        definitionProvider,
        fileWatcher,
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
 * Construye el árbol de herencia para un modelo Gextia.
 * @param modelName Nombre del modelo raíz
 * @param modelsCache Instancia de ModelsCache
 * @param visited Set de modelos ya visitados (para evitar recursión infinita)
 * @param maxDepth Profundidad máxima de recursión
 * @returns Nodo raíz del árbol de herencia
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
 * Obtiene información de repositorio remoto para un archivo dado.
 * @param filePath Ruta absoluta del archivo
 * @param projectManager Instancia de ProjectManager
 * @returns Objeto con info de si es remoto, nombre y URL
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
 * Formatea el árbol de herencia para mostrarlo en Markdown.
 * @param node Nodo raíz del árbol
 * @param level Nivel de indentación
 * @param projectManager Instancia de ProjectManager
 * @returns String Markdown del árbol
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
 * Analiza el contexto de autocompletado en un documento Python.
 * @param document Documento VS Code
 * @param position Posición del cursor
 * @param modelsCache Instancia de ModelsCache
 * @returns Contexto de autocompletado
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
 * Genera sugerencias de autocompletado para el contexto dado.
 * @param context Contexto de autocompletado
 * @param wordAtCursor Palabra bajo el cursor
 * @returns Lista de CompletionItem
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

// --------------------
// Funciones auxiliares
// --------------------

/**
 * Detecta el nombre del modelo actual en el código.
 * @param lines Líneas previas de código
 * @returns Nombre del modelo o undefined
 */
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

/**
 * Detecta el método actual en el código.
 * @param lines Líneas previas de código
 * @returns Nombre del método o undefined
 */
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

/**
 * Detecta la clase actual en el código.
 * @param lines Líneas previas de código
 * @returns Nombre de la clase o undefined
 */
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

/**
 * Calcula el nivel de indentación de una línea.
 * @param line Línea de código
 * @returns Nivel de indentación (espacios)
 */
function calculateIndentLevel(line: string): number {
    let indent = 0;
    for (const char of line) {
        if (char === ' ') indent++;
        else if (char === '\t') indent += 4;
        else break;
    }
    return indent;
}

/**
 * Determina si el cursor está dentro de una cadena.
 * @param document Documento VS Code
 * @param position Posición del cursor
 * @returns true si está en una cadena
 */
function isCursorInString(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const beforeCursor = line.substring(0, position.character);
    
    // Contar comillas simples y dobles
    const singleQuotes = (beforeCursor.match(/'/g) || []).length;
    const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
    
    return (singleQuotes % 2 === 1) || (doubleQuotes % 2 === 1);
}

/**
 * Determina si el cursor está dentro de un comentario.
 * @param document Documento VS Code
 * @param position Posición del cursor
 * @returns true si está en un comentario
 */
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