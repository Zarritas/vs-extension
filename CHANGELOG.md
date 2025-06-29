# Change Log

All notable changes to the "gextia-dev-helper" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.0] - 2024-12-19

### Added
- **Gestión de Perfiles de Proyecto**
  - Creación y gestión de múltiples perfiles de proyecto
  - Detección automática de carpetas de addons
  - Soporte para Gextia Core, Enterprise y addons personalizados
  - Cambio rápido entre perfiles de proyecto

- **Repositorios Remotos**
  - Integración con GitHub, GitLab y Bitbucket
  - Soporte para repositorios públicos y privados
  - Configuración de ramas específicas y subcarpetas
  - Autenticación con tokens personales
  - Descarga y extracción automática de repositorios ZIP
  - Sincronización automática cada 24 horas

- **Sistema de Cache Inteligente**
  - Cache local de modelos de Gextia
  - Actualización automática al guardar archivos Python
  - Refresco manual del cache con progreso
  - Estadísticas detalladas del cache
  - Logs de debug para troubleshooting

- **Autocompletado Inteligente**
  - Autocompletado contextual basado en el modelo actual
  - Detección automática de herencias (`_inherit`)
  - Sugerencias de campos y métodos heredados
  - Análisis de contexto en tiempo real
  - Triggers en punto (.) y guión bajo (_)

- **Navegación y Análisis**
  - Navegación a definiciones de modelos (Ctrl+Click)
  - Árbol de herencia visual con información detallada
  - Análisis de dependencias entre módulos
  - Parser de manifests (`__manifest__.py`, `__openerp__.py`)

- **Comandos de Gestión**
  - `Gextia: Create Project Profile` - Crear perfil de proyecto
  - `Gextia: Switch Project Profile` - Cambiar entre perfiles
  - `Gextia: Refresh Models Cache` - Refrescar cache de modelos
  - `Gextia: Show Model Inheritance Tree` - Mostrar árbol de herencia
  - `Gextia: Sync Remote Repositories` - Sincronizar repositorios
  - `Gextia: Add Path to Current Project` - Agregar ruta al proyecto
  - `Gextia: Add Remote Repository to Current Project` - Agregar repo remoto
  - `Gextia: Manage Project Paths and Repositories` - Gestionar rutas y repos
  - `Gextia: Show Cache Statistics` - Ver estadísticas del cache
  - `Gextia: Test Remote Repository Connection` - Probar conexión
  - `Gextia: Show Remote Repositories Info` - Ver info de repositorios
  - `Gextia: Go to Model Definition` - Ir a definición de modelo

- **Configuración Avanzada**
  - Configuraciones de VS Code para debug y auto-refresh
  - Exclusiones automáticas de archivos (migrations, tests, etc.)
  - Soporte para múltiples versiones de Gextia (11.0-17.0)
  - Logs detallados para debugging

- **Características Técnicas**
  - Parser inteligente de archivos Python de Gextia
  - Detección de modelos, campos y métodos
  - Análisis de herencias múltiples
  - Gestión de dependencias entre módulos
  - Sistema de logging robusto
  - Manejo de errores con reintentos automáticos

### Technical Details
- **Arquitectura**: Singleton pattern para ProjectManager, ModelsCache y RemoteRepositoryManager
- **Parser**: Análisis de archivos Python con detección de clases, herencias y campos
- **Cache**: Sistema de cache local con verificación de modificaciones
- **Repositorios**: Descarga ZIP con extracción automática y sincronización incremental
- **Autocompletado**: Proveedor de VS Code con análisis contextual
- **Navegación**: Definition provider para Ctrl+Click en modelos

### Dependencies
- `glob`: Para búsqueda de archivos
- `adm-zip`: Para extracción de archivos ZIP
- APIs nativas de VS Code para extensiones

### Supported Platforms
- Windows, macOS, Linux
- VS Code 1.74.0+

### Repository Information
- **GitHub**: https://github.com/Zarritas/vs-extension
- **Publisher**: Jesús Lorenzo
- **Categories**: Programming Languages, Snippets, Other
- **Keywords**: Gextia, Python, ERP, Autocompletion, Inheritance, Models, Development