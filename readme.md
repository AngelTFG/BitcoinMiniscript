# Guía de configuración del proyecto Miniscript Playground 

## Estructura del Proyecto
```txt
Playground/
├─ readme.md                     # Este archivo, documentación y guía del proyecto
├─ .gitignore                    # Archivos y carpetas que no se suben al control de versiones
├─ .prettierrc                   # Configuración de formato de código para Prettier
├─ favicon.svg                   # Icono de la página web
├─ btcLogo.png                   # Imagen/logo del proyecto
├─ index.html                    # Página principal que carga los bundles JS
├─ style.css                     # Estilos CSS globales del proyecto
├─ jest.config.js                # Configuración de Jest para pruebas automáticas
├─ package-lock.json             # Archivo de bloqueo de dependencias generado por npm
├─ package.json                  # Manejo de dependencias, scripts y metadatos del proyecto
├─ tsconfig.json                 # Configuración de TypeScript
├─ node_modules/                 # Dependencias instaladas 
├─ dist/                         # Carpeta de salida de los bundles generados para cada módulo/página
│   ├─ autocustodia.bundle.js    # Bundle JS para la funcionalidad de autocustodia
│   ├─ boveda.bundle.js          # Bundle JS para la funcionalidad de bóveda
│   └─ herencia.bundle.js        # Bundle JS para la funcionalidad de herencia
├─ htmls/                        # HTMLs individuales para cada módulo/página
│   ├─ autocustodia.html         # Página HTML para autocustodia
│   ├─ boveda.html               # Página HTML para bóveda
│   └─ herencia.html             # Página HTML para herencia
└─ src/                          # Código fuente del proyecto
    ├─ types.d.ts                # Definiciones de tipos globales de TypeScript
    ├─ autocustodia.source.ts    # Código fuente específico del módulo autocustodia
    ├─ boveda.source.ts          # Código fuente específico del módulo bóveda
    ├─ herencia.source.ts        # Código fuente específico del módulo herencia
    └─ __test__/                 # Carpeta de tests automáticos
        └─ interfaz.test.ts      # Pruebas de interfaz de usuario (DOM, utilidades visuales)

```

---

## Pasos para Configurar el Proyecto

### 1. Inicializar el Proyecto
Ejecutar el siguiente comando para crear un archivo `package.json`:
```bash
npm init -y
```

---

### 2. Instalar Dependencias
Ejecutar los siguientes comandos para instalar las dependencias necesarias:

**Browserify** está diseñado para empaquetar código de Node.js y proveer los polyfills necesarios para que funcionen en el navegador (incluyendo Buffer, process, etc.).

### Dependencias de desarrollo:
```bash
npm install --save-dev browserify tsify typescript jest ts-jest @types/jest @testing-library/jest-dom
```


### Dependencias del proyecto:
```bash
npm install @bitcoinerlab/secp256k1 @bitcoinerlab/descriptors bip39 bitcoinjs-lib 
```

---

### 3 .Declaraciones de tipos para módulos que no tienen tipado  en TypeScript


Para que el compilador TypeScript no muestre errores al importar y usar los módulos 

Crear el archivo `types.d.ts` con:

```js
// Declaraciones de tipos para módulos que no soportan tipado de TypeScript

declare module 'bip65' {
  export function encode(params: { blocks?: number; seconds?: number }): number;
  export function decode(locktime: number): { blocks: number; seconds: number };
}
declare module 'bip68' {
  export function encode(params: { blocks?: number; seconds?: number }): number;
  export function decode(value: number): { blocks: number; seconds: number };
}

declare module 'aria-query';
declare module 'entities/decode';
```


### 3. Configuración `tsconfig.json` 

Crear el archivo `tsconfig.json` 

"target": "ES6" → El código se transpila a ES6, que ya es compatible con todos los navegadores modernos
"module": "commonjs"  → Para que  browserify maneje los módulos
"strict": true → Activa chequeos de tipo estrictos, por seguridad

```json
{
  "compilerOptions": {
    "target": "ES6",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "moduleResolution": "node",
    "types": ["jest"]
  },
    "include": ["src/**/*.ts", "src/types.d.ts"],
    "exclude": [
      "node_modules",
      "src/__test__"
    ]
}
```

---


### 4. Configuración `tsconfig.test.json`

Crear un archivo `tsconfig.test.json` con la configuración especifica de **jest**


```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
      "types": ["jest", "@testing-library/jest-dom"]
    },
    "include": ["src/__test__/**/*.ts"]
}
```

---


### 5. Configuración de Scripts en `package.json`

Agregar el siguiente script en la sección `"scripts"` del archivo `package.json`:

**browserify** empaqueta el codigo en un bundle JS
**tsify** convierte .ts a .js durante el empaquetado, ahorrando un paso
**watchify** se queda obsarvando y lanza automaticamente el empaquetado

```json
{
  "scripts": {
    "test": "jest",

    "build-autocustodia": "browserify src/autocustodia.source.ts -p tsify --project tsconfig.json -o dist/autocustodia.bundle.js",
    "build-boveda": "browserify src/boveda.source.ts -p tsify --project tsconfig.json -o dist/boveda.bundle.js",
    "build-herencia": "browserify src/herencia.source.ts -p tsify --project tsconfig.json -o dist/herencia.bundle.js",
    "build-all": "browserify src/autocustodia.source.ts -p tsify --project tsconfig.json -o dist/autocustodia.bundle.js && browserify src/herencia.source.ts -p tsify --project tsconfig.json -o dist/herencia.bundle.js && browserify src/boveda.source.ts -p tsify --project tsconfig.json -o dist/boveda.bundle.js",
    
    "watch-autocustodia": "watchify src/autocustodia.source.ts -p tsify --project tsconfig.json -o dist/autocustodia.bundle.js --debug --verbose",
    "watch-boveda": "watchify src/boveda.source.ts -p tsify --project tsconfig.json -o dist/boveda.bundle.js --debug --verbose",
    "watch-herencia": "watchify src/herencia.source.ts -p tsify --project tsconfig.json -o dist/herencia.bundle.js --debug --verbose"
  },
}
```

---

### 6. Compilar el código

Compilar en un paso o en modo watch

```bash
npm run build-autocustodia
npm run build-boveda
npm run build-herencia
```
o
```bash
npm run watch-autocustodia
npm run watch-boveda
npm run watch-herencia
```

---


### 7. Instalar extension `Live Server` en VSCode

Instalar desde el marketplace y activar "Go Live"

### 8. Configuración de Jest

Inicializar jest

```bash
npx ts-jest config:init
```

Edita tu archivo `jest.config.js` para asegurarte de que contiene lo siguiente:

```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
  },
};
```

Esto configura Jest para trabajar con TypeScript y simular el DOM en los tests.

### 9. Ejecutar los Tests

Para ejecutar todos los tests y ver los resultados detallados:

```bash
npm test
```
o 

```bash
npx jest --verbose
```


---

