# Guía de Configuración del Proyecto Browserify 

## Estructura del Proyecto
```plaintext
Proyecto/
├─ .gitignore                 # Archivos y carpetas que no se suben al control de versiones (por ejemplo, node_modules, dist, etc)
├─ .prettierrc                # Configuración de formato de código para Prettier
├─ favicon.svg                # Icono de la página web
├─ index.html                 # Página principal que carga los bundles JS
├─ jest.config.js             # Configuración de Jest para pruebas automáticas
├─ MiniscriptRustLogo.png     # Imagen/logo del proyecto
├─ package-lock.json          # Archivo de bloqueo de dependencias generado por npm
├─ package.json               # Manejo de dependencias, scripts y metadatos del proyecto
├─ readme.md                  # Este archivo, documentación y guía del proyecto
├─ style.css                  # Estilos CSS globales del proyecto
├─ test.md                    # Documentación o ejemplos de pruebas (opcional)
├─ tsconfig.json              # Configuración de TypeScript
├─ dist/                      # Carpeta de salida de los bundles generados para cada módulo/página
│   ├─ autocustodia.bundle.js # Bundle JS para la funcionalidad de autocustodia
│   ├─ boveda.bundle.js       # Bundle JS para la funcionalidad de bóveda
│   └─ herencia.bundle.js     # Bundle JS para la funcionalidad de herencia
├─ htmls/                     # HTMLs individuales para cada módulo/página
│   ├─ autocustodia.html      # Página HTML para autocustodia
│   ├─ boveda.html            # Página HTML para bóveda
│   └─ herencia.html          # Página HTML para herencia
├─ node_modules/              # Dependencias instaladas (no modificar manualmente)
├─ src/                       # Código fuente del proyecto
│   ├─ types.d.ts             # Definiciones de tipos globales de TypeScript
│   ├─ __test__/              # Carpeta de tests automáticos
│   │   ├─ interfaz.test.ts   # Pruebas de interfaz de usuario (DOM, utilidades visuales)
│   │   └─ jest.setup.ts      # Setup para jest-dom (extiende los matchers de Jest)
│   ├─ autocustodia./          # Código fuente específico del módulo autocustodia
│   │   └─ source.ts
│   ├─ boveda/                # Código fuente específico del módulo bóveda
│   │   └─ source.ts
│   └─ herencia/              # Código fuente específico del módulo herencia
│       └─ source.ts
```

---

## Pasos para Configurar el Proyecto

### 1. Inicializar el Proyecto
Ejecuta el siguiente comando para crear un archivo `package.json`:
```bash
npm init -y
```

---

### 2. Instalar Dependencias
Ejecuta los siguientes comandos para instalar las dependencias necesarias:

Browserify es una tecnología más veterana que (por ejemplo) Webpack o Vite, pero sigue siendo válida para “convertir” tu código Node.js en algo que corra en un navegador con los polyfills adecuados.
Browserify está diseñado para empaquetar código de Node.js y proveer los polyfills necesarios para que funcionen en el navegador (incluyendo Buffer, process, etc.).

Tu tsconfig.json ya transpila a algo compatible (como target: "es5" o es6)
Usas tsify, que ya se encarga de convertir .ts → .js compatible con el navegador
Browserify empaquetará tus módulos para el navegador.


### Dependencias de desarrollo:
```bash
npm install --save-dev browserify tsify typescript jest ts-jest @types/jest @testing-library/jest-dom
```


### Dependencias del proyecto:
```bash
npm install @bitcoinerlab/secp256k1 @bitcoinerlab/descriptors bip39 bitcoinjs-lib 
```

---

### 3. Configuración tsconfig.json

Crea un archivo `tsconfig.json` 
"target": "ES6" → tu código se transpila a ES6, que ya es compatible con todos los navegadores modernos
"module": "commonjs" → es perfecto para que browserify maneje los módulos
"strict": true → activa chequeos de tipo estrictos, lo cual es bueno para seguridad

Crea el archivo `tsconfig.json` con:

```json
{
  "compilerOptions": {
    "target": "ES6",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

### 4. Configuración de Scripts en `package.json`
Agrega el siguiente script en la sección `"scripts"` de tu archivo `package.json`:
Usa el plugin tsify para que Browserify entienda y transpile TypeScript.
Convierte .ts a .js sobre la marcha durante el empaquetado.
Le dice a tsify que use el archivo tsconfig.json para las reglas de compilación TypeScript.

Agrega o actualiza la sección `"scripts"` de tu archivo `package.json` para facilitar la construcción y pruebas del proyecto.  
A continuación tienes ejemplos de scripts útiles para proyectos con varios módulos y tests:

```json
{
  "scripts": {
    "build-autocustodia": "browserify [source.ts](http://_vscodecontentref_/0) -p tsify --project [tsconfig.json](http://_vscodecontentref_/1) -o dist/autocustodia.bundle.js",
    "build-boveda": "browserify [source.ts](http://_vscodecontentref_/2) -p tsify --project [tsconfig.json](http://_vscodecontentref_/3) -o dist/boveda.bundle.js",
    "build-herencia": "browserify [source.ts](http://_vscodecontentref_/4) -p tsify --project [tsconfig.json](http://_vscodecontentref_/5) -o dist/herencia.bundle.js",
    "watch-autocustodia": "watchify [source.ts](http://_vscodecontentref_/6) -p tsify --project [tsconfig.json](http://_vscodecontentref_/7) -o [autocustodia.bundle.js](http://_vscodecontentref_/8) --debug --verbose",
    "watch-boveda": "watchify [source.ts](http://_vscodecontentref_/9) -p tsify --project [tsconfig.json](http://_vscodecontentref_/10) -o [boveda.bundle.js](http://_vscodecontentref_/11) --debug --verbose",
    "watch-herencia": "watchify [source.ts](http://_vscodecontentref_/12) -p tsify --project [tsconfig.json](http://_vscodecontentref_/13) -o [herencia.bundle.js](http://_vscodecontentref_/14) --debug --verbose",
    "test": "jest --verbose"
  }
}
```

---

## 5. Ejecutar los Tests

Para ejecutar todos los tests y ver los resultados detallados:

```bash
npm test
```
o
```bash
npx jest --verbose
```

---

