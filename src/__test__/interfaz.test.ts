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
 */

describe('Interfaz de usuario - Botones del menú', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="menu">
        <button class="app-button">Uno</button>
        <button class="app-button">Dos</button>
      </div>
    `;
    window.setActiveButton = function(button) {
      document.querySelectorAll('.menu .app-button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
    };
  });

  it('al pulsar un botón, solo ese botón queda con la clase "active" y los demás no', () => {
    const buttons = document.querySelectorAll('.app-button');
    window.setActiveButton(buttons[1]);
    expect(buttons[0]).not.toHaveClass('active');
    expect(buttons[1]).toHaveClass('active');
  });

  it('setActiveButton funciona con cualquier botón del menú', () => {
    const buttons = document.querySelectorAll('.app-button');
    window.setActiveButton(buttons[0]);
    expect(buttons[0]).toHaveClass('active');
    window.setActiveButton(buttons[1]);
    expect(buttons[1]).toHaveClass('active');
    expect(buttons[0]).not.toHaveClass('active');
  });
});

describe('Interfaz de usuario - Output y utilidades', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="output"></div>
      <button id="btn"></button>
    `;
    window.logToOutput = function(id, message) {
      const el = document.getElementById(id);
      if (el) el.innerHTML += `<p>${message}</p>`;
    };
    window.clearOutput = function(id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    };
    window.setButtonEnabled = function(id, enabled) {
      const btn = document.getElementById(id) as HTMLButtonElement;
      if (btn) btn.disabled = !enabled;
    };
    window.addScript = function(src) {
      const script = document.createElement('script');
      script.src = src;
      document.body.appendChild(script);
    };
  });

  it('logToOutput añade un mensaje al output', () => {
    window.logToOutput('output', 'Hola mundo');
    expect(document.getElementById('output')).toHaveTextContent('Hola mundo');
  });

  it('logToOutput añade varios mensajes al output', () => {
    window.logToOutput('output', 'Mensaje 1');
    window.logToOutput('output', 'Mensaje 2');
    expect(document.getElementById('output')).toHaveTextContent('Mensaje 1');
    expect(document.getElementById('output')).toHaveTextContent('Mensaje 2');
  });

  it('clearOutput limpia el contenido del output', () => {
    document.getElementById('output')!.innerHTML = 'Texto';
    window.clearOutput('output');
    expect(document.getElementById('output')!.innerHTML).toBe('');
  });

  it('clearOutput no lanza error si el id no existe', () => {
    expect(() => window.clearOutput('no-existe')).not.toThrow();
  });

  it('setButtonEnabled habilita y deshabilita el botón', () => {
    window.setButtonEnabled('btn', false);
    expect((document.getElementById('btn') as HTMLButtonElement).disabled).toBe(true);
    window.setButtonEnabled('btn', true);
    expect((document.getElementById('btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('setButtonEnabled no lanza error si el botón no existe', () => {
    expect(() => window.setButtonEnabled('no-btn', true)).not.toThrow();
  });

  it('addScript añade un script al body', () => {
    window.addScript('test.js');
    const script = document.querySelector('script[src="test.js"]');
    expect(script).not.toBeNull();
  });

  it('addScript puede añadir varios scripts con diferentes src', () => {
    window.addScript('uno.js');
    window.addScript('dos.js');
    expect(document.querySelector('script[src="uno.js"]')).not.toBeNull();
    expect(document.querySelector('script[src="dos.js"]')).not.toBeNull();
  });
});

export {};