const { ethers } = require("ethers");
const supabase = require("./supabase");
const { tornadocashAbi } = require("./abis/tornado");

const provider = new ethers.providers.JsonRpcProvider(
  "https://arb-rpc.wavynode.com"
);

const tornadoContracts = {
  eth01: "0x84443CFd09A48AF6eF360C6976C5392aC5023a1F",
  eth1: "0xd47438C816c9E7f2E2888E060936a499Af9582b3",
  eth10: "0x330bdFADE01eE9bF63C209Ee33102DD334618e0a",
  eth100: "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD",
};

async function queryTornadoCashEvents(contractAddress) {
  try {
    const contract = new ethers.Contract(
      contractAddress,
      tornadocashAbi,
      provider
    );
    const targetBlock = 281881304;
    const events = ["Deposit", "Withdrawal"];

    for (const eventName of events) {
      try {
        const eventFilter = contract.filters[eventName]();
        const queriedEvents = await contract.queryFilter(
          eventFilter,
          0,
          targetBlock
        );
        console.log(
          `Se encontraron ${queriedEvents.length} eventos de ${eventName} en TornadoCash (${contractAddress}) hasta el bloque ${targetBlock}.`
        );

        if (queriedEvents.length > 0) {
          const customData = await Promise.all(
            queriedEvents.map(async (event) => {
              const block = await provider.getBlock(event.blockNumber);
              const data = {
                contract: contractAddress,
                eventType: eventName,
                recipient: event.args?.to || event.args?.recipient || null,
                txHash: event.transactionHash,
                block: event.blockNumber,
                timestamp: block.timestamp,
              };

              if (eventName === "Deposit") {
                data.sender = event.args?.from || event.args?.account || null;
                data.amount =
                  event.args?.amount?.toString() ||
                  event.args?.value?.toString() ||
                  null;
              }

              return data;
            })
          );

          await saveToSupabaseInBatches();
        }
      } catch (error) {
        console.error(
          `Error al consultar eventos ${eventName} para TornadoCash (${contractAddress}): ${error.message}`
        );
      }
    }
  } catch (error) {
    console.error(
      `Error al consultar eventos para TornadoCash (${contractAddress}): ${error.message}`
    );
  }
}

// Guardar eventos en Supabase por lotes
async function saveToSupabaseInBatches(data, batchSize = 100) {
  const validData = validateData(data);
  if (!validData.length) {
    console.log("No hay datos válidos para insertar.");
    return;
  }

  for (let i = 0; i < validData.length; i += batchSize) {
    const batch = validData.slice(i, i + batchSize);
    console.log(
      `Insertando lote ${i / batchSize + 1} de ${Math.ceil(
        validData.length / batchSize
      )}...`
    );
    try {
      const { error } = await supabase.from("customData").insert(batch);
      if (error) {
        console.error("Error al insertar lote:", error.message);
        console.error("Datos del lote fallido:", batch);
      } else {
        console.log("¡Lote insertado exitosamente!");
      }
    } catch (error) {
      console.error("Error inesperado al insertar lote:", error.message);
    }
  }
}

// Validar datos antes de la inserción
function validateData(data) {
  return data.filter((item) => {
    if (
      !item.contract ||
      !item.eventType ||
      !item.txHash ||
      !item.block ||
      !item.timestamp
    ) {
      console.error("Datos inválidos encontrados:", item);
      return false;
    }
    return true;
  });
}

Object.values(tornadoContracts).forEach(queryTornadoCashEvents);
