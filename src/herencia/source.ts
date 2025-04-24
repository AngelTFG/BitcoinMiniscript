// Distributed under the MIT software license
68
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

const { wpkhBIP32 } = descriptors.scriptExpressions;
const { Output, BIP32 } = descriptors.DescriptorsFactory(secp256k1);

const FEE = 200;

// El purpuse se puede elegir libremiente
const WSH_ORIGIN_PATH_HOT = `/301'/1'/0'`;
const WSH_ORIGIN_PATH_DESCEN_1 = `/302'/1'/0'`;
const WSH_ORIGIN_PATH_DESCEN_2 = `/303'/1'/0'`;
const WSH_ORIGIN_PATH_RECOVERY = `/304'/1'/0'`;

// 0/0 es la primera dirección derivada de la cuenta 0, se usa para todas las claves
const WSH_KEY_PATH = `/0/0`;

// Semilla se utliza para calcular las claves, se dejan harcodeadas, aunque se podrían guardar en localStorage
const MNEMONIC = 'fábula medalla sastre pronto mármol rutina diez poder fuente pulpo empate lagarto';

// Bloqueos
const BLOCKS_HERENCIA = 3;
const BLOCKS_RECOVERY = 5;

// Funcion que toma el valor de la poliza de gasto
/*
OR
├── pk(key_hot) 
└── OR
           ├── THRESHOLD(3 of 3) 
            │         ├── pk(key_descend_1) 
            │         ├── pk(key_descend_2) 
            │         └── older(5) 
           └── THRESHOLD(2 of 2) 
                      ├── pk(key_recovery) 
                      └── older(10)
*/
////


const POLICY = (after_her: number, after_rec: number) => `or(pk(@key_hot), or(thresh(3, pk(@key_descend_1), pk(@key_descend_2), after(${after_her})), thresh(2, pk(@key_recover), after(${after_rec}))))`;


// Consola pagina web
const outputHerencia = document.getElementById('output-herencia') as HTMLElement;

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


  // Ver el extended pubkey de unvaultKey
  const childHot = masterNode.derivePath(`m${WSH_ORIGIN_PATH_HOT}`);
  // Neutered para obtener la clave pública extendida
  const xpubHot = childHot.neutered().toBase58();

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

  console.log('Extended pubKey hot:', xpubHot);
  console.log('Extended pubKey Descend 1:', xpubDescen1);
  console.log('Extended pubKey Descend 2:', xpubDescen2);
  console.log('Extended pubKey Recovery :', xpubRecover);

  /*
  // Mostrar los resultados en la interfaz de usuario
  logToOutput(outputHerencia,  `🔑 Fingerprint del nodo maestro: <strong>${fingerprint}</strong>`, 'info');
  logToOutput(outputHerencia,  `🔑 Extended pubKey hot: <strong>${xpubHot}</strong>`, 'info');
  logToOutput(outputHerencia,  `🔑 Extended pubKey Descendiente 1: <strong>${xpubDescen1}</strong>`, 'info');
  logToOutput(outputHerencia,  `🔑 Extended pubKey Descendiente 2: <strong>${xpubDescen2}</strong>`, 'info');
  logToOutput(outputHerencia,  `🔑 Extended pubKey Recovery: <strong>${xpubRecover}</strong>`, 'info');
*/
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
logToOutput(outputHerencia,  '🚀 <span style="color:blue;">Inicializar el Miniscript</span> 🚀');

/************************ ▶️ Inicializar Miniscript ************************/

// Modificar initMiniscriptOutput para devolver un objeto con todos los datos necesarios
const initMiniscriptOutput = async (
  network: any,
  explorer: string
): Promise<{
  MiniscriptDescriptorObjet: InstanceType<typeof Output>;
  originalBlockHeight: number;
  policy: string;
  masterNode: BIP32Interface;
  wshDescriptor: string; // Agregar el descriptor original al retorno
}> => {
  try {

    // Nodo maestro del que se derivan el resto de hijos
    const masterNode = BIP32.fromSeed(mnemonicToSeedSync(MNEMONIC), network);
    // Obtener la altura actual del bloque desde el explorador
    const originalBlockHeight = parseInt(await(await fetch(`${explorer}/api/blocks/tip/height`)).text());

    // Obtener el nombre de la red
    const networkName = getNetworkName(network);

    logToOutput(outputHerencia,  `🌐 Cambiando a red ${networkName} 🌐`, 'info');
    logToOutput(outputHerencia,  `⛓️ Altura actual de la cadena: ${originalBlockHeight} bloques ⛓️`, 'info');
    logToOutput(outputHerencia,  '<span style="color:green;">🌟 ¡El Miniscript ha sido inicializado con éxito! 🌟</span>', 'success');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);

    // Calcular el valor de "after" basado en la altura actual del bloque y el número de bloques de espera
    const herencia = afterEncode({ blocks: originalBlockHeight + BLOCKS_HERENCIA });
    const recovery = afterEncode({ blocks: originalBlockHeight + BLOCKS_RECOVERY });

    // Crear la política de gasto basada en el valor de "after"
    const policy = POLICY(herencia, recovery);

    console.log(`Current block height: ${originalBlockHeight}`);
    console.log(`Policy: ${policy}`);

    // Compilar la política de gasto en Miniscript y verificar si es válida
    const { miniscript, issane } = compilePolicy(policy);

    console.log('Generated Miniscript:', miniscript);

    if (!issane) throw new Error('Miniscript no válido.');
    console.log('Miniscript sane:', miniscript);

    // Derivar las claves públicas de los nodos hijos
    const key_hot = masterNode.derivePath(`m${WSH_ORIGIN_PATH_HOT}${WSH_KEY_PATH}`).publicKey;
    console.log('Public key hot:', key_hot.toString('hex'));
    const key_descend_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_1}${WSH_KEY_PATH}`).publicKey;
    console.log('Public key descen1:', key_descend_1.toString('hex'));
    const key_descend_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_2}${WSH_KEY_PATH}`).publicKey;
    console.log('Public key descen2:', key_descend_2.toString('hex'));
    const key_recover = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY}${WSH_KEY_PATH}`).publicKey;
    console.log('Public key recovery:', key_recover.toString('hex'));

    // Crear el descriptor Miniscript reemplazando las claves públicas en la política
    const wshDescriptor = `wsh(${miniscript
      .replace(
        '@key_hot',
        descriptors.keyExpressionBIP32({
          masterNode: masterNode,
          originPath: WSH_ORIGIN_PATH_HOT,
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

    console.log('Descriptor completo:', wshDescriptor);

    // Crear el objeto Output con el descriptor y la red, por defecto se utiliza la clave de key_hot
    const MiniscriptDescriptorObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_hot]
    });

    // Obtener la dirección derivada del Miniscript
    const miniscriptAddress = MiniscriptDescriptorObjet.getAddress();
    console.log(`Miniscript address: ${miniscriptAddress}`);
    console.log('Objeto descriptor expandido:', MiniscriptDescriptorObjet.expand());

    // Habilitar los botones de la interfaz de usuario después de la inicialización
    enableButtons();

    calculateFingerprint(masterNode);

    // Retornar el descriptor Miniscript, la altura actual del bloque y la política de gasto
    return { MiniscriptDescriptorObjet, originalBlockHeight, policy, masterNode, wshDescriptor };
  } catch (error: any) {
    // Manejar errores durante la inicialización del Miniscript
    console.error(`Error al inicializar Miniscript: ${error.message}`);
    throw error;
  }
};

/************************ 📜 MOSTRAR MINISCRIPT ************************/

// Modificar las funciones para aceptar el objeto retornado
const mostraMIniscript = async (
    MiniscriptDescriptorObjet: InstanceType<typeof Output>,
    originalBlockHeight: number,
    policy: string,
   explorer: string
): Promise<void> => {
  // Determinar la red en función del explorador
  const networkName = explorer.includes('testnet') ? 'Testnet' : 'Mainnet';

  // Mostrar mensaje indicando la red utilizada
  logToOutput(outputHerencia,  `🌐 Red actual: <strong>${networkName}</strong>`, 'info');

  const actualBlockHeight = parseInt(await (await fetch(`${explorer}/api/blocks/tip/height`)).text());
  const restingBlocksPro = originalBlockHeight - actualBlockHeight;
  const restingBlocksHer = originalBlockHeight + BLOCKS_HERENCIA - actualBlockHeight;
  const restingBlocksRec = originalBlockHeight + BLOCKS_RECOVERY - actualBlockHeight;

  const displayProgen = restingBlocksPro <= 0 ? 0 : restingBlocksPro;
  const progenColor = restingBlocksPro > 0 ? 'red' : 'green';

  const displayHerencia = restingBlocksHer <= 0 ? 0 : restingBlocksHer;
  const herenColor = restingBlocksHer > 0 ? 'red' : 'green';
  
  const displayRecovery = restingBlocksRec <= 0 ? 0 : restingBlocksRec;
  const recoveryColor = restingBlocksRec > 0 ? 'red' : 'green';


  logToOutput(outputHerencia,  `🧱 Altura actual de bloque: <strong>${actualBlockHeight}</strong>`, 'info');
  logToOutput(outputHerencia,  `🧓🏻 Bloques para poder gastar en la rama del progenitor: <strong style="color:${progenColor};">${displayProgen}</strong>`, 'info');
  logToOutput(outputHerencia,  `🧑🏻👨🏻 Bloques para poder gastar en la rama de herencia: <strong style="color:${herenColor};">${displayHerencia}</strong>`, 'info');
  logToOutput(outputHerencia,  `⚠️ Bloques para poder gastar en la rama de disputa: <strong style="color:${recoveryColor};">${displayRecovery}</strong>`, 'info');
  //logToOutput(outputHerencia,  `🔐 Altura de desbloqueo herencia: <strong>${originalBlockHeight + BLOCKS_HERENCIA}</strong>, profundidad en bloques: <strong style="color:${herenciaColor};">${restingBlocksHer}</strong>`, 'info');
  //logToOutput(outputHerencia,  `🔐 Altura de desbloqueo recovery: <strong>${originalBlockHeight + BLOCKS_RECOVERY}</strong>, profundidad en bloques: <strong style="color:${recoveryColor};">${restingBlocksRec}</strong>`, 'info');
  //logToOutput(outputHerencia,  `🔏 Póliza de gasto: <strong>${policy}</strong>`, 'info');
  //logToOutput(outputHerencia,  `📜 Miniscript compilado: <strong>${MiniscriptDescriptorObjet.expand().expandedMiniscript}</strong>`);

  const miniscriptAddress = MiniscriptDescriptorObjet.getAddress();
  logToOutput(
    outputHerencia,
    `📬 Dirección del Miniscript: <strong><a href="${explorer}/address/${miniscriptAddress}" target="_blank">${miniscriptAddress}</a></strong>`, 
    'info'
  );

  logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
};

/************************ 🔍 MOSTRAR UTXOs  ************************/

const fetchUtxosMini = async (MiniscriptDescriptorObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    // Obtener la dirección desde el objeto pasado como argumento
    const miniscriptAddress = MiniscriptDescriptorObjet.getAddress();

    logToOutput(outputHerencia,  `📦 Consultando fondos ...`, 'info');

    // Consultar los UTXOs asociados a la dirección
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    console.log('UTXOs:', utxos);

    if (utxos.length === 0) {
      logToOutput(outputHerencia,  `🚫 <span style="color:red;">No se encontraron fondos en la dirección <strong>${miniscriptAddress}</strong></span>`, 'error');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
      return;
    }

    logToOutput(outputHerencia,  `✅ UTXOs encontrados en la dirección: <strong>${miniscriptAddress}</strong>`, 'success');

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
  logToOutput(outputHerencia,  
    `🔹 Fondo #${index + 1}: <span style="color:red;">${utxo.value}</span> sats (TXID: <code>${utxo.txid}</code>) ${confirmationStatus} - Bloque: <strong>${blockHeight}</strong>`,
    'info'
  );
});

// Mostrar el total de los UTXOs
logToOutput(outputHerencia,  `💰 Total: <strong><span style="color:red;">${totalValue}</span></strong> sats`, 'info');
logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);

  } catch (error: any) {
    logToOutput(outputHerencia,  `❌ Error al consultar los fondos: ${error.message}`, 'error');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  }
};

/************************ 📤 ULTIMA TX ************************/
const fetchTransaction = async (MiniscriptDescriptorObjet: InstanceType<typeof Output>, explorer: string): Promise<void> => {
  try {
    const miniscriptAddress = MiniscriptDescriptorObjet.getAddress();
    logToOutput(outputHerencia,  `📦 Consultando última transacción en la dirección: <code><strong>${miniscriptAddress}</strong></code>`, 'info');

    // Obtener historial de transacciones
    const txHistory = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/txs`)).json();
    console.log('Transacciones:', txHistory);

    if (!Array.isArray(txHistory) || txHistory.length === 0) {
      logToOutput(outputHerencia,  `<span style="color:red;">🚫 No se encontraron transacciones en la dirección <strong>${miniscriptAddress}</strong></span>`);
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
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
    logToOutput(outputHerencia,  
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
        logToOutput(outputHerencia,  `VIN ${index}: <span style="color:red;">${prevoutValue}</span> sats ← ${prevoutAddress} ${match}`, 'info');
      });
    }
    
    // Mostrar detalles de las salidas
    if (esReceptor) {
      // Mostrar detalles de las salidas (vout) si es receptor
      txDetails.vout.forEach((vout: any, index: number) => {
        const match = vout.scriptpubkey_address === miniscriptAddress ? '✔️' : '➖';
        logToOutput(outputHerencia,  `VOUT ${index}: <span style="color:red;">${vout.value}</span> sats → ${vout.scriptpubkey_address} ${match}` , 'info');
      });
    }

    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  } catch (error: any) {
    logToOutput(outputHerencia,  `❌ Error al consultar la transacción: ${error.message}`, 'error');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  }
};


/************************ 🔥  PROGENITOR  🔑  ************************/

const hotPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string): Promise<void> => {
  try {
    // Define la clave que se usará para firmar la transacción, false para unvaultKey y true para emergencyKey
    //emergency = false;

    console.log('Descriptor WSH:', wshDescriptor);

    // Crear un nuevo output para la clave de emergencia
    const unvaultKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_HOT}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptDescriptorObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [unvaultKey]
    });

    logToOutput(outputHerencia,  `🔘 Se ha pulsado el botón de apertura por progenitor 🧓🏻`, 'info');
    // Obtener la dirección de recepción desde el objeto global
    const miniscriptAddress = localMiniscriptDescriptorObjet.getAddress();
    const addressDestino = 'BitcoinFaucet.uo1.net'

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    if (!utxos.length) {
      throw new Error('No hay UTXOs disponibles en la dirección del Miniscript ❌');
    }
    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    logToOutput(outputHerencia,  `🚀 Devolviendo UTXOs desde <code><strong>${miniscriptAddress}</strong></code> hacia <code><strong>${addressDestino}</strong></code>`, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log('UTXOS:', utxos.sort((a: any, b: any) => b.status.block_height  - a.status.block_height ));
    console.log('UTXO:', utxo);

    // Obtener la transacción  en formato HEX
    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión.');

    logToOutput(outputHerencia,  `💰 Valor del UTXO: <strong>${valueIn}</strong> sats`, 'info');
    logToOutput(outputHerencia,  `💸 Fee estimada: <strong>${FEE}</strong> sats`, 'info');
    logToOutput(outputHerencia,  `🔢 Valor final de la transacción: <strong>${valueOut}</strong> sats`, 'info');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptDescriptorObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un output para enviar los fondos
    new Output({
      descriptor: `addr(${TESTNET_COINFAUCET})`,
      network
    }).updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    logToOutput(outputHerencia,  `✍️ Firmando la transacción con  la clave apertura en caliente 🔥`, 'info');
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
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final'))  {
      logToOutput(outputHerencia,  `⏳ <span style="color:red;">La transacción está bloqueada temporalmente debido a un timelock</span>`, 'error');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
    }
      else {
      const txId = txFinal.getId();
      logToOutput(outputHerencia,  `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputHerencia,  `❌ <span style="color:red;">Error al enviar la transacción:</span> ${errorDetails}`, 'error');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  }
};


/************************ ⏰  HERENCIA 🔑  ************************/

const henrenciaPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string): Promise<void> => {
  try {
    // Define la clave que se usará para firmar la transacción, false para unvaultKey y true para emergencyKey
    //emergency = false;

    console.log('Descriptor WSH:', wshDescriptor);

    // Crear un nuevo output para la clave de emergencia
    const key_descend_1 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_1}${WSH_KEY_PATH}`).publicKey;
    const key_descend_2 = masterNode.derivePath(`m${WSH_ORIGIN_PATH_DESCEN_2}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptDescriptorObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [key_descend_1,  key_descend_2]
    });

    logToOutput(outputHerencia,  `🔘 Se ha pulsado el botón de apertura por testaferro  👤`, 'info');
    // Obtener la dirección de recepción desde el objeto global
    const miniscriptAddress = localMiniscriptDescriptorObjet.getAddress();
    const addressDestino = 'BitcoinFaucet.uo1.net'

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    if (!utxos.length) {
      throw new Error('No hay UTXOs disponibles en la dirección del Miniscript ❌');
    }
    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    logToOutput(outputHerencia,  `🚀 Devolviendo UTXOs desde <code><strong>${miniscriptAddress}</strong></code> hacia <code><strong>${addressDestino}</strong></code>`, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log('UTXOS:', utxos.sort((a: any, b: any) => b.status.block_height  - a.status.block_height ));
    console.log('UTXO:', utxo);

    // Obtener la transacción  en formato HEX
    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión.');

    logToOutput(outputHerencia,  `💰 Valor del UTXO: <strong>${valueIn}</strong> sats`, 'info');
    logToOutput(outputHerencia,  `💸 Fee estimada: <strong>${FEE}</strong> sats`, 'info');
    logToOutput(outputHerencia,  `🔢 Valor final de la transacción: <strong>${valueOut}</strong> sats`, 'info');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptDescriptorObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un output para enviar los fondos
    new Output({
      descriptor: `addr(${TESTNET_COINFAUCET})`,
      network
    }).updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    logToOutput(outputHerencia,  `✍️ Firmando la transacción con las clave apertura por herencia ⏳`, 'info');
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
    if (txResponse.match('non-BIP68-final') || txResponse.match('non-final'))  {
      logToOutput(outputHerencia,  `⏳ <span style="color:red;">La transacción está bloqueada temporalmente debido a un timelock</span>`, 'error');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
    }
      else {
      const txId = txFinal.getId();
      logToOutput(outputHerencia,  `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputHerencia,  `❌ <span style="color:red;">Error al enviar la transacción:</span> ${errorDetails}`, 'error');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  }
};

/************************ 🚨 RECOVERY 🔑  ************************/

const recoveryPSBT = async (masterNode: BIP32Interface, network: any, explorer: string, wshDescriptor: string): Promise<void> => {
  try {
    // Define la clave que se usará para firmar la transacción, false para unvaultKey y true para emergencyKey
    //emergency = true;

    console.log('Descriptor WSH:', wshDescriptor);

    // Crear un nuevo output para la clave de emergencia
    const emergencyKey = masterNode.derivePath(`m${WSH_ORIGIN_PATH_RECOVERY}${WSH_KEY_PATH}`).publicKey;

    const localMiniscriptDescriptorObjet = new Output({
      descriptor: wshDescriptor,
      network,
      signersPubKeys: [emergencyKey]
    });

    logToOutput(outputHerencia,  `🔘 Se ha pulsado el botón de apertura por testaferro 👤`, 'info');
    // Obtener la dirección de envio
    const miniscriptAddress = localMiniscriptDescriptorObjet.getAddress();
    const addressDestino = 'BitcoinFaucet.uo1.net'

    // Consultar UTXOs disponibles en la direccion del Miniscript
    const utxos = await (await fetch(`${explorer}/api/address/${miniscriptAddress}/utxo`)).json();
    if (!utxos.length) {
      throw new Error('No hay UTXOs disponibles en la dirección del Miniscript ❌');
    }

    // Mostrar mensaje de inicio solo si hay UTXOs disponibles
    logToOutput(outputHerencia,  `🚀 Devolviendo UTXOs desde <code><strong>${miniscriptAddress}</strong></code> hacia <code><strong>${addressDestino}</strong></code>`, 'info');

    // Seleccionar el UTXO más antiguo
    const utxo = utxos.sort((a: any, b: any) => a.status.block_height - b.status.block_height )[0];
    const { txid, vout, value: valueIn } = utxo;

    console.log('UTXOS:', utxos.sort((a: any, b: any) => b.status.block_height  - a.status.block_height ));
    console.log('UTXO:', utxo);

    // Obtener la transacción  en formato HEX
    const txHex = await (await fetch(`${explorer}/api/tx/${txid}/hex`)).text();

    const valueOut = valueIn - FEE;
    if (valueOut <= 0) throw new Error('El valor del UTXO no cubre la comisión.');

    logToOutput(outputHerencia,  `💰 Valor del UTXO: <strong>${valueIn}</strong> sats`, 'info');
    logToOutput(outputHerencia,  `💸 Fee estimada: <strong>${FEE}</strong> sats`, 'info');
    logToOutput(outputHerencia,  `🔢 Valor final de la transacción: <strong>${valueOut}</strong> sats`, 'info');

    // Crear la transacción PSBT
    const psbt = new Psbt({ network });
    // Crear el finalizador con los inputs
    const finalizer = localMiniscriptDescriptorObjet.updatePsbtAsInput({ psbt, vout, txHex });

    // Crear un output para enviar los fondos
    new Output({
      descriptor: `addr(${TESTNET_COINFAUCET})`,
      network
    }).updatePsbtAsOutput({ psbt, value: valueOut });

    // Firmar y finalizar la transacción
    logToOutput(outputHerencia,  `✍️ Firmando la transacción con  la clave de apertura no amistosa 🧑🏻‍⚖️`, 'info');
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
      logToOutput(outputHerencia,  `⏳ <span style="color:red;">La transacción está bloqueada temporalmente debido a un timelock</span>`, 'error');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
    } else {
      const txId = txFinal.getId();
      logToOutput(outputHerencia,  `🚚 Transacción enviada: <a href="${explorer}/tx/${txId}?expand" target="_blank">${txId}</a>`, 'success');
      logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
    }
  } catch (error: any) {
    const errorDetails = error.message || 'Error desconocido';
    logToOutput(outputHerencia,  `❌ <span style="color:red;">Error al enviar la transacción:</span> ${errorDetails}`, 'error');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  }
};

/************************ Llamada a la funciones  ************************/


// Inicializar el Miniscript antes de usar las funciones
const initializeNetwork = async (network: any, explorer: string): Promise<void> => {
  try {
    const { MiniscriptDescriptorObjet, originalBlockHeight, policy, masterNode, wshDescriptor } = await initMiniscriptOutput(network, explorer);

    document.getElementById('showMiniscripBtn')?.addEventListener('click', () => mostraMIniscript(MiniscriptDescriptorObjet, originalBlockHeight, policy, explorer));
    document.getElementById('fetchUtxosBtn')?.addEventListener('click', () => fetchUtxosMini(MiniscriptDescriptorObjet, explorer));
    document.getElementById('fetchTransactionBtn')?.addEventListener('click', () => fetchTransaction(MiniscriptDescriptorObjet, explorer));
    document.getElementById('hotButton')?.addEventListener('click', () => hotPSBT(masterNode, network, explorer, wshDescriptor));
    document.getElementById('henrenciaButton')?.addEventListener('click', () => henrenciaPSBT(masterNode, network, explorer, wshDescriptor));
    document.getElementById('recoveryButton')?.addEventListener('click', () => recoveryPSBT(masterNode, network, explorer, wshDescriptor));
  } catch (error: any) {
    logToOutput(outputHerencia,  `❌ Error al inicializar el Miniscript: ${error.message}`, 'error');
    logToOutput(outputHerencia,  `<span style="color:grey;">========================================</span>`);
  }
};

// Inicializar el Miniscript en la red de testnet
document.getElementById('initTestnetBtn')?.addEventListener('click', () => initializeNetwork(networks.testnet, 'https://blockstream.info/testnet'));
// Inicializar el Miniscript en la red de Mainnet
document.getElementById('initMainnetBtn')?.addEventListener('click', () => initializeNetwork(networks.bitcoin, 'https://blockstream.info/'));




// Borrar consola
document.getElementById('clearOutputBtn')?.addEventListener('click', () => {
  outputHerencia.innerHTML = '';
});
