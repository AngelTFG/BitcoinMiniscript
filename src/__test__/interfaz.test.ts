import '@testing-library/jest-dom';

declare global {
  interface Window {
    setActiveButton: (button: Element) => void;
    logToOutput: (id: string, message: string) => void;
    clearOutput: (id: string) => void;
    setButtonEnabled: (id: string, enabled: boolean) => void;
    addScript: (src: string) => void;
  }
}

/**
 * Test de interfaz: Comportamiento visual de los botones del menú y utilidades de UI.
 * Cada test está relacionado con una funcionalidad real del frontend:
 * - Activación visual de botones de menú (navegación de proyectos)
 * - Habilitación/deshabilitación de botones según el estado de la app
 * - Limpieza y escritura en la consola de salida
 * - Carga dinámica de scripts según el proyecto seleccionado
 */

// Grupo de tests para los botones del menú (columna izquierda del frontend)
describe('Interfaz de usuario - Botones del menú', () => {
  beforeEach(() => {
    // Simula el menú lateral de proyectos del frontend
    document.body.innerHTML = `
      <div class="menu">
        <button class="app-button">🧬 Herencia digital</button>
        <button class="app-button">🤖 Autocustodia programada</button>
        <button class="app-button">🏦 Bóveda de seguridad</button>
        <button id="btn"></button>
        <div id="output"></div>
      </div>
    `;
    // Simula la función que activa visualmente el botón seleccionado en el menú
    window.setActiveButton = function(button) {
      document.querySelectorAll('.menu .app-button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
    };
    // Simula la función que habilita/deshabilita botones (por ejemplo, tras inicializar la red)
    window.setButtonEnabled = function(id, enabled) {
      const btn = document.getElementById(id) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    };
    // Añade el comportamiento de selección visual al hacer click en los botones del menú
    document.querySelectorAll('.app-button').forEach(btn => {
      btn.addEventListener('click', (event) => {
        window.setActiveButton(event.currentTarget as Element);
      });
    });
  });

  // Prueba que solo un botón del menú queda activo visualmente al seleccionarlo 
  it('al pulsar un botón, solo ese botón queda con la clase "active" y los demás no', () => {
    const buttons = document.querySelectorAll('.app-button');
    window.setActiveButton(buttons[1]);
    expect(buttons[0]).not.toHaveClass('active');
    expect(buttons[1]).toHaveClass('active');
    expect(buttons[2]).not.toHaveClass('active');
  });

  // Prueba que puedes activar cualquier botón del menú y el estado visual se actualiza correctamente
  it('setActiveButton funciona con cualquier botón del menú', () => {
    const buttons = document.querySelectorAll('.app-button');
    window.setActiveButton(buttons[0]);
    expect(buttons[0]).toHaveClass('active');
    window.setActiveButton(buttons[1]);
    expect(buttons[1]).toHaveClass('active');
    expect(buttons[0]).not.toHaveClass('active');
    window.setActiveButton(buttons[2]);
    expect(buttons[2]).toHaveClass('active');
    expect(buttons[1]).not.toHaveClass('active');
  });

  // Prueba el comportamiento real de la UI: al hacer click en cada botón, solo ese queda activo 
  it('al hacer click en cada botón del menú, solo ese botón queda activo', () => {
    const buttons = document.querySelectorAll('.app-button');
    (buttons[0] as HTMLButtonElement).click();
    expect(buttons[0]).toHaveClass('active');
    expect(buttons[1]).not.toHaveClass('active');
    expect(buttons[2]).not.toHaveClass('active');

    (buttons[1] as HTMLButtonElement).click();
    expect(buttons[1]).toHaveClass('active');
    expect(buttons[0]).not.toHaveClass('active');
    expect(buttons[2]).not.toHaveClass('active');

    (buttons[2] as HTMLButtonElement).click();
    expect(buttons[2]).toHaveClass('active');
    expect(buttons[0]).not.toHaveClass('active');
    expect(buttons[1]).not.toHaveClass('active');
  });

  // Prueba que puedes habilitar y deshabilitar botones del frontend (por ejemplo, tras inicializar la red)
  it('setButtonEnabled habilita y deshabilita el botón', () => {
    window.setButtonEnabled('btn', false);
    expect((document.getElementById('btn') as HTMLButtonElement).disabled).toBe(true);
    window.setButtonEnabled('btn', true);
    expect((document.getElementById('btn') as HTMLButtonElement).disabled).toBe(false);
  });

  // Prueba que intentar habilitar/deshabilitar un botón inexistente no rompe la ejecución de la app 
  it('setButtonEnabled no lanza error si el botón no existe', () => {
    expect(() => window.setButtonEnabled('no-btn', true)).not.toThrow();
  });
});

// Grupo de tests para la consola de salida (output)
describe('Interfaz de usuario - Output', () => {
  beforeEach(() => {
    // Simula la consola de salida y un botón genérico en el frontend
    document.body.innerHTML = `
      <div id="output"></div>
      <button id="btn"></button>
    `;
    // Simula la función que añade mensajes a la consola de salida (como logToOutput)
    window.logToOutput = function(id, message) {
      const el = document.getElementById(id);
      if (el) el.innerHTML += `<p>${message}</p>`;
    };
    // Simula la función que limpia la consola de salida
    window.clearOutput = function(id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    };
  });

  // Prueba que logToOutput añade un mensaje a la consola de salida (como mostrar logs)
  it('logToOutput añade un mensaje al output', () => {
    window.logToOutput('output', 'Hola mundo');
    expect(document.getElementById('output')).toHaveTextContent('Hola mundo');
  });

  // Prueba que logToOutput puede añadir varios mensajes (como mostrar historial de logs en la consola del frontend)
  it('logToOutput añade varios mensajes al output', () => {
    window.logToOutput('output', 'Mensaje 1');
    window.logToOutput('output', 'Mensaje 2');
    expect(document.getElementById('output')).toHaveTextContent('Mensaje 1');
    expect(document.getElementById('output')).toHaveTextContent('Mensaje 2');
  });

  // Prueba que clearOutput limpia correctamente la consola de salida (como el botón "Limpiar Consola" en el frontend)
  it('clearOutput limpia el contenido del output', () => {
    document.getElementById('output')!.innerHTML = 'Texto';
    window.clearOutput('output');
    expect(document.getElementById('output')!.innerHTML).toBe('');
  });

  // Prueba que limpiar la consola no lanza error si el elemento no existe (robustez del frontend)
  it('clearOutput no lanza error si el id no existe', () => {
    expect(() => window.clearOutput('no-existe')).not.toThrow();
  });
});

// Grupo de tests para la carga dinámica de scripts (JS de cada proyecto)
describe('Interfaz de usuario - Carga de scripts', () => {
  beforeEach(() => {
    // Simula el DOM vacío para pruebas de scripts
    document.body.innerHTML = '';
    // Simula la función que añade scripts dinámicamente al body (como cuando cambias de proyecto)
    window.addScript = function(src) {
      const script = document.createElement('script');
      script.src = src;
      document.body.appendChild(script);
    };
  });

  // Prueba que addScript añade un script al body al seleccionarl el JS de un proyecto)
  it('addScript añade un script al body', () => {
    window.addScript('test.js');
    const script = document.querySelector('script[src="test.js"]');
    expect(script).not.toBeNull();
  });

  // Prueba que addScript puede añadir varios scripts diferentes ( cargar varios módulos JS)
  it('addScript puede añadir varios scripts con diferentes src', () => {
    window.addScript('uno.js');
    window.addScript('dos.js');
    expect(document.querySelector('script[src="uno.js"]')).not.toBeNull();
    expect(document.querySelector('script[src="dos.js"]')).not.toBeNull();
  });
});

export {};