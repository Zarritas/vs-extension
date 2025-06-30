import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GextiaModel, GextiaField, GextiaMethod, ModuleManifest } from '../types';
import { ModelParser } from '../parser/modelParser';
import { ProjectManager } from '../config/projectManager';

export class ModelsCache {
    private static instance: ModelsCache;
    private cache: Map<string, GextiaModel[]> = new Map(); // ModelName -> GextiaModel[]
    private componentsCache: Map<string, GextiaModel[]> = new Map(); // ComponentName -> GextiaModel[]
    private fileModificationTimes: Map<string, number> = new Map(); // FilePath -> LastModificationTime
    private isInitialized: boolean = false;
    private isRefreshing: boolean = false;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gextia Models Cache');
    }

    public static getInstance(): ModelsCache {
        if (!ModelsCache.instance) {
            ModelsCache.instance = new ModelsCache();
        }
        return ModelsCache.instance;
    }

    /**
     * Inicializa el caché cargando todos los modelos
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized || this.isRefreshing) {
            return;
        }

        const projectManager = ProjectManager.getInstance();
        if (!projectManager.hasActiveProfile()) {
            this.log('No active profile found, skipping cache initialization');
            return;
        }

        this.isRefreshing = true;
        this.log('Initializing models cache...');

        try {
            await this.refreshCache();
            this.isInitialized = true;
            this.log(`Cache initialized with ${this.getTotalModelsCount()} models`);
            
            // Mostrar notificación al usuario
            vscode.window.showInformationMessage(
                `Gextia models cache initialized: ${this.getTotalModelsCount()} models loaded`
            );
            
        } catch (error) {
            this.log(`Error initializing cache: ${error}`);
            vscode.window.showErrorMessage('Error initializing Gextia models cache');
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Refresca completamente el caché
     */
    public async refreshCache(): Promise<void> {
        if (this.isRefreshing) {
            this.log('Cache refresh already in progress');
            return;
        }
        this.isRefreshing = true;
        this.log('=== INICIANDO REFRESH DEL CACHE ===');
        try {
            // Limpiar caché actual
            this.cache.clear();
            this.componentsCache.clear();
            this.fileModificationTimes.clear();
            const projectManager = ProjectManager.getInstance();
            const modelParser = ModelParser.getInstance();
            const allPaths = projectManager.getAllModelsPaths();
            this.log(`Total de rutas a analizar: ${allPaths.length}`);
            this.log('Rutas encontradas:');
            allPaths.forEach((path, index) => {
                this.log(`  ${index + 1}. ${path} ${fs.existsSync(path) ? '✅' : '❌'}`);
            });
            // Parsear modelos y componentes en cada ruta
            for (const modelPath of allPaths) {
                this.log(`\n--- Analizando ruta: ${modelPath} ---`);
                if (!fs.existsSync(modelPath)) {
                    this.log(`⚠️  Ruta no existe, saltando: ${modelPath}`);
                    continue;
                }
                try {
                    const pathModels = await modelParser.parseModelsInPath(modelPath);
                    this.log(`📊 Modelos encontrados en esta ruta: ${pathModels.size}`);
                    // Merge con el caché existente
                    for (const [modelName, models] of pathModels) {
                        // Si es un componente, guardar en componentsCache
                        if (models.length > 0 && models[0].modelType === 'component') {
                            if (!this.componentsCache.has(modelName)) {
                                this.componentsCache.set(modelName, []);
                            }
                            this.componentsCache.get(modelName)!.push(...models);
                        } else {
                            if (!this.cache.has(modelName)) {
                                this.cache.set(modelName, []);
                            }
                            this.cache.get(modelName)!.push(...models);
                        }
                    }
                    // Actualizar tiempos de modificación
                    await this.updateFileModificationTimes(modelPath);
                } catch (error) {
                    this.log(`❌ Error analizando modelos en ${modelPath}: ${error}`);
                }
            }
            this.log(`\n=== CACHE REFRESH COMPLETADO ===`);
            this.log(`📈 Total de modelos cargados: ${this.getTotalModelsCount()}`);
            this.log(`📊 Tipos únicos de modelos: ${this.cache.size}`);
            this.log(`📊 Tipos únicos de componentes: ${this.componentsCache.size}`);
        } catch (error) {
            this.log(`❌ Error refrescando cache: ${error}`);
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Actualiza los tiempos de modificación de archivos en una ruta
     */
    private async updateFileModificationTimes(basePath: string): Promise<void> {
        try {
            await this.scanDirectoryForPythonFiles(basePath, async (filePath) => {
                try {
                    const stat = await fs.promises.stat(filePath);
                    this.fileModificationTimes.set(filePath, stat.mtime.getTime());
                } catch (error) {
                    this.log(`Error getting modification time for ${filePath}: ${error}`);
                }
            });
        } catch (error) {
            this.log(`Error updating modification times for ${basePath}: ${error}`);
        }
    }

    /**
     * Escanea un directorio buscando archivos Python recursivamente
     */
    private async scanDirectoryForPythonFiles(
        dirPath: string, 
        callback: (filePath: string) => Promise<void>
    ): Promise<void> {
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '__pycache__') {
                    await this.scanDirectoryForPythonFiles(fullPath, callback);
                } else if (entry.isFile() && entry.name.endsWith('.py')) {
                    await callback(fullPath);
                }
            }
        } catch (error) {
            // Directorio no accesible, continuar
        }
    }

    /**
     * Verifica si un archivo ha sido modificado
     */
    private async isFileModified(filePath: string): Promise<boolean> {
        try {
            const stat = await fs.promises.stat(filePath);
            const currentTime = stat.mtime.getTime();
            const cachedTime = this.fileModificationTimes.get(filePath);
            
            return !cachedTime || currentTime > cachedTime;
        } catch {
            return true; // Si no podemos obtener la info, asumir que está modificado
        }
    }

    /**
     * Actualiza el caché para un archivo específico
     */
    public async updateFileInCache(filePath: string): Promise<void> {
        if (!this.isInitialized || this.isRefreshing) {
            return;
        }

        // Verificar si el archivo fue modificado
        if (!(await this.isFileModified(filePath))) {
            return;
        }

        this.log(`Updating cache for file: ${filePath}`);

        try {
            const modelParser = ModelParser.getInstance();
            
            // Encontrar el módulo al que pertenece el archivo
            const moduleName = this.getModuleNameFromFilePath(filePath);
            if (!moduleName) {
                this.log(`Could not determine module name for ${filePath}`);
                return;
            }

            // Remover modelos antiguos de este archivo
            this.removeModelsFromFile(filePath);

            // Cargar manifest del módulo
            const manifest = await this.loadModuleManifest(filePath);
            
            // Parsear el archivo actualizado
            const models = await modelParser.parseModelsInFile(filePath, moduleName, manifest);

            // Agregar modelos al caché
            for (const model of models) {
                if (!this.cache.has(model.name)) {
                    this.cache.set(model.name, []);
                }
                this.cache.get(model.name)!.push(model);
            }

            // Actualizar tiempo de modificación
            const stat = await fs.promises.stat(filePath);
            this.fileModificationTimes.set(filePath, stat.mtime.getTime());

            this.log(`Cache updated for ${filePath}: ${models.length} models`);

        } catch (error) {
            this.log(`Error updating cache for ${filePath}: ${error}`);
        }
    }

    /**
     * Carga el manifest de un módulo
     */
    private async loadModuleManifest(filePath: string): Promise<ModuleManifest | null> {
        try {
            const modulePath = this.getModulePathFromFilePath(filePath);
            if (!modulePath) {
                return null;
            }
            
            const modelParser = ModelParser.getInstance();
            return await modelParser.parseManifest(modulePath);
            
        } catch (error) {
            this.log(`Error loading manifest for ${filePath}: ${error}`);
            return null;
        }
    }

    /**
     * Obtiene la ruta del módulo desde la ruta del archivo
     */
    private getModulePathFromFilePath(filePath: string): string | null {
        const parts = filePath.split(path.sep);
        
        // Buscar el directorio que contiene __manifest__.py
        for (let i = parts.length - 1; i >= 0; i--) {
            const possibleModulePath = parts.slice(0, i + 1).join(path.sep);
            
            try {
                const manifestPath = path.join(possibleModulePath, '__manifest__.py');
                const openerp = path.join(possibleModulePath, '__openerp__.py');
                
                if (fs.existsSync(manifestPath) || fs.existsSync(openerp)) {
                    return possibleModulePath;
                }
            } catch {
                // Continuar buscando
            }
        }
        
        return null;
    }

    /**
     * Remueve modelos de un archivo específico del caché
     */
    private removeModelsFromFile(filePath: string): void {
        for (const [modelName, models] of this.cache) {
            const filteredModels = models.filter(model => model.filePath !== filePath);
            
            if (filteredModels.length === 0) {
                this.cache.delete(modelName);
            } else {
                this.cache.set(modelName, filteredModels);
            }
        }
    }

    /**
     * Obtiene el nombre del módulo desde la ruta del archivo
     */
    private getModuleNameFromFilePath(filePath: string): string | null {
        const parts = filePath.split(path.sep);
        
        // Buscar el directorio que contiene __manifest__.py
        for (let i = parts.length - 1; i >= 0; i--) {
            const possibleModulePath = parts.slice(0, i + 1).join(path.sep);
            
            try {
                const manifestPath = path.join(possibleModulePath, '__manifest__.py');
                const openerp = path.join(possibleModulePath, '__openerp__.py');
                
                if (fs.existsSync(manifestPath) || fs.existsSync(openerp)) {
                    return parts[i];
                }
            } catch {
                // Continuar buscando
            }
        }
        
        return null;
    }

    /**
     * Obtiene todos los modelos de un nombre específico
     */
    public getModels(modelName: string): GextiaModel[] {
        // Buscar primero en Gextia Core
        const projectManager = require('../config/projectManager').ProjectManager.getInstance();
        const corePath = projectManager.getGextiaCorePath && projectManager.getGextiaCorePath();
        if (corePath) {
            for (const [name, models] of this.cache.entries()) {
                if (name === modelName) {
                    // Filtrar modelos cuyo filePath comience con el corePath
                    const coreModels = models.filter(m => m.filePath && m.filePath.startsWith(corePath));
                    if (coreModels.length > 0) {
                        return coreModels;
                    }
                }
            }
        }
        // Si no se encontró en core, buscar en el resto
        return this.cache.get(modelName) || [];
    }

    /**
     * Obtiene todos los componentes de un nombre específico
     */
    public getComponent(componentName: string): GextiaModel[] {
        return this.componentsCache.get(componentName) || [];
    }

    /**
     * Obtiene todos los nombres de modelos disponibles
     */
    public getAllModelNames(): string[] {
        return Array.from(this.cache.keys()).sort();
    }

    /**
     * Obtiene todos los nombres de componentes disponibles
     */
    public getAllComponentNames(): string[] {
        return Array.from(this.componentsCache.keys()).sort();
    }

    /**
     * Obtiene todos los modelos disponibles como Map
     */
    public getAllModelsMap(): Map<string, GextiaModel[]> {
        return new Map(this.cache);
    }

    /**
     * Obtiene todos los componentes disponibles como Map
     */
    public getAllComponentsMap(): Map<string, GextiaModel[]> {
        return new Map(this.componentsCache);
    }

    /**
     * Obtiene todos los métodos disponibles para un modelo (incluye herencia)
     */
    public getAllMethodsForModel(modelName: string): Map<string, GextiaMethod[]> {
        const allMethods = new Map<string, GextiaMethod[]>();
        
        // Obtener métodos del modelo base
        const baseModels = this.getModels(modelName);
        for (const model of baseModels) {
            for (const method of model.methods) {
                if (!allMethods.has(method.name)) {
                    allMethods.set(method.name, []);
                }
                allMethods.get(method.name)!.push(method);
            }
        }
        
        // Obtener métodos de modelos que heredan
        const inheritingModels = this.getInheritingModels(modelName);
        for (const model of inheritingModels) {
            for (const method of model.methods) {
                if (!allMethods.has(method.name)) {
                    allMethods.set(method.name, []);
                }
                allMethods.get(method.name)!.push(method);
            }
        }
        
        return allMethods;
    }

    /**
     * Obtiene todos los campos disponibles para un modelo (incluye herencia)
     */
    public getAllFieldsForModel(modelName: string): Map<string, GextiaField[]> {
        const allFields = new Map<string, GextiaField[]>();
        
        // Obtener campos del modelo base
        const baseModels = this.getModels(modelName);
        for (const model of baseModels) {
            for (const field of model.fields) {
                if (!allFields.has(field.name)) {
                    allFields.set(field.name, []);
                }
                allFields.get(field.name)!.push(field);
            }
        }
        
        // Obtener campos de modelos que heredan
        const inheritingModels = this.getInheritingModels(modelName);
        for (const model of inheritingModels) {
            for (const field of model.fields) {
                if (!allFields.has(field.name)) {
                    allFields.set(field.name, []);
                }
                allFields.get(field.name)!.push(field);
            }
        }
        
        return allFields;
    }

    /**
     * Obtiene todos los modelos que heredan de un modelo específico
     */
    public getInheritingModels(modelName: string): GextiaModel[] {
        const inheriting: GextiaModel[] = [];
        
        for (const models of this.cache.values()) {
            for (const model of models) {
                if (model.isInherit && model.inheritFrom === modelName) {
                    inheriting.push(model);
                }
            }
        }
        
        return inheriting;
    }

    /**
     * Verifica si el caché está inicializado
     */
    public isReady(): boolean {
        return this.isInitialized && !this.isRefreshing;
    }

    /**
     * Obtiene el número total de modelos en caché
     */
    private getTotalModelsCount(): number {
        let count = 0;
        for (const models of this.cache.values()) {
            count += models.length;
        }
        return count;
    }

    /**
     * Obtiene estadísticas del caché
     */
    public getCacheStats(): any {
        return {
            totalModels: this.getTotalModelsCount(),
            uniqueModelNames: this.cache.size,
            trackedFiles: this.fileModificationTimes.size,
            isInitialized: this.isInitialized,
            isRefreshing: this.isRefreshing
        };
    }

    /**
     * Limpia completamente el caché
     */
    public clearCache(): void {
        this.cache.clear();
        this.componentsCache.clear();
        this.fileModificationTimes.clear();
        this.isInitialized = false;
        this.log('Cache cleared');
    }

    /**
     * Log para debug
     */
    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        
        // Siempre mostrar en el output channel
        this.outputChannel.appendLine(logMessage);
        
        // También mostrar en consola si debug mode está habilitado
        if (vscode.workspace.getConfiguration('gextia-dev-helper').get('enableDebugMode')) {
            console.log(logMessage);
        }
    }
}