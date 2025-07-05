// Distributed under the MIT software license

import * as secp256k1 from '@bitcoinerlab/secp256k1';
import * as descriptors from '@bitcoinerlab/descriptors';
import { compilePolicy } from '@bitcoinerlab/miniscript';
import { mnemonicToSeedSync } from 'bip39';
import type { BIP32Interface } from 'bip32';
import { encode as afterEncode } from 'bip65';
import { Psbt, networks } from 'bitcoinjs-lib';
import { createHash } from 'crypto';

// https://coinfaucet.eu/en/btc-testnet/      =>  tb1qerzrlxcfu24davlur5sqmgzzgsal6wusda40er
// https://bitcoinfaucet.uo1.net/                   =>  b1qlj64u6fqutr0xue85kl55fx0gt4m4urun25p7q

// Address faucet devolver utxos
const TESTNET3_FAUCET : string = 'tb1qerzrlxcfu24davlur5sqmgzzgsal6wusda40er';
const TESTNET4_FAUCET : string = 'tb1qn9rvr53m7qvrpysx48svuxsgahs88xfsskx367';

// Importar herramientas de descriptores
const { wpkhBIP32 } = descriptors.scriptExpressions;
const { Output, BIP32 } = descriptors.DescriptorsFactory(secp256k1);

// Comisiones de la red
const FEE = 200;

// El purpuse se puede elegir libremiente
const WSH_ORIGIN_PATH_DAILY1 = `/101'/1'/0'`;
const WSH_ORIGIN_PATH_DAILY2 = `/102'/1'/0'`;
const WSH_ORIGIN_PATH_DAILY3 = `/103'/1'/0'`;
const WSH_ORIGIN_PATH_RECOVERY1 = `/105'/1'/0'`;
const WSH_ORIGIN_PATH_RECOVERY2 = `/106'/1'/0'`;
const WSH_ORIGIN_PATH_EMERGENCY = `/107'/1'/0'`;

// 0/0 es la primera dirección derivada de la cuenta 0, se usa para todas las claves
const WSH_KEY_PATH = `/0/0`;

// Semilla se utliza para calcular las claves, se dejan harcodeadas,  se podrían guardar en localStorage
const MNEMONIC = 'fábula medalla sastre pronto mármol rutina diez poder fuente pulpo empate lagarto';

// Bloqueos
const BLOCKS_RECOVERY = 1;
const BLOCKS_EMERGENCY = 2;

// Consola pagina web
const outputConsole = document.getElementById('output-console') as HTMLElement;

// Declaramos los tipos de mensaje de salida
type OutputType = 'info' | 'success' | 'error';

/************************ FUNCIONES AUXILIARES  ************************/

// Funcion que toma el valor de la poliza de gasto
const POLICY = (after_rec: number, after_eme: number) => `or(thresh(2,pk(@key_daily1),pk(@key_daily2),pk(@key_daily3)),or(and(after(${after_rec}),thresh(1,pk(@key_recovery_1),pk(@key_recovery_2))),thresh(2,pk(@key_emergency),after(${after_eme}))))`;

// Función para mostrar por pantalla el fingerprint del nodo maestro y las xpubkeys
function calculateFingerprint(masterNode: BIP32Interface): void {
  // Obtener la clave pública del nodo maestro
  const publicKey = masterNode.publicKey;

  // Calcular el hash SHA256 seguido de RIPEMD160 = H
  const sha256Hash = createHash('sha256').update(publicKey).digest();
  const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

  // Usar Uint8Array.prototype.slice() para tomar los primeros 4 bytes como fingerprint
  const fingerprint = Buffer.from(new Uint8Array(ripemd160Hash).slice(0, 4)).toString('hex');

  // Ver el extended pubkey Daily
  const childDaily1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY1}`);
  const xpubDaily1 = childDaily1.neutered().toBase58();

  const childDaily2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY2}`);
  const xpubDaily2 = childDaily2.neutered().toBase58();  

  const childDaily3 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY3}`);
  const xpubDaily3 = childDaily3.neutered().toBase58();  

  // Ver el extended pubkey Recovery
  const childRecover1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY1}`);
  const xpubRecover1 = childRecover1.neutered().toBase58();

  const childRecover2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY2}`);
  const xpubRecover2 = childRecover2.neutered().toBase58();

  // Ver el extended pubkey Emergency
  const childEmergency = masterNode.derivePath(`m${WSH_ORIGIN_PATH_EMERGENCY}`);
  const xpubEmergency = childEmergency.neutered().toBase58();


  // Mostrar los resultados en la consola
  console.log('Masternode fingerprint:', fingerprint);
  console.log('Extended pubKey Diario 1:', xpubDaily1);
  console.log('Extended pubKey Diario 2:', xpubDaily2);
  console.log('Extended pubKey Custodio:', xpubDaily3);
  console.log('Extended pubKey Recovery  1:', xpubRecover1);
  console.log('Extended pubKey Recovery 2:', xpubRecover2);
  console.log('Extended pubKey Emergency:', xpubEmergency);
}

// Función auxiliar para obtener el nombre de la red según el explorer
const getNetworkName = (explorer: string): string => {
  if (explorer.includes('testnet4')) return 'Testnet 4';
  if (explorer.includes('testnet')) return 'Testnet 3';
  return 'Desconocida';
};

// Función para mostrar mensajes en la interfaz de usuario
const logToOutput = (outputContainer: HTMLElement, message: string, type: OutputType = 'info'): void => {
  const paragraph = document.createElement('p');
  paragraph.innerHTML = message;
  paragraph.classList.add('output-line', `output-${type}`);
  outputContainer.appendChild(paragraph);
  outputContainer.scrollTop = outputContainer.scrollHeight;
};

// Habilitar los botones de la pagina web despues de la inicializacion
function enableButtons(): void {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    if (button.id !== 'initTestnet4Btn' && button.id !== 'initTestnet3Btn') {
      button.disabled = false;
    }
    // Deshabilitar el botón de inicialización si ya se ha inicializado
    else {
      button.disabled = true;
    }
  });
}

// Mensaje de bienvenida
logToOutput(
  outputConsole,
  '<span aria-hidden="true">🚀</span> Iniciar en red de pruebas:  <span aria-hidden="true">▶️</span> <a href="#" onclick="document.getElementById(\'initTestnet4Btn\').click();return false;">Testnet 4</a>',
  'info'
);

/************************ ▶️ INICIALIZAR EL MINISCRIPT  ************************/

const initMiniscriptObjet = async (
  network: any,
  explorer: string
): Promise<{
  MiniscriptObjet: InstanceType<typeof Output>;
  originalBlockHeight: number;
  masterNode: BIP32Interface;
  wshDescriptor: string; // Agregar el descriptor original al retorno
}> => {
  try {

    // Nodo maestro del que se derivan el resto de hijos
    const masterNode = BIP32.fromSeed(mnemonicToSeedSync(MNEMONIC), network);
    // Obtener la altura actual del bloque desde el explorador
    const originalBlockHeight = parseInt(await(await fetch(`${explorer}/api/blocks/tip/height`)).text());

    // Obtener el hash del último bloque
    const blockHash = await (await fetch(`${explorer}/api/block-height/${originalBlockHeight}`)).text();

    // Obtener los detalles del bloque (incluye el timestamp)
    const blockDetails = await (await fetch(`${explorer}/api/block/${blockHash}`)).json();

    // El timestamp viene en segundos desde Epoch, conviértelo a fecha legible
    const blockDate = new Date(blockDetails.timestamp * 1000);

    // Obtener el nombre de la red
    const networkName = getNetworkName(explorer);

    logToOutput(outputConsole,  `<span aria-hidden="true">🌐</span> Iniciando la wallet en la red  <strong>${networkName}</strong>`, 'info');
    logToOutput(outputConsole, '<span aria-hidden="true">🌟</span> ¡El Playground ha sido inicializado con éxito! <span aria-hidden="true">🌟</span>', 'success');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);

    // Calcular el valor de "after" basado en la altura actual del bloque y el número de bloques de espera
    const recovery = afterEncode({ blocks: originalBlockHeight + BLOCKS_RECOVERY });
    const emergency = afterEncode({ blocks: originalBlockHeight + BLOCKS_EMERGENCY });

    // Crear la política de gasto basada en el valor de "after"
    const policy = POLICY(recovery, emergency);

    // Compilar la política de gasto en Miniscript y verificar si es válida
    const { miniscript, issane } = compilePolicy(policy);

    if (!issane) throw new Error('Miniscript no válido.');

    // Derivar las claves públicas de los nodos hijos
    const key_daily1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY1}${WSH_KEY_PATH}`).publicKey;
    const key_daily2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY2}${WSH_KEY_PATH}`).publicKey;
    const key_daily3 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY3}${WSH_KEY_PATH}`).publicKey;
    const key_recovery_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY1}${WSH_KEY_PATH}`).publicKey;
    const key_recovery_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY2}${WSH_KEY_PATH}`).publicKey;
    const key_emergency = masterNode.derivePath(`m${WSH_ORIGIN_PATH_EMERGENCY}${WSH_KEY_PATH}`).publicKey;


    // Crear el descriptor Miniscript reemplazando las claves públicas en la política
    const wshDescriptor = `wsh(${miniscript
      .replace(
        '@key_daily1',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_DAILY1,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_daily2',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_DAILY2,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_daily3',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_DAILY3,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_recovery_1',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_RECOVERY1,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_recovery_2',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_RECOVERY2,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_emergency',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_EMERGENCY,
          keyPath: WSH_KEY_PATH
        })
      )})`;



    // Crear el objeto Output con el descriptor y la red, por defecto se utiliza la clave de key_emergency
    const MiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_emergency]
    });

    // Obtener la dirección derivada del Miniscript
    const miniscriptAddress = MiniscriptObjet.getAddress();

    // Habilitar los botones de la interfaz de usuario después de la inicialización
    enableButtons();

    // Mostrar información en la consola

    console.log(`Bloque, fecha y hora:${originalBlockHeight}: ${blockDate.toLocaleString()}`);
    console.log(`Frase mnemónica: ${MNEMONIC}`);

    console.log('Public key Diario 1', key_daily1.toString('hex'));
    console.log('Public key Diario 2', key_daily2.toString('hex'));
    console.log('Public key Custodio', key_daily3.toString('hex'));
    console.log('Public key Recovery 1:', key_recovery_1.toString('hex'));
    console.log('Public key Recovery 2:', key_recovery_2.toString('hex'));
    console.log('Public key Emergency:', key_emergency.toString('hex'));

    calculateFingerprint(masterNode);



    console.log(`Policy: ${policy}`);
    console.log('Generated Miniscript :', miniscript);
    console.log(`Miniscript address: ${miniscriptAddress}`);
    console.log('Descriptor:', wshDescriptor);
    console.log('Miniscript object:', MiniscriptObjet.expand());


    // Retornar el descriptor Miniscript, la altura actual del bloque y la política de gasto
    return { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor };
  } catch (error: any) {
    // Manejar errores durante la inicialización del Miniscript, initiazeNetwork muestra el error en la interfaz
    console.error(`<span aria-hidden="true">❌</span> Error al inicializar Miniscript: ${error?.message || 'Error desconocido'}`, 'error');
    throw error;
  }
};

/************************ 📜 CONSULTAR MINISCRIPT ************************/

const mostrarMiniscript = async (
  MiniscriptObjet: InstanceType<typeof Output>,
  originalBlockHeight: number,
  explorer: string
): Promise<void> => {
  try {
    // Obtener el nombre de la red
    const networkName = getNetworkName(explorer);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocksDiario = originalBlockHeight - actualBlockHeight;
    const restingBlocksRec = originalBlockHeight + BLOCKS_RECOVERY - actualBlockHeight;
    const restingBlocksEmer = originalBlockHeight + BLOCKS_EMERGENCY - actualBlockHeight;

    // Control sobre el número de bloques restantes
    const displayDiario = restingBlocksDiario <= 0 ? 0 : restingBlocksDiario;
    const displayRec = restingBlocksRec <= 0 ? 0 : restingBlocksRec;
    const displayEmerg = restingBlocksEmer <= 0 ? 0 : restingBlocksEmer;

    // Asignar clase de color según si el contador ha llegado a cero
    const diarioClass = restingBlocksDiario > 0 ? 'output-error' : 'output-success';
    const recClass = restingBlocksRec > 0 ? 'output-error' : 'output-success';
    const emergClass = restingBlocksEmer > 0 ? 'output-error' : 'output-success';

    // Mostrar información detallada
    logToOutput(outputConsole, `<span aria-hidden="true">🛜</span> Red actual: <strong>${networkName}</strong>`, 'info');
    logToOutput(outputConsole, `<span aria-hidden="true">🧱</span> Altura actual de bloque: <strong>${actualBlockHeight}</strong>`, 'info');
    logToOutput(outputConsole, `<span aria-hidden="true">🗓️</span> Bloques para poder gastar en la rama de uso diario: <strong class="${diarioClass}">${displayDiario}</strong>`, 'info');
    logToOutput(outputConsole, `<span aria-hidden="true">🛡️</span> Bloques para poder gastar en la rama de recuperación: <strong class="${recClass}">${displayRec}</strong>`, 'info');
    logToOutput(outputConsole, `<span aria-hidden="true">🚨</span> Bloques para poder gastar en la rama de emergencia: <strong class="${emergClass}">${displayEmerg}</strong>`, 'info');

    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputConsole, `<span aria-hidden="true">📩</span> Dirección del miniscript: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'info');
    logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al mostrar el Miniscript: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🔍 BUSCAR FONDOS  **********************/

const fetchUtxosMini = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    // Obtener la dirección desde el objeto pasado como argumento
    const miniscriptAddress = MiniscriptObjet.getAddress();

    logToOutput(outputConsole, `<span aria-hidden="true">🔍</span> Consultando fondos...`, 'info');

    // Consultar los UTXOs asociados a la dirección
    const utxos = await(await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    // Verificar si se encontraron UTXOs
    if (utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputConsole,
        `<span aria-hidden="true">🚫</span> No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputConsole, `<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.`, 'info');
      }

      logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
      return;
    }

    logToOutput(outputConsole, `<span aria-hidden="true">✅</span> Fondos encontrados: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'success');

    // Calcular el total de todos los UTXOs
    const totalValue = utxos.reduce((sum: number, utxo: { value: number }) => sum + utxo.value, 0);

    // Ordenar los UTXOs por block_height en orden ascendente (de más antiguo a más reciente)
    const sortedUtxos = utxos.sort((a: any, b: any) => (a.status.block_height || 0) - (b.status.block_height || 0));

    // Mostrar cada UTXO individualmente con estado de confirmación y bloque al que pertenece
    sortedUtxos.forEach((utxo: { txid: string; value: number; status: { confirmed: boolean; block_height: number } }, index: number) => {
      const confirmationStatus = utxo.status.confirmed ? '<span class="output-success"><span aria-hidden="true">✅</span> confirmado</span>' : '<span class="output-error"><span aria-hidden="true">❓</span> no confirmado</span>';
      const blockHeight = utxo.status.block_height || 'Desconocido';
      logToOutput(outputConsole, `<span aria-hidden="true">🪙</span> Fondos: <strong>${utxo.value}</strong> sats ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`, 'info');
    });

    // Mostrar el total de los UTXOs
    logToOutput(outputConsole, `<span aria-hidden="true">💰</span> Total fondos: <strong>${totalValue}</strong> sats`, 'info');
    logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al consultar los UTXOs: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🚛 ULTIMA  TX  ************************/
const fetchTransaction = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputConsole, `<span aria-hidden="true">🚛</span> Consultando última transacción...`, 'info');

    // Obtener historial de transacciones
    const txHistory = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/txs`)).json();
    console.log('Transacciones:', txHistory);

  if (!Array.isArray(txHistory) || txHistory.length === 0) {
    const networkName = getNetworkName(explorer);

    logToOutput(
      outputConsole,
      `<span aria-hidden="true">🚫</span> No se encontraron transacciones en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`,
      'error'
    );

    if (networkName === 'Testnet 4') {
      logToOutput(
        outputConsole,
        `<span aria-hidden="true">💧</span> Recibir transacción a través de <a href="https://faucet.testnet4.dev/" target="_blank">faucet Testnet 4</a>`,
        'info'
      );
    } else if (networkName === 'Testnet 3') {
      logToOutput(
        outputConsole,
        `<span aria-hidden="true">💧</span> Recibir transacción a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank">faucet Testnet 3</a>`,
        'info'
      );
    } else {
      logToOutput(outputConsole, `<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.`, 'info');
    }

    logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
    return;
  }
    
    // Obtener detalles de la transacción con el block_height más alto, que indica la última transacción
    const txnID = txHistory.sort((a: any, b: any) => b.status.block_height - a.status.block_height)[0].txid;
    const txDetails = await(await fetch(`${explorer}/api/tx/${txnID}`)).json();

    // Determinar si es envío o recepción
    const esEmisor = txDetails.vin.some((vin: any) => vin.prevout?.scriptpubkey_address === miniscriptAddress);
    const esReceptor = txDetails.vout.some((vout: any) => vout.scriptpubkey_address === miniscriptAddress);

    let tipo: string;
    if (esEmisor && esReceptor) {
      tipo = '<span aria-hidden="true">📤📥</span> Envío + Recepción (cambio)';
    } else if (esEmisor) {
      tipo = '<span aria-hidden="true">📤</span> Envío';
    } else if (esReceptor) {
      tipo = '<span aria-hidden="true">📥</span> Recepción';
    } else {
      tipo = '<span aria-hidden="true">🔍</span> Participación no directa';
    }

    const confirmationStatus = txDetails.status.confirmed ? '<span class="output-success"><span aria-hidden="true">✅</span> confirmada</span>' : '<span class="output-error"><span aria-hidden="true">❓</span> no confirmada</span>';
    logToOutput(outputConsole, `<span aria-hidden="true">✅</span> Transacción encontrada: <a href="${explorer}/tx/${txnID}"target="_blank"><code>${txnID}</code></a>`, 'success');

    const blockHeight = txDetails.status.block_height || 'Desconocido';
    logToOutput(outputConsole, `${tipo} ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`);

    // Mostrar detalles de las entradas SOLO si la dirección es la del miniscript
    if (esEmisor) {
      txDetails.vin.forEach((vin: any, index: number) => {
        const prevoutAddress = vin.prevout?.scriptpubkey_address || 'Desconocido';
        const prevoutValue = vin.prevout?.value || 'Desconocido';
        if (prevoutAddress === miniscriptAddress) {
          logToOutput(outputConsole, `<span aria-hidden="true">🪙</span> Fondos enviados: <strong>${prevoutValue}</strong> sats → ${prevoutAddress} <span aria-hidden="true">✔️</span>`, 'info');
        }
      });
    }
    
    // Mostrar detalles de las salidas SOLO si la dirección es la del miniscript
    if (esReceptor) {
      txDetails.vout.forEach((vout: any, index: number) => {
        if (vout.scriptpubkey_address === miniscriptAddress) {
          logToOutput(outputConsole, `<span aria-hidden="true">🪙</span> Fondos recibidos: <strong>${vout.value}</strong> sats → ${vout.scriptpubkey_address} <span aria-hidden="true">✔️</span>`, 'info');
        }
      });
    }

    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al consultar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  }
};


/************************ 🗓️ DIARIO 🔑🔑:🔑🔑🔑  ************************/

const dailyPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;

    // Crear un nuevo objeto para la clave de emergencia
    const dailyKey1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY1}${WSH_KEY_PATH}`).publicKey;
    const dailyKey2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY2}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [dailyKey1, dailyKey2]
    });

    logToOutput(outputConsole, `<span aria-hidden="true">🗓️</span> Se ha pulsado el botón "Uso diario..."`, 'info');

    // Obtener la dirección de recepción 
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputConsole,
        `<span aria-hidden="true">🚫</span> No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputConsole, `<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.`, 'info');
      }

      logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
      return;
    }

    // Determinar el faucet según la red
    const networkName = getNetworkName(explorer);
    let selectedFaucet = TESTNET3_FAUCET;
    if (networkName === 'Testnet 4') {
      selectedFaucet = TESTNET4_FAUCET;
    }   
    
    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    const faucetMsg =
    networkName === 'Testnet 4'
      ? '<span aria-hidden="true">📦</span> Devolviendo fondos a <code><strong>Faucet Testnet 4</strong></code>'
      : networkName === 'Testnet 3'
        ? '<span aria-hidden="true">📦</span> Devolviendo fondos a <code><strong>Faucet Testnet 3</strong></code>'
        : '<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible</strong></code>';

    logToOutput(outputConsole, faucetMsg, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log(
      'UTXOS:',
      utxos.sort((a: any, b: any) => b.status.block_height - a.status.block_height)
    );
    console.log('UTXO:', utxo);

    // Obtener la transacción  en formato HEX
    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    // Lanzar error si el UTXO no cubre la comisión
    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un Output WSH para usar como output en la transacción y enviar los fondos
    const wshOutput = new Output({
      descriptor: `addr(${selectedFaucet})`,
      network
    });
    
    console.log('Objeto wsh expandido:', wshOutput.expand());
    wshOutput.updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    descriptors.signers.signBIP32({ psbt, masterNode });
    finalizer({ psbt });

    // Extraer y transmitir la transacción
    const txFinal = psbt.extractTransaction();
    const txResponse = await(
      await fetch(`${explorer}/api/tx`, {
        method: 'POST',
        body: txFinal.toHex()
      })
    ).text();

    console.log(`Pushing TX: ${txFinal.toHex()}`);
    console.log('Resultado TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final'))  {
      const blocksClass = restingBlocks > 0 ? 'output-error' : 'output-success';
      logToOutput(outputConsole, `<span aria-hidden="true">🧱</span> Bloques para poder gastar en la rama de uso diario: <strong class="${blocksClass}">${displayBlocks}</strong>`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">⛏️</span> Los mineros han bloqueado la transacción`, 'error');
      logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
    }
      else {
      logToOutput(outputConsole, `<span aria-hidden="true">🪙</span> Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">💸</span> Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">💰</span> Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">✍🏻✍🏼</span> Firmando la transacción con las claves principal y secundaria...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputConsole, `<span aria-hidden="true">🚚</span> Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************  🛡️ RECUPERACIÓN 🕒 🔑:🔑🔑  ************************/

const recoveryPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight + BLOCKS_RECOVERY - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;

    // Crear un nuevo output para la clave de emergencia
    const key_recovery_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY1}${WSH_KEY_PATH}`).publicKey;
    const key_recovery_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY2}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_recovery_1]
    });

    logToOutput(outputConsole, `<span aria-hidden="true">🛡️</span> Se ha pulsado el botón "Recuperación"... `, 'info');
    // Obtener la dirección de recepción
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await(await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputConsole,
        `<span aria-hidden="true">🚫</span> No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputConsole, `<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.`, 'info');
      }

      logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
      return;
    }

    // Determinar el faucet según la red
    const networkName = getNetworkName(explorer);
    let selectedFaucet = TESTNET3_FAUCET;
    if (networkName === 'Testnet 4') {
      selectedFaucet = TESTNET4_FAUCET;
    }

    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    const faucetMsg =
    networkName === 'Testnet 4'
      ? '<span aria-hidden="true">📦</span> Devolviendo fondos a <code><strong>Faucet Testnet 4</strong></code>'
      : networkName === 'Testnet 3'
        ? '<span aria-hidden="true">📦</span> Devolviendo fondos a <code><strong>Faucet Testnet 3</strong></code>'
        : '<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible</strong></code>';

    logToOutput(outputConsole, faucetMsg, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height)[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log(
      'UTXOS:',
      utxos.sort((a: any, b: any) => b.status.block_height - a.status.block_height)
    );
    console.log('UTXO:', utxo);

    // Obtener la transacción  en formato HEX 
    const txHex = await(await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    // Lanzar error si el UTXO no cubre la comisión
    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un Output WSH para usar como output en la transacción y enviar los fondos
    const wshOutput = new Output({
      descriptor: `addr(${selectedFaucet})`,
      network
    });

    console.log('Objeto wsh expandido:', wshOutput.expand());
    wshOutput.updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    descriptors.signers.signBIP32({ psbt, masterNode });
    finalizer({ psbt });

    // Extraer y transmitir la transacción
    const txFinal = psbt.extractTransaction();
    const txResponse = await(
      await fetch(`${explorer}/api/tx`, {
        method: 'POST',
        body: txFinal.toHex()
      })
    ).text();

    console.log(`Pushing TX: ${txFinal.toHex()}`);
    console.log('Resultado TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final')) {
      const blocksClass = restingBlocks > 0 ? 'output-error' : 'output-success';
      logToOutput(outputConsole, `<span aria-hidden="true">🧱</span> Bloques para poder gastar en la rama de recuperación: <strong class="${blocksClass}">${displayBlocks}</strong>`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">⛏️</span> Los mineros han bloqueado la transacción`, 'error');
      logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
    } else {
      logToOutput(outputConsole, `<span aria-hidden="true">🪙</span> Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">💸</span> Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">💰</span> Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">✍🏻</span> Firmando la transacción con la clave de respaldo principal...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputConsole, `<span aria-hidden="true">🚚</span> Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🚨 EMERGENCIA ⏰ 🔑 ************************/

const emergencyPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight + BLOCKS_EMERGENCY - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;

    // Crear un nuevo output para la clave de emergencia
    const emergencyKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_EMERGENCY}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [emergencyKey]
    });

    logToOutput(outputConsole, `<span aria-hidden="true">🚨</span> Se ha pulsado el botón "Apertura de emergencia"... `, 'info');
    // Obtener la dirección de envio
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputConsole,
        `<span aria-hidden="true">🚫</span> No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputConsole,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputConsole, `<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.`, 'info');
      }

      logToOutput(outputConsole, `<hr style="border:1px dashed #ccc;">`);
      return;
    }

    // Determinar el faucet según la red
    const networkName = getNetworkName(explorer);
    let selectedFaucet = TESTNET3_FAUCET;
    if (networkName === 'Testnet 4') {
      selectedFaucet = TESTNET4_FAUCET;
    }

    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    const faucetMsg =
    networkName === 'Testnet 4'
      ? '<span aria-hidden="true">📦</span> Devolviendo fondos a <code><strong>Faucet Testnet 4</strong></code>'
      : networkName === 'Testnet 3'
        ? '<span aria-hidden="true">📦</span> Devolviendo fondos a <code><strong>Faucet Testnet 3</strong></code>'
        : '<span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible</strong></code>';

    logToOutput(outputConsole, faucetMsg, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log(
      'UTXOS:',
      utxos.sort((a: any, b: any) => b.status.block_height - a.status.block_height)
      );
    console.log('UTXO:', utxo);

    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    // Lanzar error si el UTXO no cubre la comisión
    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un Output WSH para usar como output en la transacción y enviar los fondos
    const wshOutput = new Output({
      descriptor: `addr(${selectedFaucet})`,
      network
    });

    console.log('Objeto wsh expandido:', wshOutput.expand());
    wshOutput.updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    descriptors.signers.signBIP32({ psbt, masterNode });
    finalizer({ psbt });

    // Extraer y transmitir la transacción
    const txFinal = psbt.extractTransaction();
    const txResponse = await (
      await fetch(`${explorer}/api/tx`, {
        method: 'POST',
        body: txFinal.toHex()
      })
    ).text();

    console.log(`Pushing TX: ${txFinal.toHex()}`);
    console.log('Resultado TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final')) {
      const blocksClass = restingBlocks > 0 ? 'output-error' : 'output-success';
      logToOutput(outputConsole, `<span aria-hidden="true">🧱</span> Bloques para poder gastar en la rama de emergencia: <strong class="${blocksClass}">${displayBlocks}</strong>`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">⛏️</span> Los mineros han bloqueado la transacción`, 'error');
      logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
    } else {
      logToOutput(outputConsole, `<span aria-hidden="true">🪙</span> Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">💸</span> Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">💰</span> Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputConsole, `<span aria-hidden="true">✍🏻</span> Firmando la transacción con la clave de apertura por perdida...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputConsole, `<span aria-hidden="true">🚚</span> Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🛜 CONECTAR CON LA RED BITCOIN  ************************/

const initializeNetwork = async (network: any, explorer: string): Promise<void> => {
  try {
    const { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor } = await initMiniscriptObjet(network, explorer);

    document.getElementById('showMiniscriptBtn')?.addEventListener('click', () => mostrarMiniscript(MiniscriptObjet, originalBlockHeight, explorer));
    document.getElementById('fetchUtxosBtn')?.addEventListener('click', () => fetchUtxosMini(MiniscriptObjet, explorer));
    document.getElementById('fetchTransactionBtn')?.addEventListener('click', () => fetchTransaction(MiniscriptObjet, explorer));
    document.getElementById('dailyBtn')?.addEventListener('click', () => dailyPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
    document.getElementById('recoveryBtn')?.addEventListener('click', () => recoveryPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
    document.getElementById('emergencyBtn')?.addEventListener('click', () => emergencyPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
  } catch (error: any) {
    logToOutput(outputConsole, `<span aria-hidden="true">❌</span> Error al inicializar el Miniscript: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputConsole,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🔘 LLAMADAS A LOS BOTONES   ************************/

// Inicializar el Miniscript en la red de testnet3
document.getElementById('initTestnet3Btn')?.addEventListener('click', () => initializeNetwork(networks.testnet, 'https://mempool.space/testnet'));
// Inicializar el Miniscript en la red de testnet4
document.getElementById('initTestnet4Btn')?.addEventListener('click', () => initializeNetwork(networks.testnet, 'https://mempool.space/testnet4'));
// Inicializar el Miniscript en la red de Mainnet
//document.getElementById('initMainnetBtn')?.addEventListener('click', () => initializeNetwork(networks.bitcoin, 'https://blockstream.info/'));

// Borrar consola
document.getElementById('clearOutputBtn')?.addEventListener('click', () => {
  outputConsole.innerHTML ='';
});