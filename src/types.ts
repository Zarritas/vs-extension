export interface GextiaProjectProfile{
    name: string;                                   // Nombre del proyecto
    description?: string;                           // Descipción del proyecto
    paths: {
        addonsPath: string[];                       // Rutas de addons
        gextiaPath?: string;                        // Ruta de Gextia core
        remoteRepositories?: RemoteRepository[];    // Repositorios remotos
    }
    gextiaVersion: string;                          // Versión de Gextia
    excludePatterns?: string[];                     // Patrones de archivos/carpetas a excluir
    customModulePaths?: string[];                   // Tutas adicionales de módulos
}

export interface RemoteRepository {
    name: string;                                           // Nombre descriptivo del repositorio
    url: string;                                            // URL del repositorio (GitHub, GitLab, etc.)
    type: 'github' | 'gitlab' | 'bitbucket' | 'generic';    // Tipo de repositorio
    branch?: string;                                        // Rama específica (default: main/master)
    subfolder?: string;                                     // Subcarpeta dentro del repo (ej: 'addons/')
    authToken?: string;                                     // Token de autenticación para repos privados
    lastSync?: Date;                                        // Última sincronización
    localCachePath?: string;                                // Ruta local del caché
    isPrivate?: boolean;                                    // Si el repositorio es privado
    enabled: boolean;                                       // Si está habilitado para análisis
}

export interface GextiaModel {
    name: string;                  // Nombre del modelo (ej: 'res.partner')
    className: string;             // Nombre de la clase Python
    filePath: string;              // Ruta del archivo
    moduleName: string;            // Nombre del módulo de Gextia
    isInherit: boolean;            // Si es una herencia (_inherit)
    inheritFrom?: string;          // Modelo del que hereda
    fields: GextiaField[];         // Campos del modelo
    methods: GextiaMethod[];       // Métodos del modelo
    dependencies: string[];        // Dependencias del módulo
    lineNumber: number;            // Línea donde se define la clase del modelo
    modelType: 'model' | 'abstract_model' | 'component';  // Tipo de modelo
}

export interface GextiaField {
    name: string;                  // Nombre del campo
    type: string;                  // Tipo de campo (Char, Integer, Many2one, etc.)
    properties: FieldProperty[];   // Propiedades del campo
    lineNumber: number;            // Línea donde se define
    docString?: string;            // Documentación del campo
}

export interface FieldProperty {
    name: string;                  // string, required, readonly, etc.
    value?: any;                   // Valor de la propiedad
}

export interface GextiaMethod {
    name: string;                  // Nombre del método
    parameters: string[];          // Parámetros del método
    decorators: string[];          // Decoradores (@api.model, @api.depends, etc.)
    lineNumber: number;            // Línea donde se define
    docString?: string;            // Documentación del método
    returnType?: string;           // Tipo de retorno inferido
}

export interface InheritanceNode {
    modelName: string;              // Nombre del modelo (ej: 'res.partner', 'sale.order')
    children: InheritanceNode[];    // Array de modelos que heredan de este modelo
    filePath: string;               // Ruta completa del archivo donde se define el modelo
    moduleName: string;             // Nombre del módulo de Gextia que contiene este modelo
    parentModels?: string[];        // Modelos de los que hereda este modelo (para herencia múltiple)
    isBaseModel: boolean;           // true si es un modelo base (_name sin _inherit)
    className?: string;             // Nombre de la clase Python (ej: 'ResPartner')
    inheritanceType: (              // Tipo de herencia en Gextia
        'extension' |
        'prototype' |
        'delegation'
    );
}

export interface ModuleManifest {
    name: string;                   // Nombre del módulo mostrado en la interfaz de Gextia
    version: string;                // Versión del módulo (ej: '16.0.1.0.0')
    depends: string[];              // Módulos de los que depende este módulo
    author?: string;                // Autor(es) del módulo
    category?: string;              // Categoría del módulo (ej: 'Sales/Sales', 'Accounting')
    description?: string;           // Descripción detallada del módulo
    summary?: string;               // Resumen corto del módulo
    website?: string;               // Sitio web del autor/módulo
    installable?: boolean;          // Si el módulo se puede instalar (default: true)
    auto_install?: boolean;         // Si se instala automáticamente cuando se cumplen dependencias
    application?: boolean;          // Si es una aplicación principal (aparece en el menú de apps)
    data?: string[];                // Archivos de datos XML/CSV que se cargan al instalar
    demo?: string[];                // Archivos de datos de demostración
    assets?: {
        [key: string]: string[]     // Archivos CSS/JS para el frontend
    };
    external_dependencies?: {       // Dependencias externas requeridas
        python?: string[];          // Librerías de Python requeridas
        bin?: string[];             // Binarios del sistema requeridos
    };
    license?: string;               // Licencia del módulo (ej: 'LGPL-3', 'OPL-1')
    images?: string[];              // Imágenes del módulo (para la tienda de apps)
    price?: number;                 // Precio si es un módulo de pago
    currency?: string;              // Moneda del precio
}

export interface CompletionContext {
    currentModel?: string;                          // Modelo actual donde se está escribiendo (ej: 'sale.order')
    availableModels: Map<string, GextiaModel[]>;    // Todos los modelos disponibles indexados por nombre
    currentMethod?: string;                         // Método actual donde está el cursor (ej: 'create', 'write')
    currentClass?: string;                          // Clase Python actual (ej: 'SaleOrder')
    lineText: string;                               // Texto completo de la línea actual
    position: number;                               // Posición del cursor en la línea (índice de carácter)
    wordAtCursor: string;                           // Palabra que se está escribiendo en el cursor
    triggerCharacter?: string;                      // Carácter que disparó el autocompletado ('.', '_', etc.)
    indentLevel: number;                            // Nivel de indentación (para saber si estamos en una clase/método)
    previousLines: string[];                        // Líneas anteriores para contexto adicional
    isInString: boolean;                            // Si el cursor está dentro de una cadena de texto
    isInComment: boolean;                           // Si el cursor está dentro de un comentario
}