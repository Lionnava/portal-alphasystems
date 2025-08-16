// /api/disconnect.js
require('dotenv').config();
const crypto = require('crypto'); // Módulo nativo de Node.js para criptografía

export default async function handler(req, res) {
  // 1. Obtener la MAC del cliente a desconectar (desde la petición)
  const { mac } = req.body; // Supondremos que la enviamos en el cuerpo de un POST

  if (!mac) {
    return res.status(400).json({ error: 'Dirección MAC requerida' });
  }

  // 2. Preparar los parámetros para la API de Grandstream
  const appId = process.env.GDMS_APP_ID;
  const secretKey = process.env.GDMS_SECRET_KEY;
  const timestamp = Math.floor(Date.now() / 1000); // Timestamp en segundos
  const nonce = crypto.randomBytes(8).toString('hex'); // Un string aleatorio

  // 3. Calcular la Firma (Signature) - La parte más importante
  // La documentación especifica el orden exacto de los parámetros
  const stringToSign = `${appId}${nonce}${timestamp}${secretKey}`;
  const signature = crypto.createHash('md5').update(stringToSign).digest('hex'); // o 'sha256' si lo especifica

  // 4. Construir el cuerpo de la petición para la API
  const apiBody = {
    request: {
      params: {
        appid: appId,
        nonce: nonce,
        timestamp: timestamp,
        signature: signature
      },
      method: "client.kick",
      args: {
        macs: [mac] // La API espera una lista de MACs
      }
    }
  };

  // 5. Hacer la llamada a la API de Grandstream con fetch
  try {
    const response = await fetch('https://api.gwn.cloud:6443/api/v1/openapi/client/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody)
    });

    const result = await response.json();

    if (result.response && result.response.result === 'ok') {
      return res.status(200).json({ message: `Cliente ${mac} desconectado con éxito` });
    } else {
      // Si la API de Grandstream devuelve un error
      return res.status(500).json({ error: 'Error de la API de Grandstream', details: result });
    }

  } catch (error) {
    return res.status(500).json({ error: 'Error al llamar a la API', details: error.message });
  }
}
