import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { 
    GextiaModel,
    GextiaField,
    GextiaMethod,
    FieldProperty,
    ModuleManifest
} from '../types';

export class ModelParser {
    private static instance: ModelParser;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gextia Model Parser');
    }

    public static getInstance(): ModelParser {
        if (!ModelParser.instance) {
            ModelParser.instance = new ModelParser();
        }
        return ModelParser.instance;
    }

    /**
     * Parsea todos los modelos en una ruta de addons
     */
    public async parseModelsInPath(addonsPath: string): Promise<Map<string, GextiaModel[]>> {
        const models = new Map<string, GextiaModel[]>();
        
        try {
            const moduleDirectories = await this.getModuleDirectories(addonsPath);
            
            for (const moduleDir of moduleDirectories) {
                const moduleModels = await this.parseModelsInModule(moduleDir);
                
                // Agrupar modelos por nombre
                for (const model of moduleModels) {
                    if (!models.has(model.name)) {
                        models.set(model.name, []);
                    }
                    models.get(model.name)!.push(model);
                }
            }
            
            this.log(`Parsed ${Array.from(models.values()).flat().length} models from ${addonsPath}`);
            
        } catch (error) {
            this.log(`Error parsing models in ${addonsPath}: ${error}`);
        }
        
        return models;
    }

    /**
     * Obtiene todos los directorios que contienen módulos de Gextia
     */
    private async getModuleDirectories(addonsPath: string): Promise<string[]> {
        const moduleDirectories: string[] = [];
        
        try {
            const entries = await fs.promises.readdir(addonsPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const modulePath = path.join(addonsPath, entry.name);
                    
                    // Verificar si contiene un manifest
                    if (await this.hasManifest(modulePath)) {
                        moduleDirectories.push(modulePath);
                    }
                }
            }
        } catch (error) {
            this.log(`Error reading directory ${addonsPath}: ${error}`);
        }
        
        return moduleDirectories;
    }

    /**
     * Verifica si un directorio contiene un manifest de Gextia
     */
    private async hasManifest(modulePath: string): Promise<boolean> {
        const manifestFiles = ['__manifest__.py', '__openerp__.py'];
        
        for (const manifestFile of manifestFiles) {
            try {
                await fs.promises.access(path.join(modulePath, manifestFile));
                return true;
            } catch {
                // Continuar con el siguiente
            }
        }
        
        return false;
    }

    /**
     * Parsea todos los modelos en un módulo específico
     */
    private async parseModelsInModule(modulePath: string): Promise<GextiaModel[]> {
        const models: GextiaModel[] = [];
        const moduleName = path.basename(modulePath);
        
        try {
            // Leer el manifest para obtener información del módulo
            const manifest = await this.parseManifest(modulePath);
            
            // Buscar archivos Python en la carpeta models/
            const modelsPath = path.join(modulePath, 'models');
            
            if (await this.directoryExists(modelsPath)) {
                const pythonFiles = await this.getPythonFiles(modelsPath);
                
                for (const pythonFile of pythonFiles) {
                    const fileModels = await this.parseModelsInFile(pythonFile, moduleName, manifest);
                    models.push(...fileModels);
                }
            }
            
            // También buscar en la raíz del módulo (archivos antiguos)
            const rootPythonFiles = await this.getPythonFiles(modulePath);
            for (const pythonFile of rootPythonFiles) {
                const fileModels = await this.parseModelsInFile(pythonFile, moduleName, manifest);
                models.push(...fileModels);
            }
            
        } catch (error) {
            this.log(`Error parsing module ${moduleName}: ${error}`);
        }
        
        return models;
    }

    /**
     * Parsea el manifest de un módulo
     */
    public async parseManifest(modulePath: string): Promise<ModuleManifest | null> {
        const manifestFiles = ['__manifest__.py', '__openerp__.py'];
        
        for (const manifestFile of manifestFiles) {
            const manifestPath = path.join(modulePath, manifestFile);
            
            try {
                const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
                return this.parseManifestContent(manifestContent);
            } catch {
                // Continuar con el siguiente archivo
            }
        }
        
        return null;
    }

    /**
     * Parsea el contenido de un archivo manifest
     */
    private parseManifestContent(content: string): ModuleManifest | null {
        try {
            // Evaluar el contenido Python del manifest de forma segura
            // Esto es una simplificación, en un parser real usarías un AST
            const manifestMatch = content.match(/\{([\s\S]*)\}/);
            if (!manifestMatch) {return null;}
            
            const manifestDict = manifestMatch[1];
            
            // Extraer valores usando regex (simplificado)
            const extractValue = (key: string): any => {
                const pattern = new RegExp(`['"]${key}['"]\\s*:\\s*(.+?)(?=,|\\n|$)`, 'i');
                const match = manifestDict.match(pattern);
                if (!match) {return undefined;}
                
                let value = match[1].trim();
                
                // Remover comas y espacios finales
                if (value.endsWith(',')) {
                    value = value.slice(0, -1).trim();
                }
                
                // Parsear strings
                if (value.startsWith("'") || value.startsWith('"')) {
                    return value.slice(1, -1);
                }
                
                // Parsear arrays
                if (value.startsWith('[')) {
                    try {
                        return JSON.parse(value.replace(/'/g, '"'));
                    } catch {
                        return [];
                    }
                }
                
                // Parsear booleanos
                if (value === 'True') {return true;}
                if (value === 'False') {return false;}
                
                return value;
            };

            const manifest: ModuleManifest = {
                name: extractValue('name') || 'Unknown',
                version: extractValue('version') || '1.0.0',
                depends: extractValue('depends') || [],
                author: extractValue('author'),
                category: extractValue('category'),
                description: extractValue('description'),
                summary: extractValue('summary'),
                website: extractValue('website'),
                installable: extractValue('installable') !== false,
                auto_install: extractValue('auto_install') === true,
                application: extractValue('application') === true,
                data: extractValue('data') || [],
                demo: extractValue('demo') || [],
                license: extractValue('license'),
                external_dependencies: extractValue('external_dependencies')
            };
            
            return manifest;
            
        } catch (error) {
            this.log(`Error parsing manifest content: ${error}`);
            return null;
        }
    }

    /**
     * Obtiene todos los archivos Python en un directorio
     */
    private async getPythonFiles(dirPath: string): Promise<string[]> {
        const pythonFiles: string[] = [];
        
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.py') && 
                    entry.name !== '__init__.py' && !entry.name.startsWith('test_')) {
                    pythonFiles.push(path.join(dirPath, entry.name));
                }
            }
        } catch (error) {
            // Directorio no existe o no es accesible
        }
        
        return pythonFiles;
    }

    /**
     * Parsea modelos en un archivo Python específico
     */
    public async parseModelsInFile(filePath: string, moduleName: string, manifest: ModuleManifest | null): Promise<GextiaModel[]> {
        const models: GextiaModel[] = [];
        
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Buscar definiciones de clases que hereden de models.Model
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const classMatch = line.match(/^class\s+(\w+)\s*\(\s*models\.Model\s*\)/);
                
                if (classMatch) {
                    const className = classMatch[1];
                    const model = await this.parseModelClass(lines, i, className, filePath, moduleName, manifest, 'model');
                    
                    if (model) {
                        models.push(model);
                    }
                }
            }
            
            // Buscar definiciones de clases que hereden de models.AbstractModel
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const abstractMatch = line.match(/^class\s+(\w+)\s*\(\s*models\.AbstractModel\s*\)/);
                
                if (abstractMatch) {
                    const className = abstractMatch[1];
                    const model = await this.parseModelClass(lines, i, className, filePath, moduleName, manifest, 'abstract_model');
                    
                    if (model) {
                        models.push(model);
                    }
                }
            }
            
            // Buscar definiciones de componentes (Component)
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const componentMatch = line.match(/^class\s+(\w+)\s*\(\s*Component\s*\)/);
                
                if (componentMatch) {
                    const className = componentMatch[1];
                    const model = await this.parseComponentClass(lines, i, className, filePath, moduleName, manifest);
                    
                    if (model) {
                        models.push(model);
                    }
                }
            }
            
        } catch (error) {
            this.log(`Error parsing file ${filePath}: ${error}`);
        }
        
        return models;
    }

    /**
     * Parsea una clase de modelo específica
     */
    private async parseModelClass(
        lines: string[], 
        startLine: number, 
        className: string, 
        filePath: string, 
        moduleName: string,
        manifest: ModuleManifest | null,
        modelType: 'model' | 'abstract_model'
    ): Promise<GextiaModel | null> {
        try {
            // Encontrar el final de la clase
            const classIndent = this.getIndentLevel(lines[startLine]);
            let endLine = startLine + 1;
            
            while (endLine < lines.length) {
                const line = lines[endLine];
                if (line.trim() && this.getIndentLevel(line) <= classIndent) {
                    break;
                }
                endLine++;
            }
            
            // Extraer información del modelo
            const classContent = lines.slice(startLine, endLine);
            const modelName = this.extractModelName(classContent);
            const inheritFrom = this.extractInheritFrom(classContent);
            const isInherit = inheritFrom !== undefined && !modelName;
            
            // Si no tiene _name ni _inherit, no es un modelo válido
            if (!modelName && !inheritFrom) {
                return null;
            }
            
            const fields = this.extractFields(classContent, startLine);
            const methods = this.extractMethods(classContent, startLine);
            
            const model: GextiaModel = {
                name: modelName || inheritFrom || 'unknown',
                className,
                filePath,
                moduleName,
                isInherit,
                inheritFrom,
                fields,
                methods,
                dependencies: manifest?.depends || [],
                lineNumber: startLine + 1,
                modelType
            };
            
            return model;
            
        } catch (error) {
            this.log(`Error parsing model class ${className}: ${error}`);
            return null;
        }
    }

    /**
     * Extrae el nombre del modelo (_name)
     */
    private extractModelName(classContent: string[]): string | null {
        for (const line of classContent) {
            const match = line.match(/_name\s*=\s*['"]([^'"]+)['"]/);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    /**
     * Extrae el modelo del que hereda (_inherit)
     */
    private extractInheritFrom(classContent: string[]): string | undefined {
        for (const line of classContent) {
            // _inherit con string simple
            const singleMatch = line.match(/_inherit\s*=\s*['"]([^'"]+)['"]/);
            if (singleMatch) {
                return singleMatch[1];
            }
            
            // _inherit con lista (tomar el primero)
            const listMatch = line.match(/_inherit\s*=\s*\[\s*['"]([^'"]+)['"]/);
            if (listMatch) {
                return listMatch[1];
            }
        }
        return undefined;
    }

    /**
     * Extrae los campos del modelo
     */
    private extractFields(classContent: string[], startLine: number): GextiaField[] {
        const fields: GextiaField[] = [];
        
        for (let i = 0; i < classContent.length; i++) {
            const line = classContent[i];
            
            // Buscar definiciones de campos
            const fieldMatch = line.match(/^\s*(\w+)\s*=\s*fields\.(\w+)\s*\((.*)\)/);
            if (fieldMatch) {
                const fieldName = fieldMatch[1];
                const fieldType = fieldMatch[2];
                const fieldArgs = fieldMatch[3];
                
                const field: GextiaField = {
                    name: fieldName,
                    type: fieldType,
                    properties: this.parseFieldProperties(fieldArgs),
                    lineNumber: startLine + i + 1,
                    docString: this.extractFieldDocString(classContent, i)
                };
                
                fields.push(field);
            }
        }
        
        return fields;
    }

    /**
     * Parsea las propiedades de un campo
     */
    private parseFieldProperties(argsString: string): FieldProperty[] {
        const properties: FieldProperty[] = [];
        
        try {
            // Parsear argumentos de forma simple (esto se puede mejorar con un AST real)
            const args = argsString.split(',');
            
            for (let arg of args) {
                arg = arg.trim();
                
                if (arg.includes('=')) {
                    const [key, value] = arg.split('=', 2);
                    properties.push({
                        name: key.trim(),
                        value: this.parseArgumentValue(value.trim())
                    });
                } else if (arg && !arg.includes('(')) {
                    // Argumento posicional (probablemente comodel_name)
                    properties.push({
                        name: 'comodel_name',
                        value: this.parseArgumentValue(arg)
                    });
                }
            }
        } catch (error) {
            this.log(`Error parsing field properties: ${argsString}`);
        }
        
        return properties;
    }

    /**
     * Parsea el valor de un argumento
     */
    private parseArgumentValue(value: string): any {
        value = value.trim();
        
        // String
        if ((value.startsWith("'") && value.endsWith("'")) || 
            (value.startsWith('"') && value.endsWith('"'))) {
            return value.slice(1, -1);
        }
        
        // Boolean
        if (value === 'True') {return true;}
        if (value === 'False') {return false;}
        
        // Number
        if (/^\d+$/.test(value)) {return parseInt(value);}
        if (/^\d+\.\d+$/.test(value)) {return parseFloat(value);}
        
        // Default: return as string
        return value;
    }

    /**
     * Extrae la documentación de un campo
     */
    private extractFieldDocString(classContent: string[], fieldIndex: number): string | undefined {
        // Buscar comentarios antes del campo
        for (let i = fieldIndex - 1; i >= 0; i--) {
            const line = classContent[i].trim();
            if (line.startsWith('#')) {
                return line.substring(1).trim();
            }
            if (line) {break;} // Si encontramos una línea no vacía que no es comentario, parar
        }
        return undefined;
    }

    /**
     * Extrae los métodos del modelo
     */
    private extractMethods(classContent: string[], startLine: number): GextiaMethod[] {
        const methods: GextiaMethod[] = [];
        
        for (let i = 0; i < classContent.length; i++) {
            const line = classContent[i];
            
            // Buscar definiciones de métodos
            const methodMatch = line.match(/^\s*def\s+(\w+)\s*\(([^)]*)\)/);
            if (methodMatch) {
                const methodName = methodMatch[1];
                const methodParams = methodMatch[2];
                
                // Buscar decoradores en las líneas anteriores
                const decorators = this.extractDecorators(classContent, i);
                
                const method: GextiaMethod = {
                    name: methodName,
                    parameters: this.parseMethodParameters(methodParams),
                    decorators,
                    lineNumber: startLine + i + 1,
                    docString: this.extractMethodDocString(classContent, i)
                };
                
                methods.push(method);
            }
        }
        
        return methods;
    }

    /**
     * Extrae decoradores de un método
     */
    private extractDecorators(classContent: string[], methodIndex: number): string[] {
        const decorators: string[] = [];
        
        for (let i = methodIndex - 1; i >= 0; i--) {
            const line = classContent[i].trim();
            if (line.startsWith('@')) {
                decorators.unshift(line.substring(1));
            } else if (line) {
                break; // Si encontramos una línea no vacía que no es decorador, parar
            }
        }
        
        return decorators;
    }

    /**
     * Parsea los parámetros de un método
     */
    private parseMethodParameters(paramsString: string): string[] {
        return paramsString.split(',').map(param => param.trim()).filter(param => param);
    }

    /**
     * Extrae la documentación de un método
     */
    private extractMethodDocString(classContent: string[], methodIndex: number): string | undefined {
        // Buscar docstring en las líneas siguientes al método
        for (let i = methodIndex + 1; i < classContent.length && i < methodIndex + 5; i++) {
            const line = classContent[i].trim();
            if (line.startsWith('"""') || line.startsWith("'''")) {
                return line.slice(3, -3).trim();
            }
        }
        return undefined;
    }

    /**
     * Obtiene el nivel de indentación de una línea
     */
    private getIndentLevel(line: string): number {
        let indent = 0;
        for (const char of line) {
            if (char === ' ') {indent++;}
            else if (char === '\t') {indent += 4;}
            else {break;}
        }
        return indent;
    }

    /**
     * Verifica si un directorio existe
     */
    private async directoryExists(dirPath: string): Promise<boolean> {
        try {
            const stat = await fs.promises.stat(dirPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Parsea una clase de componente específica
     */
    private async parseComponentClass(
        lines: string[], 
        startLine: number, 
        className: string, 
        filePath: string, 
        moduleName: string,
        manifest: ModuleManifest | null
    ): Promise<GextiaModel | null> {
        try {
            // Encontrar el final de la clase
            const classIndent = this.getIndentLevel(lines[startLine]);
            let endLine = startLine + 1;
            
            while (endLine < lines.length) {
                const line = lines[endLine];
                if (line.trim() && this.getIndentLevel(line) <= classIndent) {
                    break;
                }
                endLine++;
            }
            
            // Extraer información del componente
            const classContent = lines.slice(startLine, endLine);
            const componentName = this.extractComponentName(classContent);
            const applyOn = this.extractApplyOn(classContent);
            const collection = this.extractCollection(classContent);
            
            // Si no tiene _name, no es un componente válido
            if (!componentName) {
                return null;
            }
            
            const methods = this.extractMethods(classContent, startLine);
            
            const model: GextiaModel = {
                name: componentName,
                className,
                filePath,
                moduleName,
                isInherit: false,
                inheritFrom: undefined,
                fields: [], // Los componentes no tienen campos como los modelos
                methods,
                dependencies: manifest?.depends || [],
                lineNumber: startLine + 1,
                modelType: 'component'
            };
            
            return model;
            
        } catch (error) {
            this.log(`Error parsing component class ${className}: ${error}`);
            return null;
        }
    }

    /**
     * Extrae el nombre del componente (_name)
     */
    private extractComponentName(classContent: string[]): string | null {
        for (const line of classContent) {
            const match = line.match(/_name\s*=\s*['"]([^'"]+)['"]/);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    /**
     * Extrae el modelo al que se aplica el componente (_apply_on)
     */
    private extractApplyOn(classContent: string[]): string | undefined {
        for (const line of classContent) {
            const match = line.match(/_apply_on\s*=\s*['"]([^'"]+)['"]/);
            if (match) {
                return match[1];
            }
        }
        return undefined;
    }

    /**
     * Extrae la colección del componente (_collection)
     */
    private extractCollection(classContent: string[]): string | undefined {
        for (const line of classContent) {
            const match = line.match(/_collection\s*=\s*['"]([^'"]+)['"]/);
            if (match) {
                return match[1];
            }
        }
        return undefined;
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