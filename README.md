# Gextia Development Helper

> **Work In Progress**
> 
> ⚠️ El soporte para rutas de repositorios remotos está actualmente **NO DISPONIBLE** o en fase experimental. La funcionalidad de sincronización y gestión remota puede no funcionar correctamente. Se recomienda usar únicamente rutas locales de addons hasta nuevo aviso.

Una extensión de VS Code que revoluciona la experiencia de desarrollo con Gextia, proporcionando autocompletado inteligente, gestión avanzada de proyectos y análisis completo de herencia de modelos.

## ✨ Características Principales

### 🎯 Gestión Avanzada de Proyectos
- **Perfiles configurables**: Crea múltiples perfiles de proyecto para diferentes instalaciones de Gextia
- **Detección automática**: Encuentra automáticamente carpetas de addons en tu workspace
- **Múltiples fuentes**: Soporte para Gextia Core, Enterprise, Community y addons personalizados
- **Repositorios remotos**: *(No disponible actualmente)*
- **Cambio rápido**: Alterna entre proyectos con un solo comando

### 🌐 Repositorios Remotos *(No disponible)*
- **GitHub/GitLab/Bitbucket**: *(No disponible)*
- **Ramas específicas**: *(No disponible)*
- **Subcarpetas**: *(No disponible)*
- **Repositorios privados**: *(No disponible)*
- **Sincronización automática**: *(No disponible)*
- **Cache inteligente**: *(No disponible)*

### 🧠 Autocompletado Inteligente
- **Herencia completa**: Detecta automáticamente modelos que heredan usando `_inherit`
- **Contexto consciente**: Sugerencias basadas en el modelo actual y sus relaciones
- **Campos y métodos**: Autocompletado de todos los campos y métodos disponibles
- **Navegación rápida**: Salta a definiciones con Ctrl+Click
- **Análisis en tiempo real**: Actualización automática al guardar archivos

### 📊 Análisis Avanzado de Modelos
- **Caché inteligente**: Sistema que se actualiza automáticamente al detectar cambios
- **Árbol de herencia**: Visualiza cómo se relacionan tus modelos
- **Estadísticas detalladas**: Información sobre modelos cargados y archivos rastreados
- **Soporte multi-versión**: Compatible con Gextia 11.0 hasta 17.0

## 🚀 Instalación

1. Abre VS Code
2. Ve a Extensions (Ctrl+Shift+X)
3. Busca "Gextia Development Helper"
4. Haz clic en Install

## ⚙️ Configuración Inicial

### Crear tu primer perfil

1. Abre la paleta de comandos (Ctrl+Shift+P)
2. Ejecuta `Gextia: Create Project Profile`
3. Sigue el asistente de configuración:
   - Nombra tu perfil (ej: "Proyecto Cliente X")
   - Selecciona la versión de Gextia
   - Configura las fuentes de tus addons (solo rutas locales)

### Fuentes de addons soportadas

```
🎯 Estructura típica completa:

📁 Addons locales personalizados
├── /home/user/custom_addons/
│   ├── mi_modulo/
│   └── otro_modulo/

🔧 Gextia Core (opcional)
├── /opt/gextia/16.0/
│   ├── gextia/                    ← Código core
│   └── addons/                  ← Addons oficiales

💼 Gextia Enterprise (opcional)
└── /opt/gextia/enterprise/
```

### Configuración de repositorios remotos

> ⚠️ **No disponible actualmente**. La funcionalidad de repositorios remotos está en desarrollo y puede no funcionar correctamente.

---

## 📋 Comandos Disponibles

### Gestión de Proyectos
| Comando | Descripción |
|---------|-------------|
| `Gextia: Create Project Profile` | Crear un nuevo perfil de proyecto |
| `Gextia: Switch Project Profile` | Cambiar entre perfiles existentes |
| `Gextia: Add Path to Current Project` | Agregar ruta de addons al proyecto actual |
| `Gextia: Manage Project Paths and Repositories` | Gestionar rutas del proyecto |

### Cache y Análisis
| Comando | Descripción |
|---------|-------------|
| `Gextia: Refresh Models Cache` | Actualizar manualmente el caché de modelos |
| `Gextia: Show Models Cache Statistics` | Ver estadísticas del caché actual |
| `Gextia: Show Model Inheritance Tree` | Mostrar árbol de herencia de modelos |
| `Gextia: Go to Model Definition` | Navegar a la definición de un modelo |
| `Gextia: Show Models Cache Log` | Ver log del caché de modelos |
| `Gextia: Debug Refresh Models Cache` | Debug del refresco del caché |

### Repositorios Remotos *(No disponible)*
| Comando | Descripción |
|---------|-------------|
| `Gextia: Sync Remote Repositories` | *(No disponible)* |
| `Gextia: Show Remote Repositories Info` | *(No disponible)* |
| `Gextia: Test Remote Repository Connection` | *(No disponible)* |
| `Gextia: Show Remote Repositories Sync Log` | *(No disponible)* |
| `Gextia: Clear Remote Repositories Sync Log` | *(No disponible)* |

## 🎯 Casos de Uso Avanzados

### 1. Desarrollo con OCA (Gextia Community Association)

```python
# Perfil configurado con:
# - Addons locales: /home/dev/mi_proyecto/
# - OCA Server Tools: (solo si es ruta local)

class ResPartner(models.Model):
    _inherit = 'res.partner'
    
    def custom_method(self):
        # Autocompletado incluye campos de OCA automáticamente
        self.partner_autocomplete_filter  # ← Campo de OCA
        self.base_location_geonames_import  # ← Método de OCA
```

### 2. Proyecto Enterprise con addons locales

```python
# Perfil configurado con:
# - Gextia Core: /opt/gextia/16.0/
# - Gextia Enterprise: /opt/gextia/enterprise/

class SaleOrder(models.Model):
    _inherit = 'sale.order'
    
    def process_order(self):
        # Campos de Enterprise disponibles
        self.l10n_mx_edi_cfdi_uuid  # ← Campo de Enterprise
```

### 3. Desarrollo multi-cliente

```bash
# Perfil "Cliente A"
├── Addons locales: /projects/cliente-a/addons/
└── Versión: 16.0

# Perfil "Cliente B"  
├── Addons locales: /projects/cliente-b/addons/
└── Versión: 15.0

# Cambio rápido: Gextia: Switch Project Profile
```

## 🔧 Configuración Avanzada

### Configuraciones disponibles

```json
{
  "gextia-dev-helper.currentProfile": "",
  "gextia-dev-helper.profiles": {},
  "gextia-dev-helper.gextiaVersion": "16.0",
  "gextia-dev-helper.enableDebugMode": false,
  "gextia-dev-helper.autoRefreshOnSave": true
}
```

### Exclusiones automáticas

La extensión excluye automáticamente:
- `**/migrations/**` - Archivos de migración
- `**/tests/**` - Archivos de pruebas  
- `**/__pycache__/**` - Cache de Python
- `**/*.pyc` - Archivos compilados

## 🔄 Sincronización y Cache

### Sincronización automática
- *(No disponible para repositorios remotos)*
- El cache local se actualiza automáticamente al guardar archivos

### Gestión de cache
- Cache almacenado en: `~/.vscode/gextia-dev-helper/cache/`
- Limpieza automática de archivos obsoletos
- Verificación de integridad en cada sincronización

## 🐛 Solución de Problemas

### El autocompletado no funciona
1. Verifica que tengas un perfil activo: `Gextia: Show Cache Statistics`
2. Refresca el caché: `Gextia: Refresh Models Cache`

### Error de conexión a repositorio remoto
- *(No disponible actualmente)*

### Error HTTP 403 (Forbidden)
- *(No disponible actualmente)*

### Rendimiento lento
1. Verifica la configuración de exclusiones
2. Considera desactivar `autoRefreshOnSave` para proyectos muy grandes
3. Usa `enableDebugMode: false` en producción
4. Limpia el cache: elimina `~/.vscode/gextia-dev-helper/cache/`

### Repositorio no sincroniza
- *(No disponible actualmente)*

## 🚀 Casos de Uso Reales

### Startup desarrollando para múltiples clientes
- **Perfil por cliente** con rutas locales específicas
- **Cambio rápido** entre proyectos sin reconfigurar

### Empresa usando OCA + desarrollos propios
- **Repositorios OCA** locales sincronizados manualmente
- **Autocompletado completo** de toda la funcionalidad disponible

### Desarrollador freelance
- **Múltiples versiones de Gextia** en diferentes perfiles
- **Cache inteligente** para trabajar offline

## 🔍 Características Técnicas

### Análisis de Modelos
- **Parser inteligente**: Analiza archivos Python de Gextia
- **Detección de herencias**: Identifica `_inherit`, `_name`, y herencias múltiples
- **Campos y métodos**: Extrae información completa de modelos
- **Manifests**: Parsea `__manifest__.py` y `__openerp__.py`

### Gestión de Repositorios
- *(No disponible actualmente)*

### Autocompletado Contextual
- **Análisis de contexto**: Detecta modelo y método actual
- **Herencia completa**: Incluye campos y métodos heredados
- **Navegación**: Ctrl+Click para ir a definiciones
- **Filtrado inteligente**: Sugerencias relevantes al contexto

## 🤝 Contribuir

¿Encontraste un bug o tienes una idea? ¡Contribuye!

1. Fork el repositorio: `https://github.com/Zarritas/vs-extension`
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -am 'Agregar soporte para X'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

### Roadmap
- [ ] Interfaz gráfica para gestión de repositorios  
- [ ] Notificaciones de actualizaciones disponibles
- [ ] Soporte para más proveedores Git
- [ ] Análisis de dependencias entre módulos
- [ ] Generador de snippets personalizados
- [ ] Integración con Gextia Studio

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## 🙏 Agradecimientos

- **Comunidad OCA** por los excelentes addons de código abierto
- **Gextia SA** por el framework que amamos desarrollar
- **Equipo de VS Code** por las APIs que hacen posible esta extensión
- **Comunidad de desarrolladores** que contribuye con feedback y mejoras

---

## 📊 Estadísticas del Proyecto

- **🎯 Casos de uso**: Desarrollo local, múltiples clientes
- **🌐 Repositorios soportados**: *(Solo rutas locales actualmente)*
- **📦 Versiones Gextia**: 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0
- **🔧 Tipos de instalación**: Source, Docker, SaaS, On-premise

**¿Te gusta la extensión?** ⭐ ¡Dale una estrella en GitHub y compártela con la comunidad Gextia!

## 📞 Soporte y Comunidad

- 🐛 [Reportar bugs](https://github.com/Zarritas/vs-extension/issues)
- 💡 [Solicitar features](https://github.com/Zarritas/vs-extension/discussions)
- 📖 [Documentación completa](https://github.com/Zarritas/vs-extension/wiki)
- 💬 [Únete a Discord](https://discord.gg/gextia-dev-helper)
- 📧 Email: support@gextia-dev-helper.com

---

> **Tip**: ¿Nuevo en Gextia? Esta extensión te ayudará a entender mejor cómo funcionan las herencias y dependencias entre módulos. ¡Perfecto para aprender y para expertos!