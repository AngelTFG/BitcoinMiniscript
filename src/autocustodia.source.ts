// Distributed under the MIT software license

import * as secp256k1 from '@bitcoinerlab/secp256k1';
import * as descriptors from '@bitcoinerlab/descriptors';
import { compilePolicy } from '@bitcoinerlab/miniscript';
import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import type { BIP32Interface } from 'bip32';
import { encode as olderEncode } from 'bip68';
import { encode as afterEncode } from 'bip65';
import { Psbt, networks } from 'bitcoinjs-lib';
import { createHash } from 'crypto';

// https://coinfaucet.eu/en/btc-testnet/      =>  tb1qerzrlxcfu24davlur5sqmgzzgsal6wusda40er
// https://bitcoinfaucet.uo1.net/                   =>  b1qlj64u6fqutr0xue85kl55fx0gt4m4urun25p7q

// Address faucet devolver utxos
const TESTNET_COINFAUCET : string = 'tb1qerzrlxcfu24davlur5sqmgzzgsal6wusda40er';
const TESTNET_BITCOINFAUCET : string = 'b1qlj64u6fqutr0xue85kl55fx0gt4m4urun25p7q';

// Importar herramientas de descriptores
const { wpkhBIP32 } = descriptors.scriptExpressions;
const { Output, BIP32 } = descriptors.DescriptorsFactory(secp256k1);

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

// Semilla se utliza para calcular las claves, se dejan harcodeadas, aunque se podrían guardar en localStorage
const MNEMONIC = 'fábula medalla sastre pronto mármol rutina diez poder fuente pulpo empate lagarto';

// Bloqueos
const BLOCKS_RECOVERY = 3;
const BLOCKS_EMERGENCY =5;

const POLICY = (after_rec: number, after_eme: number) => `or(thresh(2,pk(@key_daily1),pk(@key_daily2),pk(@key_daily3)),or(and(after(${after_rec}),thresh(1,pk(@key_recovery_1),pk(@key_recovery_2))),thresh(2,pk(@key_emergency),after(${after_eme}))))`;

// Consola pagina web
const outputAutocustodia= document.getElementById('output-autocustodia') as HTMLElement;

// Declaramos los tipos de mensaje de salida
type OutputType = 'info' | 'success' | 'error';

/************************ FUNCIONES AUXILIARES  ************************/

// Función para mostrar por pantalla el fingerprint del nodo maestro y las xpubkeys
function calculateFingerprint(masterNode: BIP32Interface): void {
  // Obtener la clave pública del nodo maestro
  const publicKey = masterNode.publicKey;

  // Calcular el hash SHA256 seguido de RIPEMD160
  const sha256Hash = createHash('sha256').update(publicKey).digest();
  const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

  // Usar Uint8Array.prototype.slice() para tomar los primeros 4 bytes como fingerprint
  const fingerprint = Buffer.from(new Uint8Array(ripemd160Hash).slice(0, 4)).toString('hex');

  // Ver el extended pubkey Daily
  const childDaily1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY1}`);
  const xpubDaily1 = childDaily1.neutered().toBase58();

  const childDaily2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY2}`);
  const xpubDaily2 = childDaily2.neutered().toBase58();  

  const childDaily3 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY2}`);
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

// Función auxiliar para obtener el nombre de la red
const getNetworkName = (network: any): string =>
  network === networks.bitcoin
    ? 'Mainnet'
    : network === networks.testnet
    ? 'Testnet'
    : 'Desconocida';

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
    if (button.id !== 'initMainnetBtn' && button.id !== 'initTestnetBtn') {
      button.disabled = false;
    }
    // Deshabilitar el botón de inicialización si ya se ha inicializado
    else {
      button.disabled = true;
    }
  });
}

// Mensaje de bienvenida
logToOutput(outputAutocustodia, '🚀 <span style="color:blue;">Iniciar el Miniscript</span> 🚀');

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
    const networkName = getNetworkName(network);

    logToOutput(outputAutocustodia, `🌐 Cambiando a red ${networkName} 🌐`, 'info');
    logToOutput(outputAutocustodia, `⛓️ Altura de bloque: ${originalBlockHeight} ⛓️`, 'info');
    logToOutput(outputAutocustodia, '<span style="color:green;">🌟 ¡El Miniscript ha sido inicializado con éxito! 🌟</span>', 'success');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);

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

    console.log(`Frase mnemonica: ${MNEMONIC}`);

    console.log('Public key Diario 1', key_daily1.toString('hex'));
    console.log('Public key Diario 2', key_daily2.toString('hex'));
    console.log('Public key Custodio', key_daily3.toString('hex'));
    console.log('Public key Recovery 1:', key_recovery_1.toString('hex'));
    console.log('Public key Recovery 2:', key_recovery_2.toString('hex'));
    console.log('Public key Emergency:', key_emergency.toString('hex'));

    calculateFingerprint(masterNode);

    //console.log(`Current block height: ${originalBlockHeight}`);
    console.log(`Fecha y hora del  bloque ${originalBlockHeight}: ${blockDate.toLocaleString()}`);

    console.log(`Policy: ${policy}`);
    console.log('Generated Miniscript :', miniscript);
    console.log(`Miniscript address: ${miniscriptAddress}`);
    console.log('Descriptor:', wshDescriptor);
    console.log('Miniscript object:', MiniscriptObjet.expand());


    // Retornar el descriptor Miniscript, la altura actual del bloque y la política de gasto
    return { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor };
  } catch (error: any) {
    // Manejar errores durante la inicialización del Miniscript, initiazeNetwork muestra el error en la interfaz
    console.error(`Error al inicializar Miniscript: ${error.message}`);
    throw error;
  }
};

/************************ 📜 CONSULTAR MINISCRIPT ************************/

// Modificar las funciones para aceptar el objeto retornado
const mostraMIniscript = async (
    MiniscriptObjet: InstanceType<typeof Output>,
    originalBlockHeight: number,
   explorer: string
): Promise<void> => {
  // Determinar la red en función del explorador
  const networkName = explorer.includes('testnet') ? 'Testnet3' : 'Mainnet';

  // Mostrar mensaje indicando la red utilizada
  logToOutput(outputAutocustodia, `🌐 Red actual: <strong>${networkName}</strong>`, 'info');

  const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
  const restingBlocksRec = originalBlockHeight + BLOCKS_RECOVERY - actualBlockHeight;
  const restingBlocksHer = originalBlockHeight + BLOCKS_EMERGENCY - actualBlockHeight;

// ...código previo...

// Calcular bloques restantes y colores para cada rama
const displayRec = restingBlocksRec <= 0 ? 0 : restingBlocksRec;
const recColor = restingBlocksRec > 0 ? 'red' : 'green';

const displayEmerg = restingBlocksHer <= 0 ? 0 : restingBlocksHer;
const emergColor = restingBlocksHer > 0 ? 'red' : 'green';

// Mostrar información detallada y visualmente equivalente a la de herencia
logToOutput(outputAutocustodia, `🛜 Red actual: <strong>${networkName}</strong>`, 'info');
logToOutput(outputAutocustodia, `🧱 Altura actual de bloque: <strong>${actualBlockHeight}</strong>`, 'info');
logToOutput(outputAutocustodia, `🛡️ Bloques para poder gastar en la rama de recuperación: <strong style="color:${recColor};">${displayRec}</strong>`, 'info');
logToOutput(outputAutocustodia, `🚨 Bloques para poder gastar en la rama de emergencia: <strong style="color:${emergColor};">${displayEmerg}</strong>`, 'info');

  const miniscriptAddress = MiniscriptObjet.getAddress();
  logToOutput(outputAutocustodia, `📩 Dirección del miniscript: <a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a>`, 'info');
  logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
};

/************************ 🔍 BUSCAR FONDOS  **********************/

const fetchUtxosMini = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    // Obtener la dirección desde el objeto pasado como argumento
    const miniscriptAddress = MiniscriptObjet.getAddress();

    logToOutput(outputAutocustodia, `📦 Consultando UTXOs en la dirección: <code><strong>${miniscriptAddress}</strong></code>`, 'info');

    // Consultar los UTXOs asociados a la dirección
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (utxos.length === 0) {
      logToOutput(outputAutocustodia, `🚫 <span style="color:red;">No se encontraron UTXOs en la dirección <strong>${miniscriptAddress}</strong></span>`, 'error');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
      return;
    }


    logToOutput(outputAutocustodia, `✅ UTXOs encontrados en la dirección: <strong>${miniscriptAddress}</strong>`, 'success');

    // Calcular el total de todos los UTXOs
    const totalValue = utxos.reduce((sum: number, utxo: { value: number }) => sum + utxo.value, 0);

    // Ordenar los UTXOs por block_height en orden ascendente (de más antiguo a más reciente)
    const sortedUtxos = utxos.sort((a: any, b: any) => (a.status.block_height || 0) - (b.status.block_height || 0));

    // Mostrar cada UTXO individualmente con estado de confirmación y bloque al que pertenece
    sortedUtxos.forEach((utxo: { txid: string; value: number; status: { confirmed: boolean; block_height: number } }, index: number) => {
      const confirmationStatus = utxo.status.confirmed
        ? '<span style="color:green;">✅ confirmado</span>'
        : '<span style="color:red;">❓ no confirmado</span>';
      const blockHeight = utxo.status.block_height || 'Desconocido';
      logToOutput(outputAutocustodia, 
        `🔹 UTXO #${index + 1}: <span style="color:red;">${utxo.value}</span> sats (TXID: <code>${utxo.txid}</code>) ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`,
        'info'
      );
    });

    // Mostrar el total de los UTXOs
    logToOutput(outputAutocustodia, `💰 Total: <strong><span style="color:red;">${totalValue}</span></strong> sats`, 'info');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);

  } catch (error: any) {
    logToOutput(outputAutocustodia, `❌ Error al consultar los UTXOs: ${error.message}`, 'error');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  }
};

/************************ 🚛 ULTIMA  TX  ************************/
const fetchTransaction = async (MiniscriptObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    const miniscriptAddress = MiniscriptObjet.getAddress();
    logToOutput(outputAutocustodia, `📦 Consultando última transacción en la dirección: <code><strong>${miniscriptAddress}</strong></code>`, 'info');

    // Obtener historial de transacciones
    const txHistory = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/txs`)).json();
    console.log('Transacciones:', txHistory);

    if (!Array.isArray(txHistory) || txHistory.length === 0) {
      logToOutput(outputAutocustodia, `<span style="color:red;">🚫 No se encontraron transacciones en la dirección <strong>${miniscriptAddress}</strong></span>`);
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
      return;
    }
    
    // Obtener detalles de la primera transacción
    // const txnID = txHistory[0].txid;
    // Obtener detalles la primera transacción
    // const txnID = txHistory[txHistory.length -1].txid;

    // Obtener detalles de la transacción con el block_height más alto, que indica la última transacción
    const txnID = txHistory.sort((a: any, b: any) => b.status.block_height - a.status.block_height)[0].txid;

    const txDetails = await(await fetch(`${explorer}/api/tx/${txnID}`)).json();

    // Determinar si es envío o recepción
    const esEmisor = txDetails.vin.some((vin: any) => vin.prevout?.scriptpubkey_address === miniscriptAddress);
    const esReceptor = txDetails.vout.some((vout: any) => vout.scriptpubkey_address === miniscriptAddress);

    let tipo: string;
    if (esEmisor && esReceptor) {
      tipo = '📤📥 Envío + Recepción (cambio)';
    } else if (esEmisor) {
      tipo = '📤 Envío';
    } else if (esReceptor) {
      tipo = '📥 Recepción';
    } else {
      tipo = '🔍 Participación no directa';
    }

    const confirmationStatus = txDetails.status.confirmed
      ? '<span style="color:green;">✅ confirmada</span>'
      : '<span style="color:red;">❓ no confirmada</span>';
    logToOutput(outputAutocustodia, 
      `<strong>${tipo}</strong> transacción: <a href="${explorer}/tx/${txnID}"target="_blank"><code>${txnID}</code></a> ${confirmationStatus}`,
      'success'
    );

    // Mostrar detalles de las entradas
    if (esEmisor) {
      // Mostrar detalles de las entradas (vin) si es emisor
      txDetails.vin.forEach((vin: any, index: number) => {
        const prevoutAddress = vin.prevout?.scriptpubkey_address || 'Desconocido';
        const prevoutValue = vin.prevout?.value || 'Desconocido';
        const match = vin.prevout?.scriptpubkey_address ? '✔️' : '➖';
        logToOutput(outputAutocustodia, `VIN ${index}: <span style="color:red;">${prevoutValue}</span> sats ← ${prevoutAddress} ${match}`, 'info');
      });
    }
    
    // Mostrar detalles de las salidas
    if (esReceptor) {
      // Mostrar detalles de las salidas (vout) si es receptor
      txDetails.vout.forEach((vout: any, index: number) => {
        const match = vout.scriptpubkey_address === miniscriptAddress ? '✔️' : '➖';
        logToOutput(outputAutocustodia, `VOUT ${index}: <span style="color:red;">${vout.value}</span> sats → ${vout.scriptpubkey_address} ${match}` , 'info');
      });
    }

    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  } catch (error: any) {
    logToOutput(outputAutocustodia, `❌ Error al consultar la transacción: ${error.message}`, 'error');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  }
};


/************************ 🗓️ DIARIO 🔑🔑:🔑🔑🔑  ************************/

const dailyPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string): Promise<void> => {
  try {
      console.log('Descriptor WSH:', wshDescriptor);

    // Crear un nuevo objeto para la clave de emergencia
    const dailyKey1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY1}${WSH_KEY_PATH}`).publicKey;
    const dailyKey2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DAILY2}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [dailyKey1, dailyKey2]
    });

    logToOutput(outputAutocustodia, `🔘 Se ha pulsado el botón de uso diario 🗓️ `, 'info');

    // Obtener la dirección de recepción 
    const miniscriptAddress = localMiniscriptObjet.getAddress();
    const addressDestino = 'BitcoinFaucet.uo1.net'

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    if (!utxos.length) {
      throw new Error('No hay UTXOs disponibles en la dirección del Miniscript ❌');
    }
    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    logToOutput(outputAutocustodia, `🚀 Devolviendo UTXOs desde <code><strong>${miniscriptAddress}</strong></code> hacia <code><strong>${addressDestino}</strong></code>`, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log('UTXOS:', utxos.sort((a: any, b: any) => b.status.block_height  - a.status.block_height ));
    console.log('UTXO:', utxo);

    // Obtener la transacción  en formato HEX
    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión.');

    logToOutput(outputAutocustodia, `💰 Valor del UTXO: <strong>${valueIn}</strong> sats`, 'info');
    logToOutput(outputAutocustodia, `💸 Fee estimada: <strong>${FEE}</strong> sats`, 'info');
    logToOutput(outputAutocustodia, `🔢 Valor final de la transacción: <strong>${valueOut}</strong> sats`, 'info');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un Output WSH para usar como output en la transacción y  enviar los fondos
    const wshOutput = new Output({
      descriptor: `addr(${TESTNET_COINFAUCET})`,
      network
    });
    
    console.log('Objeto wsh expandido:', wshOutput.expand());
    wshOutput.updatePsbtAsOutput({ psbt, value: valueOut });




    // Firmar y finalizar la transacción
    logToOutput(outputAutocustodia, `✍️ Firmando la transacción con dos de las tres claves de uso diario 🗓️`, 'info');
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

    console.log(`TX hex: ${txFinal.toHex()}`);
    console.log('TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final'))  {
      logToOutput(outputAutocustodia, `⏳ <span style="color:red;">La transacción está bloqueada temporalmente debido a un timelock</span>`, 'error');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
    }
      else {
      const txId = txFinal.getId();
      logToOutput(outputAutocustodia, `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputAutocustodia, `❌ <span style="color:red;">Error al enviar la transacción:</span> ${errorDetails}`, 'error');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  }
};

/************************  🛡️ RECUPERACIÓN 🕒 🔑:🔑🔑  ************************/

const recoveryPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    // Crear un nuevo output para la clave de emergencia
    const key_recovery_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY1}${WSH_KEY_PATH}`).publicKey;
    const key_recovery_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY2}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_recovery_1]
    });

    logToOutput(outputAutocustodia, `🔘 Se ha pulsado el botón de recuperación 🛡️`, 'info');
    // Obtener la dirección de recepción
    const miniscriptAddress = localMiniscriptObjet.getAddress();
    const addressDestino = 'BitcoinFaucet.uo1.net';

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await(await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    if (!utxos.length) {
      throw new Error('No hay UTXOs disponibles en la dirección del Miniscript ❌');
    }
    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    logToOutput(outputAutocustodia, `🚀 Devolviendo UTXOs desde <code><strong>${miniscriptAddress}</strong></code> hacia <code><strong>${addressDestino}</strong></code>`, 'info');

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

    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión.');

    logToOutput(outputAutocustodia, `💰 Valor del UTXO: <strong>${valueIn}</strong> sats`, 'info');
    logToOutput(outputAutocustodia, `💸 Fee estimada: <strong>${FEE}</strong> sats`, 'info');
    logToOutput(outputAutocustodia, `🔢 Valor final de la transacción: <strong>${valueOut}</strong> sats`, 'info');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un output para enviar los fondos
    new Output({
      descriptor: `addr(${TESTNET_COINFAUCET})`,
      network
    }).updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    logToOutput(outputAutocustodia, `✍️ Firmando la transacción con una de las clave de recuperación 🛡️`, 'info');
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

    console.log(`TX hex: ${txFinal.toHex()}`);
    console.log('TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final')) {
      logToOutput(outputAutocustodia, `⏳ <span style="color:red;">La transacción está bloqueada temporalmente debido a un timelock</span>`, 'error');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
    } else {
      const txId = txFinal.getId();
      logToOutput(outputAutocustodia, `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputAutocustodia, `❌ <span style="color:red;">Error al enviar la transacción:</span> ${errorDetails}`, 'error');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  }
};

/************************ 🚨 EMERGENCIA ⏰ 🔑 ************************/

const emergancyPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string): Promise<void> => {
  try {
    console.log('Descriptor WSH:', wshDescriptor);

    // Crear un nuevo output para la clave de emergencia
    const emergencyKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_EMERGENCY}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [emergencyKey]
    });

    logToOutput(outputAutocustodia, `🔘 Se ha pulsado el botón de apertura de emergencia 🚨`, 'info');
    // Obtener la dirección de envio
    const miniscriptAddress = localMiniscriptObjet.getAddress();
    const addressDestino = 'BitcoinFaucet.uo1.net'

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    if (!utxos.length) {
      throw new Error('No hay UTXOs disponibles en la dirección del Miniscript ❌');
    }

    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    logToOutput(outputAutocustodia, `🚀 Devolviendo UTXOs desde <code><strong>${miniscriptAddress}</strong></code> hacia <code><strong>${addressDestino}</strong></code>`, 'info');

  // Seleccionar el UTXO más antiguo
  const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
  const { txid, vout, value: valueIn } = utxo;

  console.log('UTXOS:', utxos.sort((a: any, b: any) => b.status.block_height  - a.status.block_height ));
  console.log('UTXO:', utxo);

    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión.');

    logToOutput(outputAutocustodia, `💰 Valor del UTXO: <strong>${valueIn}</strong> sats`, 'info');
    logToOutput(outputAutocustodia, `💸 Fee estimada: <strong>${FEE}</strong> sats`, 'info');
    logToOutput(outputAutocustodia, `🔢 Valor final de la transacción: <strong>${valueOut}</strong> sats`, 'info');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un output para enviar los fondos
    new Output({
      descriptor: `addr(${TESTNET_COINFAUCET})`,
      network
    }).updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    logToOutput(outputAutocustodia, `✍️ Firmando la transacción con  la clave de emergencia 🚨`, 'info');
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

    console.log(`TX hex: ${txFinal.toHex()}`);
    console.log('TXID:', txResponse);

    // Manejar el error "non-final"
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final')) {
      logToOutput(outputAutocustodia, `⏳ <span style="color:red;">La transacción está bloqueada temporalmente debido a un timelock</span>`, 'error');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
    } else {
      const txId = txFinal.getId();
      logToOutput(outputAutocustodia, `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputAutocustodia, `❌ <span style="color:red;">Error al enviar la transacción:</span> ${errorDetails}`, 'error');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  }
};

/************************ Llamada a los botones  ************************/

const initializeNetwork = async (network: any, explorer: string): Promise<void> => {
  try {
    const { MiniscriptObjet, originalBlockHeight, masterNode, wshDescriptor } = await initMiniscriptObjet(network, explorer);

    document.getElementById('showMiniscriptBtn')?.addEventListener('click', () => mostraMIniscript(MiniscriptObjet, originalBlockHeight, explorer));
    document.getElementById('fetchUtxosBtn')?.addEventListener('click', () => fetchUtxosMini(MiniscriptObjet, explorer));
    document.getElementById('fetchTransactionBtn')?.addEventListener('click', () => fetchTransaction(MiniscriptObjet, explorer));
    document.getElementById('dailyBtn')?.addEventListener('click', () => dailyPSBT(masterNode, network, explorer, wshDescriptor));
    document.getElementById('recoveryBtn')?.addEventListener('click', () => recoveryPSBT(masterNode, network, explorer, wshDescriptor));
    document.getElementById('emergencyBtn')?.addEventListener('click', () => emergancyPSBT(masterNode, network, explorer, wshDescriptor));
  } catch (error: any) {
    logToOutput(outputAutocustodia, `❌ Error al inicializar el Miniscript: ${error.message}`, 'error');
    logToOutput(outputAutocustodia, `<span style="color:grey;">========================================</span>`);
  }
};

// Inicializar el Miniscript en la red de testnet
document.getElementById('initTestnetBtn')?.addEventListener('click', () => initializeNetwork(networks.testnet, 'https://blockstream.info/testnet'));
// Inicializar el Miniscript en la red de Mainnet
document.getElementById('initMainnetBtn')?.addEventListener('click', () => initializeNetwork(networks.bitcoin, 'https://blockstream.info/'));

// Borrar consola
document.getElementById('clearOutputBtn')?.addEventListener('click', () => {
  outputAutocustodia.innerHTML = '';
});
