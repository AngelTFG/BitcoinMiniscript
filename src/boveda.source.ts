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

// Importar herramientas de descriptors
const { wpkhBIP32 } = descriptors.scriptExpressions;
const { Output, BIP32 } = descriptors.DescriptorsFactory(secp256k1);

// Comisiones de la red
const FEE = 200;

// El purpuse se puede elegir libremiente
const WSH_ORIGIN_PATH_RETARDADA = `/201'/1'/0'`;
const WSH_ORIGIN_PATH_INMEDIATA = `/202'/1'/0'`;

// 0/0 es la primera dirección derivada de la cuenta 0, se usa para todas las claves
const WSH_KEY_PATH = `/0/0`;

// Semilla se utliza para calcular las claves, se dejan harcodeadas,  se podrían guardar en localStorage
const MNEMONIC = 'fábula medalla sastre pronto mármol rutina diez poder fuente pulpo empate lagarto';

// Bloqueos
const BLOCKS_RETARDADA = 1;

// Consola pagina web
const outputBoveda = document.getElementById('output-boveda') as HTMLElement;

// Declaramos los tipos de mensaje de salida
type OutputType = 'info' | 'success' | 'error';

/************************ FUNCIONES AUXILIARES  ************************/

// Funcion que toma el valor de la poliza de gasto
const POLICY = (after: number) => `or(pk(@key_inmediata),and(pk(@key_retardada),after(${after})))`;

// Función para mostrar por pantalla el fingerprint del nodo maestro y las xpubkeys
function calculateFingerprint(masterNode: BIP32Interface): void {
  // Obtener la clave pública del nodo maestro
  const publicKey = masterNode.publicKey;

  // Calcular el hash SHA256 seguido de RIPEMD160
  const sha256Hash = createHash('sha256').update(publicKey).digest();
  const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

  // Usar Uint8Array.prototype.slice() para tomar los primeros 4 bytes como fingerprint
  const fingerprint = Buffer.from(new Uint8Array(ripemd160Hash).slice(0, 4)).toString('hex');

  // Ver el extended pubkey de key_retardada
  const retardadaChild = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RETARDADA}`);
  // Neutered para obtener la clave pública extendida
  const retardadaTpub = retardadaChild.neutered().toBase58();

  // Ver el extended pubkey de key_inmediata
  const inmediataChild = masterNode.derivePath(`m${WSH_ORIGIN_PATH_INMEDIATA}`);
  // Neutered para obtener la clave pública extendida
  const inmediataTpub = inmediataChild.neutered().toBase58();

  // Mostrar los resultados en la consola
  console.log('Masternode fingerprint:', fingerprint);
  console.log('Extended pubKey apertura retardada:', retardadaTpub);
  console.log('Extended pubKey apertura inmediata:', inmediataTpub);
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
  outputBoveda,
  '<span aria-hidden="true">🚀</span> Iniciar en red de pruebas:  <span aria-hidden="true">▶️</span> <a href="#" onclick="document.getElementById(\'initTestnet4Btn\').click();return false;">Testnet 4</a>',
  'info'
);

/************************ ▶️ INICIALIZAR EL MINISCRIPT ************************/

// Modificar initMiniscriptObjet para devolver un objeto con todos los datos necesarios
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
    const originalBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());

    // Obtener el hash del último bloque
    const blockHash = await (await fetch(`${explorer}/api/block-height/${originalBlockHeight}`)).text();

    // Obtener los detalles del bloque (incluye el timestamp)
    const blockDetails = await (await fetch(`${explorer}/api/block/${blockHash}`)).json();

    // El timestamp viene en segundos desde Epoch, conviértelo a fecha legible
    const blockDate = new Date(blockDetails.timestamp * 1000);

    // Obtener el nombre de la red
    const networkName = getNetworkName(explorer);

    logToOutput(outputBoveda,  `<span aria-hidden="true">🌐</span> Iniciando la wallet en la red  <strong>${networkName}</strong>`, 'info');
    logToOutput(outputBoveda, '<span style="color:green;"><span aria-hidden="true">🌟</span> ¡El Playground ha sido inicializado con éxito! <span aria-hidden="true">🌟</span></span>', 'success');
    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);

    // Calcular el valor de "after" basado en la altura actual del bloque y el número de bloques de espera
    const after = afterEncode({ blocks: originalBlockHeight + BLOCKS_RETARDADA });

    // Crear la política de gasto basada en el valor de "after"
    const policy = POLICY(after);

    // Compilar la política de gasto en Miniscript y verificar si es válida
    const { miniscript, issane } = compilePolicy(policy);

    if (!issane) throw new Error('Miniscript no válido.');

    // Derivar las claves públicas para key_retardada y key_inmediata
    const key_retardada = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RETARDADA}${WSH_KEY_PATH}`).publicKey;
    const key_inmediata = masterNode.derivePath(`m${WSH_ORIGIN_PATH_INMEDIATA}${WSH_KEY_PATH}`).publicKey;


    // Crear el descriptor Miniscript reemplazando las claves públicas en la política
    const wshDescriptor = `wsh(${miniscript
      .replace(
        '@key_retardada',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_RETARDADA,
          keyPath: WSH_KEY_PATH
        })
      )
      .replace(
        '@key_inmediata',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_INMEDIATA,
          keyPath: WSH_KEY_PATH
        })
      )})`;

    // Crear el objeto Output con el descriptor y la red, por defecto se utiliza la clave key_retardada
    const MiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_retardada]
    });

    // Obtener la dirección derivada del Miniscript
    const miniscriptAddress = MiniscriptObjet.getAddress();

    // Habilitar los botones de la interfaz de usuario después de la inicialización
    enableButtons();

    // Mostrar información en la consola

    console.log(`Bloque, fecha y hora:${originalBlockHeight}: ${blockDate.toLocaleString()}`);
    console.log(`Frase mnemónica: ${MNEMONIC}`);

    console.log(`Ruta de derivación del Progenitor: m${WSH_ORIGIN_PATH_RETARDADA}${WSH_KEY_PATH}`);
    console.log(`Ruta de derivación del Heredero 1: m${WSH_ORIGIN_PATH_INMEDIATA}${WSH_KEY_PATH}`);

    calculateFingerprint(masterNode);

    console.log('Public key apertura retardada:', key_retardada.toString('hex'));
    console.log('Public key apertura inmediata:', key_inmediata.toString('hex'));

    console.log(`Policy: ${policy}`);
    console.log('Generated Miniscript:', miniscript);
    console.log(`Miniscript address: ${miniscriptAddress}`);
    console.log('Descriptor:', wshDescriptor);
    console.log('Miniscript object:', MiniscriptObjet.expand());


    // Retornar el descriptor Miniscript, la altura actual del bloque y la política de gasto
    return { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor };
  } catch (error: any) {
    // Manejar errores durante la inicialización del Miniscript
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
    const restingBlocksInmediata = originalBlockHeight - actualBlockHeight;
    const restingBlocksRetardada = originalBlockHeight + BLOCKS_RETARDADA - actualBlockHeight;

    // Control sobre el número de bloques restantes y el color que se le asigna
    const displayInmediata = restingBlocksInmediata <= 0 ? 0 : restingBlocksInmediata;
    const inmediataColor = restingBlocksInmediata > 0 ? 'red' : 'green';

    const displayRetardada = restingBlocksRetardada > 0 ? restingBlocksRetardada : 0;
    const retardadaColor = restingBlocksRetardada > 0 ? 'red' : 'green';

    // Mostrar información detallada 
    logToOutput(outputBoveda, `<span aria-hidden="true">🛜</span> Red actual: <strong>${networkName}</strong>`, 'info');
    logToOutput(outputBoveda, `<span aria-hidden="true">🧱</span> Altura actual de bloque: <strong>${actualBlockHeight}</strong>`, 'info');
    logToOutput(outputBoveda, `<span aria-hidden="true">🔧</span> Bloques para poder gastar en la rama de apertura forzada: <strong style="color:${retardadaColor};">${displayRetardada}</strong>`, 'info');
    logToOutput(outputBoveda, `<span aria-hidden="true">🆘</span> Bloques para poder gastar en la rama de botón del pánico: <strong style="color:${inmediataColor};">${displayInmediata}</strong>`, 'info');

    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputBoveda, `<span aria-hidden="true">📩</span> Dirección del miniscript: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'info');
    logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputBoveda, `<span aria-hidden="true">❌</span> Error al mostrar el Miniscript: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🔍 BUSCAR FONDOS ************************/

const fetchUtxosMini = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    // Obtener la dirección desde el objeto pasado como argumento
    const miniscriptAddress = MiniscriptObjet.getAddress();

    logToOutput(outputBoveda, `<span aria-hidden="true">🔍</span> Consultando fondos...`, 'info');

    // Consultar los UTXOs asociados a la dirección
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    // Verificar si se encontraron UTXOs
    if (utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputBoveda,
        `<span aria-hidden="true">🚫</span> <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputBoveda,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputBoveda,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputBoveda, `<span style="color:orange;"><span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
      return;
    }

    logToOutput(outputBoveda, `<span aria-hidden="true">✅</span> Fondos: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'success');

    // Calcular el total de todos los UTXOs
    const totalValue = utxos.reduce((sum: number, utxo: { value: number }) => sum + utxo.value, 0);

    // Ordenar los UTXOs por block_height en orden ascendente (de más antiguo a más reciente)
    const sortedUtxos = utxos.sort((a: any, b: any) => (a.status.block_height || 0) - (b.status.block_height || 0));

    // Mostrar cada UTXO individualmente con estado de confirmación y bloque al que pertenece
    sortedUtxos.forEach((utxo: { txid: string; value: number; status: { confirmed: boolean; block_height: number } }, index: number) => {
      const confirmationStatus = utxo.status.confirmed ? '<span style="color:green;"><span aria-hidden="true">✅</span> confirmado</span>' : '<span style="color:red;"><span aria-hidden="true">❓</span> no confirmado</span>';
      const blockHeight = utxo.status.block_height || 'Desconocido';

      logToOutput(outputBoveda, `<span aria-hidden="true">🪙</span> Fondos encontrados: <span style="color:red;">${utxo.value}</span> sats ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`, 'info');
    });

    // Mostrar el total de los UTXOs
    logToOutput(outputBoveda, `<span aria-hidden="true">💰</span> Total fondos: <strong><span style="color:red;">${totalValue}</span></strong> sats`, 'info');
    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputBoveda, `<span aria-hidden="true">❌</span> Error al consultar los UTXOs: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🚛 ULTIMA TX ************************/
const fetchTransaction = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputBoveda, `<span aria-hidden="true">🚛</span> Consultando última transacción...`, 'info');

    // Obtener historial de transacciones
    const txHistory = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/txs`)).json();
    console.log('Transacciones:', txHistory);

  if (!Array.isArray(txHistory) || txHistory.length === 0) {
    const networkName = getNetworkName(explorer);

    logToOutput(
      outputBoveda,
      `<span aria-hidden="true">🚫</span> <span style="color:red;">No se encontraron transacciones en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
      'error'
    );

    if (networkName === 'Testnet 4') {
      logToOutput(
        outputBoveda,
        `<span aria-hidden="true">💧</span> Recibir transacción a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
        'info'
      );
    } else if (networkName === 'Testnet 3') {
      logToOutput(
        outputBoveda,
        `<span aria-hidden="true">💧</span> Recibir transacción a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
        'info'
      );
    } else {
      logToOutput(outputBoveda, `<span style="color:orange;"><span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.</span>`, 'info');
    }

    logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
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
      tipo = '<span aria-hidden="true">🔍</span> Participación no directa,';
    }

    const confirmationStatus = txDetails.status.confirmed ? '<span style="color:green;"><span aria-hidden="true">✅</span> confirmada</span>' : '<span style="color:red;"><span aria-hidden="true">❓</span> no confirmada</span>';
    logToOutput(outputBoveda, `<span aria-hidden="true">✅</span> Transacción encontrada: <a href="${explorer}/tx/${txnID}"target="_blank"><code>${txnID}</code></a>`, 'success');

    const blockHeight = txDetails.status.block_height || 'Desconocido';
    logToOutput(outputBoveda, `${tipo} ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`);


    // Mostrar detalles de las entradas SOLO si la dirección es la del miniscript
    if (esEmisor) {
      txDetails.vin.forEach((vin: any, index: number) => {
        const prevoutAddress = vin.prevout?.scriptpubkey_address || 'Desconocido';
        const prevoutValue = vin.prevout?.value || 'Desconocido';
        if (prevoutAddress === miniscriptAddress) {
          logToOutput(outputBoveda, `<span aria-hidden="true">🪙</span> Fondos enviados: <span style="color:red;">${prevoutValue}</span> sats → ${prevoutAddress} <span aria-hidden="true">✔️</span>`, 'info');
        }
      });
    }
    
    // Mostrar detalles de las salidas SOLO si la dirección es la del miniscript
    if (esReceptor) {
      txDetails.vout.forEach((vout: any, index: number) => {
        if (vout.scriptpubkey_address === miniscriptAddress) {
          logToOutput(outputBoveda, `<span aria-hidden="true">🪙</span> Fondos recibidos: <span style="color:red;">${vout.value}</span> sats → ${vout.scriptpubkey_address} <span aria-hidden="true">✔️</span>`, 'info');
        }
      });
    }

    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
  } catch (error: any) {
    logToOutput(outputBoveda, `<span aria-hidden="true">❌</span> Error al consultar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🔧 APERTURA FORZADA 🔑:🔑  ************************/

const retardadaPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {

    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight + BLOCKS_RETARDADA - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;
    const blocksColor = restingBlocks > 0 ? 'red' : 'green';

    // Crear un nuevo output para la clave de emergencia
    const unvaultKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RETARDADA}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [unvaultKey]
    });

    logToOutput(outputBoveda, `<span aria-hidden="true">🔧</span> Se ha pulsado el botón de "Apertura forzada"...`, 'info');
    // Obtener la dirección de recepción desde el objeto global
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputBoveda,
        `<span aria-hidden="true">🚫</span> <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputBoveda,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputBoveda,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputBoveda, `<span style="color:orange;"><span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
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

    logToOutput(outputBoveda, faucetMsg, 'info');

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
      logToOutput(outputBoveda, `<span aria-hidden="true">🧱</span> Bloques para poder gastar en la rama de apertura forzada: <strong style="color:${blocksColor};">${displayBlocks}</strong>`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">⛏️</span> <span style="color:red;">Los mineros han bloqueado la transacción</span>`, 'error');
      logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
    }
      else {
      logToOutput(outputBoveda, `<span aria-hidden="true">🪙</span> Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">💸</span> Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">💰</span> Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">✍🏼</span> Firmando la transacción con  la clave apertura retardada...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputBoveda, `<span aria-hidden="true">🚚</span> Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputBoveda, `<span aria-hidden="true">❌</span> Error al enviar la transacción:${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🆘 BOTON DEL PÁNICO 🔑:🔑  ************************/

const inmediataPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string, originalBlockHeight: number): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    const actualBlockHeight = parseInt(await(await fetch(`${explorer}/api/blocks/tip/height`)).text());
    const restingBlocks = originalBlockHeight - actualBlockHeight;
    const displayBlocks = restingBlocks <= 0 ? 0 : restingBlocks;
    const blocksColor = restingBlocks > 0 ? 'red' : 'green';

    // Crear un nuevo output para la clave de emergencia
    const emergencyKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_INMEDIATA}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [emergencyKey]
    });

    logToOutput(outputBoveda, `<span aria-hidden="true">🆘</span> Se ha pulsado el "Botón del pánico" `, 'info');
    // Obtener la dirección de envio
    const miniscriptAddress = localMiniscriptObjet.getAddress();

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await(await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      const networkName = getNetworkName(explorer);

      logToOutput(
        outputBoveda,
        `<span aria-hidden="true">🚫</span> <span style="color:red;">No se encontraron fondos en la dirección: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></span>`,
        'error'
      );

      if (networkName === 'Testnet 4') {
        logToOutput(
          outputBoveda,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://faucet.testnet4.dev/" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 4</a>`,
          'info'
        );
      } else if (networkName === 'Testnet 3') {
        logToOutput(
          outputBoveda,
          `<span aria-hidden="true">💧</span> Recibir fondos a través de <a href="https://bitcoinfaucet.uo1.net/send.php" target="_blank" style="color:blue;text-decoration:underline;">faucet Testnet 3</a>`,
          'info'
        );
      } else {
        logToOutput(outputBoveda, `<span style="color:orange;"><span aria-hidden="true">⚠️</span> La red seleccionada no tiene faucet disponible.</span>`, 'info');
      }

      logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
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

    logToOutput(outputBoveda, faucetMsg, 'info');

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
      logToOutput(outputBoveda, `<span aria-hidden="true">🧱</span> Bloques para poder gastar en la rama de boton del pánico: <strong style="color:${blocksColor};">${displayBlocks}</strong>`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">⛏️</span> <span style="color:red;">Los mineros han bloqueado la transacción</span>`, 'error');
      logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
    } else {
      logToOutput(outputBoveda, `<span aria-hidden="true">🪙</span> Fondos enviados: <strong>${valueIn}</strong> sats`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">💸</span> Comisión: <strong>${FEE}</strong> sats`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">💰</span> Total transacción: <strong>${valueOut}</strong> sats`, 'info');
      logToOutput(outputBoveda, `<span aria-hidden="true">✍🏼</span> Firmando la transacción con la clave de apertura inmediata...`, 'info');
      const txId = txFinal.getId();
      logToOutput(outputBoveda, `<span aria-hidden="true">🚚</span> Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
    }
  } catch (error: any) {
    logToOutput(outputBoveda, `<span aria-hidden="true">❌</span> Error al enviar la transacción: ${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputBoveda,  `<hr style="border:1px dashed #ccc;">`);
  }
};

/************************ 🛜 CONECTAR CON LA RED BITCOIN  ************************/

const initializeNetwork = async (network: any, explorer: string): Promise<void> => {
  try {
    const { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor } = await initMiniscriptObjet(network, explorer);

    document.getElementById('showMiniscriptBtn')?.addEventListener('click', () => mostrarMiniscript(MiniscriptObjet, originalBlockHeight, explorer));
    document.getElementById('fetchUtxosBtn')?.addEventListener('click', () => fetchUtxosMini(MiniscriptObjet, explorer));
    document.getElementById('fetchTransactionBtn')?.addEventListener('click', () => fetchTransaction(MiniscriptObjet, explorer));
    document.getElementById('sendRetardadaBtn')?.addEventListener('click', () => retardadaPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
    document.getElementById('sendInmediataBtn')?.addEventListener('click', () => inmediataPSBT(masterNode, network, explorer, wshDescriptor, originalBlockHeight));
  } catch (error: any) {
    logToOutput(outputBoveda, `<span aria-hidden="true">❌</span> Error al inicializar el Miniscript:${error?.message || 'Error desconocido'}`, 'error');
    logToOutput(outputBoveda, `<hr style="border:1px dashed #ccc;">`);
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
  outputBoveda.innerHTML = '';
});