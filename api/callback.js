// /api/callback.js
require('dotenv').config();
const { google } = require('googleapis');

export default async function handler(req, res) {
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
  );
  
  const { step, code, state: receivedState, mac, login_url } = req.query;

  // --- Flujo 1: El frontend pide la URL de Google ---
  if (step === 'getAuthUrl') {
    if (!mac || !login_url) {
      return res.status(400).json({ error: "MAC y login_url son requeridos" });
    }
    const state = Buffer.from(JSON.stringify({ client_mac: mac, login_url })).toString('base64');
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
      state: state
    });
    return res.status(200).json({ authUrl });
  }

  // --- Flujo 2: Google nos redirige aquí después del login del usuario ---
  if (code) {
    try {
      // 1. Canjear el código por un token de acceso
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // 2. Usar el token para obtener los datos del usuario
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();
      
      // 3. Recuperar los datos del Grandstream que guardamos en el 'state'
      const state = JSON.parse(Buffer.from(receivedState, 'base64').toString());
      const { login_url: state_login_url, client_mac: state_client_mac } = state;

      if (!state_login_url || !state_client_mac) {
        throw new Error("Datos críticos del AP no se encontraron en el estado.");
      }

      // 4. (Opcional) Guardar los datos en la consola para verificar
      console.log(`Usuario autenticado con éxito: ${userInfo.email}, MAC: ${state_client_mac}`);
      
      // 5. Construir la URL final para autorizar al usuario en el Grandstream
      const grandstreamAuthUrl = `${state_login_url}?user=${encodeURIComponent(state_client_mac)}&pws=google_ok`;
      
      // 6. Redirigir al usuario al AP para concederle acceso a internet
      return res.redirect(302, grandstreamAuthUrl);

    } catch (error) {
      // Si algo falla en el Flujo 2, lo registramos y mostramos un error claro
      console.error('Error durante el callback de Google:', error.message);
      return res.status(500).send(`Error en el proceso de autenticación: ${error.message}`);
    }
  }

  // Si la petición no es para el Flujo 1 ni el Flujo 2, es inválida
  return res.status(400).send('Petición no válida.');
}