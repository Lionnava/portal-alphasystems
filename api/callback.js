// /api/callback.js
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  try {
    // --- Log de Depuración Inicial ---
    console.log("Función /api/callback iniciada. Query:", req.query);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URL
    );

    const { step, code, state: receivedState, mac, login_url, form_data } = req.query;

    if (step === 'getAuthUrl') {
      const formData = JSON.parse(decodeURIComponent(form_data));
      const state = Buffer.from(JSON.stringify({ client_mac: mac, login_url, formData })).toString('base64');
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'online',
        scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
        state: state,
      });
      return res.status(200).json({ authUrl });
    }

    if (code) {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();
      const state = JSON.parse(Buffer.from(receivedState, 'base64').toString());
      const { login_url: state_login_url, client_mac: state_client_mac, formData: datosFormulario } = state;

      if (!state_login_url || !state_client_mac || !datosFormulario) {
        throw new Error("Datos críticos (AP o formulario) no se encontraron en el estado.");
      }

      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      const { error } = await supabase.from('sesiones').insert([{ 
          email: userInfo.email, 
          nombre: userInfo.name,
          mac_cliente: state_client_mac,
          edad: datosFormulario.edad,
          sexo: datosFormulario.sexo,
          especialidad: datosFormulario.especialidad
      }]);

      if (error) { console.error('Error al guardar en Supabase:', error.message); }

      const successUrl = new URL(`https://${req.headers.host}/success.html`);
      successUrl.searchParams.append('user', state_client_mac);
      const grandstreamAuthUrl = `${state_login_url}?user=${encodeURIComponent(state_client_mac)}&pws=google_ok&url=${encodeURIComponent(successUrl.toString())}`;
      const adPortalUrl = new URL(`https://${req.headers.host}/ad_portal.html`);
      adPortalUrl.searchParams.append('auth_url', encodeURIComponent(grandstreamAuthUrl));

      return res.redirect(302, adPortalUrl.toString());
    }

    // Si no es ni 'getAuthUrl' ni un callback con 'code', es un error.
    return res.status(400).json({ error: 'Petición no válida. Faltan parámetros "step" o "code".' });

  } catch (error) {
    console.error('[ERROR GLOBAL EN API/CALLBACK]', error);
    return res.status(500).send(`A server error occurred: ${error.message}`);
  }
}
