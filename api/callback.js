// /api/callback.js
require('dotenv').config();
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
  );
  const { step, code, state: receivedState, mac, login_url, form_data } = req.query;

  if (step === 'getAuthUrl') {
   // Decodificamos los datos del formulario
const formData = JSON.parse(decodeURIComponent(form_data));
// Codificamos AMBOS datos en el state
const state = Buffer.from(JSON.stringify({ client_mac: mac, login_url, formData })).toString('base64');
  }

  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();
      
      const state = JSON.parse(Buffer.from(receivedState, 'base64').toString());
      const { login_url: state_login_url, client_mac: state_client_mac } = state;

      if (!state_login_url || !state_client_mac) {
        throw new Error("Datos críticos del AP no se encontraron en el estado.");
      }

    // Recuperamos TODO del state
const state = JSON.parse(Buffer.from(receivedState, 'base64').toString());
const { login_url: state_login_url, client_mac: state_client_mac, formData: datosFormulario } = state;

// ...

// La inserción en Supabase ahora usará los datos reales
const { data, error } = await supabase
  .from('sesiones')
  .insert([{ 
      email: userInfo.email, 
      nombre: userInfo.name,
      mac_cliente: state_client_mac,
      edad: datosFormulario.edad,      // <--- DATO REAL
      sexo: datosFormulario.sexo,      // <--- DATO REAL
      especialidad: datosFormulario.especialidad // <--- DATO REAL
  }]);

      if (error) {
        // Si hay un error con la BD, lo registramos pero no detenemos el login del usuario.
        console.error('Error al guardar en Supabase:', error);
      } else {
        console.log('Datos guardados en Supabase con éxito:', data);
      }
      // --- FIN DE LA LÓGICA DE SUPABASE ---
      
      const successUrl = new URL(req.headers.host + '/success.html');
successUrl.searchParams.append('user', state_client_mac);
const finalRedirectUrl = 'https' + '://' + successUrl.toString();

const grandstreamAuthUrl = `${state_login_url}?user=${encodeURIComponent(state_client_mac)}&pws=google_ok&url=${encodeURIComponent(finalRedirectUrl)}`;
      
      return res.redirect(302, grandstreamAuthUrl);

    } catch (error) {
      console.error('Error durante el callback de Google:', error.message);
      return res.status(500).send(`Error en el proceso de autenticación: ${error.message}`);
    }
  }

  return res.status(400).send('Petición no válida.');
}
