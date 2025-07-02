import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GextiaProjectProfile, RemoteRepository } from '../types';
import { RemoteRepositoryManager } from '../remote/remoteRepositoryManager';
import { ProfileManager } from './profileManager';

export class ProjectManager {
    private static instance: ProjectManager;
    private profileManager: ProfileManager;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gextia Dev Helper');
        this.profileManager = new ProfileManager();
    }

    public static getInstance(): ProjectManager {
        if (!ProjectManager.instance) {
            ProjectManager.instance = new ProjectManager();
        }
        return ProjectManager.instance;
    }

    /**
     * Crea un nuevo perfil de proyecto
     */
    public async createProfile(): Promise<void> {
        try {
            // Solicitar información del perfil
            const profileName = await vscode.window.showInputBox({
                prompt: 'Nombre del perfil de proyecto',
                placeHolder: 'Mi Proyecto Gextia'
            });

            if (!profileName) {return;}

            const description = await vscode.window.showInputBox({
                prompt: 'Descripción del proyecto (opcional)',
                placeHolder: 'Descripción del proyecto...'
            });

            // Seleccionar versión de Gextia
            const gextiaVersion = await vscode.window.showQuickPick([
                '16.0'
            ], {
                placeHolder: 'Selecciona la versión de Gextia'
            });

            if (!gextiaVersion) {return;}

            // Configurar rutas
            const paths = await this.configureProjectPaths();
            if (!paths) {return;}

            const profile: GextiaProjectProfile = {
                name: profileName,
                description,
                gextiaVersion,
                paths,
                excludePatterns: [
                    '**/migrations/**',
                    '**/tests/**',
                    '**/__pycache__/**',
                    '**/*.pyc'
                ]
            };

            // Guardar perfil usando ProfileManager
            await this.profileManager.createProfile(profile);

            vscode.window.showInformationMessage(`Perfil "${profileName}" creado exitosamente`);

        } catch (error) {
            this.outputChannel.appendLine(`Error creating profile: ${error}`);
            vscode.window.showErrorMessage('Error al crear el perfil');
        }
    }

    /**
     * Configura las rutas del proyecto
     */
    private async configureProjectPaths(): Promise<any> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showWarningMessage('No hay carpetas de trabajo abiertas');
            return null;
        }

        const paths = {
            addonsPath: [] as string[],
            gextiaPath: undefined as string | undefined,
            remoteRepositories: [] as RemoteRepository[],
        };
        
        // Paso 1: Detectar automáticamente carpetas de addons
        const detectedPaths = await this.detectAddonsPaths();
        
        if (detectedPaths.length > 0) {
            const useDetected = await vscode.window.showQuickPick(['Sí', 'No'], {
                placeHolder: `¿Usar las rutas detectadas automáticamente? (${detectedPaths.length} encontradas)`
            });

            if (useDetected === 'Sí') {
                paths.addonsPath.push(...detectedPaths);
            }
        }

        // Paso 2: Configurar rutas específicas
        let configuring = true;
        while (configuring) {
            const options = [
                'Agregar ruta de addons personalizados',
                'Agregar repositorio remoto (GitHub/GitLab)',
                'Configurar ruta de Gextia Core',
                'Ver rutas configuradas',
                'Finalizar configuración'
            ];

            const action = await vscode.window.showQuickPick(options, {
                placeHolder: 'Selecciona una acción de configuración'
            });

            switch (action) {
                case 'Agregar ruta de addons personalizados':
                    await this.configureCustomAddonsPath(paths);
                    break;

                case 'Agregar repositorio remoto (GitHub/GitLab)':
                    await this.configureRemoteRepository(paths);
                    break;

                case 'Configurar ruta de Gextia Core':
                    await this.configureGextiaCorePath(paths);
                    break;
                    
                case 'Ver rutas configuradas':
                    this.showConfiguredPaths(paths);
                    break;
                    
                case 'Finalizar configuración':
                    configuring = false;
                    break;
            }
        }

        // Validar que al menos tengamos addons o core
        if (paths.addonsPath.length === 0 && !paths.gextiaPath) {
            vscode.window.showWarningMessage('Debe configurar al menos una ruta de addons o la ruta de Gextia Core');
            return null;
        }

        return paths;
    }

    /**
     * Configura un repositorio remoto
     */
    private async configureRemoteRepository(paths: any): Promise<void> {
        const remoteManager = RemoteRepositoryManager.getInstance();
        
        const repository = await remoteManager.configureRemoteRepository();
        if (repository) {
            paths.remoteRepositories.push(repository);
            
            // Preguntar si sincronizar ahora
            const syncNow = await vscode.window.showQuickPick(['Sí', 'No'], {
                placeHolder: '¿Sincronizar repositorio ahora? (puede tardar unos minutos)'
            });
            
            if (syncNow === 'Sí') {
                vscode.window.showInformationMessage('Sincronizando repositorio...');
                const success = await remoteManager.syncRepository(repository);
                
                if (success) {
                    vscode.window.showInformationMessage(`Repositorio "${repository.name}" sincronizado exitosamente`);
                } else {
                    vscode.window.showWarningMessage(`Error sincronizando repositorio "${repository.name}"`);
                }
            }
        }
    }


    /**
     * Configura ruta de addons personalizados
     */
    private async configureCustomAddonsPath(paths: any): Promise<void> {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: true,
            openLabel: 'Seleccionar carpeta(s) de addons personalizados'
        });

        if (folderUri && folderUri.length > 0) {
            for (const uri of folderUri) {
                if (!paths.addonsPath.includes(uri.fsPath)) {
                    paths.addonsPath.push(uri.fsPath);
                    vscode.window.showInformationMessage(`Agregada ruta de addons: ${uri.fsPath}`);
                }
            }
        }
    }

    /**
     * Configura ruta de Gextia Core
     */
    private async configureGextiaCorePath(paths: any): Promise<void> {
        const description = `
            Selecciona la carpeta raíz de Gextia (donde están las carpetas 'gextia' y 'addons').
            Ejemplos:
            • /opt/gextia-server/gextia/
            • /home/user/gextia-server/
            • C:\\gextia-server\\gextia\\

            Esta carpeta debe contener:
            • gextia/ (código core de Gextia)
            • addons/ (addons oficiales básicos)
        `;

        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Seleccionar carpeta raíz de Gextia Core'
        });

        if (folderUri && folderUri[0]) {
            const selectedPath = folderUri[0].fsPath;
            
            // Validar que la ruta contenga la estructura esperada de Gextia
            const isValidGextiaPath = await this.validateGextiaCorePath(selectedPath);
            
            if (isValidGextiaPath) {
                paths.gextiaPath = selectedPath;
                vscode.window.showInformationMessage(`Configurada ruta de Gextia Core: ${selectedPath}`);
            } else {
                const forceUse = await vscode.window.showWarningMessage(
                    'La ruta seleccionada no parece contener una instalación válida de Gextia. ¿Usar de todas formas?',
                    'Usar de todas formas',
                    'Cancelar'
                );
                
                if (forceUse === 'Usar de todas formas') {
                    paths.gextiaPath = selectedPath;
                }
            }
        }
    }

    /**
     * Valida que una ruta contenga una instalación válida de Gextia
     */
    private async validateGextiaCorePath(gextiaPath: string): Promise<boolean> {
        try {
            const fs = require('fs').promises;
            
            // Buscar indicadores de que es una instalación de Gextia
            const possibleIndicators = [
                path.join(gextiaPath, 'odoo', '__init__.py'),
                path.join(gextiaPath, 'odoo', 'release.py'),
                path.join(gextiaPath, 'addons', 'base', '__manifest__.py'),
                path.join(gextiaPath, 'addons', 'base', '__openerp__.py'),
                path.join(gextiaPath, 'odoo-bin'),
            ];

            for (const indicator of possibleIndicators) {
                try {
                    await fs.access(indicator);
                    return true; // Si encontramos cualquier indicador válido
                } catch {
                    // Continuar buscando
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Muestra las rutas configuradas actualmente
     */
    private showConfiguredPaths(paths: any): void {
        let message = 'Rutas configuradas:\n\n';
        
        if (paths.addonsPath.length > 0) {
            message += '📁 Addons personalizados:\n';
            paths.addonsPath.forEach((path: string, index: number) => {
                message += `  ${index + 1}. ${path}\n`;
            });
            message += '\n';
        }
        
        if (paths.gextiaPath) {
            message += `🔧 Gextia Core: ${paths.gextiaPath}\n\n`;
        }
        
        if (paths.enterprisePath) {
            message += `💼 Enterprise: ${paths.enterprisePath}\n\n`;
        }
        
        if (paths.communityPath) {
            message += `🌍 Community: ${paths.communityPath}\n\n`;
        }

        if (paths.addonsPath.length === 0 && !paths.gextiaPath && !paths.enterprisePath && !paths.communityPath) {
            message = 'No hay rutas configuradas aún.';
        }

        vscode.window.showInformationMessage(message);
    }

    /**
     * Detecta automáticamente carpetas que contengan módulos de Gextia
     */
    private async detectAddonsPaths(): Promise<string[]> {
        const paths: string[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {return paths;}

        for (const folder of workspaceFolders) {
            const detected = await this.scanForGextiaModules(folder.uri.fsPath);
            paths.push(...detected);
        }

        return paths;
    }

    /**
     * Escanea una carpeta buscando módulos de Gextia
     */
    private async scanForGextiaModules(rootPath: string, maxDepth: number = 3): Promise<string[]> {
        const paths: string[] = [];

        const scanDirectory = async (dirPath: string, currentDepth: number): Promise<void> => {
            if (currentDepth > maxDepth) {return;}

            try {
                const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
                let hasManifest = false;

                // Verificar si esta carpeta tiene un manifest de Gextia
                for (const entry of entries) {
                    if (entry.isFile() && (entry.name === '__manifest__.py')) {
                        hasManifest = true;
                        break;
                    }
                }

                if (hasManifest) {
                    // Si encontramos un módulo, agregamos la carpeta padre como ruta de addons
                    const addonsPath = path.dirname(dirPath);
                    if (!paths.includes(addonsPath)) {
                        paths.push(addonsPath);
                    }
                } else {
                    // Continuar buscando en subdirectorios
                    for (const entry of entries) {
                        if (entry.isDirectory() && !entry.name.startsWith('.')) {
                            await scanDirectory(path.join(dirPath, entry.name), currentDepth + 1);
                        }
                    }
                }
            } catch (error) {
                // Ignorar errores de permisos
            }
        };

        await scanDirectory(rootPath, 0);
        return paths;
    }

    /**
     * Cambia el perfil activo
     */
    public async switchProfile(): Promise<void> {
        const profileNames = this.profileManager.getProfileNames();
        if (profileNames.length === 0) {
            const create = await vscode.window.showInformationMessage(
                'No hay perfiles configurados. ¿Crear uno nuevo?',
                'Crear perfil'
            );
            if (create) {
                await this.createProfile();
            }
            return;
        }
        const selectedProfile = await vscode.window.showQuickPick(profileNames, {
            placeHolder: 'Selecciona un perfil de proyecto'
        });
        if (selectedProfile) {
            await this.profileManager.setCurrentProfile(selectedProfile);
            vscode.window.showInformationMessage(`Perfil activo: ${selectedProfile}`);
        }
    }

    /**
     * Obtiene el perfil actual
     */
    public getCurrentProfile(): GextiaProjectProfile | null {
        return this.profileManager.getCurrentProfile();
    }

    /**
     * Obtiene todas las rutas donde buscar modelos Python
     */
    public getAllModelsPaths(): string[] {
        const paths: string[] = [];
        
        // Rutas de addons (donde están los modelos de módulos)
        paths.push(...this.getAllAddonsPaths());
        
        // Ruta del core de Gextia (donde están los modelos base)
        const corePath = this.getGextiaCorePath();
        if (corePath) {
            paths.push(corePath);
        }
        
        return paths;
    }
    
    /**
     * Obtiene todas las rutas de addons del perfil actual
     */
    public getAllAddonsPaths(): string[] {
        if (!this.getCurrentProfile()) {
            this.log('No hay perfil activo, retornando rutas vacías');
            return [];
        }
        
        this.log('=== OBTENIENDO RUTAS DE ADDONS ===');
        const allPaths: string[] = [];
        
        // Agregar rutas de addons personalizados
        if (this.getCurrentProfile()!.paths.addonsPath) {
            this.log(`Rutas de addons personalizados: ${this.getCurrentProfile()!.paths.addonsPath.length}`);
            this.getCurrentProfile()!.paths.addonsPath.forEach((path, index) => {
                this.log(`  ${index + 1}. ${path}`);
                allPaths.push(path);
            });
        } else {
            this.log('No hay rutas de addons personalizados configuradas');
        }
        
        // Agregar rutas de repositorios remotos sincronizados
        const currentProfile = this.getCurrentProfile();
        if (currentProfile && currentProfile.paths.remoteRepositories && currentProfile.paths.remoteRepositories.length > 0) {
            this.log(`Repositorios remotos configurados: ${currentProfile.paths.remoteRepositories.length}`);
            for (const repo of currentProfile.paths.remoteRepositories) {
                this.log(`\n--- Repositorio: ${repo.name} ---`);
                this.log(`  URL: ${repo.url}`);
                this.log(`  Habilitado: ${repo.enabled ? 'Sí' : 'No'}`);
                this.log(`  Ruta local: ${repo.localCachePath || 'No configurada'}`);
                
                if (repo.enabled && repo.localCachePath) {
                    const localPath = repo.localCachePath;
                    this.log(`  Ruta final calculada: ${localPath || 'No disponible'}`);
                    
                    if (localPath && fs.existsSync(localPath)) {
                        this.log(`  ✅ Agregando ruta de repositorio remoto: ${localPath}`);
                        allPaths.push(localPath);
                    } else {
                        this.log(`  ❌ Ruta no existe o no disponible: ${localPath}`);
                    }
                } else {
                    this.log(`  ⚠️  Repositorio no habilitado o sin ruta local`);
                }
            }
        } else {
            this.log('No hay repositorios remotos configurados');
        }
        
        // Agregar ruta de addons de Gextia Core
        const currentProfileForCore = this.getCurrentProfile();
        if (currentProfileForCore && currentProfileForCore.paths.gextiaPath) {
            const coreAddonsPath = path.join(currentProfileForCore.paths.gextiaPath, 'addons');
            this.log(`Ruta de addons de Gextia Core: ${coreAddonsPath}`);
            allPaths.push(coreAddonsPath);
        } else {
            this.log('No hay ruta de Gextia Core configurada');
        }
        
        this.log(`\n=== TOTAL DE RUTAS ENCONTRADAS: ${allPaths.length} ===`);
        allPaths.forEach((path, index) => {
            this.log(`  ${index + 1}. ${path} ${fs.existsSync(path) ? '✅' : '❌'}`);
        });
        
        return allPaths;
    }

    /**
     * Obtiene la ruta del código core de Gextia (para modelos base)
     */
    public getGextiaCorePath(): string | null {
        const currentProfile = this.getCurrentProfile();
        if (!currentProfile?.paths.gextiaPath) {return null;}
        return path.join(currentProfile.paths.gextiaPath, 'odoo');
    }

    /**
     * Configura el perfil actual
     */
    public async setCurrentProfile(profileName: string): Promise<void> {
        await this.profileManager.setCurrentProfile(profileName);
    }

    /**
     * Carga los perfiles desde la configuración
     */
    private loadProfiles(): void {
        this.profileManager.loadProfiles();
    }

    /**
     * Guarda los perfiles en la configuración
     */
    private async saveProfiles(): Promise<void> {
        await this.profileManager.saveProfiles();
    }

    /**
     * Verifica si hay un perfil configurado
     */
    public hasActiveProfile(): boolean {
        return this.profileManager.hasActiveProfile();
    }

    /**
     * Log para debug
     */
    public log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        
        // Siempre mostrar en el output channel
        this.outputChannel.appendLine(logMessage);
        
        // También mostrar en consola si debug mode está habilitado
        if (vscode.workspace.getConfiguration('gextia-dev-helper').get('enableDebugMode')) {
            console.log(logMessage);
        }
    }

    /**
     * Agrega una nueva ruta de addons al proyecto actual
     */
    public async addAddonsPath(addonsPath: string): Promise<boolean> {
        if (!this.getCurrentProfile()) {
            vscode.window.showWarningMessage('No hay un perfil activo. Crea uno primero.');
            return false;
        }

        try {
            // Verificar que la ruta existe
            if (!fs.existsSync(addonsPath)) {
                vscode.window.showWarningMessage(`La ruta no existe: ${addonsPath}`);
                return false;
            }

            // Verificar que no esté ya agregada
            if (this.getCurrentProfile()!.paths.addonsPath.includes(addonsPath)) {
                vscode.window.showInformationMessage('Esta ruta ya está agregada al proyecto.');
                return false;
            }

            // Agregar la ruta
            this.getCurrentProfile()!.paths.addonsPath.push(addonsPath);
            await this.saveProfiles();

            this.log(`Addons path added: ${addonsPath}`);
            vscode.window.showInformationMessage(`Ruta agregada: ${addonsPath}`);

            return true;

        } catch (error) {
            this.log(`Error adding addons path: ${error}`);
            vscode.window.showErrorMessage(`Error agregando ruta: ${error}`);
            return false;
        }
    }

    /**
     * Agrega un nuevo repositorio remoto al proyecto actual
     */
    public async addRemoteRepository(repository: RemoteRepository): Promise<boolean> {
        const currentProfile = this.getCurrentProfile();
        if (!currentProfile) {
            vscode.window.showWarningMessage('No hay un perfil activo. Crea uno primero.');
            return false;
        }
        try {
            if (!currentProfile.paths.remoteRepositories) {
                currentProfile.paths.remoteRepositories = [];
            }
            const existingRepo = currentProfile.paths.remoteRepositories.find(
                repo => repo.name === repository.name || repo.url === repository.url
            );
            if (existingRepo) {
                vscode.window.showInformationMessage('Este repositorio ya está agregado al proyecto.');
                return false;
            }
            currentProfile.paths.remoteRepositories.push(repository);
            await this.profileManager.saveProfiles();
            this.log(`Remote repository added: ${repository.name}`);
            vscode.window.showInformationMessage(`Repositorio agregado: ${repository.name}`);
            return true;
        } catch (error) {
            this.log(`Error adding remote repository: ${error}`);
            vscode.window.showErrorMessage(`Error agregando repositorio: ${error}`);
            return false;
        }
    }

    /**
     * Remueve una ruta de addons del proyecto actual
     */
    public async removeAddonsPath(addonsPath: string): Promise<boolean> {
        if (!this.getCurrentProfile()) {
            vscode.window.showWarningMessage('No hay un perfil activo.');
            return false;
        }

        try {
            const index = this.getCurrentProfile()!.paths.addonsPath.indexOf(addonsPath);
            if (index === -1) {
                vscode.window.showWarningMessage('Esta ruta no está en el proyecto.');
                return false;
            }

            this.getCurrentProfile()!.paths.addonsPath.splice(index, 1);
            await this.saveProfiles();

            this.log(`Addons path removed: ${addonsPath}`);
            vscode.window.showInformationMessage(`Ruta removida: ${addonsPath}`);

            return true;

        } catch (error) {
            this.log(`Error removing addons path: ${error}`);
            vscode.window.showErrorMessage(`Error removiendo ruta: ${error}`);
            return false;
        }
    }

    /**
     * Remueve un repositorio remoto del proyecto actual
     */
    public async removeRemoteRepository(repositoryName: string): Promise<boolean> {
        const currentProfile = this.getCurrentProfile();
        if (!currentProfile || !currentProfile.paths.remoteRepositories) {
            vscode.window.showWarningMessage('No hay repositorios configurados.');
            return false;
        }
        try {
            const index = currentProfile.paths.remoteRepositories.findIndex(
                repo => repo.name === repositoryName
            );
            if (index === -1) {
                vscode.window.showWarningMessage('Este repositorio no está en el proyecto.');
                return false;
            }
            const removedRepo = currentProfile.paths.remoteRepositories.splice(index, 1)[0];
            await this.profileManager.saveProfiles();
            this.log(`Remote repository removed: ${removedRepo.name}`);
            vscode.window.showInformationMessage(`Repositorio removido: ${removedRepo.name}`);
            return true;
        } catch (error) {
            this.log(`Error removing remote repository: ${error}`);
            vscode.window.showErrorMessage(`Error removiendo repositorio: ${error}`);
            return false;
        }
    }

    /**
     * Muestra información detallada del proyecto actual
     */
    public showProjectInfo(): void {
        const currentProfile = this.getCurrentProfile();
        if (!currentProfile) {
            vscode.window.showWarningMessage('No hay un perfil activo.');
            return;
        }

        let message = `**Proyecto: ${currentProfile.name}**\n\n`;
        
        if (currentProfile.description) {
            message += `📝 Descripción: ${currentProfile.description}\n\n`;
        }

        message += `🏷️ Versión Gextia: ${currentProfile.gextiaVersion}\n\n`;

        // Rutas de addons
        message += `📁 **Rutas de Addons (${currentProfile.paths.addonsPath.length})**\n`;
        if (currentProfile.paths.addonsPath.length > 0) {
            for (const addonsPath of currentProfile.paths.addonsPath) {
                message += `   • ${addonsPath}\n`;
            }
        } else {
            message += `   Ninguna configurada\n`;
        }
        message += '\n';

        // Repositorios remotos
        message += `🌐 **Repositorios Remotos (${currentProfile.paths.remoteRepositories?.length || 0})**\n`;
        if (currentProfile.paths.remoteRepositories && currentProfile.paths.remoteRepositories.length > 0) {
            for (const repo of currentProfile.paths.remoteRepositories) {
                const status = repo.enabled ? '✅' : '❌';
                message += `   ${status} ${repo.name}\n`;
                message += `      URL: ${repo.url}\n`;
                message += `      Rama: ${repo.branch || 'main'}\n`;
                if (repo.subfolder) {
                    message += `      Subcarpeta: ${repo.subfolder}\n`;
                }
                message += '\n';
            }
        } else {
            message += `   Ninguno configurado\n`;
        }

        vscode.window.showInformationMessage(message);
    }

    /**
     * Borra un perfil de proyecto existente
     */
    public async deleteProfile(): Promise<void> {
        try {
            const profileNames = this.profileManager.getProfileNames();
            if (profileNames.length === 0) {
                vscode.window.showWarningMessage('No hay perfiles de proyecto para borrar');
                return;
            }
            const selectedProfile = await vscode.window.showQuickPick(profileNames, {
                placeHolder: 'Selecciona el perfil que deseas borrar'
            });
            if (!selectedProfile) {
                return;
            }
            const confirmation = await vscode.window.showWarningMessage(
                `¿Estás seguro de que deseas borrar el perfil "${selectedProfile}"?`,
                'Sí', 'No'
            );
            if (confirmation !== 'Sí') {
                return;
            }
            await this.profileManager.deleteProfile(selectedProfile);
            vscode.window.showInformationMessage(`Perfil "${selectedProfile}" borrado exitosamente`);
        } catch (error) {
            this.outputChannel.appendLine(`Error deleting profile: ${error}`);
            vscode.window.showErrorMessage('Error al borrar el perfil');
        }
    }
}
