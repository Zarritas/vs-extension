# Gextia Development Helper

Una extensión de VS Code que mejora significativamente la experiencia de desarrollo con Gextia, proporcionando autocompletado inteligente, gestión de proyectos y análisis de herencia de modelos.

## ✨ Características

### 🎯 Gestión de Proyectos
- **Perfiles configurables**: Crea múltiples perfiles de proyecto para diferentes instalaciones de Gextia
- **Detección automática**: Encuentra automáticamente carpetas de addons en tu workspace
- **Múltiples rutas**: Soporte para Gextia Core, Enterprise, Community y addons personalizados
- **Cambio rápido**: Alterna entre proyectos con un solo comando

### 🧠 Autocompletado Inteligente
- **Herencia completa**: Detecta automáticamente modelos que heredan usando `_inherit`
- **Contexto consciente**: Sugerencias basadas en el modelo actual y sus relaciones
- **Campos y métodos**: Autocompletado de todos los campos y métodos disponibles
- **Navegación rápida**: Salta a definiciones con Ctrl+Click

### 📊 Análisis de Modelos
- **Caché inteligente**: Sistema de caché que se actualiza automáticamente al guardar archivos
- **Árbol de herencia**: Visualiza cómo se relacionan tus modelos
- **Estadísticas**: Información detallada sobre modelos cargados y archivos rastreados

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
   - Nombra tu perfil
   - Selecciona la versión de Gextia
   - Configura las rutas de tus addons

### Estructura típica de rutas

```
Proyecto Gextia típico:
├── /opt/gextia-server/odoo/           ← Gextia Core
│   ├── odoo/                          ← Código core
│   └── addons/                        ← Addons oficiales
└── /home/user/custom_addons/          ← Tus addons personalizados
    ├── mi_modulo/
    ├── otro_modulo/
    └── ...
```

## 📋 Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `Gextia: Create Project Profile` | Crear un nuevo perfil de proyecto |
| `Gextia: Switch Project Profile` | Cambiar entre perfiles existentes |
| `Gextia: Refresh Models Cache` | Actualizar manualmente el caché de modelos |
| `Gextia: Show Cache Statistics` | Ver estadísticas del caché actual |
| `Gextia: Show Inheritance Tree` | Mostrar árbol de herencia de modelos |

## 🎯 Casos de Uso

### Autocompletado de campos relacionales

```python
class SaleOrder(models.Model):
    _inherit = 'sale.order'
    
    def custom_method(self):
        # Escribe "self.partner_id." y obtén sugerencias de todos los campos de res.partner
        self.partner_id.name
        self.partner_id.email
        self.partner_id.phone  # ← Sugerencias automáticas
```

### Navegación entre herencias

```python
# Modelo base en addons/base/models/res_partner.py
class ResPartner(models.Model):
    _name = 'res.partner'
    name = fields.Char("Name")

# Tu extensión en custom_addons/mi_modulo/models/partner.py  
class ResPartnerCustom(models.Model):
    _inherit = 'res.partner'
    custom_field = fields.Char("Custom Field")  # ← Ctrl+Click para navegar
```

## 🔧 Configuración Avanzada

### Configuraciones disponibles

- `gextia-dev-helper.enableDebugMode`: Activar logs detallados
- `gextia-dev-helper.autoRefreshOnSave`: Actualizar caché al guardar archivos Python
- `gextia-dev-helper.gextiaVersion`: Versión de Gextia del proyecto actual

### Exclusiones de archivos

La extensión excluye automáticamente:
- `**/migrations/**` - Archivos de migración
- `**/tests/**` - Archivos de pruebas
- `**/__pycache__/**` - Cache de Python
- `**/*.pyc` - Archivos compilados

## 🐛 Solución de Problemas

### El autocompletado no funciona
1. Verifica que tengas un perfil activo: `Gextia: Show Cache Statistics`
2. Refresca el caché: `Gextia: Refresh Models Cache`
3. Revisa que las rutas estén configuradas correctamente

### Rendimiento lento
1. Verifica la configuración de exclusiones
2. Considera desactivar `autoRefreshOnSave` para proyectos muy grandes
3. Usa `enableDebugMode: false` en producción

### No encuentra modelos
1. Asegúrate de que las rutas incluyan los archivos `__manifest__.py`
2. Verifica permisos de lectura en las carpetas configuradas
3. Revisa los logs en el Output Channel "Gextia Dev Helper"

## 🤝 Contribuir

¿Encontraste un bug o tienes una idea? ¡Contribuye!

1. Fork el repositorio
2. Crea una rama para tu feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit tus cambios: `git commit -am 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## 🙏 Agradecimientos

- Comunidad de Gextia por la inspiración
- Equipo de VS Code por las excelentes APIs
- Todos los contribuidores y usuarios que hacen posible este proyecto

---

**¿Te gusta la extensión?** ⭐ ¡Dale una estrella en GitHub y compártela con otros desarrolladores de Gextia!

## 📞 Soporte

- 🐛 [Reportar bugs](https://github.com/tu-usuario/gextia-dev-helper/issues)
- 💡 [Solicitar features](https://github.com/tu-usuario/gextia-dev-helper/issues)
- 📧 Email: tu-email@ejemplo.com