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

const { wpkhBIP32 } = descriptors.scriptExpressions;
const { Output, BIP32 } = descriptors.DescriptorsFactory(secp256k1);

// Comisiones de la red
const FEE = 200;

// El purpuse se puede elegir libremiente
const WSH_ORIGIN_PATH_PROGEN = `/301'/1'/0'`;
const WSH_ORIGIN_PATH_DESCEN_1 = `/302'/1'/0'`;
const WSH_ORIGIN_PATH_DESCEN_2 = `/303'/1'/0'`;
const WSH_ORIGIN_PATH_RECOVERY = `/304'/1'/0'`;

// 0/0 es la primera dirección derivada de la cuenta 0, se usa para todas las claves
const WSH_KEY_PATH = `/0/0`;

// Semilla se utliza para calcular las claves, se dejan harcodeadas,  se podrían guardar en localStorage
const MNEMONIC = 'fábula medalla sastre pronto mármol rutina diez poder fuente pulpo empate lagarto';

// Bloqueos
const BLOCKS_HERENCIA = 1;
const BLOCKS_RECOVERY = 2;

// Consola pagina web
const outputHerencia = document.getElementById('output-herencia') as HTMLElement;

// Declaramos los tipos de mensaje de salida
type OutputType = 'info' | 'success' | 'error';

/************************ FUNCIONES AUXILIARES  ************************/

// Funcion que toma el valor de la poliza de gasto
const POLICY = (after_her: number, after_rec: number) => `or(pk(@key_progen), or(thresh(3, pk(@key_descend_1), pk(@key_descend_2), after(${after_her})), thresh(2, pk(@key_recover), after(${after_rec}))))`;

// Función para mostrar por pantalla el fingerprint del nodo maestro y las xpubkeys
function calculateFingerprint(masterNode: BIP32Interface): void {
  // Obtener la clave pública del nodo maestro
  const publicKey = masterNode.publicKey;

  // Calcular el hash SHA256 seguido de RIPEMD160
  const sha256Hash = createHash('sha256').update(publicKey).digest();
  const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

  // Usar Uint8Array.prototype.slice() para tomar los primeros 4 bytes como fingerprint
  const fingerprint = Buffer.from(new Uint8Array(ripemd160Hash).slice(0, 4)).toString('hex');

  // Ver el extended pubkey de unvaultKey
  const childProgenitor = masterNode.derivePath(`m${WSH_ORIGIN_PATH_PROGEN}`);
  // Neutered para obtener la clave pública extendida
  const xpubProgenitor = childProgenitor.neutered().toBase58();

  // Ver el extended pubkey de emergencyKey
  const chidDescen1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_1}`);
  // Neutered para obtener la clave pública extendida
  const xpubDescen1 = chidDescen1.neutered().toBase58();  
  
  // Ver el extended pubkey de emergencyKey
  const chidDescen2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_2}`);
  // Neutered para obtener la clave pública extendida
  const xpubDescen2 = chidDescen2.neutered().toBase58();  
  
  // Ver el extended pubkey de emergencyKey
  const chidRecover = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY}`);
  // Neutered para obtener la clave pública extendida
  const xpubRecover = chidRecover.neutered().toBase58();  
    

  // Mostrar los resultados en la consola
  console.log('Masternode fingerprint:', fingerprint);
  console.log('Extended pubKey Progenitor:', xpubProgenitor);
  console.log('Extended pubKey Heredero 1:', xpubDescen1);
  console.log('Extended pubKey Heredero 2:', xpubDescen2);
  console.log('Extended pubKey Abogado :', xpubRecover);
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
  outputHerencia,
  '🚀 Iniciar en red de pruebas:  ▶️ <a href="#" onclick="document.getElementById(\'initTestnet4Btn\').click();return false;">Testnet 4</a>',
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

    logToOutput(outputHerencia,  `🌐 Iniciando la wallet en la red  <strong>${networkName}</strong>`, 'info');
    logToOutput(outputHerencia,  '<span style="color:green;">🌟 ¡El Playground ha sido inicializado con éxito! 🌟</span>', 'success');
    logToOutput(outputHerencia,  `<hr style="border:1px dashed #ccc;">`);

    // Calcular el valor de "after" basado en la altura actual del bloque y el número de bloques de espera
    const herencia = afterEncode({ blocks: originalBlockHeight + BLOCKS_HERENCIA });
    const recovery = afterEncode({ blocks: originalBlockHeight + BLOCKS_RECOVERY });

    // Crear la política de gasto basada en el valor de "after"
    const policy = POLICY(herencia, recovery);

    // Compilar la política de gasto en Miniscript y verificar si es válida
    const { miniscript, issane } = compilePolicy(policy);

    if (!issane) throw new Error('Miniscript no válido.');

    // Derivar las claves públicas de los nodos hijos
    const key_progen = masterNode.derivePath(`m${WSH_ORIGIN_PATH_PROGEN}${WSH_KEY_PATH}`).publicKey;
    const key_descend_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_1}${WSH_KEY_PATH}`).publicKey;
    const key_descend_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_2}${WSH_KEY_PATH}`).publicKey;
    const key_recover = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY}${WSH_KEY_PATH}`).publicKey;

    // Crear el descriptor Miniscript reemplazando las claves públicas en la política
    const wshDescriptor = `wsh(${miniscript
      .replace(
        '@key_progen',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_PROGEN,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_descend_1',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_DESCEN_1,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_descend_2',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_DESCEN_2,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_recover',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_RECOVERY,
          keyPath: WSH_KEY_PATH
        })
      )})`;

    // Crear el objeto tipo Output con el descriptor y la red, por defecto se utiliza la clave de key_progen
    const MiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_progen]
    });

    // Obtener la dirección derivada del Miniscript
    const miniscriptAddress = MiniscriptObjet.getAddress();

    // Habilitar los botones de la interfaz de usuario después de la inicialización
    enableButtons();

    // Mostrar información en la consola

    console.log(`Bloque, fecha y hora: ${originalBlockHeight} ${blockDate.toLocaleString()}`);
    console.log(`Frase mnemónica: ${MNEMONIC}`);

    console.log(`Ruta de derivación del Progenitor: m${WSH_ORIGIN_PATH_PROGEN}${WSH_KEY_PATH}`);
    console.log(`Ruta de derivación del Heredero 1: m${WSH_ORIGIN_PATH_DESCEN_1}${WSH_KEY_PATH}`);
    console.log(`Ruta de derivación del Heredero 2: m${WSH_ORIGIN_PATH_DESCEN_2}${WSH_KEY_PATH}`);
    console.log(`Ruta de derivación del Abogado: m${WSH_ORIGIN_PATH_RECOVERY}${WSH_KEY_PATH}`);

    calculateFingerprint(masterNode);

    console.log('Public key Progenitor:', key_progen.toString('hex'));
    console.log('Public key Heredero 1:', key_descend_1.toString('hex'));
    console.log('Public key Heredero 2:', key_descend_2.toString('hex'));
    console.log('Public key  Abogado:', key_recover.toString('hex'));

    console.log(`Policy: ${policy}`);
    console.log('Generated Miniscript:', miniscript);
    console.log(`Miniscript address: ${miniscriptAddress}`);
    console.log('Descriptor:', wshDescriptor);
    console.log('Miniscript object:', MiniscriptObjet.expand());


    // Retornar el descriptor Miniscript, la altura actual del bloque y la política de gasto
    return { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor };
  } catch (error: any) {
    // Manejar errores durante la inicialización del Miniscript
    console.error(`❌ Error al inicializar Miniscript:${error?.message || 'Error desconocido'}`, 'error');
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
    const restingBlocksProgen = originalBlockHeight - actualBlockHeight;
    const restingBlocksHer = originalBlockHeight + BLOCKS_HERENCIA - actualBlockHeight;
    const restingBlocksRec = originalBlockHeight + BLOCKS_RECOVERY - actualBlockHeight;

    // Control sobre el numero de bloques restantes y el color que se le asigna
    const displayProgen = restingBlocksProgen <= 0 ? 0 : restingBlocksProgen;
    const progenColor = restingBlocksProgen > 0 ? 'red' : 'green';

    const displayHerencia = restingBlocksHer <= 0 ? 0 : restingBlocksHer;
    const herenColor = restingBlocksHer > 0 ? 'red' : 'green';

    const displayRecovery = restingBlocksRec <= 0 ? 0 : restingBlocksRec;
    const recoveryColor = restingBlocksRec > 0 ? 'red' : 'green';

    // Mostrar información detallada 
    logToOutput(outputHerencia,  `🛜 Red actual: <strong>${networkName}</strong>`, 'info');
    logToOutput(outputHerencia,  `🧱 Altura actual de bloque: <strong>${actualBlockHeight}</strong>`, 'info');
    logToOutput(outputHerencia,  `🧓🏻 Bloques para poder gastar en la rama de acceso directo: <strong style="color:${progenColor};">${displayProgen}</strong>`, 'info');
    logToOutput(outputHerencia,  `🧑🏻👨🏻 Bloques para poder gastar en la rama de herencia: <strong style="color:${herenColor};">${displayHerencia}</strong>`, 'info');
    logToOutput(outputHerencia,  `👤 Bloques para poder gastar en la rama de disputa: <strong style="color:${recoveryColor};">${displayRecovery}</strong>`, 'info');

    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputHerencia, `📩 Dirección del miniscript: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'info');
    logToOutput(outputHerencia,  `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputHerencia, `❌ Error al mostrar el Miniscript: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
  }
};
/************************ 🔍 BUSCAR FONDOS  ************************/

const fetchUtxosMini = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    // Obtener la dirección desde el objeto pasado como argumento
    const miniscriptAddress = MiniscriptObjet.getAddress();

    logToOutput(outputHerencia, `🔍 Consultando fondos...`, 'info');

    // Consultar los UTXOs asociados a la dirección
    const utxos = await(await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    // Verificar si se encontraron UTXOs
    if (utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputHerencia,
        `🚫 <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputHerencia, `<span style="color:orange;">⚠️ La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
      return;
    }

    logToOutput(outputHerencia, `✅ Fondos encontrados: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'success');

    // Calcular el total de todos los UTXOs
    const totalValue = utxos.reduce((sum: number, utxo: { value: number }) => sum + utxo.value, 0);

    // Ordenar los UTXOs por block_height en orden ascendente (de más antiguo a más reciente)
    const sortedUtxos = utxos.sort((a: any, b: any) => (a.status.block_height || 0) - (b.status.block_height || 0));

    // Mostrar cada UTXO individualmente con estado de confirmación y bloque al que pertenece
    sortedUtxos.forEach((utxo: { txid: string; value: number; status: { confirmed: boolean; block_height: number } }, index: number) => {
      const confirmationStatus = utxo.status.confirmed ? '<span style="color:green;">✅ confirmado</span>' : '<span style="color:red;">❓ no confirmado</span>';
      const blockHeight = utxo.status.block_height || 'Desconocido';
      logToOutput(outputHerencia, `🪙 Fondos: <span style="color:red;">${utxo.value}</span> sats ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`, 'info');
    });

    // Mostrar el total de los UTXOs
    logToOutput(outputHerencia, `💰 Total fondos: <strong><span style="color:red;">${totalValue}</span></strong> sats`, 'info');
    logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputHerencia, `❌ Error al consultar los fondos:${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🚛 ULTIMA TX ************************/

const fetchTransaction = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputHerencia, `🚛 Consultando última transacción...`, 'info');

    // Obtener historial de transacciones
    const txHistory = await(await fetch(`${explorer}/api/address/${miniscriptAddress}/txs`)).json();
    console.log('Transacciones:', txHistory);

    if (!Array.isArray(txHistory) || txHistory.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputHerencia,
        `🚫 <span style="color:red;">No se encontraron transacciones en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputHerencia,
          `💧 Recibir transacción a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputHerencia,
          `💧 Recibir transacción a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputHerencia, `<span style="color:orange;">⚠️ La red seleccionada no tiene faucet disponible</span>`, 'info');
      }

      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
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
      tipo = '📤📥 Tipo: Envío + Recepción (cambio)';
    } else if (esEmisor) {
      tipo = '📤 Tipo: <span style="color:red;">Envío</span>';
    } else if (esReceptor) {
      tipo = '📥 Tipo: <span style="color:green;">Recepción</span>';
    } else {
      tipo = '🔍  Tipo: Participación no directa';
    }

    const confirmationStatus = txDetails.status.confirmed ? '<span style="color:green;">✅ confirmada</span>' : '<span style="color:red;">❓ no confirmada</span>';
    logToOutput(outputHerencia, `✅ Transacción encontrada: <a href="${explorer}/tx/${txnID}"target="_blank"><code>${txnID}</code></a>`, 'success');

    const blockHeight = txDetails.status.block_height || 'Desconocido';
    logToOutput(outputHerencia, `${tipo} ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`);

    // Mostrar detalles de las entradas SOLO si la dirección es la del miniscript
    if (esEmisor) {
      txDetails.vin.forEach((vin: any, index: number) => {
        const prevoutAddress = vin.prevout?.scriptpubkey_address || 'Desconocido';
        const prevoutValue = vin.prevout?.value || 'Desconocido';
        if (prevoutAddress === miniscriptAddress) {
          logToOutput(outputHerencia, `🪙 Fondos enviados: <span style="color:red;">${prevoutValue}</span> sats → ${prevoutAddress} ✔️`, 'info');
        }
      });
    }

    // Mostrar detalles de las salidas SOLO si la dirección es la del miniscript
    if (esReceptor) {
      txDetails.vout.forEach((vout: any, index: number) => {
        if (vout.scriptpubkey_address === miniscriptAddress) {
          logToOutput(outputHerencia, `🪙 Fondos recibidos: <span style="color:red;">${vout.value}</span> sats → ${vout.scriptpubkey_address} ✔️`, 'info');
        }
      });
    }

    logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputHerencia, `❌ Error al consultar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia,  `<hr style="border:1px dashed #ccc;">`);
  }
};


/************************ 🧓🏻  ACCESO DIRECTO  🔑:🔑  ************************/

const directoPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;
    const blocksColor = restingBlocks > 0 ? 'red' : 'green';

    // Crear un nuevo Output para la clave de emergencia
    const progenKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_PROGEN}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [progenKey]
    });

    logToOutput(outputHerencia, `🧓🏻 Se ha pulsado el botón "Acceso directo"...`, 'info');
    // Obtener la dirección de recepción desde el objeto global
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputHerencia,
        `🚫 <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputHerencia, `<span style="color:orange;">⚠️ La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
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
      ? '📦 Devolviendo fondos a <code><strong>Faucet Testnet 4</strong></code>'
      : networkName === 'Testnet 3'
        ? '📦 Devolviendo fondos a <code><strong>Faucet Testnet 3</strong></code>'
        : '⚠️ La red seleccionada no tiene faucet disponible</strong></code>';

    logToOutput(outputHerencia, faucetMsg, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height)[0];
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
      logToOutput(outputHerencia, `🧱 Bloques para poder gastar en la rama de acceso directo:  <strong style="color:${blocksColor};">${displayBlocks}</strong>`, 'info');
      logToOutput(outputHerencia, `⛏️ <span style="color:red;">Los mineros han bloqueado la transacción</span>`, 'error');
      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
    } else {
      logToOutput(outputHerencia, `🪙 Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputHerencia, `💸 Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputHerencia, `💰 Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputHerencia, `✍🏼 Firmando la transacción con la clave del progenitor...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputHerencia, `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputHerencia, `❌ Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🧑🏻👨🏻  HERENCIA 🔑🔑:🔑🔑  ************************/

const herenciaPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight + BLOCKS_HERENCIA - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;
    const blocksColor = restingBlocks > 0 ? 'red' : 'green';


    // Crear un nuevo output para la clave de emergencia
    const key_descend_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_1}${WSH_KEY_PATH}`).publicKey;
    const key_descend_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_2}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_descend_1, key_descend_2]
    });

    logToOutput(outputHerencia, `🧑🏻👨🏻 Se ha pulsado el botón "Herencia"...`, 'info');

    // Obtener la dirección de recepción desde el objeto global
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputHerencia,
        `🚫 <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputHerencia, `<span style="color:orange;">⚠️ La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
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
      ? '📦 Devolviendo fondos a <code><strong>Faucet Testnet 4</strong></code>'
      : networkName === 'Testnet 3'
        ? '📦 Devolviendo fondos a <code><strong>Faucet Testnet 3</strong></code>'
        : '⚠️ La red seleccionada no tiene faucet disponible</strong></code>';

    logToOutput(outputHerencia, faucetMsg, 'info');

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

    console.log(`Pushing: ${txFinal.toHex()}`);
    console.log('Resultado TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68ninal') || txResponse.match('non-final')) {
      logToOutput(outputHerencia, `🧱 Bloques para poder gastar en la rama de herencia: <strong style="color:${blocksColor};">${displayBlocks}</strong>`, 'info');
      logToOutput(outputHerencia, `⛏️ <span style="color:red;">Los mineros han bloqueado la transacción</span>`, 'error');
      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
    } else {
      logToOutput(outputHerencia, `🪙 Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputHerencia, `💸 Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputHerencia, `💰 Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputHerencia, `✍🏻✍🏼 Firmando la transacción con las claves de los herederos...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputHerencia, `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputHerencia, `❌ Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 👤 DISPUTA 🔑:🔑  ************************/

const disputaPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string,   originalBlockHeight: number): Promise<void> => {
  try {

    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight + BLOCKS_RECOVERY - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;
    const blocksColor = restingBlocks > 0 ? 'red' : 'green';

    // Crear un nuevo output para la clave de emergencia
    const abogadoKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [abogadoKey]
    });

    logToOutput(outputHerencia, `👤 Se ha pulsado el botón "Disputa"...`, 'info');
    // Obtener la dirección de envio
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputHerencia,
        `🚫 <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputHerencia,
          `💧 Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputHerencia, `<span style="color:orange;">⚠️ La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
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
      ? '📦 Devolviendo fondos a <code><strong>Faucet Testnet 4</strong></code>'
      : networkName === 'Testnet 3'
        ? '📦 Devolviendo fondos a <code><strong>Faucet Testnet 3</strong></code>'
        : '⚠️ La red seleccionada no tiene faucet disponible</strong></code>';

    logToOutput(outputHerencia, faucetMsg, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height)[0];
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
    const txResponse = await (
      await fetch(`${explorer}/api/tx`, {
        method: 'POST',
        body: txFinal.toHex()
      })
    ).text();

    console.log(`Pushing: ${txFinal.toHex()}`);
    console.log('Resultado TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final')) {
      logToOutput(outputHerencia, `🧱 Bloques para poder gastar en la rama de disputa: <strong style="color:${blocksColor};">${displayBlocks}</strong>`, 'info');
      logToOutput(outputHerencia, `⛏️ <span style="color:red;">Los mineros han bloqueado la transacción</span>`, 'error');
      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
    } else {
      logToOutput(outputHerencia, `🪙 Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputHerencia, `💸 Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputHerencia, `💰 Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputHerencia, `✍🏼 Firmando la transacción con  la clave del abogado...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputHerencia, `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputHerencia, `❌ Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia, `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🛜 CONECTAR CON LA RED BITCOIN  ************************/

const initializeNetwork = async (network: any, explorer: string): Promise<void> => {
  try {
    const { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor } = await initMiniscriptObjet(network, explorer);

    document.getElementById('showMiniscriptBtn')?.addEventListener('click', () => mostrarMiniscript(MiniscriptObjet, originalBlockHeight, explorer));
    document.getElementById('fetchUtxosBtn')?.addEventListener('click', () => fetchUtxosMini(MiniscriptObjet, explorer));
    document.getElementById('fetchTransactionBtn')?.addEventListener('click', () => fetchTransaction(MiniscriptObjet, explorer));
    document.getElementById('directBtn')?.addEventListener('click', () => directoPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
    document.getElementById('herenciaBtn')?.addEventListener('click', () => herenciaPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
    document.getElementById('disputaBtn')?.addEventListener('click', () => disputaPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
  } catch (error: any) {
    logToOutput(outputHerencia,  `❌ Error al inicializar el Miniscript: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputHerencia,   `<hr style="border:1px dashed #ccc;">`);
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
  outputHerencia.innerHTML = '';
});
