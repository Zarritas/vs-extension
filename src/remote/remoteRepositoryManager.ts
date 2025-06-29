import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { RemoteRepository } from '../types';

export class RemoteRepositoryManager {
    private static instance: RemoteRepositoryManager;
    private outputChannel: vscode.OutputChannel;
    private cacheDir: string;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('gextia Remote Repositories');
        this.cacheDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.vscode', 'gextia-dev-helper', 'cache');
        this.ensureCacheDir();
    }

    public static getInstance(): RemoteRepositoryManager {
        if (!RemoteRepositoryManager.instance) {
            RemoteRepositoryManager.instance = new RemoteRepositoryManager();
        }
        return RemoteRepositoryManager.instance;
    }

    /**
     * Asegura que el directorio de caché existe
     */
    private async ensureCacheDir(): Promise<void> {
        try {
            await fs.promises.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            this.log(`Error creating cache directory: ${error}`);
        }
    }

    /**
     * Configura un nuevo repositorio remoto
     */
    public async configureRemoteRepository(): Promise<RemoteRepository | null> {
        try {
            // Solicitar URL del repositorio
            const url = await vscode.window.showInputBox({
                prompt: 'URL del repositorio (GitHub, GitLab, etc.)',
                placeHolder: 'https://github.com/usuario/repositorio.git',
                validateInput: (value) => {
                    if (!value) return 'URL es requerida';
                    if (!this.isValidRepositoryUrl(value)) {
                        return 'URL no válida. Formatos soportados: GitHub, GitLab, Bitbucket';
                    }
                    return null;
                }
            });

            if (!url) return null;

            // Detectar tipo de repositorio
            const repoType = this.detectRepositoryType(url);
            
            // Solicitar nombre descriptivo
            const name = await vscode.window.showInputBox({
                prompt: 'Nombre descriptivo para el repositorio',
                placeHolder: 'OCA Server Tools',
                value: this.generateDefaultName(url)
            });

            if (!name) return null;

            // Solicitar rama (opcional)
            const branch = await vscode.window.showInputBox({
                prompt: 'Rama a usar (opcional, por defecto: main/master)',
                placeHolder: '16.0, main, master, develop...'
            });

            // Solicitar subcarpeta (opcional)
            const subfolder = await vscode.window.showInputBox({
                prompt: 'Subcarpeta dentro del repositorio (opcional)',
                placeHolder: 'addons/, modules/, src/addons...'
            });

            // Verificar si es repositorio privado
            const isPrivate = await this.checkIfPrivateRepository(url);
            let authToken: string | undefined;

            if (isPrivate) {
                const needsAuth = await vscode.window.showQuickPick(['Sí', 'No'], {
                    placeHolder: 'Este repositorio parece ser privado. ¿Configurar autenticación?'
                });

                if (needsAuth === 'Sí') {
                    authToken = await this.configureAuthentication(repoType);
                }
            }

            const repository: RemoteRepository = {
                name,
                url: this.normalizeUrl(url),
                type: repoType,
                branch: branch || undefined,
                subfolder: subfolder || undefined,
                authToken,
                isPrivate,
                enabled: true,
                localCachePath: path.join(this.cacheDir, this.generateSafeName(name))
            };

            // Probar conexión
            const testResult = await this.testRepositoryConnection(repository);
            if (!testResult.success) {
                const retry = await vscode.window.showWarningMessage(
                    `No se pudo conectar al repositorio: ${testResult.error}. ¿Continuar de todas formas?`,
                    'Continuar',
                    'Cancelar'
                );
                
                if (retry !== 'Continuar') {
                    return null;
                }
            }

            vscode.window.showInformationMessage(`Repositorio "${name}" configurado exitosamente`);
            return repository;

        } catch (error) {
            this.log(`Error configuring remote repository: ${error}`);
            vscode.window.showErrorMessage('Error configurando repositorio remoto');
            return null;
        }
    }

    /**
     * Valida si una URL es válida para un repositorio
     */
    private isValidRepositoryUrl(url: string): boolean {
        const patterns = [
            /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+/,
            /^https:\/\/gitlab\.com\/[\w\-\.\/]+/,
            /^https:\/\/bitbucket\.org\/[\w\-\.]+\/[\w\-\.]+/,
            /^https:\/\/[\w\-\.]+\/[\w\-\.\/]+\.git$/,
            /^git@github\.com:[\w\-\.]+\/[\w\-\.]+\.git$/,
            /^git@gitlab\.com:[\w\-\.\/]+\.git$/
        ];

        return patterns.some(pattern => pattern.test(url));
    }

    /**
     * Detecta el tipo de repositorio basado en la URL
     */
    private detectRepositoryType(url: string): RemoteRepository['type'] {
        if (url.includes('github.com')) return 'github';
        if (url.includes('gitlab.com')) return 'gitlab';
        if (url.includes('bitbucket.org')) return 'bitbucket';
        return 'generic';
    }

    /**
     * Genera un nombre por defecto basado en la URL
     */
    private generateDefaultName(url: string): string {
        try {
            const urlObj = new URL(url.replace('git@', 'https://').replace(':', '/'));
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            
            if (pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1].replace('.git', '')}`;
            }
            
            return urlObj.hostname || 'Repository';
        } catch {
            return 'Repository';
        }
    }

    /**
     * Normaliza la URL del repositorio
     */
    private normalizeUrl(url: string): string {
        // Convertir URLs SSH a HTTPS para facilitar el acceso
        if (url.startsWith('git@github.com:')) {
            return url.replace('git@github.com:', 'https://github.com/');
        }
        if (url.startsWith('git@gitlab.com:')) {
            return url.replace('git@gitlab.com:', 'https://gitlab.com/');
        }
        
        // Remover .git del final si existe
        return url.replace(/\.git$/, '');
    }

    /**
     * Genera un nombre seguro para carpetas
     */
    private generateSafeName(name: string): string {
        return name.replace(/[^\w\s\-]/g, '').replace(/\s+/g, '-').toLowerCase();
    }

    /**
     * Verifica si un repositorio es privado
     */
    private async checkIfPrivateRepository(url: string): Promise<boolean> {
        try {
            // Para GitHub y GitLab públicos, intentar acceso sin autenticación
            if (url.includes('github.com') || url.includes('gitlab.com')) {
                const apiUrl = this.getApiUrl(url);
                if (apiUrl) {
                    const response = await this.makeHttpRequest(apiUrl);
                    return response.statusCode === 404; // 404 puede indicar privado
                }
            }
            
            // Por defecto, asumir que podría ser privado
            return false;
        } catch {
            return true; // En caso de error, asumir privado
        }
    }

    /**
     * Obtiene la URL de la API para un repositorio
     */
    private getApiUrl(repoUrl: string): string | null {
        try {
            const url = new URL(repoUrl);
            const pathParts = url.pathname.split('/').filter(p => p);
            
            if (url.hostname === 'github.com' && pathParts.length >= 2) {
                return `https://api.github.com/repos/${pathParts[0]}/${pathParts[1]}`;
            }
            
            if (url.hostname === 'gitlab.com' && pathParts.length >= 2) {
                const projectPath = pathParts.join('/');
                return `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath)}`;
            }
            
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Configura autenticación para repositorios privados
     */
    private async configureAuthentication(repoType: RemoteRepository['type']): Promise<string | undefined> {
        const authMethods = {
            github: 'Personal Access Token de GitHub',
            gitlab: 'Personal Access Token de GitLab',
            bitbucket: 'App Password de Bitbucket',
            generic: 'Token de autenticación'
        };

        const instructions = {
            github: 'Ve a GitHub > Settings > Developer settings > Personal access tokens > Generate new token',
            gitlab: 'Ve a GitLab > User Settings > Access Tokens > Add a personal access token',
            bitbucket: 'Ve a Bitbucket > Personal settings > App passwords > Create app password',
            generic: 'Consulta la documentación de tu proveedor de Git'
        };

        const showInstructions = await vscode.window.showInformationMessage(
            `Necesitas un ${authMethods[repoType]} para acceder a este repositorio privado.`,
            'Ver instrucciones',
            'Ya tengo el token'
        );

        if (showInstructions === 'Ver instrucciones') {
            vscode.window.showInformationMessage(instructions[repoType]);
        }

        const token = await vscode.window.showInputBox({
            prompt: `Ingresa tu ${authMethods[repoType]}`,
            password: true,
            placeHolder: 'ghp_xxxxxxxxxxxx...'
        });

        return token;
    }

    /**
     * Prueba la conexión a un repositorio
     */
    private async testRepositoryConnection(repository: RemoteRepository): Promise<{success: boolean, error?: string}> {
        try {
            const apiUrl = this.getApiUrl(repository.url);
            if (!apiUrl) {
                return { success: false, error: 'No se puede verificar la conexión para este tipo de repositorio' };
            }

            const headers: any = {};
            if (repository.authToken) {
                if (repository.type === 'github') {
                    headers['Authorization'] = `token ${repository.authToken}`;
                } else if (repository.type === 'gitlab') {
                    headers['PRIVATE-TOKEN'] = repository.authToken;
                }
            }

            const response = await this.makeHttpRequest(apiUrl, headers);
            
            if (response.statusCode === 200) {
                return { success: true };
            } else if (response.statusCode === 401) {
                return { success: false, error: 'Token de autenticación inválido' };
            } else if (response.statusCode === 404) {
                return { success: false, error: 'Repositorio no encontrado o privado' };
            } else {
                return { success: false, error: `Error HTTP ${response.statusCode}` };
            }

        } catch (error) {
            return { success: false, error: `Error de conexión: ${error}` };
        }
    }

    /**
     * Realiza una petición HTTP
     */
    private makeHttpRequest(url: string, headers: any = {}): Promise<{statusCode: number, data: string}> {
        return new Promise((resolve, reject) => {
            const request = https.get(url, { headers }, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    resolve({
                        statusCode: response.statusCode || 0,
                        data
                    });
                });
            });

            request.on('error', (error) => {
                reject(error);
            });

            request.setTimeout(10000, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    /**
     * Sincroniza un repositorio remoto (descarga contenido)
     */
    public async syncRepository(repository: RemoteRepository): Promise<boolean> {
        try {
            this.log(`Syncing repository: ${repository.name}`);

            // Crear directorio de caché si no existe
            const cachePath = repository.localCachePath!;
            await fs.promises.mkdir(cachePath, { recursive: true });

            // Determinar URL de descarga
            const downloadUrl = this.getDownloadUrl(repository);
            if (!downloadUrl) {
                throw new Error('Cannot determine download URL');
            }

            // Descargar y extraer contenido
            await this.downloadAndExtract(downloadUrl, cachePath, repository);

            // Actualizar timestamp de sincronización
            repository.lastSync = new Date();

            this.log(`Repository ${repository.name} synced successfully`);
            return true;

        } catch (error) {
            this.log(`Error syncing repository ${repository.name}: ${error}`);
            return false;
        }
    }

    /**
     * Obtiene la URL de descarga para un repositorio
     */
    private getDownloadUrl(repository: RemoteRepository): string | null {
        const branch = repository.branch || 'main';
        
        if (repository.type === 'github') {
            return `${repository.url}/archive/refs/heads/${branch}.zip`;
        } else if (repository.type === 'gitlab') {
            return `${repository.url}/-/archive/${branch}/${repository.url.split('/').pop()}-${branch}.zip`;
        }
        
        return null;
    }

    /**
     * Descarga y extrae el contenido de un repositorio
     */
    private async downloadAndExtract(url: string, cachePath: string, repository: RemoteRepository): Promise<void> {
        // Simplificación: por ahora solo crear un archivo indicador
        // En una implementación completa, aquí descargarías y extraerías el ZIP
        
        const indicatorPath = path.join(cachePath, '.gextia-remote-repo');
        const repoInfo = {
            url: repository.url,
            branch: repository.branch,
            lastSync: new Date().toISOString(),
            type: repository.type
        };
        
        await fs.promises.writeFile(indicatorPath, JSON.stringify(repoInfo, null, 2));
        
        // TODO: Implementar descarga real del repositorio
        // 1. Descargar ZIP desde URL
        // 2. Extraer contenido
        // 3. Si hay subfolder, mover archivos
        // 4. Limpiar archivos temporales
    }

    /**
     * Obtiene la ruta local de un repositorio sincronizado
     */
    public getLocalPath(repository: RemoteRepository): string | null {
        if (!repository.localCachePath) return null;
        
        const fullPath = repository.subfolder 
            ? path.join(repository.localCachePath, repository.subfolder)
            : repository.localCachePath;
            
        return fullPath;
    }

    /**
     * Verifica si un repositorio necesita sincronización
     */
    public needsSync(repository: RemoteRepository): boolean {
        if (!repository.lastSync) return true;
        
        // Sincronizar cada 24 horas
        const now = new Date();
        const lastSync = new Date(repository.lastSync);
        const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        
        return hoursSinceSync > 24;
    }

    /**
     * Lista todos los repositorios que necesitan sincronización
     */
    public getRepositoriesNeedingSync(repositories: RemoteRepository[]): RemoteRepository[] {
        return repositories.filter(repo => repo.enabled && this.needsSync(repo));
    }

    /**
     * Log para debug
     */
    private log(message: string): void {
        if (vscode.workspace.getConfiguration('gextia-dev-helper').get('enableDebugMode')) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
        }
    }
}