# 📦 Cómo Subir el Proyecto a GitHub

## Opción 1: Usando GitHub Desktop (Recomendado - Más Fácil)

1. **Descargar GitHub Desktop**
   - Ve a: https://desktop.github.com/
   - Descarga e instala GitHub Desktop

2. **Crear Repositorio**
   - Abre GitHub Desktop
   - Click en "File" → "Add Local Repository"
   - Selecciona la carpeta: `C:\Users\geron\.gemini\antigravity\scratch\aws-microtasks-platform`
   - Si dice que no es un repositorio, click en "Create a repository here instead"

3. **Hacer el Primer Commit**
   - Verás todos los archivos en la lista
   - En el campo "Summary", escribe: `Initial commit: AWS Microtasks Platform`
   - Click en "Commit to main"

4. **Publicar a GitHub**
   - Click en "Publish repository"
   - Elige un nombre: `aws-microtasks-platform`
   - Desmarca "Keep this code private" si quieres que sea público
   - Click en "Publish Repository"

¡Listo! Tu código estará en GitHub.

---

## Opción 2: Usando Git desde la Línea de Comandos

### Paso 1: Instalar Git
- Descarga Git desde: https://git-scm.com/download/win
- Instala con las opciones por defecto

### Paso 2: Configurar Git (primera vez)
```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"
```

### Paso 3: Inicializar Repositorio
```bash
cd C:\Users\geron\.gemini\antigravity\scratch\aws-microtasks-platform
git init
git add .
git commit -m "Initial commit: AWS Microtasks Platform with 4-page system"
```

### Paso 4: Crear Repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre del repositorio: `aws-microtasks-platform`
3. Click en "Create repository"

### Paso 5: Subir el Código
```bash
git remote add origin https://github.com/TU-USUARIO/aws-microtasks-platform.git
git branch -M main
git push -u origin main
```

---

## Opción 3: Subir Manualmente (Sin Git)

1. **Crear Repositorio en GitHub**
   - Ve a https://github.com/new
   - Nombre: `aws-microtasks-platform`
   - Click en "Create repository"

2. **Subir Archivos**
   - En la página del repositorio, click en "uploading an existing file"
   - Arrastra las carpetas: `backend`, `frontend`, `infrastructure`
   - Arrastra los archivos: `README.md`, `.gitignore`
   - Click en "Commit changes"

---

## 📁 Estructura del Proyecto

```
aws-microtasks-platform/
├── backend/                 # Lambda functions
│   └── src/
│       ├── tasks/          # Task management
│       ├── media/          # Media upload
│       └── qc/             # Quality control
├── frontend/               # React application
│   └── src/
│       ├── pages/          # React pages
│       └── styles/         # CSS
├── infrastructure/         # AWS CDK stacks
│   └── lib/
│       ├── auth-stack.ts
│       ├── database-stack.ts
│       ├── api-stack.ts
│       └── ...
├── .gitignore             # Git ignore rules
└── README.md              # Project documentation
```

---

## ⚠️ Importante: Antes de Subir

### Archivos que NO debes subir (ya están en .gitignore):
- ❌ `node_modules/` (dependencias - muy pesado)
- ❌ `dist/` (archivos compilados)
- ❌ `cdk.out/` (archivos temporales de CDK)
- ❌ `.env` (variables de entorno - pueden contener secretos)

### Archivos que SÍ debes subir:
- ✅ `backend/` (código fuente)
- ✅ `frontend/` (código fuente)
- ✅ `infrastructure/` (definiciones de CDK)
- ✅ `README.md` (documentación)
- ✅ `.gitignore` (reglas de Git)
- ✅ `package.json` (dependencias)

---

## 🔐 Seguridad

**NUNCA subas:**
- Credenciales de AWS
- API Keys
- Passwords
- Tokens de acceso
- Archivos `.env`

Estos archivos ya están protegidos en el `.gitignore`.

---

## 📝 Después de Subir

1. **Actualiza el README.md** con:
   - Tu nombre de usuario de GitHub
   - URLs específicas de tu deployment
   - Instrucciones personalizadas

2. **Añade un LICENSE** (opcional):
   - En GitHub, ve a "Add file" → "Create new file"
   - Nombre: `LICENSE`
   - Elige una licencia (MIT es común)

3. **Añade Topics** (etiquetas):
   - En GitHub, click en el ⚙️ junto a "About"
   - Añade: `aws`, `react`, `typescript`, `cdk`, `crowdsourcing`

---

## 🎯 URL de tu Repositorio

Después de crearlo, tu repositorio estará en:
```
https://github.com/TU-USUARIO/aws-microtasks-platform
```

¡Comparte este link para que otros vean tu proyecto!
