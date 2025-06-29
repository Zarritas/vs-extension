import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GextiaProjectProfile } from '../types';

export class ProjectManager {
    private static instance: ProjectManager;
    private currentProfile: GextiaProjectProfile | null = null;
    private profiles: Map<string, GextiaProjectProfile> = new Map();
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gextia Dev Helper');
        this.loadProfiles();
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

            // Guardar perfil
            this.profiles.set(profileName, profile);
            await this.saveProfiles();
            await this.setCurrentProfile(profileName);

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
            enterprisePath: undefined as string | undefined,
            communityPath: undefined as string | undefined
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
                path.join(gextiaPath, 'gextia', '__init__.py'),
                path.join(gextiaPath, 'gextia', 'release.py'),
                path.join(gextiaPath, 'addons', 'base', '__manifest__.py'),
                path.join(gextiaPath, 'addons', 'base', '__openerp__.py'),
                path.join(gextiaPath, 'gextia-bin'),
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
        const profileNames = Array.from(this.profiles.keys());
        
        if (profileNames.length === 0) {
            const create = await vscode.window.showInformationMessage(
                'No hay perfiles configurados. ¿Crear uno nuevo?',
                'Crear perfil'
            );
            
            if (create) {
                await this.createProfile();
            }
            {return;}
        }

        const selectedProfile = await vscode.window.showQuickPick(profileNames, {
            placeHolder: 'Selecciona un perfil de proyecto'
        });

        if (selectedProfile) {
            await this.setCurrentProfile(selectedProfile);
            vscode.window.showInformationMessage(`Perfil activo: ${selectedProfile}`);
        }
    }

    /**
     * Establece el perfil actual
     */
    private async setCurrentProfile(profileName: string): Promise<void> {
        const profile = this.profiles.get(profileName);
        if (profile) {
            this.currentProfile = profile;
            const config = vscode.workspace.getConfiguration('gextia-dev-helper');
            await config.update('currentProfile', profileName, vscode.ConfigurationTarget.Global);
            
            // Actualizar versión de Gextia
            await config.update('gextiaVersion', profile.gextiaVersion, vscode.ConfigurationTarget.Workspace);
        }
    }

    /**
     * Obtiene el perfil actual
     */
    public getCurrentProfile(): GextiaProjectProfile | null {
        return this.currentProfile;
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
        if (!this.currentProfile) {return [];}
        
        const allPaths: string[] = [];
        
        // Agregar rutas de addons personalizados
        if (this.currentProfile.paths.addonsPath) {
            allPaths.push(...this.currentProfile.paths.addonsPath);
        }
        
        // Agregar ruta de addons de Gextia Core
        if (this.currentProfile.paths.gextiaPath) {
            const coreAddonsPath = path.join(this.currentProfile.paths.gextiaPath, 'addons');
            allPaths.push(coreAddonsPath);
        }
        
        return allPaths;
    }

    /**
     * Obtiene la ruta del código core de Gextia (para modelos base)
     */
    public getGextiaCorePath(): string | null {
        if (!this.currentProfile?.paths.gextiaPath) {return null;}
        return path.join(this.currentProfile.paths.gextiaPath, 'gextia');
    }

    /**
     * Carga los perfiles desde la configuración
     */
    private loadProfiles(): void {
        const config = vscode.workspace.getConfiguration('gextia-dev-helper');
        const savedProfiles = config.get<any>('profiles', {});
        const currentProfileName = config.get<string>('currentProfile', '');

        this.profiles.clear();
        
        for (const [name, profile] of Object.entries(savedProfiles)) {
            this.profiles.set(name, profile as GextiaProjectProfile);
        }

        if (currentProfileName && this.profiles.has(currentProfileName)) {
            this.currentProfile = this.profiles.get(currentProfileName) || null;
        }
    }

    /**
     * Guarda los perfiles en la configuración
     */
    private async saveProfiles(): Promise<void> {
        const config = vscode.workspace.getConfiguration('gextia-dev-helper');
        const profilesObj: any = {};
        
        this.profiles.forEach((profile, name) => {
            profilesObj[name] = profile;
        });

        await config.update('profiles', profilesObj, vscode.ConfigurationTarget.Global);
    }

    /**
     * Verifica si hay un perfil configurado
     */
    public hasActiveProfile(): boolean {
        return this.currentProfile !== null;
    }

    /**
     * Log para debug
     */
    public log(message: string): void {
        if (vscode.workspace.getConfiguration('gextia-dev-helper').get('enableDebugMode')) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
        }
    }
}