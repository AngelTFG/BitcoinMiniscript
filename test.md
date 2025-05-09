# Pruebas de Interfaz de Usuario con Jest

Este documento explica cómo instalar, configurar y ejecutar pruebas de interfaz para tu proyecto usando **Jest** y **@testing-library/jest-dom**.  
Incluye el archivo de pruebas completo para utilidades de la interfaz y recomendaciones para interpretar los resultados.

---

## 1. Instalación de dependencias

Abre la terminal en la raíz de tu proyecto y ejecuta:

```bash
npm install --save-dev jest ts-jest @types/jest @testing-library/jest-dom

npx ts-jest config:init
```

---

## 2. Configuración de Jest

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

---

## 3. Archivo de setup para jest-dom

Crea el archivo `src/__test__/jest.setup.ts` con el siguiente contenido:

```typescript
import '@testing-library/jest-dom';
```

Esto habilita los matchers extendidos de jest-dom, como `toHaveClass`, `toHaveTextContent`, etc.

---

## 4. Escribe tus tests de interfaz

Guarda el siguiente contenido como  
`src/__test__/interfaz.test.ts`:


---


## 5. Ejecutar los tests

Para ejecutar todos los tests y ver los resultados en la consola:

```bash
npm test
```

Para ver una salida más detallada (con los nombres de los tests):

```bash
npm test -- --verbose
```
o
```bash
npx jest --verbose
```

---



## 6. Interpretar la salida

Verás algo como:

```
 PASS  src/__test__/interfaz.test.ts

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

---

## 7. Consejos adicionales

- Puedes añadir más tests para cualquier función de interfaz que manipule el DOM.
- Si tienes problemas con los tipos de los matchers de jest-dom, asegúrate de importar `@testing-library/jest-dom` en tu archivo de setup o al principio de cada archivo de test.
- Usa la opción `--watch` para ejecutar los tests automáticamente al guardar cambios:

```bash
npx jest --watch
```

---

¡Listo! Así puedes instalar, configurar y ejecutar pruebas de interfaz para tu proyecto con Jest y ver los resultados en la consola.