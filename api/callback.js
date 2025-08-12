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
  
  const { step, code, state: receivedState, mac, login_url } = req.query;

  if (step === 'getAuthUrl') {
    // ... (esta parte no cambia) ...
    const state = Buffer.from(JSON.stringify({ client_mac: mac, login_url })).toString('base64');
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
      state: state
    });
    return res.status(200).json({ authUrl });
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

      // --- ¡NUEVO! LÓGICA PARA GUARDAR EN SUPABASE ---
      // Recuperamos los datos del formulario que guardamos en localStorage en el frontend.
      // ¡OJO! Esta parte es un ejemplo, ya que no podemos pasar los datos del form a través de Google.
      // Lo ideal sería pedirlos de nuevo o guardarlos de otra forma. Por ahora, usaremos datos de ejemplo.
      const datosFormulario = { edad: 45, sexo: 'masculino', especialidad: 'pediatria' }; // Datos de ejemplo

      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

      const { data, error } = await supabase
        .from('sesiones')
        .insert([{ 
            email: userInfo.email, 
            nombre: userInfo.name,
            mac_cliente: state_client_mac,
            edad: datosFormulario.edad,
            sexo: datosFormulario.sexo,
            especialidad: datosFormulario.especialidad
        }]);

      if (error) {
        // Si hay un error con la BD, lo registramos pero no detenemos el login del usuario.
        console.error('Error al guardar en Supabase:', error);
      } else {
        console.log('Datos guardados en Supabase con éxito:', data);
      }
      // --- FIN DE LA LÓGICA DE SUPABASE ---
      
      const grandstreamAuthUrl = `${state_login_url}?user=${encodeURIComponent(state_client_mac)}&pws=google_ok`;
      
      return res.redirect(302, grandstreamAuthUrl);

    } catch (error) {
      console.error('Error durante el callback de Google:', error.message);
      return res.status(500).send(`Error en el proceso de autenticación: ${error.message}`);
    }
  }

  return res.status(400).send('Petición no válida.');
}