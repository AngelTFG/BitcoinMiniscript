# Guía de Configuración del Proyecto Browserify + Babel

## Estructura del Proyecto
```plaintext
browserify/
  ├─ package.json          (para manejar dependencias)
  ├─ tsconig.json          (configuración ts)
  ├─ bundle.js             (archivo ts transpilado)
  ├─ src/ 
  │   └─ app.ts            (tu script principal con import/export)
  └─ index.html            (la página web que cargará bundle.js)
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
npm install --save-dev browserify 
```


### Dependencias del proyecto:
```bash
npm install @bitcoinerlab/secp256k1 @bitcoinerlab/descriptors bip39 bitcoinjs-lib
npm install ledger-bitcoin
```

---

### 3. Configuración tsconfig.json
Crea un archivo `tsconfig.json` 
"target": "ES6" → tu código se transpila a ES6, que ya es compatible con todos los navegadores modernos
"module": "commonjs" → es perfecto para que browserify maneje los módulos
"strict": true → activa chequeos de tipo estrictos, lo cual es bueno para seguridad

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

```json
{
  "scripts": {
    "build": "browserify src/app.ts -p tsify --project tsconfig.json -o bundle.js"
  }
}
```

---

### 5. Construir el Proyecto
Para generar el archivo `bundle.js`, ejecuta el siguiente comando:
```bash
npm run build
```

---

### 6. Alternativa: Construir Manualmente
Si prefieres construir manualmente, puedes usar el siguiente comando:
```bash
npx browserify src/app.js -o bundle.js -t babelify
```

---

