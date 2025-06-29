import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
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

            // Verificar si es repositorio privado o tiene restricciones
            const isPrivate = await this.checkIfPrivateRepository(url);
            let authToken: string | undefined;

            // Para repositorios de OCA y otros públicos, sugerir token opcional
            if (this.isOCARepository(url) || this.isPublicRepositoryWithRateLimit(url)) {
                const needsAuth = await vscode.window.showQuickPick([
                    'Sí, configurar token (recomendado para OCA)',
                    'No, continuar sin token',
                    'Cancelar'
                ], {
                    placeHolder: 'Los repositorios de OCA tienen límites de rate limit. ¿Configurar autenticación?'
                });

                if (needsAuth === 'Cancelar') {
                    return null;
                }

                if (needsAuth === 'Sí, configurar token (recomendado para OCA)') {
                    authToken = await this.configureAuthentication(repoType);
                }
            } else if (isPrivate) {
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
            const apiUrl = this.getApiUrl(url);
            if (!apiUrl) {
                // Si no podemos verificar, asumimos que es público
                return false;
            }

            // Para repositorios públicos, usar headers básicos sin autenticación
            const headers = {
                'User-Agent': 'Gextia-Dev-Helper/1.0',
                'Accept': 'application/vnd.github.v3+json'
            };

            const response = await this.makeHttpRequest(apiUrl, headers);
            
            // Si obtenemos 200, es público
            if (response.statusCode === 200) {
                return false;
            }
            
            // Si obtenemos 401 o 403, puede ser privado o requerir autenticación
            if (response.statusCode === 401 || response.statusCode === 403) {
                return true;
            }
            
            // Para otros códigos, asumimos que es público
            return false;

        } catch (error) {
            this.log(`Error checking repository privacy: ${error}`);
            // En caso de error, asumimos que es público
            return false;
        }
    }

    /**
     * Obtiene la URL de la API para verificar el repositorio
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
            github: 'Ve a GitHub > Settings > Developer settings > Personal access tokens > Generate new token (solo necesitas permisos de lectura pública)',
            gitlab: 'Ve a GitLab > User Settings > Access Tokens > Add a personal access token (solo necesitas permisos de lectura)',
            bitbucket: 'Ve a Bitbucket > Personal settings > App passwords > Create app password (solo necesitas permisos de lectura)',
            generic: 'Consulta la documentación de tu proveedor de Git'
        };

        const showInstructions = await vscode.window.showInformationMessage(
            `Para repositorios con límites de rate limit, puedes usar un ${authMethods[repoType]} (opcional).`,
            'Ver instrucciones',
            'Ya tengo el token',
            'Continuar sin token'
        );

        if (showInstructions === 'Ver instrucciones') {
            vscode.window.showInformationMessage(instructions[repoType]);
        }

        if (showInstructions === 'Continuar sin token') {
            return undefined;
        }

        const token = await vscode.window.showInputBox({
            prompt: `Ingresa tu ${authMethods[repoType]} (opcional)`,
            password: true,
            placeHolder: 'ghp_xxxxxxxxxxxx...'
        });

        return token || undefined;
    }

    /**
     * Prueba la conexión a un repositorio
     */
    public async testRepositoryConnection(repository: RemoteRepository): Promise<{success: boolean, error?: string}> {
        try {
            const apiUrl = this.getApiUrl(repository.url);
            if (!apiUrl) {
                // Si no podemos verificar la API, intentamos con la URL de descarga
                return await this.testDownloadUrl(repository);
            }

            const headers: any = {
                'User-Agent': 'Gextia-Dev-Helper/1.0',
                'Accept': 'application/vnd.github.v3+json'
            };

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
            } else if (response.statusCode === 403) {
                // Para 403, puede ser rate limiting o repositorio privado
                if (response.data.includes('rate limit')) {
                    return { success: false, error: 'Límite de rate limit alcanzado. Intenta más tarde o usa un token de autenticación.' };
                }
                return { success: false, error: 'Acceso denegado. El repositorio puede ser privado.' };
            } else if (response.statusCode === 404) {
                return { success: false, error: 'Repositorio no encontrado' };
            } else {
                return { success: false, error: `Error HTTP ${response.statusCode}` };
            }

        } catch (error) {
            return { success: false, error: `Error de conexión: ${error}` };
        }
    }

    /**
     * Prueba la URL de descarga directamente
     */
    private async testDownloadUrl(repository: RemoteRepository): Promise<{success: boolean, error?: string}> {
        try {
            const downloadUrl = this.getDownloadUrl(repository);
            if (!downloadUrl) {
                return { success: false, error: 'No se puede determinar la URL de descarga' };
            }

            const headers: any = {
                'User-Agent': 'Gextia-Dev-Helper/1.0'
            };

            if (repository.authToken) {
                if (repository.type === 'github') {
                    headers['Authorization'] = `token ${repository.authToken}`;
                } else if (repository.type === 'gitlab') {
                    headers['PRIVATE-TOKEN'] = repository.authToken;
                }
            }

            const response = await this.makeHttpRequest(downloadUrl, headers);
            
            if (response.statusCode === 200) {
                return { success: true };
            } else if (response.statusCode === 403) {
                return { success: false, error: 'Acceso denegado. Verifica que el repositorio sea público o usa autenticación.' };
            } else {
                return { success: false, error: `Error HTTP ${response.statusCode} al acceder a la descarga` };
            }

        } catch (error) {
            return { success: false, error: `Error probando URL de descarga: ${error}` };
        }
    }

    /**
     * Realiza una petición HTTP y sigue redirecciones
     */
    private makeHttpRequest(url: string, headers: any = {}, redirectCount = 0): Promise<{statusCode: number, data: string}> {
        const MAX_REDIRECTS = 5;
        return new Promise((resolve, reject) => {
            const request = https.get(url, { headers }, (response) => {
                let data = '';

                // Manejar redirecciones
                if ([301, 302, 307, 308].includes(response.statusCode || 0)) {
                    const location = response.headers.location;
                    if (location && redirectCount < MAX_REDIRECTS) {
                        const newUrl = location.startsWith('http') ? location : new URL(location, url).toString();
                        this.log(`Redirigiendo a: ${newUrl}`);
                        response.destroy();
                        resolve(this.makeHttpRequest(newUrl, headers, redirectCount + 1));
                        return;
                    } else {
                        reject(new Error('Demasiadas redirecciones o Location no encontrada.'));
                        return;
                    }
                }
                
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
            this.log(`=== Iniciando sincronización de repositorio: ${repository.name} ===`);
            this.log(`URL: ${repository.url}`);
            this.log(`Tipo: ${repository.type}`);
            this.log(`Rama: ${repository.branch || 'main'}`);
            this.log(`Subcarpeta: ${repository.subfolder || 'ninguna'}`);
            this.log(`Tiene token: ${repository.authToken ? 'Sí' : 'No'}`);

            // Crear directorio de caché si no existe
            const cachePath = repository.localCachePath!;
            this.log(`Directorio de caché: ${cachePath}`);
            await fs.promises.mkdir(cachePath, { recursive: true });

            // Determinar URL de descarga
            const downloadUrl = this.getDownloadUrl(repository);
            if (!downloadUrl) {
                throw new Error('No se puede determinar la URL de descarga para este tipo de repositorio');
            }
            this.log(`URL de descarga: ${downloadUrl}`);

            // Probar la URL de descarga antes de descargar
            this.log('Probando acceso a la URL de descarga...');
            const testResult = await this.testDownloadUrl(repository);
            if (!testResult.success) {
                throw new Error(`Error al probar URL de descarga: ${testResult.error}`);
            }
            this.log('✓ URL de descarga accesible');

            // Descargar y extraer contenido
            this.log('Iniciando descarga y extracción...');
            await this.downloadAndExtract(downloadUrl, cachePath, repository);

            // Actualizar timestamp de sincronización
            repository.lastSync = new Date();

            this.log(`=== Repositorio ${repository.name} sincronizado exitosamente ===`);
            return true;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`=== ERROR sincronizando repositorio ${repository.name} ===`);
            this.log(`Error: ${errorMessage}`);
            this.log(`Stack: ${error instanceof Error ? error.stack : 'No disponible'}`);
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
        let tempDir: string | null = null;
        try {
            this.log(`Iniciando descarga desde: ${url}`);
            
            // Crear directorio temporal para la descarga
            tempDir = path.join(cachePath, 'temp');
            this.log(`Directorio temporal: ${tempDir}`);
            await fs.promises.mkdir(tempDir, { recursive: true });
            
            // Descargar archivo ZIP
            const zipPath = path.join(tempDir, 'repository.zip');
            this.log(`Descargando ZIP a: ${zipPath}`);
            await this.downloadFile(url, zipPath, repository);
            this.log('✓ Archivo ZIP descargado exitosamente');
            
            // Verificar que el archivo existe y tiene contenido
            const stats = await fs.promises.stat(zipPath);
            this.log(`Tamaño del archivo ZIP: ${stats.size} bytes`);
            if (stats.size === 0) {
                throw new Error('El archivo ZIP descargado está vacío');
            }
            
            // Extraer contenido
            this.log('Extrayendo contenido del ZIP...');
            await this.extractZip(zipPath, tempDir);
            this.log('✓ Contenido extraído exitosamente');
            
            // Encontrar la carpeta extraída
            this.log('Buscando carpeta extraída...');
            const extractedDir = path.join(tempDir, await this.findExtractedFolder(tempDir));
            this.log(`Carpeta extraída encontrada: ${extractedDir}`);
            
            // Determinar ruta final
            const finalPath = repository.subfolder 
                ? path.join(cachePath, repository.subfolder)
                : cachePath;
            this.log(`Ruta final: ${finalPath}`);
                
            // Mover contenido a la ubicación final
            this.log('Moviendo contenido a ubicación final...');
            await this.moveDirectory(extractedDir, finalPath);
            this.log('✓ Contenido movido exitosamente');
            
            // Crear archivo indicador
            const indicatorPath = path.join(cachePath, '.gextia-remote-repo');
            const repoInfo = {
                url: repository.url,
                branch: repository.branch,
                lastSync: new Date().toISOString(),
                type: repository.type
            };
            
            await fs.promises.writeFile(indicatorPath, JSON.stringify(repoInfo, null, 2));
            this.log(`Archivo indicador creado: ${indicatorPath}`);
            
            this.log(`=== Repositorio descargado y extraído exitosamente a: ${cachePath} ===`);
            
        } catch (error) {
            this.log(`=== ERROR en downloadAndExtract ===`);
            this.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
            this.log(`Stack: ${error instanceof Error ? error.stack : 'No disponible'}`);
            throw error;
        } finally {
            // Limpiar archivos temporales de forma segura
            if (tempDir) {
                try {
                    this.log('Limpiando archivos temporales...');
                    await this.safeRemoveDirectory(tempDir);
                    this.log('✓ Archivos temporales eliminados');
                } catch (cleanupError) {
                    this.log(`⚠ Error limpiando archivos temporales: ${cleanupError}`);
                }
            }
        }
    }

    /**
     * Descarga un archivo desde una URL, siguiendo redirecciones
     */
    private async downloadFile(url: string, filePath: string, repository: RemoteRepository, redirectCount = 0): Promise<void> {
        const MAX_REDIRECTS = 5;
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(filePath);
            
            const options: any = {
                headers: {
                    'User-Agent': 'Gextia-Dev-Helper/1.0'
                }
            };
            
            // Agregar headers de autenticación si es necesario
            if (repository.authToken) {
                if (repository.type === 'github') {
                    options.headers['Authorization'] = `token ${repository.authToken}`;
                } else if (repository.type === 'gitlab') {
                    options.headers['PRIVATE-TOKEN'] = repository.authToken;
                }
            }
            
            const request = https.get(url, options, (response) => {
                // Manejar redirecciones
                if ([301, 302, 307, 308].includes(response.statusCode || 0)) {
                    const location = response.headers.location;
                    if (location && redirectCount < MAX_REDIRECTS) {
                        const newUrl = location.startsWith('http') ? location : new URL(location, url).toString();
                        this.log(`Redirigiendo descarga a: ${newUrl}`);
                        response.destroy();
                        // Llamada recursiva para seguir la redirección
                        this.downloadFile(newUrl, filePath, repository, redirectCount + 1).then(resolve).catch(reject);
                        return;
                    } else {
                        reject(new Error('Demasiadas redirecciones o Location no encontrada en descarga.'));
                        return;
                    }
                }
                
                if (response.statusCode === 200) {
                    response.pipe(file);
                    
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                } else if (response.statusCode === 403) {
                    // Manejar específicamente el error 403
                    let errorMessage = `HTTP 403: Acceso denegado`;
                    
                    // Intentar leer el cuerpo de la respuesta para más detalles
                    let responseData = '';
                    response.on('data', (chunk) => {
                        responseData += chunk;
                    });
                    
                    response.on('end', () => {
                        if (responseData.includes('rate limit')) {
                            errorMessage = 'Límite de rate limit alcanzado. Intenta más tarde o usa un token de autenticación.';
                        } else if (responseData.includes('private')) {
                            errorMessage = 'El repositorio es privado. Necesitas autenticación.';
                        }
                        reject(new Error(errorMessage));
                    });
                } else {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }
            });
            
            request.on('error', (error) => {
                reject(error);
            });
            
            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Download timeout'));
            });
        });
    }

    /**
     * Extrae un archivo ZIP
     */
    private async extractZip(zipPath: string, extractPath: string): Promise<void> {
        // Para una implementación completa, necesitarías una librería como 'unzipper' o 'adm-zip'
        // Por ahora, usaremos una implementación simplificada
        
        const execAsync = promisify(exec);
        
        try {
            // Usar comando del sistema para extraer
            if (process.platform === 'win32') {
                await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`);
            } else {
                await execAsync(`unzip -o '${zipPath}' -d '${extractPath}'`);
            }
        } catch (error) {
            this.log(`Error extracting ZIP: ${error}`);
            throw error;
        }
    }

    /**
     * Encuentra la carpeta extraída (normalmente tiene el nombre del repositorio)
     */
    private async findExtractedFolder(basePath: string): Promise<string> {
        const items = await fs.promises.readdir(basePath);
        const directories = [];
        
        for (const item of items) {
            const itemPath = path.join(basePath, item);
            const stat = await fs.promises.stat(itemPath);
            if (stat.isDirectory()) {
                directories.push(item);
            }
        }
        
        return directories[0] || '';
    }

    /**
     * Mueve un directorio de una ubicación a otra con manejo de errores de permisos
     */
    private async moveDirectory(source: string, destination: string): Promise<void> {
        try {
            this.log(`Moviendo directorio de ${source} a ${destination}`);
            
            // Crear directorio de destino si no existe
            await fs.promises.mkdir(destination, { recursive: true });
            
            // Mover archivos
            const items = await fs.promises.readdir(source);
            
            for (const item of items) {
                const sourcePath = path.join(source, item);
                const destPath = path.join(destination, item);
                
                const stat = await fs.promises.stat(sourcePath);
                
                if (stat.isDirectory()) {
                    await this.moveDirectory(sourcePath, destPath);
                } else {
                    try {
                        // Intentar renombrar primero (más eficiente)
                        await fs.promises.rename(sourcePath, destPath);
                    } catch (renameError) {
                        // Si falla el renombrar, intentar copiar y luego eliminar
                        this.log(`Renombrar falló, intentando copiar: ${item}`);
                        await this.copyFileWithRetry(sourcePath, destPath);
                        try {
                            await fs.promises.unlink(sourcePath);
                        } catch (deleteError) {
                            this.log(`No se pudo eliminar archivo original: ${sourcePath}`);
                        }
                    }
                }
            }
            
            // Intentar eliminar el directorio fuente si está vacío
            try {
                await fs.promises.rmdir(source);
            } catch (error) {
                this.log(`No se pudo eliminar directorio fuente: ${source}`);
            }
            
        } catch (error) {
            this.log(`Error moviendo directorio: ${error}`);
            throw error;
        }
    }

    /**
     * Copia un archivo con reintentos para manejar errores de permisos
     */
    private async copyFileWithRetry(source: string, destination: string, retries = 3): Promise<void> {
        for (let i = 0; i < retries; i++) {
            try {
                // Usar copyFile en lugar de rename para evitar problemas de permisos
                await fs.promises.copyFile(source, destination);
                return;
            } catch (error) {
                if (i === retries - 1) {
                    throw error;
                }
                this.log(`Intento ${i + 1} falló, reintentando en 1 segundo...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
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
     * Registra un mensaje en el log
     */
    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        console.log(logMessage); // También mostrar en consola de desarrollo
    }

    /**
     * Verifica si es un repositorio de OCA
     */
    private isOCARepository(url: string): boolean {
        return url.includes('github.com/OCA/') || 
               url.includes('github.com/oca/') ||
               url.toLowerCase().includes('oca');
    }

    /**
     * Verifica si es un repositorio público que puede tener rate limiting
     */
    private isPublicRepositoryWithRateLimit(url: string): boolean {
        // Repositorios conocidos que pueden tener rate limiting
        const knownRepos = [
            'github.com/odoo/',
            'github.com/OCA/',
            'github.com/oca/',
            'github.com/odoo-community/',
            'github.com/odoo-enterprise/'
        ];
        
        return knownRepos.some(repo => url.toLowerCase().includes(repo.toLowerCase()));
    }

    /**
     * Muestra el log de sincronización al usuario
     */
    public showLog(): void {
        this.outputChannel.show();
    }

    /**
     * Limpia el log
     */
    public clearLog(): void {
        this.outputChannel.clear();
    }

    /**
     * Elimina un directorio de forma segura con reintentos
     */
    private async safeRemoveDirectory(dirPath: string, retries = 3): Promise<void> {
        for (let i = 0; i < retries; i++) {
            try {
                await fs.promises.rm(dirPath, { recursive: true, force: true });
                return;
            } catch (error) {
                if (i === retries - 1) {
                    throw error;
                }
                this.log(`Intento ${i + 1} de eliminación falló, reintentando en 2 segundos...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
}